#!/usr/bin/env node
// board.json → ArtifactData batch 페이로드. 문서마다 JSON 파일을 <out-dir>에 쓰고, 50건 단위 batch 목록(file_path 참조)을 stdout에 낸다.
//   node restore.mjs board.json --out-dir <dir> [--current dump.json] [--versions versions.txt]
// 기존 문서를 덮어쓰는 set에는 if_version이 필수라 --versions(list 결과 텍스트 또는 {id:version})를 같이 준다.
// --current(현재 DB 덤프)가 있으면 스냅샷에 없는 카드는 삭제하지 않고 archived:true로 남긴다.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { isMain, parseArgs, out, err } from "./lib/cli.mjs";
import { parseVersions } from "./probe-to-batch.mjs";

function plan(snapshot, current, outDir, versions = {}) {
  const writes = [];
  const put = (collection, doc_id, data) => { const p = join(outDir, collection, doc_id + ".json"); mkdirSync(join(outDir, collection), { recursive: true }); writeFileSync(p, JSON.stringify(data, null, 2)); const w = { op: "set", collection, doc_id, file_path: p }; if (versions[doc_id] != null) w.if_version = versions[doc_id]; writes.push(w); };
  put("meta", "board", { ...snapshot.meta, updatedAt: new Date().toISOString() });
  if (snapshot.sync) put("meta", "sync", snapshot.sync);
  const ids = new Set();
  for (const c of snapshot.cards || []) { ids.add(c.id); put("cards", c.id, c); }
  const archiveOnly = [];
  for (const c of current?.cards || []) if (!ids.has(c.id) && !c.archived) { archiveOnly.push(c.id); put("cards", c.id, { ...c, archived: true, note: [c.note, `restore ${snapshot.exportedAt || ""}에 없어 보관`].filter(Boolean).join(" · "), updatedAt: new Date().toISOString() }); }
  const batches = []; for (let i = 0; i < writes.length; i += 50) batches.push(writes.slice(i, i + 50));
  return { batches, summary: { meta: snapshot.sync ? 2 : 1, cards: (snapshot.cards || []).length, archiveOnly } };
}
if (isMain(import.meta.url)) {
  const { opts, pos } = parseArgs(process.argv.slice(2));
  if (!pos[0] || !opts["out-dir"]) { err("usage: restore.mjs board.json --out-dir <dir> [--current dump.json]"); process.exit(2); }
  const snap = JSON.parse(readFileSync(pos[0], "utf8")), cur = opts.current ? JSON.parse(readFileSync(opts.current, "utf8")) : null;
  const versions = opts.versions && existsSync(opts.versions) ? parseVersions(readFileSync(opts.versions, "utf8")) : {};
  const r = plan(snap, cur, opts["out-dir"], versions);
  err(`meta ${r.summary.meta} · 카드 ${r.summary.cards} · 보관 전환 ${r.summary.archiveOnly.length} · batch ${r.batches.length}개`);
  out(r);
}
export { plan };
