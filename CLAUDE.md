# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

HI-IPTV: player web para listas IPTV (Xtream Codes), primeiro passo de um app para **Google TV**. HTML/CSS/JS puro (ES modules),
sem build, sem dependências locais. Repo: https://github.com/gabrielguimaraes94/Hi-IPTV (`main`). O README cobre uso e teclas.

## Comandos

```bash
python serve.py [porta]     # http://localhost:8080 — serve os estáticos + proxy /proxy?u= (nesta máquina é `python`, não `python3`)

# Não há build, lint nem testes. A única checagem automática é sintaxe:
for f in js/*.js; do node --input-type=module --check < "$f" || echo "FAIL $f"; done
python -I -m py_compile serve.py
```

- **Não existe "rodar um teste"**: a verificação é manual no navegador (Chrome DevTools MCP). Use página isolada
  (`new_page` com `isolatedContext`) para não mexer na sessão do usuário; aba em segundo plano congela a renderização
  (`select_page` com `bringToFront` antes de screenshot); `resize_page` não garante 1920×1080 nem mobile confiável.
  Teclado nos testes: `document.dispatchEvent(new KeyboardEvent('keydown', {key, bubbles:true}))`.
- Edições Python grandes: gravar o script em arquivo (scratchpad) e rodar — heredoc grande no Bash quebra.
- O hook GateGuard exige "fatos" na primeira escrita/edição de cada arquivo; apresente-os e repita a chamada.

## Regras do usuário

- **Commit + push a cada passo**, sem pedir. O diretório tem `.git` próprio, mas está dentro do repo git da home.
- **Credenciais nunca no repo.** A conta de teste é do usuário (peça a ele); usuário/senha só vivem no `localStorage` do navegador.
  Antes de commitar: `grep -rniE "<usuario>|<senha>|<host do provedor>" . --exclude-dir=.git`.
- A conta de teste permite **1 conexão simultânea**: nunca dois streams ao mesmo tempo, e avise se o usuário estiver assistindo.

## Arquitetura (visão geral)

**Fluxo de dados:** `main.js` (boot) → `api.js` → IndexedDB → `D` → `views.js` → `player.js`.

- **Duas fontes** (`cfg.type`): `xtream` (API) e `m3u` (link do arquivo). `refresh()` escolhe `refreshXtream` ou `refreshM3u`; o cache é
  validado por `cat.src` (tipo + host/usuário ou URL), então trocar de lista refaz o catálogo. No M3U cada item leva a URL pronta em `u`,
  não há notas/backdrops/sinopses (hero some, "mais bem avaliados" é omitido), `m3u.js` (puro, testável no Node) classifica e agrupa séries
  e guarda episódios como tuplas em `cat.eps` (expandidas por `expandSeries` ao abrir a série). Lista grande de episódios é pesada
  (M3U do provedor de teste: ~46 MB de catálogo, heap ~176 MB) — Xtream é preferível quando existir.
- `api.js` fala com `player_api.php`. `refreshXtream()` baixa 6 endpoints em paralelo, **compacta** (campos curtos: `n,y,i,r,a,c,x…`),
  remove adulto/duplicatas e grava um único registro `catalog` no IndexedDB. `buildIndex()` preenche o objeto global **`D`**
  (arrays `vod/series/live` com `q` normalizado para busca, `Map`s por categoria e por id). Duas visões do mesmo dado:
  `vodNew/seriesNew` (únicas por título+ano: hero, "novos", busca) e `vodBy/seriesBy` (completas por categoria).
- **Cache diário:** `cat.day !== today()` (data local) → splash com progresso e re-download; mesmo dia → cache, zero requisições de catálogo.
  `visibilitychange` recarrega se o app for retomado em novo dia. **Suba `CATALOG_V` em `api.js` sempre que mudar a limpeza ou o formato
  dos dados**, senão o cache antigo continua valendo até a meia-noite.
- **Guia (`epg.js`):** Xtream usa `get_short_epg` (títulos em base64, cache de 5 min por canal). M3U usa XMLTV lido em streaming por
  `createXmltvParser` (puro, testável; guarda só [agora−30 min, agora+36 h], 40 programas/canal) e salvo no IndexedDB (`epg`, 1×/dia, em segundo plano,
  falha nunca bloqueia). Casamento: `tvg-id`, senão nome do canal (`<display-name>`). No provedor de teste: XMLTV 11,8 MB, 47 mil programas, 92% dos
  canais casam; `<channel id>` pode vir vazio, e os ids são nomes ("PREMIERE 3 HD"). Consumidores: `startEpg` (player) e o painel `.epg-strip` (grade de TV).
- **Detalhes só sob demanda** (`vodInfo`/`seriesInfo`, cache 7 dias no IndexedDB) — nunca por cartão (seriam milhares de requisições).
- **Views** (`views.js`) retornam `{ el, focus?, back?, cleanup }`; `main.go(name, opts)` monta `{ go, ...opts }` como contexto
  (ex.: "Ver tudo" na home chama `go('movies', { cat })`). `back()` devolve `true` se consumiu o Esc (grade de categoria → fileiras).
- **Camadas e foco** (`nav.js`): toda sobreposição (detalhe, player, ajustes, boot/login) faz `pushLayer({ el, onBack, keys })`.
  Um único `keydown` global roteia: `keys()` da camada de cima → Esc/Backspace → setas. O escopo do foco é a camada de cima.
  Focáveis são `<button>`/`input` com `data-f` (`data-scroll` = `none|top|x`); navegação espacial por geometria. A classe `body.kb`
  liga o anel de foco (some com mouse). `setNeedMore()` deixa o D-pad construir fileiras/blocos de grade ainda não renderizados
  (`watchRows`, `showGrid`). Ao fechar camada o foco volta ao elemento anterior.
- **Player** (`player.js`): um único estado `P`; `openPlayer(o)` reaproveita a camada e `load(o)` **sempre destrói o engine anterior**
  (a conta só tem 1 conexão). `o = { title, sub, url, alt, live, start, onTime, onEnd, onClose, zap }`; `alt` é o fallback do ao vivo
  (`.ts` via mpegts.js → `.m3u8` via hls.js). **Não volte o `.m3u8` para primeiro**: no provedor de teste cada recarga da playlist
  passa por um 302 com token novo (expira em ~12 s, então não dá para fixar a URL) e cai em servidores diferentes, fora de sincronia
  (um com segmentos de 2,5 s, outro de 10 s e ~1 min atrás); o hls.js mistura os dois e o vídeo trava, pula e repete. O padrão fica `.ts`;
  só a preferência `live: 'hls'` (Ajustes → "Formato do ao vivo", `liveOpts` em `views.js`) inverte a ordem. Progresso (`prog`) é salvo a cada 5 s e ao fechar (`store.js`).
- **Estado do navegador** (`store.js`): `ls` grava no `localStorage` com prefixo `hi:` (`cfg`, `prog`, `list`, `liveCat`, `lastLive`, `prefs`);
  "Sair da conta" apaga `cfg/prog/list` + IndexedDB `catalog/epg`, mas **`prefs` sobrevive**. `prefs` (tema, escala, animações, formato do ao vivo)
  vira `data-theme|scale|motion` no `<html>` (`applyPrefs` em `main.js`) e o CSS resolve o resto por variáveis (`--accent`, `--fs`…).
- DOM é montado com `h(tag, props, ...kids)` de `ui.js` (sem framework); filhos/props `null`/`false` são ignorados (`0` e `''` não), então `cond && h(...)` é o idioma.
- **Proxy** (`serve.py`): repassa `Range` e devolve `Content-Range/Length` (sem isso o Chrome rejeita filmes), e reescreve as linhas
  de `.m3u8` para voltarem ao `/proxy`. O browser só usa o proxy se `cfg.proxy` (`viaProxy()`).

## Armadilhas

- Nomes do provedor vêm **sem acento** ("Codigo Vinganca"); categorias em CAIXA ALTA. **Notas (`rating`) não são confiáveis**
  (séries: 100% inteiros; filmes com ★ 10.0 e muitos ★ 4.0): `text.js` trata 0 e ≥10 como sem nota (`trustedRating`) e mostra inteiro quando for inteiro.
  `pretty()` (`text.js`) arruma caixa, siglas e acentos das categorias; novas palavras sem acento vão em `FIX`. 99,9% dos filmes são mp4; mkv/avi raros podem falhar no navegador.
- Existem `_small.jpg` para pôsteres de filmes/séries (13 KB vs 52 KB). `img()` cai para a original com uma flag — **não compare `img.src`
  com a URL original** (normalização cria laço de erros; já causou milhares de 404).
- 403 em stream costuma ser o limite de 1 conexão. mpegts.js só existe no jsDelivr (não no cdnjs).
- CSS: animação `from`-only termina no valor base do elemento — não ponha `opacity:0` base com keyframe sem `to` (o texto do hero ficou invisível).
- Identidade: acento (`var(--accent)`: brasa `#ff5a36` no tema padrão, ciano `#36e2f5` no tema "Órbita") só em ação primária/foco
  no Brasa. O Órbita (bloco `[data-theme="orbita"]` no fim do `app.css`, futurista/minimalista) muda a **forma**, não só a cor: cantos retos,
  Sora fina em caixa alta nos títulos, rótulos em JetBrains Mono (`--mono`), fileiras numeradas (contador CSS `row`), portais e logos em preto e branco,
  foco/hover com mira nos cantos (`--hud`) em vez de zoom. Só recolorir não basta, o usuário não percebeu a diferença.
  O **Aurora** (`[data-theme="aurora"]`, "cara de produto de IA", pedido do usuário) é a exceção consciente à regra "sem roxo, glass": aurora azul/violeta
  respirando em `body::before`, luz que segue o foco em `body::after` (lê `--fx/--fy` e `html.fx-on` de `js/fx.js`, ligado por `syncFx()` em `applyPrefs`),
  borda em gradiente girando (`@property --ang`), vidro só em barras/painéis (nunca em cartões); `data-motion="low"` tira também o vidro.
  Nunca cor fixa no CSS, senão o tema alternativo quebra; `[data-motion="low"]` desliga animações globalmente; movimento só com `transform`/`opacity`; no Brasa e no Órbita: sem roxo, glass, emoji. Elemento próprio:
  "portais" com pôsteres derivando. A skill `/ui-humanizer` foi usada; nenhum tell classe A restou.
- Conteúdo adulto é removido na carga (regex `ADULT` + `is_adult`). Decisão pendente do usuário: bloqueio por senha?

## Progresso

**`progress.md`** guarda o que está feito, em andamento, as pendências da auditoria por prioridade e o que não foi testado.
Atualize-o no mesmo commit de cada passo.

## Roadmap combinado

1. Pendências do `progress.md` + canais favoritos/último canal + "Novo".
2. **Android TV** (WebView ou ExoPlayer) cedo, para descobrir D-pad/desempenho/codec reais; o proxy some no app nativo.
   Perguntar ao usuário se tem Google TV, Android Studio ou celular Android para testar.
3. Zapping por número, mini-lista no player (EPG já feito).
4. **Ativação por aparelho (modelo IBO Player)**, só depois de o player estar garantido: app sem conteúdo, ID do aparelho (formato MAC, gerado —
   o MAC real não é legível no Android 6+) + chave; exige servidor, painel web e pagamento; vender só o **software**, nunca conteúdo
   (Google Play recusa IPTV com conteúdo embutido). Começar pelo servidor mínimo com ativação manual.
