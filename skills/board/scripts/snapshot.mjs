#!/usr/bin/env node
// stdin: {artifact?, meta, sync?, cards[]} → board.json 정규화(행·열 순서 → ord, 키 고정 순서). --out <file>이면 파일로.
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { isMain, parseArgs, readStdinJSON, out, err } from "./lib/cli.mjs";

const CARD_KEYS = ["id", "type", "title", "stage", "pos", "owner", "due", "target", "ticket", "pr", "branch", "links", "blockedBy", "blockedAt", "archived", "note", "probe", "createdAt", "updatedAt"];
const ordered = (o, keys) => { const r = {}; for (const k of keys) if (o[k] !== undefined) r[k] = o[k]; for (const k of Object.keys(o).sort()) if (!(k in r)) r[k] = o[k]; return r; };
function normalize(dump) {
  const meta = dump.meta || {}, rows = (meta.rows || []).map((r) => r.id), cols = (meta.cols || []).map((c) => c.id);
  const ix = (arr, v) => { const i = arr.indexOf(v); return i < 0 ? 1e9 : i; };
  const cards = [...(dump.cards || [])].sort((a, b) => (a.archived ? 1 : 0) - (b.archived ? 1 : 0) || ix(rows, a.pos?.row) - ix(rows, b.pos?.row) || ix(cols, a.pos?.col) - ix(cols, b.pos?.col) || String(a.pos?.ord || "").localeCompare(String(b.pos?.ord || "")) || String(a.id).localeCompare(String(b.id)));
  return { artifact: dump.artifact || null, exportedAt: dump.exportedAt || new Date().toISOString(), meta: ordered(meta, ["schemaVersion", "title", "ticket", "repo", "branchPrefix", "rows", "cols", "updatedAt"]), sync: dump.sync || null, cards: cards.map((c) => ordered(c, CARD_KEYS)) };
}
if (isMain(import.meta.url)) {
  const { opts } = parseArgs(process.argv.slice(2));
  const snap = normalize(await readStdinJSON());
  if (opts.out) { mkdirSync(dirname(opts.out), { recursive: true }); writeFileSync(opts.out, JSON.stringify(snap, null, 2) + "\n"); err(`저장: ${opts.out} (카드 ${snap.cards.length})`); }
  else out(snap);
}
export { normalize };
