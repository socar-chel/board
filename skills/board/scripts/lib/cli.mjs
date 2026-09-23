// 스크립트 공통: 인자 파싱 · stdin JSON · 진입점 판정(심링크 안전).
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

// ~/.claude/skills/board 가 심링크면 process.argv[1]과 import.meta.url이 다른 경로를 가리킨다 — realpath로 비교한다.
function isMain(metaUrl) {
  try { return realpathSync(fileURLToPath(metaUrl)) === realpathSync(process.argv[1]); } catch { return false; }
}
function parseArgs(argv) {
  const opts = {}, pos = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) { const [k, v] = a.slice(2).split("="); if (v !== undefined) opts[k] = v; else if (argv[i + 1] && !argv[i + 1].startsWith("--")) opts[k] = argv[++i]; else opts[k] = true; }
    else pos.push(a);
  }
  return { opts, pos };
}
async function readStdin() { let s = ""; for await (const ch of process.stdin) s += ch; return s; }
async function readStdinJSON() { const s = await readStdin(); if (!s.trim()) throw new Error("stdin이 비어 있다"); return JSON.parse(s); }
const out = (o) => process.stdout.write(JSON.stringify(o, null, 2) + "\n");
const err = (s) => process.stderr.write(String(s) + "\n");
export { isMain, parseArgs, readStdin, readStdinJSON, out, err };
