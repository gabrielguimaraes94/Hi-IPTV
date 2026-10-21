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

- `api.js` fala com `player_api.php`. `refresh()` baixa 6 endpoints em paralelo, **compacta** (campos curtos: `n,y,i,r,a,c,x…`),
  remove adulto/duplicatas e grava um único registro `catalog` no IndexedDB. `buildIndex()` preenche o objeto global **`D`**
  (arrays `vod/series/live` com `q` normalizado para busca, `Map`s por categoria e por id). Duas visões do mesmo dado:
  `vodNew/seriesNew` (únicas por título+ano: hero, "novos", busca) e `vodBy/seriesBy` (completas por categoria).
- **Cache diário:** `cat.day !== today()` (data local) → splash com progresso e re-download; mesmo dia → cache, zero requisições de catálogo.
  `visibilitychange` recarrega se o app for retomado em novo dia. **Suba `CATALOG_V` em `api.js` sempre que mudar a limpeza ou o formato
  dos dados**, senão o cache antigo continua valendo até a meia-noite.
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
  (`.m3u8` → `.ts` via mpegts.js). Progresso (`prog`) é salvo a cada 5 s e ao fechar (`store.js`).
- **Proxy** (`serve.py`): repassa `Range` e devolve `Content-Range/Length` (sem isso o Chrome rejeita filmes), e reescreve as linhas
  de `.m3u8` para voltarem ao `/proxy`. O browser só usa o proxy se `cfg.proxy` (`viaProxy()`).

## Armadilhas

- Nomes do provedor vêm **sem acento** ("Codigo Vinganca"); categorias em CAIXA ALTA. **Notas (`rating`) não são confiáveis**
  (séries: 100% inteiros; filmes com ★ 10.0 e muitos ★ 4.0). 99,9% dos filmes são mp4; mkv/avi raros podem falhar no navegador.
- Existem `_small.jpg` para pôsteres de filmes/séries (13 KB vs 52 KB). `img()` cai para a original com uma flag — **não compare `img.src`
  com a URL original** (normalização cria laço de erros; já causou milhares de 404).
- 403 em stream costuma ser o limite de 1 conexão. mpegts.js só existe no jsDelivr (não no cdnjs).
- CSS: animação `from`-only termina no valor base do elemento — não ponha `opacity:0` base com keyframe sem `to` (o texto do hero ficou invisível).
- Identidade: acento brasa `#ff5a36` só em ação primária/foco; movimento só com `transform`/`opacity`; sem roxo, glass, emoji. Elemento próprio:
  "portais" com pôsteres derivando. A skill `/ui-humanizer` foi usada; nenhum tell classe A restou.
- Conteúdo adulto é removido na carga (regex `ADULT` + `is_adult`). Decisão pendente do usuário: bloqueio por senha?

## Pendências (auditoria de 2026-10-20) — por prioridade

1. **Segurança `serve.py`:** proxy aberto — aceita qualquer http(s) (inclusive `127.0.0.1`/rede privada) e manda `Access-Control-Allow-Origin: *`,
   então qualquer site aberto no navegador lê a rede interna pelo proxy local (confirmado por curl). Remover ACAO `*` (página é same-origin),
   validar `Host`/`Origin`, bloquear IPs privados/loopback, ou restringir ao host do provedor.
2. **Log com senha:** `BaseHTTPRequestHandler` imprime a URL do proxy com usuário/senha; sobrescrever `log_message` para mascarar.
3. **Notas:** ignorar 0/10.0 (e talvez 4.0) em "Melhor nota", "mais bem avaliados" e hero (`r >= 6.3`); inteiro nas séries ou esconder (`ratingTag` em `ui.js`).
4. **PT:** `pretty()` em `views.js` faz Title Case ("Jogos Do Dia", "Hbo", "Record Tv"): usar caixa de frase + siglas (HBO, SBT, TV, UHD, 4K, DC, ESPN…)
   e restaurar acentos das categorias (Lançamentos, Ação, Comédia, Animação/Infantil, Ficção, Documentários).
5. **TV fraca:** `nav.js` chama `getComputedStyle` em cada focável a cada tecla; portais animam mesmo fora da tela (pausar com IntersectionObserver).
6. **Player:** `Sem sinal neste canal agora` também aparece para 403 — diferenciar pelo código de resposta.
7. Texto pequeno para 10 pés (`.tag` ≈ 13 px a 1080p); escala de raios inconsistente; `lastLive` é gravado e nunca lido; sem SRI nos CDNs;
   hero de série sem sinopse (a lista não traz).

**Não testado:** mobile/tela pequena (só a home), próximo episódio automático, mkv/avi, refresh pós-meia-noite com app aberto,
D-pad com controle real, desempenho em hardware de TV.

## Roadmap combinado

1. Pendências acima + canais favoritos/último canal + "Novo".
2. **Android TV** (WebView ou ExoPlayer) cedo, para descobrir D-pad/desempenho/codec reais; o proxy some no app nativo.
   Perguntar ao usuário se tem Google TV, Android Studio ou celular Android para testar.
3. EPG (`get_short_epg`), zapping por número, mini-lista no player.
4. **Ativação por aparelho (modelo IBO Player)**, só depois de o player estar garantido: app sem conteúdo, ID do aparelho (formato MAC, gerado —
   o MAC real não é legível no Android 6+) + chave; exige servidor, painel web e pagamento; vender só o **software**, nunca conteúdo
   (Google Play recusa IPTV com conteúdo embutido). Começar pelo servidor mínimo com ativação manual.
