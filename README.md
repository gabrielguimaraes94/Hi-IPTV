# HI-IPTV

Player web para listas IPTV (Xtream Codes), primeiro passo de um app para Google TV.
HTML/CSS/JS puro, sem build. Pensado para controle remoto (navegação espacial por setas).

## Rodar

```
python serve.py        # http://localhost:8080
```

Abra o endereço e escolha a fonte da lista: **Usuário e senha** (Xtream Codes: servidor, usuário e senha) ou **Lista M3U**
(link do `.m3u`, com guia de programação XMLTV opcional). Deixe "Usar proxy local" marcado (a maioria dos provedores bloqueia o navegador por CORS).
As credenciais ficam só no `localStorage` do navegador — nunca no código.

## Como funciona

- **Catálogo:** Xtream vem da API `player_api.php` (leve e com capas/sinopses); M3U é lido e organizado no próprio app
  (filmes por `/movie/` ou extensão de vídeo, séries agrupadas pelo padrão `S01E02` no nome, o resto é TV ao vivo). Fica no IndexedDB.
  Na **primeira abertura de cada dia** o app baixa e atualiza tudo (splash com progresso);
  nas demais aberturas usa o cache. Ajustes → "Atualizar lista agora" força.
- **Telas:** Início (hero rotativo + portais Filmes/Séries/TV com pôsteres em movimento + fileiras),
  Filmes, Séries (temporadas e episódios), TV ao Vivo (categorias + grade), Busca, Ajustes.
- **Categorias:** em Filmes e Séries há uma barra de categorias (com contagem) e "Ver tudo ›" em cada fileira; a categoria abre em grade com ordenação (Recentes, Melhor nota, A–Z). Esc volta às fileiras.
- **Continuar assistindo** e **Minha lista** ficam no navegador.
- **Conteúdo adulto** é removido na carga do catálogo.
- **Player:** HLS (hls.js) e MPEG-TS (mpegts.js). Canais ao vivo usam `.m3u8` com fallback para `.ts`.
  Só um stream por vez — muitas contas permitem apenas 1 conexão.

## Teclas

| Tecla | Ação |
|---|---|
| ← ↑ ↓ → | navegar |
| Enter | abrir / assistir |
| Esc, Backspace | voltar |
| ← → (player) | −10 s / +10 s |
| ↑ ↓, PgUp/PgDn (ao vivo) | canal anterior / próximo |
| Espaço | pausar |
| F | tela cheia |

## Estrutura

```
index.html        shell
css/app.css       identidade visual e movimento
js/main.js        boot: login, splash, atualização diária, ajustes
js/api.js         cliente Xtream, catálogo, cache diário
js/store.js       localStorage + IndexedDB, progresso, minha lista
js/nav.js         navegação espacial e camadas
js/views.js       home, filmes, séries, TV, busca, detalhes
js/player.js      player em tela cheia
js/ui.js          helpers de DOM, cartões, fileiras
serve.py          servidor local + proxy CORS (/proxy?u=)
```

## Limitações conhecidas

- Sem EPG (guia de programação) ainda.
- Filmes `.mkv`/`.avi` (raros) podem não tocar no navegador.
- O proxy do `serve.py` é só para desenvolvimento; no app Android TV o player nativo não precisa dele.
- O proxy só aceita destinos públicos (recusa localhost e rede privada) e só responde a esta página. Provedor na rede local:
  `HI_ALLOW_PRIVATE=1 python serve.py`. O log mostra só o host do destino, nunca usuário/senha.
