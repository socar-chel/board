#!/usr/bin/env node
// stdin: 덤프 {meta, cards} → stdout: {updates:[{id, probe}], suggestions, jira, unregistered, errors, probed}
// 실측은 gh(로그인된 계정)로만 읽는다. 쓰기 없음. 카드는 만들지 않는다.
import { execFileSync } from "node:child_process";
import { isMain, parseArgs, readStdinJSON, out, err } from "./lib/cli.mjs";
import { probeCards } from "./lib/probe.mjs";

const run = (cmd, args) => { try { return execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 60000 }); } catch (e) { throw new Error((e.stderr || e.message || String(e)).trim()); } };

if (isMain(import.meta.url)) {
  const { opts } = parseArgs(process.argv.slice(2));
  const dump = await readStdinJSON();
  if (opts.repo) dump.meta = { ...(dump.meta || {}), repo: opts.repo };
  if (!dump.meta?.repo) err("경고: meta.repo가 없어 브랜치·미등록 PR 탐색을 건너뛴다 (--repo owner/name)");
  const r = await probeCards(dump, { run });
  err(`실측 ${r.probed}건 · 실패 ${r.errors.length} · 제안 ${r.suggestions.length} · Jira ${r.jira.length}건은 에이전트가 MCP로 · 미등록 PR ${r.unregistered.length}`);
  out(r);
}
