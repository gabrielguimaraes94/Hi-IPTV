# Progresso — HI-IPTV

Mantenha esta lista em dia: marque o item no mesmo commit que o conclui e acrescente itens novos quando surgirem.
Detalhes de cada passo estão no `git log`; arquitetura e armadilhas no `CLAUDE.md`.

## Feito
- [x] 2026-10-20: player IPTV em HTML com proxy local (`serve.py`)
- [x] 2026-10-20: home estilo streaming com API Xtream e cache diário no IndexedDB
- [x] 2026-10-20: títulos limpos, sem duplicatas; foco após episódio, splash em toda abertura, refresh pós-meia-noite
- [x] 2026-10-20: barra de categorias e "Ver tudo" em filmes e séries
- [x] 2026-10-21: proxy do `serve.py` fechado e senha fora do log
- [x] 2026-10-21: notas suspeitas do provedor (`trustedRating`) e títulos/categorias em português (`text.js`)
- [x] 2026-10-21: lista M3U como segunda fonte (além do Xtream)
- [x] 2026-10-21: guia de programação (Xtream `get_short_epg` e XMLTV para M3U)
- [x] 2026-10-29: engrenagem no player: estatísticas para nerds, qualidade, áudio e velocidade
- [x] 2026-10-29: ao vivo via `.ts` primeiro (o `.m3u8` do provedor de teste trava e repete trechos)

## Em andamento
- [ ] Ajustes → "Aparência e reprodução": tema (Brasa/Órbita), tamanho do texto (Normal/Grande), animações (Completas/Reduzidas)
      e formato do ao vivo (MPEG-TS/HLS, só Xtream). Código pronto no working tree (`prefs` em `store.js`, `applyPrefs` em `main.js`,
      `app.css`, fonte Sora no `index.html`), **ainda sem commit e sem validação no navegador**

## Pendências (auditoria de 2026-10-20), por prioridade
1. [ ] **TV fraca:** `nav.js` chama `getComputedStyle` em cada focável a cada tecla; portais animam mesmo fora da tela (pausar com IntersectionObserver)
2. [ ] **Player:** "Sem sinal neste canal agora" também aparece para 403 (limite de 1 tela); diferenciar pelo código de resposta
3. [ ] Texto pequeno para 10 pés (`.tag` ≈ 13 px a 1080p); o modo "Grande" dos Ajustes ajuda, mas o padrão continua pequeno
4. [ ] Escala de raios inconsistente no CSS
5. [ ] `lastLive` é gravado e nunca lido (usar em "último canal")
6. [ ] Sem SRI nos scripts de CDN (hls.js, mpegts.js)
7. [ ] Hero de série sem sinopse (a lista não traz)
8. [ ] Decidir com o usuário: esconder também a nota 4.0 (possível valor padrão)? Bloqueio por senha para conteúdo adulto?

## Próximos (roadmap, ver `CLAUDE.md`)
- [ ] Canais favoritos, último canal e selo "Novo"
- [ ] Zapping por número e mini-lista de canais no player
- [ ] Android TV (WebView ou ExoPlayer); perguntar ao usuário que aparelhos e ferramentas tem para testar
- [ ] Ativação por aparelho (modelo IBO Player), só depois de o player estar garantido

## Não testado
- Mobile/tela pequena (só a home foi vista)
- Próximo episódio automático
- Filmes mkv/avi
- Refresh pós-meia-noite com o app aberto
- D-pad com controle real e desempenho em hardware de TV
