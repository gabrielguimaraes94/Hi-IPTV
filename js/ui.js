// Helpers de interface: criação de DOM, imagens com fallback, cartões e fileiras.
import { small } from './api.js';
import { setNeedMore } from './nav.js';

export function h(tag, props, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat(Infinity)) if (k != null && k !== false) e.append(k.nodeType ? k : document.createTextNode(k));
  return e;
}

export const svg = (d, cls) => {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  if (cls) s.setAttribute('class', cls);
  s.innerHTML = d;
  return s;
};
export const ICON = {
  play: '<path d="M8 5v14l11-7z" fill="currentColor"/>',
  pause: '<path d="M7 5h4v14H7zM13 5h4v14h-4z" fill="currentColor"/>',
  back: '<path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
  plus: '<path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
  info: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 11v6M12 7.5v.5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
  gear: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="15" cy="7" r="2.2" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="9" cy="17" r="2.2" fill="none" stroke="currentColor" stroke-width="2"/>',
  fs: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
};

export function fmtTime(s) {
  s = Math.max(0, Math.floor(s || 0));
  const hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
  return (hh ? hh + ':' + String(mm).padStart(2, '0') : mm) + ':' + String(ss).padStart(2, '0');
}
export const fmtDur = s => { const m = Math.round(s / 60); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}min` : `${m} min`; };

let toastT;
export function toast(msg, ms = 3400) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('on');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), ms);
}

// Imagem: tenta a miniatura (_small) e cai para a original; aparece com fade.
export function img(src, cls, { full = false, eager = false } = {}) {
  const i = new Image();
  i.className = cls || ''; i.alt = ''; i.loading = eager ? 'eager' : 'lazy'; i.decoding = 'async';
  if (!src) return i;
  const sm = full ? '' : small(src);
  i.src = sm || src;
  let fell = !sm;   // já tentou a original? (flag evita laço se a URL normalizar diferente)
  i.onload = () => i.classList.add('ok');
  i.onerror = () => {
    if (!fell) { fell = true; i.src = src; }
    else i.classList.add('bad');
  };
  return i;
}

// Cartão de pôster. opts: { tag, cap, pct, onOpen }
export function card(item, opts = {}) {
  const frame = h('span', { class: 'frame' },
    h('span', { class: 'ph' }, item.n),
    img(item.i),
    opts.tag ? h('span', { class: 'tag' }, opts.tag) : null,
    opts.pct ? h('span', { class: 'pbar' }, h('i', { style: `width:${Math.round(opts.pct * 100)}%` })) : null);
  return h('button', { class: 'card', 'data-f': '', title: item.n, onclick: opts.onOpen },
    frame, h('span', { class: 'cap' }, opts.cap || item.n));
}
export const ratingTag = r => (r > 0 ? '★ ' + r.toFixed(1) : '');

// Fileira horizontal. build() devolve os nós; só roda quando a fileira chega perto da tela.
export function lazyRow(title, build) {
  const sec = h('section', { class: 'row lazy' }, h('h2', {}, title), h('div', { class: 'track' }));
  sec._build = () => {
    if (sec._done) return false;
    sec._done = true;
    sec.querySelector('.track').append(...build());
    sec.classList.remove('lazy');
    return true;
  };
  return sec;
}

export function watchRows(root) {
  const io = new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting) { e.target._build && e.target._build(); io.unobserve(e.target); }
  }), { rootMargin: '700px 0px' });
  root.querySelectorAll('.row.lazy').forEach(r => io.observe(r));
  setNeedMore(() => {
    const r = [...root.querySelectorAll('.row.lazy')].find(x => !x._done);
    return r ? r._build() : false;
  });
  return () => { io.disconnect(); setNeedMore(() => false); };
}
