// Texto e notas vindos do provedor. Módulo puro (sem DOM): testável no Node.

// Preposições/artigos ficam em minúscula no meio do nome ("Jogos do Dia").
const SMALL = new Set(['de', 'do', 'da', 'dos', 'das', 'e', 'em', 'no', 'na', 'nos', 'nas', 'a', 'o', 'as', 'os', 'para', 'por', 'com', 'ao']);
// Siglas e formatos técnicos: 4K, 24H, H265, UHD, HBO, TV…
const ACRO = /^(tv|hbo|sbt|uhd|hd|fhd|dc|espn|nba|nfl|ufc|wwe|cnn|bbc|fx|amc|ppv|dj|dazn|vod|hevc|h\d+)$/i;
// O provedor manda categorias sem acento ou com acento pela metade ("AÇAO"); só palavras que realmente aparecem.
const FIX = {
  acao: 'ação', açao: 'ação', lancamentos: 'lançamentos', comedia: 'comédia', animacao: 'animação', ficcao: 'ficção',
  documentarios: 'documentários', musicas: 'músicas', series: 'séries', noticias: 'notícias', brasileirao: 'brasileirão',
  appletv: 'Apple TV', sportv: 'SporTV', youtube: 'YouTube', cientifica: 'científica', historia: 'história', religiao: 'religião',
};

// "JOGOS DO DIA" → "Jogos do Dia"; "HBO MAX" → "HBO Max"; "UHD 4K" → "UHD 4K"; "ACAO" → "Ação".
export function pretty(s) {
  let first = true;
  return String(s).toLowerCase().replace(/\p{L}[\p{L}\p{N}]*/gu, w => {
    const fixed = FIX[w] ?? w;
    let out;
    if (ACRO.test(w)) out = w.toUpperCase();
    else if (!first && SMALL.has(w)) out = fixed;
    else out = fixed.charAt(0).toUpperCase() + fixed.slice(1);
    first = false;
    return out;
  });
}

// A nota do provedor só é confiável entre 0 e 10 exclusivos: 0 é "sem nota" e 10.0 aparece como valor de teto/padrão.
export const trustedRating = r => r > 0 && r < 10;

// Séries chegam sempre arredondadas (8, 9…): mostra "★ 8" em vez de fingir precisão com "★ 8.0".
export const ratingLabel = r => (trustedRating(r) ? '★ ' + (Number.isInteger(r) ? r : r.toFixed(1)) : '');
