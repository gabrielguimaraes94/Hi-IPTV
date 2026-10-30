// Tema Aurora: luz que segue o foco (D-pad) ou o cursor. Só escreve --fx/--fy no <html>; a suavidade fica no CSS.
const root = document.documentElement;
const rm = matchMedia('(prefers-reduced-motion: reduce)');
let on = false, raf = 0, px = -1, py = -1, el = null;

// Um frame por vez: lê a geometria do foco (se houver) e escreve as duas variáveis.
function frame() {
  raf = 0;
  if (!on) return;
  if (el) {
    const r = el.getBoundingClientRect();
    px = r.left + r.width / 2; py = r.top + r.height / 2; el = null;
  }
  if (px < 0) return;
  root.style.setProperty('--fx', Math.round(px) + 'px');
  root.style.setProperty('--fy', Math.round(py) + 'px');
}
const ask = () => { if (!raf) raf = requestAnimationFrame(frame); };

function onFocus(e) {
  if (!on || !e.target.hasAttribute || !e.target.hasAttribute('data-f')) return;
  el = e.target; ask();
}
function onMove(e) {
  if (!on) return;
  px = e.clientX; py = e.clientY; el = null; ask();
}
function onScroll() {
  if (!on || !document.body.classList.contains('kb')) return;
  const a = document.activeElement;
  if (a && a.hasAttribute && a.hasAttribute('data-f')) { el = a; ask(); }
}

export function syncFx() {
  const d = root.dataset;
  const want = d.theme === 'aurora' && d.motion !== 'low' && !rm.matches;
  if (want === on) return;
  on = want;
  root.classList.toggle('fx-on', on);
  if (on) onScroll();   // já começa no elemento focado, se houver
}

export function initFx() {
  addEventListener('focusin', onFocus, { passive: true });
  addEventListener('pointermove', onMove, { passive: true });
  addEventListener('scroll', onScroll, { passive: true, capture: true });
  rm.addEventListener('change', syncFx);
  syncFx();
}
