#!/usr/bin/env node
// ArtifactData의 out_dir 덤프(<dir>/meta/board.json · <dir>/meta/sync.json · <dir>/cards/*.json) → 한 파일 {artifact, meta, sync, cards}.
//   node assemble-dump.mjs <dir> [--url <artifact url>] [--out dump.json]
// out_dir 파일은 문서 본문 그대로일 수도, {id, data, version} 봉투일 수도 있다 — 둘 다 받는다.
import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isMain, parseArgs, out, err } from "./lib/cli.mjs";

const unwrap = (j) => (j && typeof j === "object" && "data" in j && "version" in j && j.data && typeof j.data === "object") ? j.data : j;
const readDoc = (p) => (existsSync(p) ? unwrap(JSON.parse(readFileSync(p, "utf8"))) : null);
function assemble(dir, { url = null } = {}) {
  const meta = readDoc(join(dir, "meta", "board.json")), sync = readDoc(join(dir, "meta", "sync.json"));
  const cdir = join(dir, "cards");
  const cards = existsSync(cdir) ? readdirSync(cdir).filter((f) => f.endsWith(".json")).map((f) => readDoc(join(cdir, f))).filter(Boolean) : [];
  return { artifact: url ? { url } : null, exportedAt: new Date().toISOString(), meta, sync, cards };
}
if (isMain(import.meta.url)) {
  const { opts, pos } = parseArgs(process.argv.slice(2));
  if (!pos[0]) { err("usage: assemble-dump.mjs <dir> [--url U] [--out F]"); process.exit(2); }
  const d = assemble(pos[0], { url: opts.url || null });
  if (!d.meta) err("경고: meta/board.json 없음");
  err(`카드 ${d.cards.length}`);
  if (opts.out) writeFileSync(opts.out, JSON.stringify(d, null, 2) + "\n"); else out(d);
}
export { assemble };
