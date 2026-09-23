import { test } from "node:test";
import assert from "node:assert/strict";
import { normalize } from "./snapshot.mjs";
import { plan } from "./restore.mjs";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const meta = { title: "t", rows: [{ id: "r1" }, { id: "r2" }], cols: [{ id: "unset" }, { id: "c1" }] };
const cards = [
  { id: "z", type: "pr", pos: { row: "r2", col: "c1", ord: "V" }, title: "z" },
  { id: "a", type: "doc", pos: { row: "r1", col: "c1", ord: "k" }, title: "a" },
  { id: "b", type: "doc", pos: { row: "r1", col: "c1", ord: "F" }, title: "b" },
  { id: "x", type: "qa", pos: { row: "r1", col: "unset", ord: "V" }, title: "x", archived: true },
];
test("snapshot orders by row → col → ord, archived last, keys fixed", () => {
  const s = normalize({ meta, cards, exportedAt: "E" });
  assert.deepEqual(s.cards.map((c) => c.id), ["b", "a", "z", "x"]);
  assert.deepEqual(Object.keys(s.cards[0]).slice(0, 4), ["id", "type", "title", "pos"]);
  assert.deepEqual(Object.keys(s.meta).slice(0, 2), ["title", "rows"]);
});
test("restore plans set writes and archives cards missing from the snapshot", () => {
  const dir = mkdtempSync(join(tmpdir(), "board-restore-"));
  const r = plan({ meta, cards: cards.slice(0, 2), exportedAt: "E" }, { cards: [...cards, { id: "only-in-db", type: "pr", pos: { row: "r1", col: "c1", ord: "V" }, title: "o" }] }, dir);
  assert.equal(r.summary.cards, 2); assert.deepEqual(r.summary.archiveOnly, ["b", "only-in-db"]);
  assert.equal(r.batches[0].length, 5);
  const doc = JSON.parse(readFileSync(r.batches[0].find((w) => w.doc_id === "only-in-db").file_path, "utf8")); assert.equal(doc.archived, true);
});
