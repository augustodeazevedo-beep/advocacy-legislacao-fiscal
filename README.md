# advocacy-legislacao-fiscal

Base **pública** (somente metadados de normas públicas, sem dados de clientes) usada pelas calculadoras CBS/IBS do ecossistema Advocacy.IA.

## Como funciona
1. Todo dia às 05h (Brasília) o GitHub Actions consulta as fontes listadas em `base.json` (União e Estados), calcula a impressão digital (hash) de cada uma e grava a data em `verificadoEm`.
2. Se uma fonte **mudou**, o robô liga `revisaoPendente` e abre uma *issue* pedindo revisão humana. O robô **nunca** altera alíquotas.
3. As plataformas (Advoga, Fin, Inventaria, Peticiona) leem `base.json`. Se a última verificação tiver mais de 72 h, a calculadora **bloqueia** o resultado (aviso forte a partir de 36 h).

## Como revisar uma mudança (profissional)
Leia a norma alterada → se afetar alíquotas, edite `parametros` (e `statusReferencia`: `"lei"` ou `"estimativa"`) → coloque `revisaoPendente: false` e atualize `revisadoEm`.

## Como incluir uma fonte (União ou outro Estado)
Acrescente um objeto em `fontes` (`esfera`, `uf`, `url`, `tipo`: `html` ou `github-release`). Fontes que falham aparecem em `alertas`.

Aviso: a verificação detecta que um texto mudou; não interpreta a mudança. Fontes com conteúdo dinâmico podem gerar alertas falsos.
