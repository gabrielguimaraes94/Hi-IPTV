// Fontes de lista (Xtream Codes via player_api.php, ou M3U) + catálogo em cache diário.
import { idb } from './store.js';
import { clean, splitYear, ADULT } from './text.js';
import { parseM3U, buildCatalog, expandSeries } from './m3u.js';

let cfg = null;   // { type: 'xtream'|'m3u', proxy, host, user, pass | url, epg }
let base = '';    // origem dos streams (server_info do Xtream)

export const D = {};   // catálogo indexado (preenchido por buildIndex)

const normHost = h => { h = h.trim().replace(/\/+$/, ''); return /^https?:\/\//i.test(h) ? h : 'http://' + h; };

export function configure(c) {
  const type = c.type === 'm3u' ? 'm3u' : 'xtream';
  cfg = type === 'm3u'
    ? { ...c, type, url: c.url.trim(), epg: (c.epg || '').trim() }
    : { ...c, type, host: normHost(c.host) };
  base = '';
}
export const conf = () => cfg;
export const isM3u = () => !!cfg && cfg.type === 'm3u';
export const setBase = b => { base = b; };
export const viaProxy = u => (cfg && cfg.proxy ? '/proxy?u=' + encodeURIComponent(u) : u);
// Identifica a fonte do cache: trocar de lista/conta invalida o catálogo salvo.
const sourceKey = () => (cfg.type === 'm3u' ? 'm3u|' + cfg.url : 'xtream|' + cfg.host + '|' + cfg.user);

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

// ---- URLs de reprodução (M3U já traz a URL pronta em `u`) ----
export const urlMovie = m => m.u || `${base}/movie/${cfg.user}/${cfg.pass}/${m.id}.${m.x || 'mp4'}`;
export const urlEpisode = e => e.u || `${base}/series/${cfg.user}/${cfg.pass}/${e.id}.${e.ext || 'mp4'}`;
export const urlLive = (c, ext = 'm3u8') => (c.u ? (ext === 'm3u8' ? c.u : null) : `${base}/live/${cfg.user}/${cfg.pass}/${c.id}.${ext}`);
export const small = u => (u ? u.replace('_big.', '_small.') : '');

// ---- Catálogo ----
export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const CATALOG_V = 4;   // sobe quando muda a limpeza/estrutura dos dados em cache
const firstBackdrop = b => (Array.isArray(b) ? b[0] : String(b || '').split(/\s+/)[0]) || '';
const tick = () => new Promise(r => setTimeout(r, 0));   // deixa a barra de progresso pintar antes de trabalho pesado

const JOBS = [
  ['Categorias de filmes', 'get_vod_categories'],
  ['Filmes', 'get_vod_streams'],
  ['Categorias de séries', 'get_series_categories'],
  ['Séries', 'get_series'],
  ['Categorias de canais', 'get_live_categories'],
  ['Canais ao vivo', 'get_live_streams'],
];

export async function refresh(onStep) {
  return cfg.type === 'm3u' ? refreshM3u(onStep) : refreshXtream(onStep);
}

async function refreshM3u(onStep) {
  const total = 3;
  onStep(0, total, 'Baixando a lista');
  const r = await fetch(viaProxy(cfg.url));
  if (!r.ok) throw new Error('Servidor respondeu ' + r.status);
  const text = await r.text();
  onStep(1, total, 'Lendo os canais');
  await tick();
  const entries = parseM3U(text);
  if (!entries.length) throw new Error('Nenhum canal encontrado na lista.');
  onStep(2, total, 'Organizando');
  await tick();
  const built = buildCatalog(entries, t => ADULT.test(t));
  const cat = {
    v: CATALOG_V, day: today(), at: Date.now(), type: 'm3u', src: sourceKey(), user: '', server: '',
    acct: { exp: 0, maxc: 0 }, ...built,
  };
  await idb.set('catalog', cat);
  onStep(3, total, 'Concluído');
  return cat;
}

async function refreshXtream(onStep) {
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
    v: CATALOG_V, day: today(), at: Date.now(), type: 'xtream', src: sourceKey(), user: cfg.user, server: base,
    acct: { exp: +info.user_info.exp_date || 0, maxc: +info.user_info.max_connections || 1 },
    vod, vodCats, series, seriesCats, live, liveCats,
  };
  await idb.set('catalog', cat);
  return cat;
}

export async function loadCatalog() {
  const c = await idb.get('catalog');
  return c && c.v === CATALOG_V && c.src === sourceKey() ? c : null;
}

export function buildIndex(cat) {
  Object.assign(D, cat);
  D.eps = cat.eps || null;   // só M3U: temporadas/episódios agrupados localmente
  const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  D.norm = norm;
  for (const list of [D.vod, D.series, D.live]) for (const x of list) x.q = norm(x.n);
  // Listas globais (novos, hero, busca) mostram cada título uma vez; as fileiras por categoria mantêm tudo.
  const uniq = list => { const seen = new Set(); return list.filter(x => { const k = x.n.toLowerCase() + '|' + x.y; return !seen.has(k) && seen.add(k); }); };
  const vodSorted = [...D.vod].sort((a, b) => b.a - a.a), seriesSorted = [...D.series].sort((a, b) => b.a - a.a);
  D.vodNew = uniq(vodSorted);
  D.seriesNew = uniq(seriesSorted);
  const group = list => {
    const m = new Map();
    for (const x of list) { if (!m.has(x.c)) m.set(x.c, []); m.get(x.c).push(x); }
    return m;
  };
  D.vodBy = group(vodSorted); D.seriesBy = group(seriesSorted); D.liveBy = group(D.live);
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

const EMPTY_INFO = { bd: [], plot: '', genre: '', cast: '', dir: '', date: '', dur: 0, rating: 0 };

export const vodInfo = id => (isM3u() ? Promise.resolve(EMPTY_INFO) : cached('vi:' + id, async () => {
  const i = (await api('get_vod_info', { vod_id: id })).info || {};
  return {
    bd: backdrops(i), plot: i.plot || i.description || '', genre: i.genre || '', cast: i.cast || i.actors || '',
    dir: i.director || '', date: i.releasedate || '', dur: +i.duration_secs || 0, rating: +i.rating || 0,
  };
}));

export const seriesInfo = id => (isM3u() ? Promise.resolve(expandSeries(D.eps[id])) : cached('si:' + id, async () => {
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
}));
