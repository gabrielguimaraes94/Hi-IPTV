// Lista M3U → catálogo no mesmo formato compacto da API Xtream. Módulo puro (sem DOM): testável no Node.
import { clean, splitYear } from './text.js';

// "Show S01 E02", "Show.S1E2.Titulo": mesmo padrão que o Xtream usa nos episódios.
const SERIES_RE = /^(.*?)[\s._-]*[Ss](\d{1,2})[\s._-]*[Ee](\d{1,3})\b[\s._-]*(.*)$/;
const VIDEO_EXT = /\.(mp4|mkv|avi|mov|wmv|m4v)$/i;

const attr = (line, k) => (line.match(new RegExp(k + '="([^"]*)"', 'i')) || [])[1] || '';

export function parseM3U(text) {
  const out = [];
  let meta = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#EXTINF')) {
      meta = {
        name: clean(line.slice(line.lastIndexOf(',') + 1)) || attr(line, 'tvg-name') || '',
        logo: attr(line, 'tvg-logo'), group: clean(attr(line, 'group-title')), tvg: attr(line, 'tvg-id'),
      };
    } else if (line.startsWith('#EXTGRP:') && meta) {
      meta.group = clean(line.slice(8)) || meta.group;
    } else if (!line.startsWith('#')) {
      out.push({ ...(meta || { name: line, logo: '', group: '', tvg: '' }), url: line });
      meta = null;
    }
  }
  return out;
}

// 'vod' | 'series' | 'live' pelos sinais da própria URL e do nome.
export function classify(e) {
  const p = e.url.split('?')[0].toLowerCase();
  if (/\/series\//.test(p) || SERIES_RE.test(e.name)) return 'series';
  if (/\/movie\//.test(p) || VIDEO_EXT.test(p)) return 'vod';
  return 'live';
}

const extOf = url => ((url.split('?')[0].match(/\.([a-z0-9]{2,4})$/i) || [])[1] || 'mp4').toLowerCase();

// Série guardada compacta (tuplas) → formato que as telas usam (igual ao de seriesInfo do Xtream).
export const expandSeries = raw => ({
  bd: [], plot: '', genre: '', cast: '', dir: '', date: '', rating: 0,
  seasons: raw.seasons.map(se => ({
    n: se.n,
    eps: se.e.map(([id, num, t, ext, img, u]) => ({ id, num, t, ext, img, plot: '', dur: 0, sn: se.n, u })),
  })),
});

// isAdult(texto) decide o que sai do catálogo (categoria ou nome).
export function buildCatalog(entries, isAdult = () => false) {
  const N = entries.length;
  const cats = { vod: new Map(), series: new Map(), live: new Map() };
  const catId = (kind, group) => {
    const name = group || 'Sem categoria';
    if (!cats[kind].has(name)) cats[kind].set(name, { id: kind[0] + ':' + name, n: name });
    return cats[kind].get(name).id;
  };
  const vod = [], live = [], series = [], eps = {};
  const showByKey = new Map(), seen = new Set();
  let nextVod = 1, nextLive = 1, nextShow = 1, nextEp = 1;

  entries.forEach((e, idx) => {
    if (isAdult(e.group) || isAdult(e.name)) return;
    const kind = classify(e);
    const a = N - idx;   // M3U não tem data: a ordem da lista vale como "mais recente primeiro"
    if (kind === 'live') {
      live.push({ id: nextLive++, n: e.name, i: e.logo, c: catId('live', e.group), u: e.url, tv: e.tvg });
    } else if (kind === 'vod') {
      const [n, y] = splitYear(e.name);
      const c = catId('vod', e.group), key = `${c}|${n.toLowerCase()}|${y}`;
      if (seen.has(key)) return;
      seen.add(key);
      vod.push({ id: nextVod++, n, y, i: e.logo, r: 0, a, c, x: extOf(e.url), u: e.url });
    } else {
      const m = e.name.match(SERIES_RE);
      const show = clean(m ? m[1] : e.name), sn = m ? +m[2] : 1, num = m ? +m[3] : 1, title = clean(m ? m[4] : '');
      const c = catId('series', e.group), key = `${c}|${show.toLowerCase()}`;
      let s = showByKey.get(key);
      if (!s) {
        const [n, y] = splitYear(show);
        s = { id: nextShow++, n, y, i: e.logo, b: '', p: '', g: '', r: 0, a, c };
        showByKey.set(key, s);
        series.push(s);
        eps[s.id] = { seasons: [], _m: new Map() };
      }
      const info = eps[s.id];
      let season = info._m.get(sn);
      if (!season) { season = { n: sn, e: [] }; info._m.set(sn, season); info.seasons.push(season); }
      season.e.push([nextEp++, num, title, extOf(e.url), e.logo, e.url]);   // tupla: [id, nº, título, ext, capa, url]
    }
  });

  for (const info of Object.values(eps)) {
    delete info._m;
    info.seasons.sort((x, y) => x.n - y.n);
    for (const se of info.seasons) se.e.sort((x, y) => x[1] - y[1]);
  }
  const list = kind => [...cats[kind].values()];
  return { vod, series, live, vodCats: list('vod'), seriesCats: list('series'), liveCats: list('live'), eps };
}
