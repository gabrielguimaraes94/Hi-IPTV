// Boot: login → (atualização diária do catálogo | cache) → app.
import { ls, idb } from './store.js';
import { configure, conf, login, refresh, loadCatalog, buildIndex, setBase, today, D } from './api.js';
import { h, svg, ICON, toast } from './ui.js';
import { focusEl, onRootBack, pushLayer, popLayer } from './nav.js';
import { playerOpen } from './player.js';
import * as V from './views.js';

const $ = id => document.getElementById(id);
const NAV = [['home', 'Início'], ['movies', 'Filmes'], ['series', 'Séries'], ['live', 'TV ao Vivo'], ['search', 'Buscar']];
const VIEWS = { home: V.homeView, movies: V.moviesView, series: V.seriesView, live: V.liveView, search: V.searchView };
let current = '', ctl = null;

const brand = big => h('div', { class: 'brand' + (big ? ' big' : '') }, h('b', {}, 'HI'), h('span', {}, 'IPTV'));

// ---------------------------------------------------------------- navegação

function go(name, opts = {}) {
  if (ctl) ctl.cleanup();
  const root = $('view');
  root.classList.remove('enter');
  root.textContent = '';
  current = name;
  document.querySelectorAll('#top .nav[data-v]').forEach(b => b.classList.toggle('on', b.dataset.v === name));
  ctl = VIEWS[name]({ go, ...opts });
  root.append(ctl.el);
  void root.offsetWidth;
  root.classList.add('enter');
  window.scrollTo(0, 0);
  requestAnimationFrame(() => ctl.focus && ctl.focus());
}

function buildTop() {
  const top = $('top');
  top.textContent = '';
  top.append(
    brand(false),
    h('nav', {}, NAV.map(([k, l]) => h('button', { class: 'nav', 'data-f': '', 'data-scroll': 'none', 'data-v': k, onclick: () => go(k) }, l))),
    h('button', { class: 'nav icon', 'data-f': '', 'data-scroll': 'none', 'aria-label': 'Ajustes', onclick: settings }, svg(ICON.gear)));
  top.hidden = false;
  addEventListener('scroll', () => top.classList.toggle('solid', scrollY > 40), { passive: true });
}

onRootBack(() => {
  if (ctl && ctl.back && ctl.back()) return;   // grade de categoria volta às fileiras
  if (current !== 'home') go('home');
});

// ---------------------------------------------------------------- ajustes

function settings() {
  const prev = document.activeElement;
  const exp = D.acct && D.acct.exp ? new Date(D.acct.exp * 1000).toLocaleDateString('pt-BR') : '—';
  const upd = D.at ? new Date(D.at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
  const close = () => {
    popLayer(layer); el.remove();
    if (prev && prev.isConnected) prev.focus({ preventScroll: true });
  };
  const wipe = () => { idb.del('catalog').then(() => location.reload()); };
  const first = h('button', { class: 'btn primary', 'data-f': '', onclick: wipe }, 'Atualizar lista agora');
  const el = h('div', { class: 'layer settings' },
    h('div', { class: 'panel' },
      h('h2', {}, 'Ajustes'),
      h('dl', {},
        h('dt', {}, 'Usuário'), h('dd', {}, conf().user),
        h('dt', {}, 'Vencimento'), h('dd', {}, exp),
        h('dt', {}, 'Telas simultâneas'), h('dd', {}, String(D.acct ? D.acct.maxc : 1)),
        h('dt', {}, 'Lista atualizada em'), h('dd', {}, upd),
        h('dt', {}, 'Catálogo'), h('dd', {}, `${D.vod.length.toLocaleString('pt-BR')} filmes · ${D.series.length.toLocaleString('pt-BR')} séries · ${D.live.length.toLocaleString('pt-BR')} canais`)),
      h('p', { class: 'hint' }, 'A lista é baixada na primeira abertura de cada dia. Conteúdo adulto fica oculto.'),
      h('div', { class: 'btns' },
        first,
        h('button', { class: 'btn', 'data-f': '', onclick: () => { ls.del('cfg'); idb.del('catalog').then(() => location.reload()); } }, 'Sair da conta'),
        h('button', { class: 'btn', 'data-f': '', onclick: close }, 'Fechar'))));
  const layer = pushLayer({ el, onBack: close });
  $('layers').append(el);
  focusEl(first);
}

// ---------------------------------------------------------------- login / splash

function field(label, name, type, value, ph) {
  return h('label', { class: 'fld' }, h('span', {}, label),
    h('input', { name, type, value, placeholder: ph || '', 'data-f': '', 'data-scroll': 'none', autocomplete: 'off', required: true }));
}

let bootLayer = null;
function bootScreen(...kids) {
  const b = $('boot');
  b.textContent = '';
  b.append(...kids);
  b.hidden = false;
  if (!bootLayer) bootLayer = pushLayer({ el: b });
  return b;
}
function hideBoot() {
  const b = $('boot');
  b.classList.add('out');
  setTimeout(() => { b.hidden = true; b.classList.remove('out'); b.textContent = ''; }, 350);
  if (bootLayer) { popLayer(bootLayer); bootLayer = null; }
}

function showLogin(err) {
  const c = ls.get('cfg') || {};
  const msg = h('p', { class: 'err' }, err || '');
  const submit = h('button', { class: 'btn primary', 'data-f': '', 'data-scroll': 'none', type: 'submit' }, 'Entrar');
  const form = h('form', { class: 'login' },
    brand(true),
    h('p', { class: 'sub' }, 'Entre com os dados da sua lista (Xtream Codes).'),
    field('Servidor', 'host', 'text', c.host || '', 'http://servidor.exemplo:8080'),
    field('Usuário', 'user', 'text', c.user || ''),
    field('Senha', 'pass', 'password', ''),
    h('label', { class: 'chk' }, h('input', { type: 'checkbox', name: 'proxy', checked: c.proxy !== false }), 'Usar proxy local (python serve.py)'),
    msg, submit);
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(form);
    const cfg = { host: fd.get('host'), user: fd.get('user').trim(), pass: fd.get('pass'), proxy: !!fd.get('proxy') };
    msg.textContent = 'Conectando…'; submit.disabled = true;
    configure(cfg);
    try { await login(); } catch (x) {
      msg.textContent = (x.message || 'Falha na conexão') + (/fetch|Failed/i.test(x.message) ? ' — verifique o servidor ou ative o proxy.' : '');
      submit.disabled = false; return;
    }
    ls.set('cfg', cfg);
    boot();
  });
  bootScreen(form);
  focusEl(form.querySelector('input'));
}

// Tela inicial: aparece em toda abertura. A barra mostra o progresso só quando há atualização.
function showSplash() {
  const bar = h('i'), txt = h('p', { class: 'sub' }, 'Abrindo…');
  bootScreen(h('div', { class: 'splash' }, brand(true), h('div', { class: 'bar' }, bar), txt));
  return {
    step(done, total, label) {
      bar.style.transform = `scaleX(${done / total})`;
      txt.textContent = done >= total ? 'Organizando o catálogo…' : `Atualizando a lista · ${label}`;
    },
    fill() { bar.style.transform = 'scaleX(1)'; },
  };
}
const wait = ms => new Promise(r => setTimeout(r, ms));

// ---------------------------------------------------------------- boot

async function boot() {
  const c = ls.get('cfg');
  if (!c) return showLogin();
  configure(c);
  const t0 = performance.now(), splash = showSplash();
  let cat = await loadCatalog();
  if (!cat || cat.day !== today()) {
    try { cat = await refresh(splash.step); } catch (e) {
      if (!cat) return showLogin('Não foi possível carregar a lista: ' + e.message);
      setBase(cat.server);
      toast('Sem conexão com o servidor: usando a lista salva.');
    }
  } else { setBase(cat.server); splash.fill(); }
  buildIndex(cat);
  await wait(Math.max(0, 900 - (performance.now() - t0)));
  buildTop();
  go('home');
  hideBoot();
}

boot();

// App retomado (TV/aba aberta) depois da meia-noite: recarrega para atualizar a lista do novo dia.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && D.day && D.day !== today() && !playerOpen()) location.reload();
});
