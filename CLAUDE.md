# HI-IPTV — contexto do projeto

Player web para listas IPTV (Xtream Codes), primeiro passo de um app para **Google TV**.
HTML/CSS/JS puro (ES modules), sem build. Repo: https://github.com/gabrielguimaraes94/Hi-IPTV (branch `main`).

## Regras de trabalho (do usuário)

- **Commit + push a cada passo**, sem pedir (ver memória "commit every step").
- **Nunca** pôr credenciais no repo/código. Antes de cada commit: `grep -rniE "<usuario>|<senha>|<host do provedor>" . --exclude-dir=.git`.
  A conta de teste é do usuário; usuário/senha só vivem no `localStorage` do navegador. Peça a ele se precisar testar.
- A conta de teste permite **1 conexão simultânea** (`max_connections: 1`): não abrir dois streams ao mesmo tempo.
  Se o usuário estiver assistindo no navegador de teste, avise antes de abrir stream.
- Projeto está **dentro** do repo git da home (`C:\Users\gguimaraes`); este diretório tem o próprio `.git`.

## Rodar / testar

```
python serve.py        # http://localhost:8080  (nesta máquina é `python`, não `python3`)
```

- Navegador de teste: Chrome DevTools MCP. Usar página isolada (`new_page` com `isolatedContext`) para não mexer na sessão do usuário.
  Aba em segundo plano congela a renderização: `select_page` com `bringToFront` antes de screenshot.
  `resize_page` não garante 1920×1080 nem mobile confiável.
- Eventos de teclado nos testes: `document.dispatchEvent(new KeyboardEvent('keydown', {key, bubbles:true}))`.
- Scripts Python grandes de edição: gravar em arquivo no scratchpad e rodar (heredoc grande no Bash quebra).
- Hook GateGuard pede "fatos" na primeira escrita de cada arquivo novo/edição; apresentar os fatos e repetir.

## Arquitetura

```
index.html        shell (fontes: Bricolage Grotesque; hls.js 1.5.17 via cdnjs; mpegts.js 1.7.3 via jsDelivr — não existe no cdnjs)
css/app.css       identidade visual e movimento
js/main.js        boot: login → splash → atualização diária → app; ajustes; go(view, opts); Esc global
js/api.js         cliente Xtream (player_api.php), catálogo compacto, cache diário, índices (D), info sob demanda
js/store.js       localStorage (prefixo hi:) + IndexedDB; progresso (continuar assistindo); minha lista
js/nav.js         navegação espacial por setas/D-pad, pilha de camadas, needMore (rows lazy)
js/views.js       home, filmes, séries (barra de categorias + grade), TV ao vivo, busca, detalhes
js/player.js      player em tela cheia (HLS/MPEG-TS), 1 engine por vez
js/ui.js          h(), ícones SVG, img() com fallback _small→_big, card, lazyRow ("Ver tudo ›")
serve.py          servidor local + proxy CORS `/proxy?u=` (repassa Range/Content-Range; reescreve .m3u8)
```

### Decisões e fatos aprendidos

- **Catálogo vem da API Xtream**, não do M3U (73 MB / 44 s → ~7 MB / ~4 s). Compactado (`refresh()` em `api.js`), guardado no
  IndexedDB (`catalog`, versão `CATALOG_V` em `api.js` — **subir quando mudar a limpeza/estrutura**).
- **Atualização diária:** `cat.day !== today()` (data local) → splash com progresso e re-download. Mesmo dia → cache.
  `visibilitychange` recarrega se o app for retomado em novo dia (sem player aberto). "Atualizar lista agora" nos Ajustes.
- **Conteúdo adulto é removido na carga** (`ADULT` regex nas categorias + `is_adult==='1'`). Decisão do usuário pendente: bloqueio por senha?
- **Dedupe:** por categoria+título+ano na carga; listas globais (novos/hero/busca) únicas por título+ano; fileiras por categoria completas.
- **Título:** `splitYear` tira " - 2026" e "(L)/(12)…" do nome. Nomes do provedor vêm **sem acento** ("Codigo Vinganca") — dado do provedor.
- **Detalhes só sob demanda** (`get_vod_info`/`get_series_info`, cache 7 dias no IndexedDB); nunca por cartão.
- **URLs de stream:** filme `/movie/u/p/{id}.{ext}`, episódio `/series/u/p/{ep id}.{ext}`, ao vivo `/live/u/p/{id}.m3u8` com fallback `.ts`.
  99,9% dos filmes são mp4 (17 mkv/avi podem falhar no navegador).
- **Imagens:** existem `_small.jpg` (13 KB vs 52 KB) para filmes e séries; logos de canais são externos e quebram às vezes (mostra iniciais).
- **Foco/D-pad:** todo focável é `<button>`/input com `data-f`; `data-scroll` = `none|top|x`. Classe `body.kb` liga o anel de foco
  (some com mouse). Ao fechar player/detalhe o foco volta ao elemento anterior; ao refazer a lista de episódios volta ao mesmo índice.
- **Movimento só com transform/opacity** (TV fraca); `prefers-reduced-motion` desliga tudo.
- **Identidade:** fundo `#0d0c0b`, creme `#f4efe6`, único acento brasa `#ff5a36` (só ações primárias/foco). Sem roxo, sem glass, sem emoji.
  Elemento próprio: "portais" Filmes/Séries/TV com pôsteres reais derivando em diagonal.

## Estado (fim do dia 2026-10-20)

Feito e no GitHub (último commit de feature: barra de categorias + "Ver tudo"):
login, splash/atualização diária, home (hero rotativo + portais + fileiras), Filmes/Séries (barra de categorias com contagem, grade com
ordenação Recentes/Melhor nota/A–Z e carga progressiva, Esc volta às fileiras), detalhes (filme; série com temporadas/episódios),
TV ao vivo (categorias + grade, zapping ↑↓/PgUp/PgDn), busca, continuar assistindo, minha lista, ajustes, README.

Testado no Chrome com a lista real: login, cache zero-request no mesmo dia, D-pad (home→portais→fileiras→topo), filme (1080p, seek, retomar),
episódio (720p, foco volta ao episódio), canal ao vivo HLS 1080p + zap, busca, dedupe, categorias/ordenação/carga progressiva, 3 ciclos abrir/fechar sem erro.

**Não testado:** layout mobile/tela pequena (só a home, ~500 px), próximo episódio automático ao fim, mkv/avi, refresh pós-meia-noite com app aberto,
D-pad com controle remoto real, desempenho dos portais em hardware de TV.

## Pendências da auditoria ui-humanizer (2026-10-20) — fazer primeiro amanhã

Tells de template: **nenhum da classe A** (sem eyebrow, gradiente em texto, borda lateral, pulse, emoji, roxo, glass, 3-passos).
Detector: 3× A13 (hover em `.portal/.card/.tile` — todos botões clicáveis, ok) e 8× B6 (gradientes só como escurecimento p/ legibilidade sobre foto — ok;
`css/app.css:82` e `:156` poderiam ser sólidos).

Problemas reais encontrados (ordem de prioridade):

1. **Segurança — `serve.py`:** o proxy é aberto. `serve.py:26` aceita qualquer http(s) (inclusive `127.0.0.1`/rede privada) e `serve.py:38`
   manda `Access-Control-Allow-Origin: *` → qualquer site aberto no navegador pode usar o proxy local para ler recursos da rede interna.
   Confirmado por curl (Origin arbitrária → 200 com ACAO `*`; proxy alcança `127.0.0.1:8080`).
   Corrigir: remover ACAO `*` (a página é same-origin), exigir `Host`/`Origin` locais, bloquear IPs privados/loopback, e/ou restringir ao host do provedor.
2. **Segurança — log:** `BaseHTTPRequestHandler` imprime a URL do proxy no console com usuário/senha (confirmado). Sobrescrever `log_message` para mascarar `password=`/`/user/pass/`.
3. **Notas do provedor não confiáveis:** nas séries, 83/83 notas visíveis são inteiros (★ 8.0, 9.0, até ★ 1.0 e 10.0); `ui.js:75` (`ratingTag`) mostra 1 casa decimal.
   Em filmes há ★ 10.0 no topo de "Melhor nota" e vários ★ 4.0 (valor padrão?). Decidir: ignorar 0/10.0 (e 4.0?) na ordenação e nas fileiras
   "mais bem avaliados"/hero (`r >= 6.3`), mostrar inteiro nas séries, ou esconder a nota.
4. **Título/categoria em PT:** `views.js:8` (`pretty`) faz Title Case: "Jogos Do Dia", "Record Tv", "Hbo", "Sbt", "Uhd 4k" (preposição e siglas erradas);
   `copy.md` da skill diz que Title Case em PT é tell. Usar caixa de frase + lista de siglas (HBO, SBT, TV, UHD, 4K, DC, ESPN, NBA, NFL…) e
   restaurar acentos dos nomes de categoria do provedor (Lançamentos, Ação, Comédia, Animação/Infantil, Ficção, Documentários).
5. **Desempenho em TV:** `nav.js:19` chama `getComputedStyle` em cada focável a cada tecla (centenas de elementos). Cachear/usar `offsetParent`/`checkVisibility`.
   Portais animam o tempo todo mesmo fora da tela: pausar com IntersectionObserver (`animation-play-state`). Testar em aparelho real.
6. **Mensagem de erro do player:** `player.js:141` mostra "Sem sinal neste canal agora" também para 403 (limite de 1 tela). Diferenciar pelo `d.response.code`.
7. **Texto pequeno para TV:** `.tag` (`app.css:159`, .72rem ≈ 13 px a 1080p) e legendas .85rem. Subir para uso em 10 pés.
8. **Menores:** escala de raios inconsistente (.25/.3/.4/.5/.6/2rem — reduzir a 2–3 tokens; chips em pill são ok, `app.css:208`);
   `views.js:66` grava `lastLive` e nunca lê (implementar "último canal" ou remover); fileira "Continuar assistindo" com 1 cartão fica vazia;
   hero de série sem sinopse (lista não traz; buscar em `get_series_info` só para os destaques); sem SRI nos scripts de CDN.

## Roadmap combinado

1. **Bloco 1 (rápido):** pendências acima + testar próximo episódio e layout pequeno + canais favoritos/último canal + etiqueta "Novo".
2. **Google TV de verdade:** empacotar como app Android TV (WebView ou ExoPlayer). Vale cedo: D-pad real, desempenho, codecs. No app nativo o proxy some.
   **Perguntar ao usuário:** tem Google TV / Android Studio / celular Android para testar?
3. **TV ao vivo melhor:** EPG (`get_short_epg`), zapping por número, mini-lista no player.
4. **Ativação por aparelho (modelo IBO Player) para monetizar — só depois de garantir que o player funciona:**
   - App abre **sem conteúdo**, mostra **ID do aparelho (formato MAC) + chave**; o cliente/revendedor ativa e cadastra a lista no site.
   - MAC real não é legível no Android 6+ → ID aleatório salvo no aparelho + chave curta; prever transferência de licença (limpar dados do app troca o ID).
   - Exige **servidor** (cadastro de aparelhos, validade, lista por aparelho), **painel web** e **pagamento** (Pix/Stripe/Mercado Pago). A tela de login atual sai.
   - Jurídico/loja: vender só o **software**, nunca conteúdo; sem provedor/lista embutidos (Google Play recusa apps de IPTV com conteúdo).
   - Começar pelo servidor mínimo com ativação manual, depois pagamento.
