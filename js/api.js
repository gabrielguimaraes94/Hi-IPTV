// Cliente Xtream Codes (player_api.php) + catálogo em cache diário.
import { idb } from './store.js';

let cfg = null;   // { host, user, pass, proxy }
let base = '';    // origem dos streams (server_info)

export const D = {};   // catálogo indexado (preenchido por buildIndex)

const ADULT = /18\+|adult|porno|hentai|xxx/i;
const normHost = h => { h = h.trim().replace(/\/+$/, ''); return /^https?:\/\//i.test(h) ? h : 'http://' + h; };

export function configure(c) { cfg = { ...c, host: normHost(c.host) }; base = ''; }
export const conf = () => cfg;
export const setBase = b => { base = b; };
export const viaProxy = u => (cfg && cfg.proxy ? '/proxy?u=' + encodeURIComponent(u) : u);

export async function api(action, params = {}) {
  const q = new URLSearchParams({ username: cfg.user, password: cfg.pass, ...(action ? { action } : {}), ...params });
  const r = await fetch(viaProxy(`${cfg.host}/player_api.php?${q}`));
  if (!r.ok) throw new Error('Servidor respondeu ' + r.status);
  return r.json();
}

export async function login() {
  const d = await api('');
  if (!d.user_info || d.user_info.auth !== 1) throw new Error('Usuário ou senha inválidos');
  const s = d.server_info || {};
  base = s.url ? `${s.server_protocol || 'http'}://${s.url}${s.port && s.port !== '80' ? ':' + s.port : ''}` : cfg.host;
  return d;
}

// ---- URLs de reprodução ----
export const urlMovie = m => `${base}/movie/${cfg.user}/${cfg.pass}/${m.id}.${m.x || 'mp4'}`;
export const urlEpisode = e => `${base}/series/${cfg.user}/${cfg.pass}/${e.id}.${e.ext || 'mp4'}`;
export const urlLive = (c, ext = 'm3u8') => `${base}/live/${cfg.user}/${cfg.pass}/${c.id}.${ext}`;
export const small = u => (u ? u.replace('_big.', '_small.') : '');

// ---- Catálogo ----
export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const CATALOG_V = 3;   // sobe quando muda a limpeza/estrutura dos dados em cache
const clean = s => (s || '').replace(/\s+/g, ' ').trim();
function splitYear(name) {
  const t = clean(name);
  const m = t.match(/^(.*?)\s*[-–]\s*((?:19|20)\d{2})(?:\s*\((?:L|\d{1,2})\))?$/);
  return m ? [m[1], +m[2]] : [t, 0];
}
const firstBackdrop = b => (Array.isArray(b) ? b[0] : String(b || '').split(/\s+/)[0]) || '';

const JOBS = [
  ['Categorias de filmes', 'get_vod_categories'],
  ['Filmes', 'get_vod_streams'],
  ['Categorias de séries', 'get_series_categories'],
  ['Séries', 'get_series'],
  ['Categorias de canais', 'get_live_categories'],
  ['Canais ao vivo', 'get_live_streams'],
];

export async function refresh(onStep) {
  const info = await login();
  let done = 0;
  onStep(0, JOBS.length, 'Conectando');
  const raw = {};
  await Promise.all(JOBS.map(async ([label, act]) => {
    raw[act] = await api(act);
    onStep(++done, JOBS.length, label);
  }));

  // Categorias adultas saem do app inteiro (e os itens marcados is_adult).
  const keepCats = list => list.filter(c => !ADULT.test(c.category_name)).map(c => ({ id: c.category_id, n: clean(c.category_name) }));
  const vodCats = keepCats(raw.get_vod_categories), seriesCats = keepCats(raw.get_series_categories), liveCats = keepCats(raw.get_live_categories);
  const ok = cats => new Set(cats.map(c => c.id));
  const okV = ok(vodCats), okS = ok(seriesCats), okL = ok(liveCats);

  // O provedor repete o mesmo título (versões HD/FHD) na mesma categoria: fica um só.
  const seen = new Set();
  const dup = (c, n, y) => { const k = `${c}|${n.toLowerCase()}|${y}`; return seen.has(k) || !seen.add(k); };

  const vod = [];
  for (const x of raw.get_vod_streams) {
    if (x.is_adult === '1' || !okV.has(String(x.category_id))) continue;
    const [n, y] = splitYear(x.name);
    if (dup('v' + x.category_id, n, y)) continue;
    vod.push({ id: x.stream_id, n, y, i: x.stream_icon, r: +x.rating || 0, a: +x.added || 0, c: String(x.category_id), x: x.container_extension || 'mp4' });
  }
  const series = [];
  for (const x of raw.get_series) {
    if (!okS.has(String(x.category_id))) continue;
    const [n, y0] = splitYear(x.name);
    if (dup('s' + x.category_id, n, y0)) continue;
    series.push({
      id: x.series_id, n, y: y0 || +String(x.releaseDate || '').slice(0, 4) || 0, i: x.cover, b: firstBackdrop(x.backdrop_path),
      p: x.plot || '', g: x.genre || '', r: +x.rating || 0, a: +x.last_modified || 0, c: String(x.category_id),
    });
  }
  const live = [];
  for (const x of raw.get_live_streams) {
    if (x.is_adult === '1' || !okL.has(String(x.category_id))) continue;
    live.push({ id: x.stream_id, n: clean(x.name), i: x.stream_icon, c: String(x.category_id) });
  }

  const cat = {
    v: CATALOG_V, day: today(), at: Date.now(), user: cfg.user, server: base,
    acct: { exp: +info.user_info.exp_date || 0, maxc: +info.user_info.max_connections || 1 },
    vod, vodCats, series, seriesCats, live, liveCats,
  };
  await idb.set('catalog', cat);
  return cat;
}

export async function loadCatalog() {
  const c = await idb.get('catalog');
  return c && c.v === CATALOG_V && c.user === cfg.user ? c : null;
}

export function buildIndex(cat) {
  Object.assign(D, cat);
  const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  D.norm = norm;
  for (const list of [D.vod, D.series, D.live]) for (const x of list) x.q = norm(x.n);
  D.vodNew = [...D.vod].sort((a, b) => b.a - a.a);
  D.seriesNew = [...D.series].sort((a, b) => b.a - a.a);
  const group = list => {
    const m = new Map();
    for (const x of list) { if (!m.has(x.c)) m.set(x.c, []); m.get(x.c).push(x); }
    return m;
  };
  D.vodBy = group(D.vodNew); D.seriesBy = group(D.seriesNew); D.liveBy = group(D.live);
  D.vodById = new Map(D.vod.map(x => [x.id, x]));
  D.seriesById = new Map(D.series.map(x => [x.id, x]));
  D.ready = true;
}

// ---- Detalhes sob demanda (nunca por cartão) ----
const memo = new Map();
function cached(key, loader, ttl = 7 * 864e5) {
  if (memo.has(key)) return memo.get(key);
  const p = (async () => {
    const hit = await idb.get(key);
    if (hit && Date.now() - hit.at < ttl) return hit.v;
    const v = await loader();
    idb.set(key, { at: Date.now(), v }).catch(() => {});
    return v;
  })();
  memo.set(key, p);
  p.catch(() => memo.delete(key));
  return p;
}
const backdrops = i => (Array.isArray(i.backdrop_path) && i.backdrop_path.length ? i.backdrop_path : String(i.backdrop || '').split(/\s+/).filter(Boolean));

export const vodInfo = id => cached('vi:' + id, async () => {
  const i = (await api('get_vod_info', { vod_id: id })).info || {};
  return {
    bd: backdrops(i), plot: i.plot || i.description || '', genre: i.genre || '', cast: i.cast || i.actors || '',
    dir: i.director || '', date: i.releasedate || '', dur: +i.duration_secs || 0, rating: +i.rating || 0,
  };
});

export const seriesInfo = id => cached('si:' + id, async () => {
  const d = await api('get_series_info', { series_id: id });
  const i = d.info || {};
  const eps = Array.isArray(d.episodes) ? { 1: d.episodes } : d.episodes || {};
  const seasons = Object.keys(eps).sort((a, b) => a - b).map(n => ({
    n: +n,
    eps: eps[n].map(e => ({
      id: e.id, num: +e.episode_num || 0, t: e.title || '', ext: e.container_extension || 'mp4',
      img: (e.info && e.info.movie_image) || '', plot: (e.info && e.info.plot) || '', dur: +(e.info && e.info.duration_secs) || 0, sn: +n,
    })),
  }));
  return {
    bd: backdrops(i), plot: i.plot || '', genre: i.genre || '', cast: i.cast || '', dir: i.director || '',
    date: i.releaseDate || '', rating: +i.rating || 0, seasons,
  };
});
