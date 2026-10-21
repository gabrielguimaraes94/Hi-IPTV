// Telas: home, filmes, séries, TV ao vivo, busca e detalhes.
import { D, vodInfo, seriesInfo, urlMovie, urlEpisode, urlLive } from './api.js';
import { prog, mylist, ls } from './store.js';
import { h, svg, ICON, img, card, ratingTag, lazyRow, watchRows, toast, fmtTime, fmtDur } from './ui.js';
import { pushLayer, popLayer, focusEl, topLayer } from './nav.js';
import { openPlayer, closePlayer } from './player.js';

const pretty = s => s.toLowerCase().replace(/(^|[\s/+-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase());
const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
const resumeAt = k => { const p = prog.get(k); return p && p.t / p.d < 0.95 ? p.t : 0; };
const yearOf = (item, info) => item.y || (info && info.date ? +String(info.date).slice(0, 4) : 0) || '';

// ---------------------------------------------------------------- reprodução

export function playMovie(m, info, onClose) {
  const key = 'm:' + m.id;
  openPlayer({
    title: m.n,
    sub: [yearOf(m, info), info && info.genre].filter(Boolean).join(' · '),
    url: urlMovie(m),
    start: resumeAt(key),
    onTime: (t, d) => prog.save(key, t, d, { k: 'm', id: m.id, n: m.n, i: m.i }),
    onClose,
  });
}

function epTitle(ep) { return ep.t && !/^S\d+\s*E\d+$/i.test(ep.t.trim()) ? ep.t : `Episódio ${ep.num}`; }

function playEpisode(s, info, si, ei, onClose) {
  const sea = info.seasons[si], ep = sea.eps[ei], key = 'e:' + ep.id;
  const label = `T${sea.n} · E${ep.num}`;
  openPlayer({
    title: s.n,
    sub: `${label} · ${epTitle(ep)}`,
    url: urlEpisode(ep),
    start: resumeAt(key),
    onTime: (t, d) => prog.save(key, t, d, { k: 'e', id: s.id, n: s.n, i: s.i, ep: ep.id, sub: label }),
    onEnd: () => {
      let a = si, b = ei + 1;
      if (b >= sea.eps.length) { a++; b = 0; }
      info.seasons[a] ? playEpisode(s, info, a, b, onClose) : closePlayer();
    },
    onClose,
  });
}

async function resumeEpisode(s, p) {
  toast('Carregando episódio…');
  try {
    const info = await seriesInfo(s.id);
    for (let si = 0; si < info.seasons.length; si++) {
      const ei = info.seasons[si].eps.findIndex(e => String(e.id) === String(p.ep));
      if (ei >= 0) return playEpisode(s, info, si, ei);
    }
  } catch {}
  openDetail('s', s);
}

function liveOpts(list, i, catName) {
  const c = list[i], n = list.length;
  ls.set('lastLive', c.id);
  return { live: true, title: c.n, sub: catName, url: urlLive(c), alt: urlLive(c, 'ts'), zap: d => liveOpts(list, (i + d + n) % n, catName) };
}

// ---------------------------------------------------------------- cartões e fileiras

const movieCard = m => card(m, { tag: ratingTag(m.r), cap: m.y ? `${m.n} · ${m.y}` : m.n, onOpen: () => openDetail('m', m) });
const seriesCard = s => card(s, { tag: ratingTag(s.r), cap: s.y ? `${s.n} · ${s.y}` : s.n, onOpen: () => openDetail('s', s) });
const itemCard = k => (k.startsWith('m:') ? (it => it && movieCard(it))(D.vodById.get(+k.slice(2)))
  : (it => it && seriesCard(it))(D.seriesById.get(+k.slice(2))));

const buildNow = r => { r._build(); return r; };

function continueRow() {
  const cards = prog.recent().map(([, p]) => {
    if (p.k === 'm') {
      const m = D.vodById.get(p.id) || { id: p.id, n: p.n, i: p.i };
      return card(p, { cap: p.n, pct: p.t / p.d, onOpen: () => playMovie(m) });
    }
    const s = D.seriesById.get(p.id) || { id: p.id, n: p.n, i: p.i };
    return card(p, { cap: `${p.n} · ${p.sub}`, pct: p.t / p.d, onOpen: () => resumeEpisode(s, p) });
  });
  return cards.length ? buildNow(lazyRow('Continuar assistindo', () => cards)) : null;
}

function listRow() {
  const cards = mylist.all().map(itemCard).filter(Boolean);
  return cards.length ? buildNow(lazyRow('Minha lista', () => cards)) : null;
}

const newRow = (title, list, mk) => lazyRow(title, () => list.slice(0, 40).map(mk));
const catRows = (cats, by, mk, limit = 99) =>
  cats.filter(c => (by.get(c.id) || []).length).slice(0, limit)
    .map(c => lazyRow(pretty(c.n), () => by.get(c.id).slice(0, 40).map(mk)));

// ---------------------------------------------------------------- hero

async function heroSlides(kinds) {
  const mPool = shuffle(D.vodNew.filter(m => m.r >= 6.3 && m.i).slice(0, 60));
  const sPool = shuffle(D.seriesNew.filter(s => s.b && s.r >= 6.3).slice(0, 60));
  const picks = kinds.map(k => (k === 'm' ? mPool.shift() : sPool.shift())).filter(Boolean);
  const out = await Promise.all(picks.map(async it => {
    try {
      if (D.vodById.get(it.id) === it) {
        const inf = await vodInfo(it.id);
        return inf.bd[0] ? { kind: 'm', it, bd: inf.bd[0], plot: inf.plot, genre: inf.genre, info: inf } : null;
      }
      return { kind: 's', it, bd: it.b, plot: it.p, genre: it.g };
    } catch { return null; }
  }));
  return out.filter(Boolean);
}

function buildHero(slides) {
  const stage = h('div', { class: 'stage' }, slides.map(s => h('div', { class: 'slide' }, h('img', { src: s.bd, alt: '' }))));
  const ttl = h('h1', { class: 'ttl' }), meta = h('p', { class: 'meta' }), plot = h('p', { class: 'plot' });
  const play = h('button', { class: 'btn primary', 'data-f': '', 'data-scroll': 'top' }, svg(ICON.play), 'Assistir');
  const more = h('button', { class: 'btn', 'data-f': '', 'data-scroll': 'top' }, svg(ICON.info), 'Mais informações');
  const copy = h('div', { class: 'copy' }, ttl, meta, plot, h('div', { class: 'btns' }, play, more));
  const ticks = h('div', { class: 'ticks' }, slides.map(() => h('i')));
  const el = h('section', { class: 'hero' }, stage, h('div', { class: 'scrim' }), copy, ticks);
  let idx = -1, timer = 0;

  function show(i) {
    idx = i;
    const s = slides[i];
    [...stage.children].forEach((c, k) => c.classList.toggle('on', k === i));
    [...ticks.children].forEach((t, k) => { t.className = k < i ? 'done' : ''; });
    void ticks.offsetWidth;
    ticks.children[i].className = 'now';
    copy.classList.remove('in'); void copy.offsetWidth;
    ttl.textContent = s.it.n;
    meta.textContent = [yearOf(s.it, s.info), pretty(s.genre.split(/[\/,]/)[0] || ''), ratingTag(s.it.r)].filter(Boolean).join('  ·  ');
    plot.textContent = s.plot;
    play.onclick = () => (s.kind === 'm' ? playMovie(s.it, s.info) : openDetail('s', s.it));
    more.onclick = () => openDetail(s.kind, s.it);
    copy.classList.add('in');
  }
  show(0);
  if (slides.length > 1) timer = setInterval(() => { if (!document.hidden && !topLayer()) show((idx + 1) % slides.length); }, 9000);
  return { el, stop: () => clearInterval(timer), play };
}

async function mountHero(host, kinds, ctl) {
  const slides = await heroSlides(kinds).catch(() => []);
  if (ctl.dead) return;
  if (!slides.length) { host.classList.add('none'); return; }
  const hero = buildHero(slides);
  ctl.stops.push(hero.stop);
  host.append(hero.el);
  const ae = document.activeElement;
  if (ctl.wanted && (ae === document.body || ae === host.parentNode.querySelector('.portal, .card'))) focusEl(hero.play);
}

// ---------------------------------------------------------------- telas

function portal(label, count, srcs, cls, onOpen) {
  const cols = [0, 1, 2].map(c => {
    const set = srcs.filter((_, i) => i % 3 === c);
    return h('div', { class: 'col' }, [...set, ...set].map(src => h('span', { class: 'cell' }, img(src, '', { eager: true }))));
  });
  return h('button', { class: 'portal ' + cls, 'data-f': '', onclick: onOpen },
    h('div', { class: 'cols' }, cols), h('div', { class: 'veil' }),
    h('div', { class: 'lbl' }, h('small', {}, count), h('b', {}, label)));
}

export function homeView(ctx) {
  const ctl = { stops: [], dead: false };
  const heroHost = h('div', { class: 'hero-host' });
  const n = x => x.toLocaleString('pt-BR');
  const sample = (list, k) => shuffle(list.slice(0, 500).filter(x => x.i)).slice(0, k).map(x => x.i);
  const portals = h('section', { class: 'portals' },
    portal('Filmes', `${n(D.vod.length)} títulos`, sample(D.vodNew, 15), 'p-movies', () => ctx.go('movies')),
    portal('Séries', `${n(D.series.length)} séries`, sample(D.seriesNew, 15), 'p-series', () => ctx.go('series')),
    portal('TV ao Vivo', `${n(D.live.length)} canais`, shuffle(D.live.filter(c => c.i)).slice(0, 15).map(c => c.i), 'p-live logos', () => ctx.go('live')));

  const rows = [
    continueRow(), listRow(),
    newRow('Filmes recém-adicionados', D.vodNew, movieCard),
    newRow('Séries com episódios novos', D.seriesNew, seriesCard),
    lazyRow('Os mais bem avaliados', () => [...D.vodNew.slice(0, 800)].sort((a, b) => b.r - a.r).slice(0, 40).map(movieCard)),
    ...catRows(D.vodCats, D.vodBy, movieCard, 3),
    ...catRows(D.seriesCats, D.seriesBy, seriesCard, 3),
  ].filter(Boolean);

  const el = h('div', { class: 'home' }, heroHost, portals, ...rows);
  const stopRows = watchRows(el);
  mountHero(heroHost, ['m', 'm', 'm', 'm', 's', 's'], ctl);
  return {
    el,
    focus: () => { ctl.wanted = true; focusEl(el.querySelector('.hero .btn') || el.querySelector('.portal')); },
    cleanup: () => { ctl.dead = true; ctl.stops.forEach(f => f()); stopRows(); },
  };
}

function catalogView(kind) {
  const isM = kind === 'm';
  const ctl = { stops: [], dead: false };
  const heroHost = h('div', { class: 'hero-host' });
  const mk = isM ? movieCard : seriesCard;
  const rows = [
    isM ? newRow('Recém-adicionados', D.vodNew, mk) : newRow('Atualizadas recentemente', D.seriesNew, mk),
    ...catRows(isM ? D.vodCats : D.seriesCats, isM ? D.vodBy : D.seriesBy, mk),
  ];
  const el = h('div', { class: 'home catalog' }, heroHost, h('div', { class: 'rows' }, rows));
  const stopRows = watchRows(el);
  mountHero(heroHost, isM ? ['m', 'm', 'm', 'm', 'm', 'm'] : ['s', 's', 's', 's', 's', 's'], ctl);
  return {
    el,
    focus: () => { ctl.wanted = true; focusEl(el.querySelector('.hero .btn') || el.querySelector('.card')); },
    cleanup: () => { ctl.dead = true; ctl.stops.forEach(f => f()); stopRows(); },
  };
}
export const moviesView = () => catalogView('m');
export const seriesView = () => catalogView('s');

function tile(c, onOpen) {
  return h('button', { class: 'tile', 'data-f': '', title: c.n, onclick: onOpen },
    h('span', { class: 'logo' }, h('span', { class: 'ph' }, c.n.slice(0, 2)), img(c.i, '', { full: true })),
    h('span', { class: 'nm' }, c.n));
}

export function liveView() {
  const cats = D.liveCats.filter(c => (D.liveBy.get(c.id) || []).length);
  let cur = ls.get('liveCat', cats[0] && cats[0].id);
  if (!cats.some(c => c.id === cur)) cur = cats[0] && cats[0].id;
  const rail = h('div', { class: 'rail' }), grid = h('div', { class: 'grid' });

  function select(id, keepFocus) {
    cur = id; ls.set('liveCat', id);
    [...rail.children].forEach(b => b.classList.toggle('on', b.dataset.id === id));
    const list = D.liveBy.get(id) || [], name = pretty(cats.find(c => c.id === id).n);
    grid.textContent = '';
    grid.append(h('h2', {}, name), h('div', { class: 'tiles' }, list.map((c, i) => tile(c, () => openPlayer(liveOpts(list, i, name))))));
    if (!keepFocus) window.scrollTo({ top: 0 });
  }
  cats.forEach(c => rail.append(h('button', { class: 'rail-i', 'data-f': '', 'data-id': c.id, onclick: () => select(c.id, true) },
    h('span', {}, pretty(c.n)), h('small', {}, (D.liveBy.get(c.id) || []).length))));
  select(cur, true);
  const el = h('div', { class: 'live' }, rail, grid);
  return { el, focus: () => focusEl(rail.querySelector('.on') || rail.firstChild), cleanup() {} };
}

export function searchView() {
  const input = h('input', { type: 'search', 'data-f': '', 'data-scroll': 'top', placeholder: 'Buscar filmes, séries e canais', autocomplete: 'off' });
  const out = h('div', { class: 'results' }, h('p', { class: 'hint' }, 'Digite ao menos 2 letras.'));
  let t = 0;
  function run() {
    const q = D.norm(input.value.trim());
    out.textContent = '';
    if (q.length < 2) { out.append(h('p', { class: 'hint' }, 'Digite ao menos 2 letras.')); return; }
    const mv = D.vodNew.filter(x => x.q.includes(q)).slice(0, 40);
    const sr = D.seriesNew.filter(x => x.q.includes(q)).slice(0, 40);
    const lv = D.live.filter(x => x.q.includes(q)).slice(0, 40);
    if (!mv.length && !sr.length && !lv.length) { out.append(h('p', { class: 'hint' }, 'Nada encontrado.')); return; }
    if (mv.length) out.append(buildNow(lazyRow(`Filmes (${mv.length})`, () => mv.map(movieCard))));
    if (sr.length) out.append(buildNow(lazyRow(`Séries (${sr.length})`, () => sr.map(seriesCard))));
    if (lv.length) out.append(buildNow(lazyRow(`Canais (${lv.length})`, () => lv.map((c, i) => tile(c, () => openPlayer(liveOpts(lv, i, 'Busca')))))));
  }
  input.addEventListener('input', () => { clearTimeout(t); t = setTimeout(run, 180); });
  return { el: h('div', { class: 'search' }, input, out), focus: () => input.focus(), cleanup: () => clearTimeout(t) };
}

// ---------------------------------------------------------------- detalhes

export function openDetail(kind, item) {
  const isS = kind === 's';
  const key = (isS ? 's:' : 'm:') + item.id;
  const prev = document.activeElement;
  let info = null, curSeason = 0;

  const bd = h('img', { class: 'd-bd', alt: '' });
  bd.onload = () => bd.classList.add('ok');
  if (item.b) bd.src = item.b;
  const ttl = h('h1', {}, item.n), meta = h('p', { class: 'meta' }), plot = h('p', { class: 'plot' }, item.p || ''), credits = h('p', { class: 'credits' });
  const primary = h('button', { class: 'btn primary', 'data-f': '', 'data-scroll': 'none' });
  const listBtn = h('button', { class: 'btn', 'data-f': '', 'data-scroll': 'none', onclick: () => { mylist.toggle(key); paintList(); } });
  const back = h('button', { class: 'btn back', 'data-f': '', 'data-scroll': 'none', onclick: close }, svg(ICON.back), 'Voltar');
  const seasonsBar = h('div', { class: 'seasons' }), epList = h('div', { class: 'eps' });

  const el = h('div', { class: 'layer detail' },
    h('div', { class: 'd-bg' }, bd), h('div', { class: 'd-scrim' }), back,
    h('div', { class: 'd-body' },
      h('div', { class: 'd-poster' }, h('span', { class: 'ph' }, item.n), img(item.i, '', { full: true })),
      h('div', { class: 'd-copy' }, ttl, meta, plot, credits, h('div', { class: 'btns' }, primary, listBtn))),
    isS ? h('div', { class: 'd-eps' }, seasonsBar, epList) : null);

  function paintList() {
    listBtn.textContent = '';
    const on = mylist.has(key);
    listBtn.append(svg(on ? ICON.check : ICON.plus), on ? 'Na minha lista' : 'Minha lista');
  }

  function paintPrimary() {
    primary.textContent = '';
    primary.append(svg(ICON.play));
    if (!isS) {
      const at = resumeAt(key);
      primary.append(at ? `Continuar de ${fmtTime(at)}` : 'Assistir');
      primary.onclick = () => playMovie(item, info, paintPrimary);
      return;
    }
    if (!info) { primary.append('Carregando…'); primary.onclick = () => toast('Carregando episódios…'); return; }
    let target = [0, 0];
    const last = prog.recent().find(([k, p]) => k.startsWith('e:') && p.id === item.id);
    if (last) {
      info.seasons.forEach((s, si) => s.eps.forEach((e, ei) => { if (String(e.id) === String(last[1].ep)) target = [si, ei]; }));
    }
    const [si, ei] = target, ep = info.seasons[si] && info.seasons[si].eps[ei];
    if (!ep) { primary.append('Sem episódios'); primary.onclick = null; return; }
    primary.append(`${last ? 'Continuar' : 'Assistir'} T${info.seasons[si].n} · E${ep.num}`);
    primary.onclick = () => { curSeason = si; playEpisode(item, info, si, ei, refreshEps); };
  }

  function epRow(ep, ei) {
    const p = prog.get('e:' + ep.id);
    return h('button', { class: 'ep', 'data-f': '', onclick: () => playEpisode(item, info, curSeason, ei, refreshEps) },
      h('span', { class: 'ep-n' }, ep.num),
      h('span', { class: 'ep-th' }, h('span', { class: 'ph' }, ''), img(ep.img || item.i, '', { full: true }),
        p ? h('span', { class: 'pbar' }, h('i', { style: `width:${Math.round((p.t / p.d) * 100)}%` })) : null),
      h('span', { class: 'ep-tx' }, h('b', {}, epTitle(ep)), ep.dur ? h('small', {}, fmtDur(ep.dur)) : null, ep.plot ? h('em', {}, ep.plot) : null));
  }

  function renderEps(focusSeason) {
    seasonsBar.textContent = '';
    info.seasons.forEach((s, i) => seasonsBar.append(h('button', {
      class: 'chip' + (i === curSeason ? ' on' : ''), 'data-f': '',
      onclick: () => { curSeason = i; renderEps(true); },
    }, `Temporada ${s.n}`)));
    epList.textContent = '';
    (info.seasons[curSeason] ? info.seasons[curSeason].eps : []).forEach((ep, ei) => epList.append(epRow(ep, ei)));
    if (focusSeason) focusEl(seasonsBar.children[curSeason]);
  }
  function refreshEps() { if (info) { renderEps(false); paintPrimary(); } paintPrimary(); }

  function fill() {
    if (info.bd && info.bd[0]) bd.src = info.bd[0];
    if (info.plot) plot.textContent = info.plot;
    const parts = [yearOf(item, info), pretty((info.genre || item.g || '').split(/[\/,]/)[0] || ''), !isS && info.dur ? fmtDur(info.dur) : '', ratingTag(item.r || info.rating)];
    meta.textContent = parts.filter(Boolean).join('  ·  ');
    credits.textContent = '';
    if (info.cast) credits.append(h('span', {}, h('b', {}, 'Elenco '), info.cast.split(',').slice(0, 6).join(',')));
    if (info.dir) credits.append(h('span', {}, h('b', {}, 'Direção '), info.dir));
    if (isS) {
      const target = prog.recent().find(([k, p]) => k.startsWith('e:') && p.id === item.id);
      if (target) info.seasons.forEach((s, si) => { if (s.eps.some(e => String(e.id) === String(target[1].ep))) curSeason = si; });
      renderEps(false);
    }
    paintPrimary();
  }

  function close() {
    popLayer(layer); el.classList.add('out');
    setTimeout(() => el.remove(), 180);
    if (prev && prev.isConnected) prev.focus({ preventScroll: true });
  }

  meta.textContent = [item.y || '', ratingTag(item.r)].filter(Boolean).join('  ·  ');
  paintList(); paintPrimary();
  const layer = pushLayer({ el, onBack: close });
  document.getElementById('layers').append(el);
  focusEl(primary);
  (isS ? seriesInfo(item.id) : vodInfo(item.id))
    .then(i => { info = i; fill(); })
    .catch(() => toast('Não foi possível carregar os detalhes.'));
}
