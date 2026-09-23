#!/usr/bin/env node
// probe.json(+ Jira 실측 결과) → ArtifactData batch 페이로드. 카드마다 {probe} 파일을 <out-dir>/probe/<id>.json에 쓰고 50건 단위 목록을 stdout에 낸다.
//   node probe-to-batch.mjs probe.json --out-dir <dir> [--jira jira.json] [--versions versions.txt]
// jira.json: [{id, key, status, assignee, title, ok, err}] — 에이전트가 MCP로 읽어 만든다. 없으면 jira[] 카드는 {ok:false, err:"미실측"}으로 남긴다.
// versions: 기존 문서 update는 if_version이 필수다(실측). ArtifactData list/get 결과 텍스트(`"id"  N bytes  version V` 줄)나
//   {id: version} JSON을 그대로 파일로 넘기면 항목마다 if_version을 붙인다. 없으면 붙이지 않는다(새 문서에만 통한다).
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { isMain, parseArgs, out, err } from "./lib/cli.mjs";

function parseVersions(txt) {
  if (!txt) return {};
  try { const j = JSON.parse(txt); if (j && typeof j === "object" && !Array.isArray(j) && !("data" in j)) return j; } catch {}
  const m = {};
  for (const raw of txt.split("\n")) {
    const line = raw.trim().replace(/^-\s*/, "");
    const a = line.match(/^"([^"]+)"\s+\d+\s+bytes\s+version\s+(\d+)/); if (a) { m[a[1]] = Number(a[2]); continue; }
    if (line.startsWith("{")) { try { const j = JSON.parse(line); if (j.id && j.version != null) m[j.id] = Number(j.version); } catch {} }
  }
  return m;
}
function toBatch(probe, jira, outDir, now = new Date().toISOString(), versions = {}) {
  const byId = new Map(probe.updates.map((u) => [u.id, { ...u.probe }]));
  const jmap = new Map((jira || []).map((j) => [j.id, j]));
  for (const { id, key } of probe.jira || []) {
    const j = jmap.get(id);
    const t = j ? { key, status: j.status ?? null, assignee: j.assignee ?? null, title: j.title ?? null, at: now, ok: j.ok !== false, err: j.err ?? null } : { key, at: now, ok: false, err: "미실측 (Jira MCP 없음)" };
    const p = byId.get(id) || { at: now, ok: true, err: null }; p.ticket = t; if (!t.ok && p.ok !== false) { /* PR 실측은 성공이어도 티켓 실패는 별도 필드 */ } byId.set(id, p);
  }
  mkdirSync(join(outDir, "probe"), { recursive: true });
  const writes = [];
  for (const [id, p] of byId) { const f = join(outDir, "probe", id + ".json"); writeFileSync(f, JSON.stringify({ probe: p }, null, 2)); const w = { op: "update", collection: "cards", doc_id: id, file_path: f }; if (versions[id] != null) w.if_version = versions[id]; writes.push(w); }
  const missing = [...byId.keys()].filter((id) => versions[id] == null);
  const batches = []; for (let i = 0; i < writes.length; i += 50) batches.push(writes.slice(i, i + 50));
  // 실패 목록은 사람이 읽을 문장으로 — 헤더의 "미실측 n"에 마우스를 올리면 이게 보인다
  const failures = [];
  for (const [id, p] of byId) {
    if (p.ok === false) failures.push({ id, what: p.pr?.number ? `PR #${p.pr.number}` : p.branch ? "브랜치" : "PR", err: p.err || "실측 실패" });
    if (p.ticket && p.ticket.ok === false) failures.push({ id, what: `Jira ${p.ticket.key || ""}`.trim(), err: p.ticket.err || "실측 실패" });
  }
  return { batches, missingVersions: missing, sync: { at: now, by: "agent", probed: byId.size, failed: failures.length, failures, schemaVersion: 1 } };
}
if (isMain(import.meta.url)) {
  const { opts, pos } = parseArgs(process.argv.slice(2));
  if (!pos[0] || !opts["out-dir"]) { err("usage: probe-to-batch.mjs probe.json --out-dir <dir> [--jira jira.json]"); process.exit(2); }
  const probe = JSON.parse(readFileSync(pos[0], "utf8")), jira = opts.jira && existsSync(opts.jira) ? JSON.parse(readFileSync(opts.jira, "utf8")) : null;
  const versions = opts.versions && existsSync(opts.versions) ? parseVersions(readFileSync(opts.versions, "utf8")) : {};
  const r = toBatch(probe, jira, opts["out-dir"], undefined, versions);
  err(`update ${r.sync.probed}건 · 실패 ${r.sync.failed} · batch ${r.batches.length}개` + (r.missingVersions.length ? ` · if_version 없음 ${r.missingVersions.length}건 (${r.missingVersions.join(", ")})` : ""));
  out(r);
}
export { toBatch, parseVersions };
