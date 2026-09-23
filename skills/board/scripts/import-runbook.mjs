#!/usr/bin/env node
// 런북 HTML(table.matrix) → 보드 초안 {meta, cards}. stdout JSON, stderr 요약.
//   node import-runbook.mjs runbook.html [--year 2026] [--repo owner/name] [--branch-prefix feature/TICKET]
import { readFileSync } from "node:fs";
import { isMain, parseArgs, out, err } from "./lib/cli.mjs";
import { importRunbook } from "./lib/import.mjs";

if (isMain(import.meta.url)) {
  const { opts, pos } = parseArgs(process.argv.slice(2));
  if (!pos[0]) { err("usage: import-runbook.mjs runbook.html [--year Y] [--repo owner/name] [--branch-prefix P]"); process.exit(2); }
  const r = importRunbook(readFileSync(pos[0], "utf8"), { year: opts.year ? Number(opts.year) : undefined });
  if (opts.repo) r.meta.repo = opts.repo;
  if (opts["branch-prefix"]) r.meta.branchPrefix = opts["branch-prefix"];
  const s = r.summary;
  err(`제목 "${r.meta.title}" · 티켓 ${r.meta.ticket || "-"} · 행 ${s.rows} · 열 ${s.cols} · 카드 ${s.cards} (${Object.entries(s.byType).map(([k, v]) => `${k} ${v}`).join(" · ")})`);
  for (const w of s.warnings) err("  경고: " + w);
  out({ meta: r.meta, cards: r.cards, summary: s });
}
