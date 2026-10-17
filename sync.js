// Cloud sync for Centro de Controle (Supabase).
//
// localStorage stays the store the app reads and writes, so everything works
// offline. Every write under the app prefix is intercepted, timestamped and
// pushed to the `kv` table (one row per key, last write wins). On start, on
// focus and through Realtime, newer rows from other devices are applied back.
(function(){
  const CONFIG = {
    url: 'https://ehcbkoxbqqwiibjyzhoy.supabase.co',
    key: 'sb_publishable_mx8ZeUY1HIxCFO4R5BfanQ_wkPaA0Bw',
  };
  const PREFIX = 'centro_controle_';
  const META_KEY = PREFIX + '__sync_meta';
  // device-specific keys that must never travel between devices
  const LOCAL_ONLY = [/^active_profile$/, /^notif_last_/, /^__sync_meta$/, /__probe__$/, /^cloud_skip$/];
  const isSynced = fullKey => fullKey.startsWith(PREFIX) && !LOCAL_ONLY.some(re => re.test(fullKey.slice(PREFIX.length)));

  const ls = window.localStorage;
  const rawSet = Storage.prototype.setItem;
  const rawRemove = Storage.prototype.removeItem;
  let applying = false;

  let meta = {};
  try { meta = JSON.parse(ls.getItem(META_KEY) || '{}') || {}; } catch(e){ meta = {}; }
  const saveMeta = () => { try { rawSet.call(ls, META_KEY, JSON.stringify(meta)); } catch(e){} };

  const state = { status: 'local', lastSync: null, error: null, user: null };
  const listeners = new Set();
  const emit = () => listeners.forEach(fn => { try { fn(Object.assign({}, state)); } catch(e){} });
  const setStatus = (status, extra) => { Object.assign(state, {status}, extra || {}); emit(); };

  let client = null;
  const enabled = !!(window.supabase && window.supabase.createClient && CONFIG.key);
  if (enabled) {
    client = window.supabase.createClient(CONFIG.url, CONFIG.key, {
      // detectSessionInUrl off: the app signs in only with e-mail and password. With it on, a link
      // carrying someone else's tokens (#access_token=...) would silently sign this device into
      // that account, and everything the person typed afterwards would sync to it.
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'cc-auth' },
    });
  }

  // ---- capture local writes ------------------------------------------------
  function touch(fullKey){
    meta[fullKey.slice(PREFIX.length)] = { t: Date.now(), dirty: true };
    saveMeta();
    schedulePush();
  }
  Storage.prototype.setItem = function(k, v){
    rawSet.call(this, k, v);
    if (this === ls && !applying && isSynced(k)) touch(k);
  };
  Storage.prototype.removeItem = function(k){
    rawRemove.call(this, k);
    if (this === ls && !applying && isSynced(k)) touch(k);
  };

  // ---- push ------------------------------------------------------------------
  let pushTimer = null, pushing = false;
  function schedulePush(delay){
    if (!client || !state.user) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(push, delay == null ? 1200 : delay);
  }
  const hasDirty = () => Object.keys(meta).some(k => meta[k].dirty);

  async function push(){
    if (!client || !state.user) return;
    if (!navigator.onLine) { setStatus('offline'); return; }
    if (pushing) { schedulePush(800); return; }
    const keys = Object.keys(meta).filter(k => meta[k].dirty);
    if (!keys.length) return;
    pushing = true;
    setStatus('syncing');
    const sentAt = {};
    const rows = keys.map(k => {
      sentAt[k] = meta[k].t;
      const raw = ls.getItem(PREFIX + k);
      let value = null;
      if (raw !== null) { try { value = JSON.parse(raw); } catch(e){ value = raw; } }
      return { user_id: state.user.id, key: k, value, updated_at: new Date(meta[k].t).toISOString() };
    });
    try {
      for (let i = 0; i < rows.length; i += 200) {
        const { error } = await client.from('kv').upsert(rows.slice(i, i + 200), { onConflict: 'user_id,key' });
        if (error) throw error;
      }
      // only clear keys that were not written again while the request was in flight
      keys.forEach(k => { if (meta[k] && meta[k].t === sentAt[k]) meta[k].dirty = false; });
      saveMeta();
      setStatus('synced', { lastSync: Date.now(), error: null });
    } catch(e) {
      setStatus(navigator.onLine ? 'error' : 'offline', { error: e.message || String(e) });
    } finally {
      pushing = false;
      if (hasDirty() && state.status === 'synced') schedulePush(1500);
    }
  }

  // ---- pull ------------------------------------------------------------------
  function applyRow(row){
    const k = row.key;
    if (!k || !isSynced(PREFIX + k)) return false;
    const remoteT = Date.parse(row.updated_at);
    const local = meta[k];
    if (local && local.t >= remoteT) return false;
    applying = true;
    try {
      if (row.value === null || row.value === undefined) ls.removeItem(PREFIX + k);
      else ls.setItem(PREFIX + k, JSON.stringify(row.value));
    } finally { applying = false; }
    meta[k] = { t: remoteT, dirty: false };
    return true;
  }

  // Runs every time the app comes back to the screen, so it first asks only for keys and
  // timestamps (a few KB) and then downloads the values of the keys that changed elsewhere.
  async function pull(){
    if (!client || !state.user) return false;
    if (!navigator.onLine) { setStatus('offline'); return false; }
    setStatus('syncing');
    let changed = false;
    try {
      const newer = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await client.from('kv').select('key,updated_at').range(from, from + 999);
        if (error) throw error;
        data.forEach(r => {
          if (!r.key || !isSynced(PREFIX + r.key)) return;
          const local = meta[r.key];
          if (!local || local.t < Date.parse(r.updated_at)) newer.push(r.key);
        });
        if (data.length < 1000) break;
      }
      for (let i = 0; i < newer.length; i += 100) {
        const { data, error } = await client.from('kv').select('key,value,updated_at').in('key', newer.slice(i, i + 100));
        if (error) throw error;
        data.forEach(r => { if (applyRow(r)) changed = true; });
      }
      // anything stored here that the account has never seen gets uploaded
      for (let i = 0; i < ls.length; i++) {
        const fk = ls.key(i);
        if (fk && isSynced(fk) && !meta[fk.slice(PREFIX.length)]) meta[fk.slice(PREFIX.length)] = { t: Date.now(), dirty: true };
      }
      saveMeta();
      setStatus('synced', { lastSync: Date.now(), error: null });
      if (hasDirty()) schedulePush(300);
    } catch(e) {
      setStatus(navigator.onLine ? 'error' : 'offline', { error: e.message || String(e) });
    }
    return changed;
  }

  // ---- live updates + lifecycle -----------------------------------------------
  let channel = null, started = false;
  function startBackground(onRemoteChange){
    if (!client || !state.user || started) return;
    started = true;
    channel = client.channel('kv-' + state.user.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'kv', filter: 'user_id=eq.' + state.user.id }, payload => {
        const row = payload.new && payload.new.key ? payload.new : null;
        if (row && applyRow(row)) { saveMeta(); onRemoteChange(); }
      })
      .subscribe();
    window.addEventListener('online', async () => { await push(); if (await pull()) onRemoteChange(); });
    window.addEventListener('offline', () => setStatus('offline'));
    document.addEventListener('visibilitychange', async () => {
      if (document.visibilityState === 'hidden') { push(); return; }
      if (await pull()) onRemoteChange();
    });
    window.addEventListener('pagehide', () => { if (hasDirty()) push(); });
    if (hasDirty()) schedulePush(500);
  }

  // ---- auth ------------------------------------------------------------------
  const AUTH_MESSAGES = [
    [/invalid login credentials/i, 'E-mail ou senha incorretos.'],
    [/email not confirmed/i, 'Essa conta ainda não foi ativada no servidor. Tente de novo mais tarde.'],
    [/already registered|already been registered|user already exists/i, 'Já existe uma conta com esse e-mail. Use "Entrar".'],
    [/at least 6|password should be/i, 'A senha precisa ter pelo menos 6 caracteres.'],
    [/rate limit|too many/i, 'Muitas tentativas seguidas. Aguarde um minuto e tente de novo.'],
    [/invalid.*email|unable to validate email/i, 'Esse e-mail não parece válido.'],
    [/failed to fetch|network/i, 'Sem conexão com o servidor. Verifique a internet.'],
  ];
  const friendly = e => {
    const msg = (e && e.message) || String(e);
    const hit = AUTH_MESSAGES.find(([re]) => re.test(msg));
    return hit ? hit[1] : 'Não foi possível concluir: ' + msg;
  };

  async function restoreSession(){
    if (!client) return null;
    const { data } = await client.auth.getSession();
    state.user = data && data.session ? data.session.user : null;
    if (state.user) setStatus(navigator.onLine ? 'synced' : 'offline');
    return state.user;
  }
  async function signIn(email, password){
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw new Error(friendly(error));
    state.user = data.user;
    return data.user;
  }
  // No e-mail confirmation: the account is ready to use as soon as it is created.
  // (Supabase → Authentication → Email → "Confirm email" must be off; with it on, the
  // sign-in below fails and the person sees why instead of waiting for an e-mail.)
  async function signUp(email, password){
    const { data, error } = await client.auth.signUp({ email, password });
    if (error) throw new Error(friendly(error));
    if (data.session) { state.user = data.user; return data.user; }
    return signIn(email, password);
  }
  async function signOut(){
    await push();
    if (hasDirty()) throw new Error('Ainda há alterações que não foram enviadas. Conecte-se à internet e tente de novo.');
    if (channel) { client.removeChannel(channel); channel = null; }
    await client.auth.signOut();
    state.user = null;
    // the data lives in the account; leave nothing behind on this device
    applying = true;
    try {
      const keys = [];
      for (let i = 0; i < ls.length; i++) { const k = ls.key(i); if (k && k.startsWith(PREFIX)) keys.push(k); }
      keys.forEach(k => ls.removeItem(k));
    } finally { applying = false; }
    meta = {};
    setStatus('local', { lastSync: null, error: null });
  }

  // ---- push notifications ------------------------------------------------------
  const PUSH_ERRORS = [
    [/relation .*push_subscriptions.* does not exist|could not find the table/i, 'O Supabase ainda não foi preparado para notificações (falta rodar supabase/push.sql).'],
    [/failed to fetch|network/i, 'Sem conexão com o servidor. Verifique a internet.'],
  ];
  const pushFriendly = e => {
    const msg = (e && e.message) || String(e);
    const hit = PUSH_ERRORS.find(([re]) => re.test(msg));
    return new Error(hit ? hit[1] : msg);
  };
  async function currentPushSub(){
    if (!('serviceWorker' in navigator)) return null;
    const reg = await navigator.serviceWorker.getRegistration();
    return reg && reg.pushManager ? reg.pushManager.getSubscription() : null;
  }
  async function savePush(sub, tz){
    if (!client || !state.user) throw new Error('Entre na sua conta para ativar as notificações.');
    const j = sub.toJSON();
    const { error } = await client.from('push_subscriptions').upsert(
      { endpoint: j.endpoint, user_id: state.user.id, p256dh: j.keys.p256dh, auth: j.keys.auth, tz },
      { onConflict: 'endpoint' });
    if (error) throw pushFriendly(error);
  }
  async function deletePush(endpoint){
    if (!client || !state.user) return;
    await client.from('push_subscriptions').delete().eq('endpoint', endpoint);
  }
  async function testPush(){
    if (!client || !state.user) throw new Error('Entre na sua conta para testar.');
    const { data, error } = await client.functions.invoke('lembretes', { body: { test: true } });
    if (error) {
      const status = error.context && error.context.status;
      if (status === 404) throw new Error('A função de lembretes ainda não foi publicada no Supabase.');
      throw pushFriendly(error);
    }
    return data;
  }
  // leaving the account also stops this device from getting that account's reminders
  const _signOut = signOut;
  async function signOutAndUnsubscribe(){
    try {
      const sub = await currentPushSub();
      if (sub) { await deletePush(sub.endpoint); await sub.unsubscribe(); }
    } catch (e) {}
    return _signOut();
  }

  window.Sync = {
    enabled,
    get state(){ return Object.assign({}, state); },
    get user(){ return state.user; },
    onChange(fn){ listeners.add(fn); fn(Object.assign({}, state)); return () => listeners.delete(fn); },
    hasSyncedBefore: () => Object.keys(meta).length > 0,
    hasPending: hasDirty,
    restoreSession, signIn, signUp, signOut: signOutAndUnsubscribe, pull, push, startBackground,
    currentPushSub, savePush, deletePush, testPush,
  };
})();
