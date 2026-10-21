// Navegação espacial (D-pad / setas) e pilha de camadas (detalhes, player, ajustes).
// Todo elemento focável é um <button> (ou input) com o atributo data-f.

const layers = [];   // { el, onBack, keys(e) }
let rootBack = () => {};
let needMore = () => false;

export const pushLayer = l => { layers.push(l); return l; };
export const popLayer = l => { const i = layers.indexOf(l); if (i >= 0) layers.splice(i, 1); };
export const topLayer = () => layers[layers.length - 1];
export const onRootBack = fn => { rootBack = fn; };
export const setNeedMore = fn => { needMore = fn; };

const scope = () => (topLayer() ? topLayer().el : document.body);
const visible = el => {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
};
const focusables = () => [...scope().querySelectorAll('[data-f]')].filter(visible);

export function focusEl(el) {
  if (!el) return;
  el.focus({ preventScroll: true });
  const mode = el.dataset.scroll;
  if (mode === 'none') return;
  if (mode === 'top') { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
  el.scrollIntoView({ block: el.closest('.layer') ? 'nearest' : 'center', inline: 'center', behavior: 'smooth' });
}

export function focusFirst(root) {
  const el = (root || scope()).querySelector('[data-f]');
  focusEl(el);
  return el;
}

function pick(dir, cur, all) {
  const a = cur.getBoundingClientRect();
  const ax = a.left + a.width / 2, ay = a.top + a.height / 2;
  let best = null, bs = Infinity;
  for (const el of all) {
    if (el === cur) continue;
    const b = el.getBoundingClientRect();
    const bx = b.left + b.width / 2, by = b.top + b.height / 2;
    let p, perp;
    if (dir === 'right' || dir === 'left') {
      p = dir === 'right' ? bx - ax : ax - bx;
      perp = Math.abs(by - ay);
      if (p <= 4 || perp > Math.max(a.height, b.height) * 0.7) continue;
      const s = p + perp * 2.5;
      if (s < bs) { bs = s; best = el; }
    } else {
      p = dir === 'down' ? by - ay : ay - by;
      perp = Math.abs(bx - ax);
      if (p <= 8) continue;
      const s = p + perp * 2;
      if (s < bs) { bs = s; best = el; }
    }
  }
  return best;
}

function move(dir) {
  document.body.classList.add('kb');
  let all = focusables();
  const cur = document.activeElement;
  if (!cur || !cur.matches || !cur.matches('[data-f]') || !scope().contains(cur)) { focusEl(all[0]); return; }
  let next = pick(dir, cur, all);
  if (!next && dir === 'down' && needMore()) { all = focusables(); next = pick(dir, cur, all); }
  focusEl(next);
}

const DIRS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };

document.addEventListener('keydown', e => {
  const L = topLayer();
  if (L && L.keys && L.keys(e)) { e.preventDefault(); return; }
  const typing = e.target.matches && e.target.matches('input, textarea');
  if (e.key === 'Escape' || e.key === 'GoBack' || e.keyCode === 4 || (e.key === 'Backspace' && !typing)) {
    e.preventDefault();
    L ? L.onBack && L.onBack() : rootBack();
    return;
  }
  const dir = DIRS[e.key];
  if (!dir) return;
  if (typing && (dir === 'left' || dir === 'right')) return;
  e.preventDefault();
  move(dir);
});

// Mouse/toque tiram o anel de foco; teclado/controle trazem de volta.
addEventListener('pointerdown', () => document.body.classList.remove('kb'));
