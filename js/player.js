// Player em tela cheia. A conta só permite 1 conexão: sempre destrói o engine antes de abrir outro stream.
import { viaProxy } from './api.js';
import { pushLayer, popLayer, focusEl } from './nav.js';
import { h, svg, ICON, fmtTime } from './ui.js';
import { hhmm } from './epg.js';

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
  const gearBtn = h('button', { class: 'pbtn', 'data-f': '', 'data-scroll': 'none', 'aria-label': 'Configurações do player', onclick: () => openMenu() }, svg(ICON.gear));
  const statsBox = h('div', { class: 'p-stats', hidden: true },
    h('div', { class: 'p-shead' }, h('b', {}, 'Estatísticas para nerds'),
      h('button', { 'aria-label': 'Fechar estatísticas', onclick: () => setStats(false) }, '×')),
    h('dl'));
  const el = h('div', { class: 'layer player', tabindex: '-1' },
    video, statsBox,
    h('div', { class: 'p-top' },
      h('button', { class: 'pbtn', 'data-f': '', 'data-scroll': 'none', 'aria-label': 'Voltar', onclick: close }, svg(ICON.back)),
      h('div', { class: 'p-meta' }, h('div', { class: 'p-title' }), h('div', { class: 'p-sub' }), h('div', { class: 'p-epg' }))),
    h('div', { class: 'p-spin' }),
    h('div', { class: 'p-msg' }),
    h('div', { class: 'p-bar' },
      playBtn, seek, h('span', { class: 'p-time' }), gearBtn,
      h('button', { class: 'pbtn', 'data-f': '', 'data-scroll': 'none', 'aria-label': 'Tela cheia', onclick: fullscreen }, svg(ICON.fs))));
  P = { el, video, playBtn, seek, gearBtn, statsBox, stats: false, menu: null, o: null, engine: null, idleT: 0, saveT: 0, stallT: 0, prev: document.activeElement };
  P.layer = pushLayer({ el, onBack: close, keys });
  document.getElementById('layers').append(el);

  seek.addEventListener('click', e => {
    const r = seek.getBoundingClientRect();
    if (isFinite(video.duration)) video.currentTime = ((e.clientX - r.left) / r.width) * video.duration;
  });
  // Ao fechar, video.load() ainda dispara eventos assíncronos: só age se este player continua aberto.
  const on = (ev, fn) => video.addEventListener(ev, () => { if (P && P.video === video) fn(); });
  on('click', () => (P.menu ? closeMenu() : toggle()));
  el.addEventListener('mousemove', () => { if (P && P.el === el) show(); });
  on('waiting', () => el.classList.add('wait'));
  on('playing', () => { clearTimeout(P.stallT); el.classList.remove('wait'); msg(''); icon(); });
  on('pause', icon);
  on('timeupdate', tick);
  on('loadedmetadata', () => {
    if (P.o && P.o.start > 0 && !P.o.live) video.currentTime = P.o.start;
  });
  on('ended', () => {
    const o = P.o;
    if (o.onTime && !o.live) o.onTime(video.duration, video.duration);
    o.onEnd ? o.onEnd() : close();
  });
  on('error', () => fail(P.o, 'Não foi possível reproduzir este conteúdo.'));
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
  P.idleT = setTimeout(() => { if (!P.video.paused && !P.menu) P.el.classList.add('idle'); }, 3800);
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

// Engrenagem: estatísticas para nerds, qualidade e áudio (só HLS) e velocidade (só VOD).
// O menu é uma camada própria dentro do player: setas ficam nele e Esc volta ao menu principal ou fecha.
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const hlsOf = () => (window.Hls && P.engine instanceof Hls ? P.engine : null);
const bits = b => (!b ? null : b >= 1e6 ? `${(b / 1e6).toFixed(1)} Mbps` : `${Math.round(b / 1e3)} kbps`);
const levelName = l => (!l ? '?' : l.height ? `${l.height}p` : bits(l.bitrate) || '?');
const trackName = (t, i) => (t && (t.name || t.lang)) || `Faixa ${i + 1}`;
const speedName = s => (s === 1 ? 'Normal' : `${s}×`);

function item(label, value, fn, on) {
  return h('button', { class: 'p-item' + (on ? ' on' : ''), 'data-f': '', 'data-scroll': 'none', role: 'menuitem', onclick: fn },
    h('span', {}, label), value != null && h('em', {}, value), on && svg(ICON.check));
}

function openMenu() {
  if (P.menu) return closeMenu();
  const box = h('div', { class: 'p-menu', role: 'menu' });
  P.menu = { box, sub: false };
  P.menu.layer = pushLayer({ el: box, onBack: () => (P.menu.sub ? mainMenu() : closeMenu()) });
  P.el.append(box);
  show();
  mainMenu();
}

function closeMenu() {
  const m = P && P.menu;
  if (!m) return;
  popLayer(m.layer);
  m.box.remove();
  P.menu = null;
  focusEl(P.gearBtn);
  show();
}

function paintMenu(title, items) {
  const m = P.menu;
  m.sub = !!title;
  m.box.textContent = '';
  if (title) m.box.append(h('button', { class: 'p-item p-mhead', 'data-f': '', 'data-scroll': 'none', onclick: mainMenu }, svg(ICON.back), h('span', {}, title)));
  m.box.append(...items);
  focusEl(m.box.querySelector('.on') || m.box.querySelector('[data-f]'));
}

function mainMenu() {
  const e = hlsOf(), items = [item('Estatísticas para nerds', P.stats ? 'Ligadas' : 'Desligadas', () => { setStats(!P.stats); closeMenu(); })];
  if (e && e.levels.length > 1) {
    const cur = e.levels[e.currentLevel];
    items.push(item('Qualidade', e.autoLevelEnabled ? 'Automática' + (cur ? ` · ${levelName(cur)}` : '') : levelName(cur), qualityMenu));
  }
  if (e && e.audioTracks.length > 1) items.push(item('Áudio', trackName(e.audioTracks[e.audioTrack], e.audioTrack), audioMenu));
  if (!P.o.live) items.push(item('Velocidade', speedName(P.video.playbackRate), speedMenu));
  paintMenu(null, items);
}

function qualityMenu() {
  const e = hlsOf(), auto = e.autoLevelEnabled, L = e.levels;
  const set = i => () => { e.currentLevel = i; closeMenu(); };   // -1 = automática
  const order = L.map((_, i) => i).sort((a, b) => ((L[b].height || 0) - (L[a].height || 0)) || (L[b].bitrate - L[a].bitrate));
  paintMenu('Qualidade', [item('Automática', null, set(-1), auto),
    ...order.map(i => item(levelName(L[i]), L[i].height ? bits(L[i].bitrate) : null, set(i), !auto && e.currentLevel === i))]);
}

function audioMenu() {
  const e = hlsOf();
  paintMenu('Áudio', e.audioTracks.map((t, i) => item(trackName(t, i), null, () => { e.audioTrack = i; closeMenu(); }, e.audioTrack === i)));
}

function speedMenu() {
  const v = P.video;
  paintMenu('Velocidade', SPEEDS.map(s => item(speedName(s), null, () => { v.playbackRate = s; closeMenu(); }, v.playbackRate === s)));
}

function setStats(on) {
  P.stats = on;
  P.statsBox.hidden = !on;
  clearInterval(P.statsT);
  if (on) { paintStats(); P.statsT = setInterval(paintStats, 1000); }
}

const ahead = v => {
  const b = v.buffered, t = v.currentTime;
  for (let i = 0; i < b.length; i++) if (b.start(i) <= t + 0.5 && t <= b.end(i)) return b.end(i) - t;
  return 0;
};

function formatOf(url) {
  const ext = (url.split('?')[0].toLowerCase().match(/\.(\w+)$/) || [])[1];
  return ext === 'm3u8' ? 'HLS (.m3u8)' : ext === 'ts' ? 'MPEG-TS (.ts)' : ext ? ext.toUpperCase() : '?';
}

// Atualiza a cada segundo enquanto aberto. Só mostra o host: a URL do stream carrega usuário e senha.
function paintStats() {
  const v = P.video, o = P.o, hls = hlsOf(), ts = P.engine && !hls ? P.engine : null;
  const lvl = hls && hls.levels[hls.currentLevel];
  const mi = (ts && ts.mediaInfo) || {}, si = (ts && ts.statisticsInfo) || {};
  const q = v.getVideoPlaybackQuality && v.getVideoPlaybackQuality();
  const fps = Math.round(mi.fps || (lvl && lvl.frameRate) || 0);
  const codecs = [lvl ? lvl.videoCodec : mi.videoCodec, lvl ? lvl.audioCodec : mi.audioCodec].filter(Boolean).join(' / ');
  let host = '?';
  try { host = new URL(o.url).host; } catch {}
  const cls = P.el.classList;
  const rows = [
    ['Estado', cls.contains('err') ? 'Erro' : cls.contains('wait') ? 'Carregando' : v.paused ? 'Pausado' : 'Reproduzindo'],
    ['Conteúdo', o.live ? 'Ao vivo' : 'Sob demanda'],
    ['Motor', hls ? `hls.js ${Hls.version}` : ts ? `mpegts.js ${mpegts.version || ''}`.trim() : 'Nativo do navegador'],
    ['Formato', formatOf(o.url)],
    ['Servidor', host + (viaProxy(o.url) !== o.url ? ' · via proxy local' : '')],
    ['Resolução', v.videoWidth ? `${v.videoWidth}×${v.videoHeight}` + (fps ? ` @ ${fps} fps` : '') : '—'],
    ['Tela', `${Math.round(v.clientWidth * devicePixelRatio)}×${Math.round(v.clientHeight * devicePixelRatio)}`],
    ['Codecs', codecs],
    ['Qualidade', hls && lvl ? `${hls.autoLevelEnabled ? 'Automática' : 'Manual'} · ${hls.currentLevel + 1} de ${hls.levels.length}` : null],
    ['Taxa da faixa', lvl && bits(lvl.bitrate)],
    ['Banda estimada', hls && bits(hls.bandwidthEstimate)],
    ['Download', si.speed ? `${(si.speed * 8 / 1000).toFixed(1)} Mbps` : null],
    ['Buffer', `${ahead(v).toFixed(1)} s`],
    ['Latência', hls && o.live && hls.latency ? `${hls.latency.toFixed(1)} s` : null],
    ['Quadros perdidos', q ? `${q.droppedVideoFrames} de ${q.totalVideoFrames}` : null],
  ];
  const dl = P.statsBox.querySelector('dl');
  dl.textContent = '';
  for (const [k, val] of rows) if (val) dl.append(h('dt', {}, k), h('dd', {}, val));
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

// Canais ao vivo: mostra o que está no ar e o que vem a seguir, atualizando a cada minuto.
function startEpg(o) {
  clearInterval(P.epgT);
  const box = P.el.querySelector('.p-epg');
  box.textContent = '';
  if (!o.live || !o.epg) return;
  const paint = () => o.epg().then(r => {
    if (!P || P.o !== o) return;
    box.textContent = '';
    if (!r) return;
    if (r.now) box.append(h('div', {}, `Agora · ${hhmm(r.now[0])}–${hhmm(r.now[1])} · ${r.now[2]}`));
    if (r.next) box.append(h('div', {}, `A seguir · ${hhmm(r.next[0])} · ${r.next[2]}`));
  }).catch(() => {});
  paint();
  P.epgT = setInterval(paint, 60000);
}

function load(o) {
  P.o = o;
  const v = P.video;
  P.el.classList.toggle('live', !!o.live);
  P.el.classList.add('wait');
  P.el.querySelector('.p-title').textContent = o.title || '';
  P.el.querySelector('.p-sub').textContent = o.sub || '';
  P.seek.firstChild.style.transform = 'scaleX(0)';
  msg(''); killEngine(); show(); startEpg(o);

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
  clearInterval(P.saveT); clearInterval(P.epgT); clearInterval(P.statsT); clearTimeout(P.idleT); clearTimeout(P.stallT);
  if (P.menu) popLayer(P.menu.layer);
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
