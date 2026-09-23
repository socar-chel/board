import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { importRunbook } from "./import.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, "..", "fixtures", "runbook-sample.html"), "utf8");
const out = importRunbook(html, { year: 2026, now: "2026-09-19T00:00:00.000Z" });
const byTitle = (s) => out.cards.find((c) => c.title.includes(s) || (c.pr || "").endsWith("/pull/" + s.replace("#", "")));

test("title · ticket · rows · cols", () => {
  assert.equal(out.meta.ticket, "ACME-1234"); assert.equal(out.meta.title, "파트너 채널 연동");
  assert.deepEqual(out.meta.rows.map((r) => [r.label, r.sub, r.kind, r.type]), [["T1", "service-server", "code", "pr"], ["T6", "ops · 환경", "infra", "infra"], ["사람 · 외부", "관문 · 회신", "ask", "ask"], ["QA", "TC 작성 · 수행", "qa", "qa"]]);
  assert.equal(out.meta.cols[0].id, "unset");
  assert.deepEqual(out.meta.cols[2], { id: "c2", label: "Phase 1 핵심 경로", start: "2026-09-10", end: "2026-09-17", note: "" });
  assert.equal(out.meta.cols[3].note, "10/13"); assert.equal(out.meta.jiraBase, "https://acme.atlassian.net/browse/");
});
test("pr links split into one card each with stage hint", () => {
  const p811 = byTitle("#811"), p812 = byTitle("#812"), p813 = byTitle("#813"), p795 = byTitle("#795");
  assert.ok(p811 && p812 && p813 && p795);
  assert.equal(p811.pr, "https://github.com/acme/repo/pull/811");
  assert.equal(p812.title, "② 9/17 머지"); assert.equal(p795.title, "결제 포트 도입 9/10");
  assert.equal(p813.stage, "review"); assert.equal(p795.stage, "merged");
  assert.equal(p811.title, "① #811"); assert.equal(p811.note, "① #811 · ② #812 9/17 머지");
  assert.deepEqual([p811.pos.col, p813.pos.row], ["c2", "r1"]);
  assert.ok(p811.pos.ord < p812.pos.ord && p812.pos.ord < p813.pos.ord);
});
test("non-pr items: type from li class, ticket, links, ☐/✅ stages", () => {
  const infra = byTitle("재채번"); assert.equal(infra.type, "infra"); assert.equal(infra.stage, "planned");
  const dbreq = byTitle("DBREQ"); assert.equal(dbreq.type, "ask"); assert.equal(dbreq.stage, "todo"); assert.equal(dbreq.title, "DBREQ"); assert.equal(dbreq.note, "DBREQ ☐(V50·V51)"); assert.equal(dbreq.delayNote, "런북에서 지연으로 표시");
  const doc = byTitle("ops 런북"); assert.equal(doc.type, "doc"); assert.equal(doc.stage, "published"); assert.equal(byTitle("T5")?.stage ?? "todo", "todo"); assert.deepEqual(doc.links, ["https://wiki.example/ops"]);
  const sec = byTitle("보안성"); assert.deepEqual(sec.ticket, { key: "ISE-1624" }); assert.equal(sec.stage, "waiting");
  const dec = byTitle("자격"); assert.equal(dec.type, "decision"); assert.equal(dec.stage, "pending"); assert.equal(dec.owner.kind, "me"); assert.equal(byTitle("#813").owner.kind, "agent");
  const mixed = byTitle("WAF"); assert.equal(mixed.type, "infra"); assert.equal(mixed.stage, "in_progress");
});
test("cells without ul.items fall back to row type; empty cells warn", () => {
  const eg = byTitle("egress"); assert.equal(eg.type, "infra"); assert.equal(eg.stage, "done"); assert.equal(eg.pos.col, "c1");
  const app = byTitle("앱 설치"); assert.equal(app.type, "infra"); assert.equal(app.stage, "planned");
  assert.equal(out.summary.cards, 12);
  assert.deepEqual(out.summary.byType, { pr: 4, infra: 4, ask: 2, doc: 1, decision: 1 });
  assert.equal(out.summary.warnings.length, 1);
});
