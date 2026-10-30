// Persistência: localStorage para o pequeno (conta, progresso, minha lista),
// IndexedDB para o catálogo (~16 MB de JSON não cabe no localStorage).

export const ls = {
  get(k, d) { try { const v = localStorage.getItem('hi:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('hi:' + k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem('hi:' + k); } catch {} },
};

// Preferências da tela Ajustes. Ficam fora de 'cfg', então sobrevivem a "Sair da conta".
const PREF_DEF = { theme: 'brasa', scale: 'normal', motion: 'full', live: 'ts' };
export const prefs = {
  get: k => ({ ...PREF_DEF, ...ls.get('prefs', {}) })[k],
  set(k, v) { ls.set('prefs', { ...ls.get('prefs', {}), [k]: v }); },
};

let dbp;
const open = () => dbp ||= new Promise((res, rej) => {
  const r = indexedDB.open('hi-iptv', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('kv');
  r.onsuccess = () => res(r.result);
  r.onerror = () => rej(r.error);
});

async function tx(mode, fn) {
  const db = await open();
  return new Promise((res, rej) => {
    const t = db.transaction('kv', mode);
    const req = fn(t.objectStore('kv'));
    t.oncomplete = () => res(req && req.result);
    t.onerror = t.onabort = () => rej(t.error);
  });
}

export const idb = {
  get: k => tx('readonly', s => s.get(k)).catch(() => undefined),
  set: (k, v) => tx('readwrite', s => s.put(v, k)),
  del: k => tx('readwrite', s => s.delete(k)).catch(() => {}),
};

// ---- Continuar assistindo ----
// chave: 'm:<id>' (filme) ou 'e:<id do episódio>'
export const prog = {
  all: () => ls.get('prog', {}),
  get(k) { return this.all()[k]; },
  save(k, t, d, meta) {
    if (!isFinite(d) || d < 60) return;
    const p = this.all();
    if (t / d > 0.95) delete p[k];
    else if (t > 10) p[k] = { ...meta, t, d, at: Date.now() };
    else return;
    const keep = Object.entries(p).sort((a, b) => b[1].at - a[1].at).slice(0, 40);
    ls.set('prog', Object.fromEntries(keep));
  },
  recent() { return Object.entries(this.all()).sort((a, b) => b[1].at - a[1].at); },
};

// ---- Minha lista ----  chave: 'm:<id>' | 's:<id>'
export const mylist = {
  all: () => ls.get('list', []),
  has(k) { return this.all().includes(k); },
  toggle(k) {
    const l = this.all(), i = l.indexOf(k);
    i >= 0 ? l.splice(i, 1) : l.unshift(k);
    ls.set('list', l);
    return i < 0;
  },
};
