// Supabase Edge Function "lembretes": push reminders for Centro de Controle.
//
// Called every 15 minutes by pg_cron (supabase/push.sql). For each account with a
// subscribed device it reads the synced data (kv table) and, in the device's time zone,
// sends at most once:
//   - from 07:00, a summary of today (exams, tasks due, lab reports due, overdue tasks);
//   - from 20:00, a heads-up about tomorrow (on Sundays, a summary of the week ahead instead);
//   - an alert when an exam starts in two hours or less.
// Days with nothing due send nothing. POST {"test": true} with a user's access token
// sends a test notification to that user's devices only.
//
// Secrets (Edge Functions → Secrets): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, and optionally
// CRON_SECRET. "Verify JWT" must be off: cron calls it without a user token. Every reminder
// is logged in push_log, so extra calls never send anything twice; with CRON_SECRET set,
// only a call carrying it (header x-cron-secret, see push.sql) runs the reminders at all,
// so nobody else can make the function read every account and push over and over.
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2.117.2';

// ---------------------------------------------------------------------------
// Pure rules (no I/O), kept separate so they can be tested on their own
// ---------------------------------------------------------------------------
// a time zone the device sent; an invalid one would throw and stop the reminders of everyone after it
export function safeTz(tz) {
  try { new Intl.DateTimeFormat('en-CA', { timeZone: tz }); return tz; } catch (_) { return 'America/Sao_Paulo'; }
}
// push services of the browsers; any other endpoint is not a browser subscription
const PUSH_HOST = /^https:\/\/([a-z0-9-]+\.)*(fcm\.googleapis\.com|push\.services\.mozilla\.com|notify\.windows\.com|push\.apple\.com)\//i;
export const isPushEndpoint = (e) => typeof e === 'string' && PUSH_HOST.test(e);
export function localNow(tz, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const g = (t) => parts.find((p) => p.type === t).value;
  return { date: `${g('year')}-${g('month')}-${g('day')}`, hm: `${g('hour')}:${g('minute')}` };
}
export function addDays(iso, n) {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const minutes = (hm) => { const [h, m] = String(hm).split(':').map(Number); return h * 60 + (m || 0); };
const hora = (hm) => { if (!hm) return ''; const [H, M] = hm.split(':'); return ` às ${Number(H)}h${M && M !== '00' ? M : ''}`; };
const semSigla = (s) => String(s || '').replace(/\s*\([^)]*\)\s*$/, '');
const provaTxt = (p) => `${p.tipo || 'Prova'} de ${semSigla(p.disciplina)}${hora(p.hora)}`;
const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

// kv rows of one account → open tasks, exams and pending lab reports of every profile
export function collect(kv) {
  const ids = new Set(Array.isArray(kv.profiles) ? kv.profiles.map((p) => p && p.id).filter(Boolean) : []);
  Object.keys(kv).forEach((k) => { const m = /^(.+)_(tarefas|provas)$/.exec(k); if (m) ids.add(m[1]); });
  const all = { tarefas: [], provas: [], rels: [] };
  for (const id of ids) {
    const arr = (v) => (Array.isArray(v) ? v : []);
    all.tarefas.push(...arr(kv[`${id}_tarefas`]).filter((t) => t && t.status !== 'Concluído' && t.prazo));
    all.provas.push(...arr(kv[`${id}_provas`]).filter((p) => p && p.data));
    const base = kv[`${id}_base_data`] || {};
    const ov = kv[`${id}_relatorios_overrides`] || {};
    const ocultos = arr(kv[`${id}_relatorios_ocultos`]);
    const feitos = kv[`${id}_lab_concluido`] || {};
    arr(base.relatorios).filter((r) => r && !ocultos.includes(r.nome)).forEach((r) => {
      const o = ov[r.nome] || {};
      const rel = { nome: o.nome || r.nome, fim: o.fim || r.fim };
      // "done" is stored under the original name, even after the report is renamed
      if (rel.fim && !feitos[r.nome]) all.rels.push(rel);
    });
  }
  return all;
}

// what should go out now: [{tag, title, body, url}]
export function plan(all, now) {
  const msgs = [];
  const hoje = now.date, amanha = addDays(hoje, 1), agora = minutes(now.hm);
  const provasDia = (d) => all.provas.filter((p) => p.data === d).sort((a, b) => String(a.hora || '').localeCompare(String(b.hora || '')));
  const tarefasDia = (d) => all.tarefas.filter((t) => t.prazo === d);
  const relsDia = (d) => all.rels.filter((r) => r.fim === d);
  const lista = (itens) => itens.join('\n');

  if (agora >= 7 * 60 && agora < 12 * 60) {
    const provas = provasDia(hoje).filter((p) => !p.hora || minutes(p.hora) > agora);
    const outros = [
      ...tarefasDia(hoje).map((t) => `Vence hoje: ${t.nome}`),
      ...relsDia(hoje).map((r) => `Entrega hoje: ${r.nome}`),
    ];
    const atrasadas = all.tarefas.filter((t) => t.prazo < hoje);
    if (atrasadas.length) outros.push(atrasadas.length === 1 ? `Atrasada: ${atrasadas[0].nome}` : `${atrasadas.length} tarefas atrasadas`);
    if (provas.length === 1) {
      const p = provas[0];
      msgs.push({ tag: `manha-${hoje}`, title: `Hoje tem ${provaTxt(p)}`, url: './',
        body: lista([p.local ? `Local: ${p.local}` : 'Você se preparou pra isso, vai com calma.', ...outros]) });
    } else if (provas.length > 1) {
      msgs.push({ tag: `manha-${hoje}`, title: `Hoje tem ${provas.length} provas`, url: './',
        body: lista([...provas.map((p) => provaTxt(p)), ...outros]) });
    } else if (outros.length) {
      msgs.push({ tag: `manha-${hoje}`, title: outros.length === 1 ? outros[0] : 'Seu dia hoje', url: './?aba=tarefas',
        body: outros.length === 1 ? 'Não esquece.' : lista(outros) });
    }
  }

  // Sunday 20:00: the week ahead (it already covers Monday, so no separate heads-up)
  const domingo = new Date(hoje + 'T12:00:00Z').getUTCDay() === 0;
  if (agora >= 20 * 60 && domingo) {
    const dias = Array.from({ length: 7 }, (_, i) => addDays(hoje, i + 1));
    const quando = (d) => (d === amanha ? 'Amanhã' : DIAS[new Date(d + 'T12:00:00Z').getUTCDay()]);
    const provas = all.provas.filter((p) => dias.includes(p.data))
      .sort((a, b) => (a.data + (a.hora || '')).localeCompare(b.data + (b.hora || '')));
    const prazos = [
      ...all.tarefas.filter((t) => dias.includes(t.prazo)).map((t) => ({ d: t.prazo, txt: t.nome })),
      ...all.rels.filter((r) => dias.includes(r.fim)).map((r) => ({ d: r.fim, txt: `entrega do ${r.nome}` })),
    ].sort((a, b) => a.d.localeCompare(b.d));
    if (provas.length || prazos.length) {
      const partes = [];
      if (provas.length) partes.push(provas.length === 1 ? '1 prova' : `${provas.length} provas`);
      if (prazos.length) partes.push(prazos.length === 1 ? '1 prazo' : `${prazos.length} prazos`);
      const linhas = [...provas.map((p) => `${quando(p.data)}: ${provaTxt(p)}`), ...prazos.map((x) => `${quando(x.d)}: ${x.txt}`)];
      msgs.push({ tag: `semana-${hoje}`, title: `Sua semana: ${partes.join(' e ')}`, url: './',
        body: lista(linhas.length > 5 ? [...linhas.slice(0, 4), `e mais ${linhas.length - 4}`] : linhas) });
    }
  } else if (agora >= 20 * 60) {
    const provas = provasDia(amanha);
    const outros = [
      ...tarefasDia(amanha).map((t) => `Vence amanhã: ${t.nome}`),
      ...relsDia(amanha).map((r) => `Entrega amanhã: ${r.nome}`),
    ];
    if (provas.length === 1) {
      msgs.push({ tag: `noite-${hoje}`, title: `Amanhã tem ${provaTxt(provas[0])}`, url: './?aba=provas',
        body: lista(['Vale uma revisada hoje e uma boa noite de sono.', ...outros]) });
    } else if (provas.length > 1) {
      msgs.push({ tag: `noite-${hoje}`, title: `Amanhã tem ${provas.length} provas`, url: './?aba=provas',
        body: lista([...provas.map((p) => provaTxt(p)), ...outros]) });
    } else if (outros.length) {
      msgs.push({ tag: `noite-${hoje}`, title: outros.length === 1 ? outros[0] : 'Para amanhã', url: './?aba=tarefas',
        body: outros.length === 1 ? 'Dá tempo de adiantar hoje.' : lista(outros) });
    }
  }

  provasDia(hoje).filter((p) => p.hora).forEach((p) => {
    const falta = minutes(p.hora) - agora;
    if (falta > 0 && falta <= 120) {
      msgs.push({
        tag: `prova-${hoje}-${p.hora}-${semSigla(p.disciplina)}`,
        title: `${p.tipo || 'Prova'} de ${semSigla(p.disciplina)} daqui a pouco`,
        body: `Começa${hora(p.hora)}${p.local ? `, ${p.local}` : ''}. Boa prova!`,
        url: './?aba=provas',
      });
    }
  });
  return msgs;
}

// ---------------------------------------------------------------------------
// Delivery
// ---------------------------------------------------------------------------
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

if (typeof Deno !== 'undefined') {
  webpush.setVapidDetails(
    'https://tulioh4.github.io/centro-de-controle/',
    Deno.env.get('VAPID_PUBLIC_KEY'),
    Deno.env.get('VAPID_PRIVATE_KEY'),
  );
  const db = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });

  const send = async (s, m) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify({ title: m.title, body: m.body, tag: m.tag, url: m.url }),
        { TTL: 6 * 3600, urgency: 'high' },
      );
      return 1;
    } catch (e) {
      // device unsubscribed or app uninstalled: forget it
      if (e && (e.statusCode === 404 || e.statusCode === 410)) await db.from('push_subscriptions').delete().eq('endpoint', s.endpoint);
      else console.error('push failed', e && e.statusCode, e && e.body);
      return 0;
    }
  };

  const CRON_SECRET = Deno.env.get('CRON_SECRET') || '';
  Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    let body = {};
    try { body = await req.json(); } catch (_) { /* cron sends {} */ }
    if (!body.test && CRON_SECRET && req.headers.get('x-cron-secret') !== CRON_SECRET) return json({ error: 'forbidden' }, 403);

    let onlyUser = null;
    if (body.test) {
      const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
      const { data, error } = await db.auth.getUser(token);
      if (error || !data.user) return json({ error: 'Entre na sua conta para testar.' }, 401);
      onlyUser = data.user.id;
    }

    let q = db.from('push_subscriptions').select('endpoint,user_id,p256dh,auth,tz');
    if (onlyUser) q = q.eq('user_id', onlyUser);
    const { data: subs, error } = await q;
    if (error) return json({ error: error.message }, 500);

    const byUser = new Map();
    (subs || []).filter((s) => isPushEndpoint(s.endpoint))
      .forEach((s) => { if (!byUser.has(s.user_id)) byUser.set(s.user_id, []); byUser.get(s.user_id).push(s); });

    let sent = 0;
    for (const [uid, devices] of byUser) {
      if (body.test) {
        for (const s of devices) sent += await send(s, { title: 'Notificações funcionando', body: 'Você vai receber os lembretes de provas e tarefas por aqui.', tag: 'teste', url: './' });
        continue;
      }
      // one account with odd data must not stop the reminders of the others
      try {
        const { data: rows } = await db.from('kv').select('key,value').eq('user_id', uid);
        const kv = Object.fromEntries((rows || []).map((r) => [r.key, r.value]));
        const now = localNow(safeTz(devices[0].tz || 'America/Sao_Paulo'));
        for (const m of plan(collect(kv), now)) {
          // claim the reminder first; if it was already claimed, skip
          const { data: claimed } = await db.from('push_log')
            .upsert({ user_id: uid, tag: m.tag }, { onConflict: 'user_id,tag', ignoreDuplicates: true })
            .select('tag');
          if (!claimed || !claimed.length) continue;
          for (const s of devices) sent += await send(s, m);
        }
      } catch (e) {
        console.error('reminders failed for one account', e && e.message);
      }
    }
    return json({ ok: true, devices: (subs || []).length, sent });
  });
}
