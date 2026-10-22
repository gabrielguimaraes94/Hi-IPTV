// Guia de programação. Xtream: get_short_epg sob demanda (por canal, com cache curto).
// M3U + XMLTV: arquivo lido em streaming (pode ter dezenas de MB) guardando só a janela [agora-30min, agora+36h].
import { idb } from './store.js';
import { api, viaProxy, isM3u, conf, today } from './api.js';

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decode = s => s.replace(/&(#x?[0-9a-f]+|amp|lt|gt|quot|apos);/gi, (m, e) => {
  if (e[0] !== '#') return ENT[e.toLowerCase()];
  const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
  return Number.isFinite(code) ? String.fromCodePoint(code) : m;
});
const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

// "20261021200000 +0300" → epoch ms (fuso opcional; sem fuso = UTC)
export function xmltvTime(s) {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?\s*([+-])?(\d{2})?(\d{2})?/.exec(s || '');
  if (!m) return NaN;
  const utc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
  const off = m[7] ? (m[7] === '-' ? -1 : 1) * ((+m[8] || 0) * 60 + (+m[9] || 0)) * 60000 : 0;
  return utc - off;
}

const attr = (s, k) => (new RegExp('\\b' + k + '="([^"]*)"').exec(s) || [])[1] || '';

// Parser incremental (aceita o arquivo em pedaços; um elemento pode ser cortado entre dois pedaços).
export function createXmltvParser(now = Date.now(), { past = 30 * 60e3, future = 36 * 3600e3, perChannel = 40 } = {}) {
  let buf = '';
  const map = {}, names = {};
  const re = /<(programme|channel)\s([^>]*?)(?:\/>|>([\s\S]*?)<\/\1>)/g;
  return {
    feed(str) {
      buf += str;
      let last = 0, m;
      re.lastIndex = 0;
      while ((m = re.exec(buf))) {
        last = re.lastIndex;
        const [, tag, attrs, body = ''] = m;
        if (tag === 'channel') {
          const id = decode(attr(attrs, 'id'));
          for (const n of body.matchAll(/<display-name[^>]*>([^<]*)<\/display-name>/g)) names[norm(decode(n[1]))] = id;
        } else {
          const s = xmltvTime(attr(attrs, 'start')), e = xmltvTime(attr(attrs, 'stop'));
          if (!(e > now - past && s < now + future)) continue;
          const t = (/<title[^>]*>([^<]*)<\/title>/.exec(body) || [])[1];
          if (!t) continue;   // sem título não vira canal no mapa
          const id = decode(attr(attrs, 'channel'));
          const list = map[id] || (map[id] = []);
          if (list.length < perChannel) list.push([s, e, decode(t).trim()]);
        }
      }
      // Guarda só o que sobrou depois do último elemento completo (início de um elemento cortado).
      const tail = buf.slice(last), cut = Math.max(tail.lastIndexOf('<programme'), tail.lastIndexOf('<channel'));
      buf = cut >= 0 ? tail.slice(cut) : tail.slice(-64);
    },
    result() {
      for (const l of Object.values(map)) l.sort((a, b) => a[0] - b[0]);
      return { map, names };
    },
  };
}

// ---- Estado em memória ----
const E = { map: null, names: null, at: 0, day: '' };
export const epgStatus = () => ({ loaded: !!E.map, channels: E.map ? Object.keys(E.map).length : 0, at: E.at });

export async function loadEpg() {
  if (!isM3u() || !conf().epg) return false;
  const c = await idb.get('epg');
  if (!c || c.src !== conf().epg) return false;
  Object.assign(E, { map: c.map, names: c.names, at: c.at, day: c.day });
  return true;
}
export const epgStale = () => !E.map || E.day !== today();

export async function refreshEpg() {
  const url = conf().epg;
  if (!isM3u() || !url) return null;
  const r = await fetch(viaProxy(url));
  if (!r.ok || !r.body) throw new Error('Servidor do guia respondeu ' + r.status);
  let body = r.body;
  if (/\.gz(\?|$)/i.test(url) && typeof DecompressionStream !== 'undefined') body = body.pipeThrough(new DecompressionStream('gzip'));
  const parser = createXmltvParser(), dec = new TextDecoder();
  const reader = body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parser.feed(dec.decode(value, { stream: true }));
  }
  const res = parser.result();
  if (!Object.keys(res.map).length) throw new Error('O guia não tem programação para as próximas horas.');
  Object.assign(E, { ...res, at: Date.now(), day: today() });
  await idb.set('epg', { src: url, day: E.day, at: E.at, map: res.map, names: res.names });
  return epgStatus();
}

// ---- Xtream: get_short_epg ----
const b64 = s => { try { return new TextDecoder().decode(Uint8Array.from(atob(s), c => c.charCodeAt(0))); } catch { return s; } };
const short = new Map();   // stream_id → { at, p: Promise<lista> }
function shortEpg(id) {
  const hit = short.get(id);
  if (hit && Date.now() - hit.at < 5 * 60e3) return hit.p;
  const p = api('get_short_epg', { stream_id: id, limit: 4 })
    .then(d => (d.epg_listings || []).map(x => [(+x.start_timestamp || 0) * 1000, (+x.stop_timestamp || 0) * 1000, b64(x.title || '').trim()]).filter(x => x[2]))
    .catch(() => []);
  short.set(id, { at: Date.now(), p });
  return p;
}

function localList(ch) {
  if (!E.map) return [];
  const id = (ch.tv && E.map[ch.tv] ? ch.tv : null) || E.names[norm(ch.n)];
  return (id && E.map[id]) || [];
}

// { now: [início, fim, título] | null, next: [...] | null } ou null quando não há guia para o canal.
export async function nowNext(ch) {
  const list = isM3u() ? localList(ch) : await shortEpg(ch.id);
  const t = Date.now();
  const now = list.find(p => p[0] <= t && t < p[1]) || null;
  const next = list.find(p => p[0] >= (now ? now[1] : t)) || null;
  return now || next ? { now, next } : null;
}

export const hhmm = ms => new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
