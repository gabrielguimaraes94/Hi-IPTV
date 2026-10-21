// Player em tela cheia. A conta só permite 1 conexão: sempre destrói o engine antes de abrir outro stream.
import { viaProxy } from './api.js';
import { pushLayer, popLayer, focusEl } from './nav.js';
import { h, svg, ICON, fmtTime } from './ui.js';

let P = null;   // estado do player aberto

export const playerOpen = () => !!P;

export function openPlayer(o) {
  if (!P) create();
  load(o);
}

function create() {
  const video = h('video', { playsinline: '' });
  const playBtn = h('button', { class: 'pbtn', 'data-f': '', 'data-scroll': 'none', 'aria-label': 'Reproduzir/Pausar', onclick: () => toggle() });
  const seek = h('div', { class: 'seek', 'data-f': '', 'data-scroll': 'none', tabindex: '0', role: 'slider' }, h('i'), h('b'));
  const el = h('div', { class: 'layer player', tabindex: '-1' },
    video,
    h('div', { class: 'p-top' },
      h('button', { class: 'pbtn', 'data-f': '', 'data-scroll': 'none', 'aria-label': 'Voltar', onclick: close }, svg(ICON.back)),
      h('div', { class: 'p-meta' }, h('div', { class: 'p-title' }), h('div', { class: 'p-sub' }))),
    h('div', { class: 'p-spin' }),
    h('div', { class: 'p-msg' }),
    h('div', { class: 'p-bar' },
      playBtn, seek, h('span', { class: 'p-time' }),
      h('button', { class: 'pbtn', 'data-f': '', 'data-scroll': 'none', 'aria-label': 'Tela cheia', onclick: fullscreen }, svg(ICON.fs))));
  P = { el, video, playBtn, seek, o: null, engine: null, idleT: 0, saveT: 0, stallT: 0, prev: document.activeElement };
  P.layer = pushLayer({ el, onBack: close, keys });
  document.getElementById('layers').append(el);

  seek.addEventListener('click', e => {
    const r = seek.getBoundingClientRect();
    if (isFinite(video.duration)) video.currentTime = ((e.clientX - r.left) / r.width) * video.duration;
  });
  video.addEventListener('click', toggle);
  el.addEventListener('mousemove', show);
  video.addEventListener('waiting', () => el.classList.add('wait'));
  video.addEventListener('playing', () => { clearTimeout(P.stallT); el.classList.remove('wait'); msg(''); icon(); });
  video.addEventListener('pause', icon);
  video.addEventListener('timeupdate', tick);
  video.addEventListener('loadedmetadata', () => {
    if (P.o && P.o.start > 0 && !P.o.live) video.currentTime = P.o.start;
  });
  video.addEventListener('ended', () => {
    const o = P.o;
    if (o.onTime && !o.live) o.onTime(video.duration, video.duration);
    o.onEnd ? o.onEnd() : close();
  });
  video.addEventListener('error', () => fail(P.o, 'Não foi possível reproduzir este conteúdo.'));
  P.saveT = setInterval(() => {
    const o = P.o;
    if (o && o.onTime && !o.live && !video.paused && isFinite(video.duration)) o.onTime(video.currentTime, video.duration);
  }, 5000);
  focusEl(playBtn);
}

const msg = t => { P.el.querySelector('.p-msg').textContent = t; P.el.classList.toggle('err', !!t); };
function icon() {
  const b = P.playBtn; b.textContent = '';
  b.append(svg(P.video.paused ? ICON.play : ICON.pause));
  show();
}
function show() {
  P.el.classList.remove('idle');
  clearTimeout(P.idleT);
  P.idleT = setTimeout(() => { if (!P.video.paused) P.el.classList.add('idle'); }, 3800);
}
function tick() {
  const v = P.video;
  if (P.o.live) { P.el.querySelector('.p-time').textContent = 'AO VIVO'; return; }
  const d = v.duration;
  P.el.querySelector('.p-time').textContent = `${fmtTime(v.currentTime)} / ${fmtTime(d)}`;
  if (isFinite(d)) P.seek.firstChild.style.transform = `scaleX(${v.currentTime / d})`;
}
const toggle = () => { P.video.paused ? P.video.play().catch(() => {}) : P.video.pause(); show(); };
const seekBy = s => { if (isFinite(P.video.duration)) P.video.currentTime = Math.max(0, Math.min(P.video.duration, P.video.currentTime + s)); };
function fullscreen() {
  document.fullscreenElement ? document.exitFullscreen() : P.el.requestFullscreen && P.el.requestFullscreen().catch(() => {});
}

function zap(d) {
  const n = P.o.zap && P.o.zap(d);
  if (n) load(n);
}

function keys(e) {
  show();
  const live = P.o.live;
  switch (e.key) {
    case 'ArrowLeft': if (!live) seekBy(-10); return true;
    case 'ArrowRight': if (!live) seekBy(10); return true;
    case 'ArrowUp': if (live) { zap(-1); return true; } return false;
    case 'ArrowDown': if (live) { zap(1); return true; } return false;
    case 'PageUp': case 'ChannelUp': zap(-1); return true;
    case 'PageDown': case 'ChannelDown': zap(1); return true;
    case ' ': case 'MediaPlayPause': toggle(); return true;
    case 'f': case 'F': fullscreen(); return true;
  }
  return false;
}

function killEngine() {
  if (P.engine) { try { P.engine.destroy(); } catch {} P.engine = null; }
  P.video.removeAttribute('src');
  P.video.load();
}

function fail(o, text) {
  if (!P || P.o !== o) return;
  if (o.alt) { load({ ...o, url: o.alt, alt: null }); return; }
  clearTimeout(P.stallT);
  P.el.classList.remove('wait');
  msg(text);
}

function load(o) {
  P.o = o;
  const v = P.video;
  P.el.classList.toggle('live', !!o.live);
  P.el.classList.add('wait');
  P.el.querySelector('.p-title').textContent = o.title || '';
  P.el.querySelector('.p-sub').textContent = o.sub || '';
  P.seek.firstChild.style.transform = 'scaleX(0)';
  msg(''); killEngine(); show();

  const url = viaProxy(o.url), path = o.url.split('?')[0].toLowerCase();
  clearTimeout(P.stallT);
  P.stallT = setTimeout(() => fail(o, 'Sem resposta do servidor. Lembre: a conta permite 1 tela por vez.'), 25000);

  if (path.endsWith('.m3u8') && window.Hls && Hls.isSupported()) {
    const e = P.engine = new Hls({ maxBufferLength: 20 });
    e.loadSource(url); e.attachMedia(v);
    e.on(Hls.Events.MANIFEST_PARSED, () => v.play().catch(() => {}));
    e.on(Hls.Events.ERROR, (_, d) => {
      if (!d.fatal) return;
      if (d.type === Hls.ErrorTypes.MEDIA_ERROR) e.recoverMediaError();
      else fail(o, o.live ? 'Sem sinal neste canal agora.' : 'Falha ao carregar o vídeo.');
    });
  } else if (o.live && window.mpegts && mpegts.isSupported()) {
    const e = P.engine = mpegts.createPlayer({ type: 'mpegts', isLive: true, url });
    e.attachMediaElement(v);
    e.on(mpegts.Events.ERROR, () => fail(o, 'Sem sinal neste canal agora.'));
    e.load(); e.play();
  } else {
    v.src = url;
    v.play().catch(() => {});
  }
}

export function closePlayer() { close(); }
function close() {
  if (!P) return;
  const { video, o } = P;
  clearInterval(P.saveT); clearTimeout(P.idleT); clearTimeout(P.stallT);
  if (o && o.onTime && !o.live && isFinite(video.duration) && video.currentTime > 0) o.onTime(video.currentTime, video.duration);
  killEngine();
  popLayer(P.layer);
  P.el.remove();
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  const prev = P.prev, done = o && o.onClose;
  P = null;
  if (prev && prev.isConnected) prev.focus({ preventScroll: true });
  if (done) done();
}
