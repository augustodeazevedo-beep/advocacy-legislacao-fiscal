import test from "node:test";
import assert from "node:assert/strict";
import { atualizarBase, normalizarHtml } from "./atualizar-base.mjs";

const mk = () => ({
  verificadoEm: "2026-01-01T00:00:00.000Z",
  revisaoPendente: false,
  alertas: [],
  fontes: [
    { id: "a", orgao: "Planalto", titulo: "LC 214", url: "https://x/a", tipo: "html" },
    { id: "b", orgao: "RFB", titulo: "release", url: "https://x/b", tipo: "github-release" },
  ],
});
const resp = (corpo, ok = true) => ({ ok, status: ok ? 200 : 500, text: async () => corpo, json: async () => JSON.parse(corpo) });
const agora = new Date("2026-11-18T08:00:00Z");

test("normaliza HTML ignorando scripts e marcação", () => {
  assert.equal(normalizarHtml("<p>Olá <b>Mundo</b></p><script>x()</script>"), "olá mundo");
});

test("primeira rodada marca fonte como nova e atualiza a data de verificação", async () => {
  const f = async (u) => (u.endsWith("/b") ? resp(JSON.stringify({ tag_name: "v1", published_at: "2026-01-01" })) : resp("<p>texto da lei com conteúdo</p>"));
  const r = await atualizarBase(mk(), { fetchImpl: f, agora , esperaMs: 0 });
  assert.equal(r.base.fontes[0].status, "nova");
  assert.equal(r.base.verificadoEm, agora.toISOString());
  assert.equal(r.mudou, false);
});

test("mudança de conteúdo liga revisaoPendente e gera alerta", async () => {
  const base = mk();
  const f1 = async (u) => (u.endsWith("/b") ? resp(JSON.stringify({ tag_name: "v1", published_at: "d" })) : resp("<p>versão um do texto legal</p>"));
  await atualizarBase(base, { fetchImpl: f1, agora , esperaMs: 0 });
  const f2 = async (u) => (u.endsWith("/b") ? resp(JSON.stringify({ tag_name: "v1", published_at: "d" })) : resp("<p>versão dois do texto legal</p>"));
  const r = await atualizarBase(base, { fetchImpl: f2, agora: new Date("2026-11-19T08:00:00Z") , esperaMs: 0 });
  assert.equal(r.mudou, true);
  assert.equal(r.base.revisaoPendente, true);
  assert.equal(r.base.fontes[0].status, "mudou");
  assert.match(r.base.alertas[0], /Mudança detectada/);
});

test("sem mudança, o robô não desliga revisaoPendente (só humano desliga)", async () => {
  const base = mk();
  base.revisaoPendente = true;
  const f = async (u) => (u.endsWith("/b") ? resp(JSON.stringify({ tag_name: "v1", published_at: "d" })) : resp("<p>mesmo texto legal estável</p>"));
  await atualizarBase(base, { fetchImpl: f, agora , esperaMs: 0 });
  const r = await atualizarBase(base, { fetchImpl: f, agora , esperaMs: 0 });
  assert.equal(r.base.revisaoPendente, true);
});

test("falha em mais da metade das fontes NÃO atualiza a data de verificação", async () => {
  const base = mk();
  const f = async () => resp("erro", false);
  const r = await atualizarBase(base, { fetchImpl: f, agora , esperaMs: 0 });
  assert.equal(r.verificacaoValida, false);
  assert.equal(r.base.verificadoEm, "2026-01-01T00:00:00.000Z");
  assert.match(r.base.alertas[0], /NÃO concluída/);
});

test("falha em uma de duas fontes ainda conta como verificação válida", async () => {
  const base = mk();
  const f = async (u) => (u.endsWith("/b") ? resp("x", false) : resp("<p>texto legal com tamanho suficiente</p>"));
  const r = await atualizarBase(base, { fetchImpl: f, agora , esperaMs: 0 });
  assert.equal(r.falhas, 1);
  assert.equal(r.verificacaoValida, true);
  assert.equal(r.base.fontes[1].status, "falha");
});
