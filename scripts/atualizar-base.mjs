// Verificação diária das fontes de legislação fiscal (União e Estados).
// Sem dependências: usa só o Node 20+. Detecta MUDANÇAS; nunca altera alíquotas sozinho.
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export const LIMITE_FALHAS = 0.5; // se mais da metade das fontes falhar, a verificação NÃO conta

export function normalizarHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export const sha256 = (texto) => createHash("sha256").update(texto).digest("hex");

async function buscar(fonte, fetchImpl) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 30000);
  try {
    const headers = { "User-Agent": "advocacy-legislacao-fiscal/1.0 (verificacao diaria; +https://github.com/augustodeazevedo-beep/advocacy-legislacao-fiscal)" };
    // A API do GitHub limita consultas anônimas; no robô usamos o token automático do próprio Actions.
    if (fonte.url.startsWith("https://api.github.com/") && process.env.GITHUB_TOKEN) {
      headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    }
    const res = await fetchImpl(fonte.url, { signal: ctrl.signal, headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    if (fonte.tipo === "github-release") {
      const j = await res.json();
      return `${j.tag_name ?? ""}|${j.published_at ?? ""}`;
    }
    return normalizarHtml(await res.text());
  } finally {
    clearTimeout(t);
  }
}

/** Atualiza a base com o resultado de uma rodada de verificação. Função pura em relação ao relógio e à rede injetados. */
export async function atualizarBase(base, { fetchImpl = fetch, agora = new Date(), esperaMs = 8000 } = {}) {
  const iso = agora.toISOString();
  const alertas = [];
  let falhas = 0;
  let mudou = false;

  for (const f of base.fontes) {
    f.ultimaVerificacaoEm = iso;
    try {
      // até 3 tentativas com espera crescente: sites públicos oscilam e às vezes recusam conexões
      let conteudo;
      for (let tentativa = 1; ; tentativa++) {
        try {
          conteudo = await buscar(f, fetchImpl);
          break;
        } catch (e) {
          if (tentativa >= 3) throw e;
          await new Promise((r) => setTimeout(r, esperaMs * tentativa));
        }
      }
      if (!conteudo || conteudo.length < 10) throw new Error("conteúdo vazio");
      const hash = sha256(conteudo);
      if (!f.ultimoHash) {
        f.status = "nova";
        f.ultimoHash = hash;
      } else if (f.ultimoHash !== hash) {
        f.status = "mudou";
        f.ultimoHash = hash;
        f.ultimaMudancaEm = iso;
        mudou = true;
        alertas.push(`Mudança detectada em ${f.orgao}: ${f.titulo}. Revise a norma e, se for o caso, atualize os parâmetros.`);
      } else {
        f.status = "ok";
      }
      delete f.erro;
    } catch (e) {
      falhas += 1;
      f.status = "falha";
      const causa = e && e.cause ? ` — ${e.cause.code ?? ""} ${e.cause.message ?? ""}`.trimEnd() : "";
      f.erro = (e instanceof Error ? e.message : String(e)) + causa;
      alertas.push(`Não foi possível consultar ${f.orgao}: ${f.titulo} (${f.erro}).`);
    }
  }

  const total = base.fontes.length || 1;
  const verificacaoValida = falhas / total <= LIMITE_FALHAS;
  if (verificacaoValida) {
    base.verificadoEm = iso;
  } else {
    alertas.unshift("Verificação NÃO concluída: falha em mais da metade das fontes. A data de verificação não foi atualizada.");
  }
  // A revisão pendente só é desligada por um humano (editando base.json); o robô apenas liga.
  if (mudou) base.revisaoPendente = true;
  base.alertas = alertas;
  return { base, mudou, falhas, verificacaoValida };
}

async function principal() {
  const caminho = new URL("../base.json", import.meta.url);
  const base = JSON.parse(await readFile(caminho, "utf8"));
  const r = await atualizarBase(base);
  await writeFile(caminho, JSON.stringify(r.base, null, 2) + "\n");
  console.log(`fontes=${base.fontes.length} falhas=${r.falhas} mudou=${r.mudou} valida=${r.verificacaoValida}`);
  if (process.env.GITHUB_OUTPUT) {
    const { appendFile } = await import("node:fs/promises");
    await appendFile(process.env.GITHUB_OUTPUT, `mudou=${r.mudou}\nvalida=${r.verificacaoValida}\n`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  principal().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
