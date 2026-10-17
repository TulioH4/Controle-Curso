// Service worker: offline app shell.
// Pages: network-first (online users always get the latest version, offline falls back to cache).
// Same-origin assets: stale-while-revalidate. Whitelisted CDNs: cache-first.
// Anything else (e.g. the sync API) is never cached.
const VERSION = 'v2';
const CACHE = `controle-${VERSION}`;
const SHELL = [
  './',
  './index.html',
  './sync.js',
  './dados_curso.js',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];
const CDN_HOSTS = ['cdnjs.cloudflare.com', 'cdn.jsdelivr.net', 'cdn.sheetjs.com'];
// Libraries live in their own cache, outside the app version: their URLs pin an exact version, so
// a copy never goes stale, and an app update no longer throws away pdf.js (1.4 MB) or the charts.
const LIBS = 'cdn-libs-1';
// The charts library loads only when the Notas tab opens; keep a copy so the tab also works offline.
// The sync library too: without it an offline launch opens with sync off until the next reload.
const OPTIONAL = [
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/dist/umd/supabase.js',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE)
    .then(c => c.addAll(SHELL))
    .then(() => caches.open(LIBS))
    .then(c => Promise.all(OPTIONAL.map(async u => { if (!(await c.match(u))) await c.add(u).catch(() => {}); })))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('controle-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// ---- Local reminders (no server) ---------------------------------------------
// The app keeps a small snapshot of open tasks, exams and lab reports in Cache
// Storage. The worker checks it when the app opens, every few minutes while it is
// open, and (Android, installed app) on periodic background sync, and shows each
// reminder once.
const REMINDER_CACHE = 'lembretes-data';
const SNAP = './__lembretes.json';
const SENT = './__lembretes-enviados.json';
async function readJSON(path, fallback) {
  try { const r = await (await caches.open(REMINDER_CACHE)).match(path); return r ? await r.json() : fallback; }
  catch (e) { return fallback; }
}
async function writeJSON(path, value) {
  const c = await caches.open(REMINDER_CACHE);
  await c.put(path, new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } }));
}
const isoDay = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const hora = hm => { if (!hm) return ''; const [H, M] = hm.split(':'); return ` às ${Number(H)}h${M && M !== '00' ? M : ''}`; };
const semSigla = s => String(s || '').replace(/\s*\([^)]*\)\s*$/, '');
const provaTxt = p => `${p.tipo || 'Prova'} de ${semSigla(p.disciplina)}${hora(p.hora)}`;
const mins = hm => { const [h, m] = String(hm).split(':').map(Number); return h * 60 + (m || 0); };
const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

// Sunday evening: what the coming week (Monday to Sunday) holds, exams first
function resumoSemana(snap, now) {
  const dias = Array.from({ length: 7 }, (_, i) => isoDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() + i + 1)));
  const quando = d => d === dias[0] ? 'Amanhã' : DIAS[new Date(d + 'T12:00:00').getDay()];
  const provas = (snap.provas || []).filter(p => dias.includes(p.data))
    .sort((a, b) => (a.data + (a.hora || '')).localeCompare(b.data + (b.hora || '')));
  const prazos = [
    ...(snap.tarefas || []).filter(t => dias.includes(t.prazo)).map(t => ({ d: t.prazo, txt: t.nome })),
    ...(snap.rels || []).filter(r => dias.includes(r.fim)).map(r => ({ d: r.fim, txt: `entrega do ${r.nome}` })),
  ].sort((a, b) => a.d.localeCompare(b.d));
  if (!provas.length && !prazos.length) return null;
  const partes = [];
  if (provas.length) partes.push(provas.length === 1 ? '1 prova' : `${provas.length} provas`);
  if (prazos.length) partes.push(prazos.length === 1 ? '1 prazo' : `${prazos.length} prazos`);
  const linhas = [...provas.map(p => `${quando(p.data)}: ${provaTxt(p)}`), ...prazos.map(x => `${quando(x.d)}: ${x.txt}`)];
  const corpo = linhas.length > 5 ? [...linhas.slice(0, 4), `e mais ${linhas.length - 4}`] : linhas;
  return { tag: `semana-${isoDay(now)}`, url: './', title: `Sua semana: ${partes.join(' e ')}`, body: corpo.join('\n') };
}

async function checkReminders() {
  if (self.Notification && Notification.permission !== 'granted') return;
  const snap = await readJSON(SNAP, null);
  if (!snap) return;
  const sent = await readJSON(SENT, {});
  const now = new Date();
  const hoje = isoDay(now), amanha = isoDay(new Date(now.getTime() + 86400000));
  const agora = now.getHours() * 60 + now.getMinutes();
  const doDia = d => ({
    provas: (snap.provas || []).filter(p => p.data === d).sort((a, b) => String(a.hora || '').localeCompare(String(b.hora || ''))),
    tarefas: (snap.tarefas || []).filter(t => t.prazo === d),
    rels: (snap.rels || []).filter(r => r.fim === d),
  });
  const notes = [];

  // today: once a day, whenever the first check of the day happens
  const h = doDia(hoje);
  const provasHoje = h.provas.filter(p => !p.hora || mins(p.hora) > agora);
  const atrasadas = (snap.tarefas || []).filter(t => t.prazo < hoje);
  const outrosHoje = [...h.tarefas.map(t => `Vence hoje: ${t.nome}`), ...h.rels.map(r => `Entrega hoje: ${r.nome}`)];
  if (atrasadas.length) outrosHoje.push(atrasadas.length === 1 ? `Atrasada: ${atrasadas[0].nome}` : `${atrasadas.length} tarefas atrasadas`);
  if (provasHoje.length === 1) notes.push({ tag: `dia-${hoje}`, url: './', title: `Hoje tem ${provaTxt(provasHoje[0])}`,
    body: [provasHoje[0].local ? `Local: ${provasHoje[0].local}` : 'Você se preparou pra isso, vai com calma.', ...outrosHoje].join('\n') });
  else if (provasHoje.length > 1) notes.push({ tag: `dia-${hoje}`, url: './', title: `Hoje tem ${provasHoje.length} provas`,
    body: [...provasHoje.map(provaTxt), ...outrosHoje].join('\n') });
  else if (outrosHoje.length) notes.push({ tag: `dia-${hoje}`, url: './?aba=tarefas', title: outrosHoje.length === 1 ? outrosHoje[0] : 'Seu dia hoje',
    body: outrosHoje.length === 1 ? 'Não esquece.' : outrosHoje.join('\n') });

  // Sunday, from 17h: the week ahead (it already covers Monday, so no separate heads-up)
  if (agora >= 17 * 60 && now.getDay() === 0) {
    const semana = resumoSemana(snap, now);
    if (semana) notes.push(semana);
  }
  // other days, from 17h: tomorrow
  else if (agora >= 17 * 60) {
    const a = doDia(amanha);
    const outros = [...a.tarefas.map(t => `Vence amanhã: ${t.nome}`), ...a.rels.map(r => `Entrega amanhã: ${r.nome}`)];
    if (a.provas.length === 1) notes.push({ tag: `vespera-${hoje}`, url: './?aba=provas', title: `Amanhã tem ${provaTxt(a.provas[0])}`,
      body: ['Vale uma revisada hoje e uma boa noite de sono.', ...outros].join('\n') });
    else if (a.provas.length > 1) notes.push({ tag: `vespera-${hoje}`, url: './?aba=provas', title: `Amanhã tem ${a.provas.length} provas`,
      body: [...a.provas.map(provaTxt), ...outros].join('\n') });
    else if (outros.length) notes.push({ tag: `vespera-${hoje}`, url: './?aba=tarefas', title: outros.length === 1 ? outros[0] : 'Para amanhã',
      body: outros.length === 1 ? 'Dá tempo de adiantar hoje.' : outros.join('\n') });
  }

  // exam starting in two hours or less
  h.provas.filter(p => p.hora).forEach(p => {
    const falta = mins(p.hora) - agora;
    if (falta > 0 && falta <= 120) notes.push({ tag: `prova-${hoje}-${p.hora}-${semSigla(p.disciplina)}`, url: './?aba=provas',
      title: `${p.tipo || 'Prova'} de ${semSigla(p.disciplina)} daqui a pouco`, body: `Começa${hora(p.hora)}${p.local ? `, ${p.local}` : ''}. Boa prova!` });
  });

  let changed = false;
  for (const n of notes) {
    if (sent[n.tag]) continue;
    await self.registration.showNotification(n.title, { body: n.body, tag: n.tag, icon: './icons/icon-192.png', data: { url: n.url } });
    sent[n.tag] = Date.now(); changed = true;
  }
  const limite = Date.now() - 4 * 86400000;
  Object.keys(sent).forEach(k => { if (sent[k] < limite) { delete sent[k]; changed = true; } });
  if (changed) await writeJSON(SENT, sent);
}
self.addEventListener('periodicsync', event => { if (event.tag === 'lembretes') event.waitUntil(checkReminders()); });
self.addEventListener('message', event => { if (event.data === 'check-reminders') event.waitUntil(checkReminders()); });

// Push reminders sent by the "lembretes" Edge Function (when the server is set up)
self.addEventListener('push', event => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (e) { d = { body: event.data ? event.data.text() : '' }; }
  event.waitUntil(self.registration.showNotification(d.title || 'Centro de Controle', {
    body: d.body || '',
    tag: d.tag || undefined,
    icon: './icons/icon-192.png',
    data: { url: d.url || './' },
  }));
});

// Tapping a notification opens the app (or focuses it) on the right screen
self.addEventListener('notificationclick', event => {
  event.notification.close();
  // only pages of the app itself: a notification never opens another site
  let url = new URL((event.notification.data && event.notification.data.url) || './', self.registration.scope).href;
  if (!url.startsWith(self.registration.scope)) url = self.registration.scope;
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const win = wins.find(w => w.url.startsWith(self.registration.scope));
    if (win) {
      await win.focus();
      if ('navigate' in win) { try { await win.navigate(url); } catch (e) {} }
      return;
    }
    await self.clients.openWindow(url);
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (req.mode === 'navigate') {
    event.respondWith(
      // no-cache: always revalidate with the server, so a new version shows up right after a deploy
      // (a navigate-mode Request cannot take options, so fetch by URL)
      fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' })
        .then(res => {
          // keep only a good copy of the app page itself: a 404 or a server error stored here
          // would become the offline app
          const appPage = url.pathname.replace(/index\.html$/, '') === new URL(self.registration.scope).pathname;
          if (res.ok && appPage) { const copy = res.clone(); caches.open(CACHE).then(c => c.put('./index.html', copy)); }
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  if (url.origin === self.location.origin) {
    const network = caches.open(CACHE).then(cache =>
      fetch(req).then(res => { if (res.ok) return cache.put(req, res.clone()).then(() => res); return res; }));
    event.respondWith(
      caches.open(CACHE).then(async cache => (await cache.match(req, {ignoreSearch: true})) || network)
        .catch(() => network)
    );
    // the background refresh must finish even after the cached copy was already returned
    event.waitUntil(network.catch(() => {}));
    return;
  }

  if (CDN_HOSTS.includes(url.hostname)) {
    event.respondWith(
      caches.open(LIBS).then(async cache => {
        const cached = await cache.match(req);
        // an opaque copy (from an old script tag) cannot answer a request that checks integrity
        if (cached && (cached.type !== 'opaque' || req.mode === 'no-cors')) return cached;
        const res = await fetch(req);
        // opaque responses are not kept: Chrome counts each one as ~7 MB of the storage quota
        if (res.ok) cache.put(req, res.clone());
        return res;
      })
    );
  }
});
