#!/usr/bin/env node
// 런북(로컬 HTML) → 보드 DB 게시. 두 단계로 나뉜다 — 에이전트가 사이에서 ArtifactData batch를 부른다.
//   node runbook-publish.mjs plan <runbook.html> --remote <덤프 dir> --out-dir <dir> [--versions versions.txt] [--state runbook.publish.json] [--label 런북] [--adopt]
//   node runbook-publish.mjs commit --plan <plan.json> --state <runbook.publish.json> [--url <artifact url>]
// plan: <덤프 dir>/meta/runbook.json · <덤프 dir>/runbook/*.json (ArtifactData get/list의 out_dir)과 state(마지막 게시 기록)를 대조해
//   batches[](≤50건, 항목마다 file_path·if_version)를 낸다. 충돌이 하나라도 있으면 batches를 비우고 exit 3 —
//   절 일부만 올라가면 A1이 아직 없는 결정 #N을 가리키는 식으로 문서가 어긋나므로 전부 아니면 전무다.
//   충돌 절의 원격 본문은 <out-dir>/conflicts/<id>.remote.html에 떨어진다 — 로컬에 병합하고 plan을 다시 돈다.
// commit: batch가 전부 성공한 뒤에만 부른다. state를 이번 게시본으로 갱신한다.
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { isMain, parseArgs, out, err } from "./lib/cli.mjs";
import { splitRunbook, planPublish, unwrap } from "./lib/runbook.mjs";
import { parseVersions } from "./probe-to-batch.mjs";

function readRemote(dir, versions = {}) {
  const shellFile = join(dir, "meta", "runbook.json");
  const shell = existsSync(shellFile) ? unwrap(JSON.parse(readFileSync(shellFile, "utf8"))) : null;
  if (shell && shell.version == null && versions.runbook != null) shell.version = versions.runbook;
  const sections = new Map(), sdir = join(dir, "runbook");
  if (existsSync(sdir)) for (const f of readdirSync(sdir).filter((x) => x.endsWith(".json"))) {
    const r = unwrap(JSON.parse(readFileSync(join(sdir, f), "utf8"))), id = r.data?.id || f.replace(/\.json$/, "");
    if (r.version == null && versions[id] != null) r.version = versions[id];
    sections.set(id, r);
  }
  return { shell: shell && shell.data ? shell : null, sections };
}

function plan(file, opts) {
  const local = splitRunbook(readFileSync(file, "utf8"), { label: opts.label || "런북" });
  const versions = opts.versions && existsSync(opts.versions) ? parseVersions(readFileSync(opts.versions, "utf8")) : {};
  const remote = readRemote(opts.remote, versions);
  const state = opts.state && existsSync(opts.state) ? JSON.parse(readFileSync(opts.state, "utf8")) : null;
  if (!state && (remote.shell || remote.sections.size) && !opts.adopt) err("state 없음 — 원격 게시본이 이미 있다. 로컬이 원격을 반영했으면 --adopt, 아니면 원격을 받아 병합부터");
  const p = planPublish(local, remote, state, { adopt: !!opts.adopt });
  const od = opts["out-dir"]; mkdirSync(join(od, "docs"), { recursive: true });
  const entries = [];
  for (const d of p.docs) {
    const f = join(od, "docs", `${d.collection}__${d.id}.json`); writeFileSync(f, JSON.stringify(d.doc));
    const e = { op: "set", collection: d.collection, doc_id: d.id, file_path: f }; if (d.version != null) e.if_version = d.version;
    (d.last ? (entries.last = e) : entries.push(e));
  }
  entries.push(...p.deletes);
  if (entries.last) entries.push(entries.last);
  const missing = entries.filter((e) => e.if_version == null && (e.op === "delete" || (e.collection === "runbook" ? remote.sections.has(e.doc_id) : !!remote.shell))).map((e) => `${e.collection}/${e.doc_id}`);
  if (p.conflicts.length) {
    mkdirSync(join(od, "conflicts"), { recursive: true });
    for (const c of p.conflicts) { const r = c.id === "meta/runbook" ? remote.shell : remote.sections.get(c.id); if (r?.data) writeFileSync(join(od, "conflicts", `${c.id.replace("/", "__")}.remote.${c.id === "meta/runbook" ? "json" : "html"}`), c.id === "meta/runbook" ? JSON.stringify(r.data, null, 2) : r.data.html || ""); }
  }
  const batches = []; if (!p.conflicts.length) for (let i = 0; i < entries.length; i += 50) batches.push(entries.slice(i, i + 50));
  return { file, sections: local.sections.length, write: p.docs.length, delete: p.deletes.length, unchanged: p.unchanged, conflicts: p.conflicts, missingVersions: missing, batches, nextState: p.nextState };
}

if (isMain(import.meta.url)) {
  const [cmd, ...rest] = process.argv.slice(2);
  const { opts, pos } = parseArgs(rest);
  if (cmd === "plan") {
    if (!pos[0] || !opts.remote || !opts["out-dir"]) { err("usage: runbook-publish.mjs plan <runbook.html> --remote <dir> --out-dir <dir> [--versions F] [--state F] [--adopt]"); process.exit(2); }
    const r = plan(pos[0], opts);
    err(`절 ${r.sections} · 쓰기 ${r.write} · 삭제 ${r.delete} · 그대로 ${r.unchanged.length} · 충돌 ${r.conflicts.length}` + (r.missingVersions.length ? ` · if_version 없음 ${r.missingVersions.join(", ")}` : ""));
    for (const c of r.conflicts) err(`  충돌 ${c.id} — ${c.reason}`);
    out(r);
    if (r.conflicts.length) process.exit(3);
  } else if (cmd === "commit") {
    if (!opts.plan || !opts.state) { err("usage: runbook-publish.mjs commit --plan plan.json --state runbook.publish.json [--url U]"); process.exit(2); }
    const p = JSON.parse(readFileSync(opts.plan, "utf8"));
    if (p.conflicts?.length) { err("충돌이 있는 계획은 커밋하지 않는다"); process.exit(3); }
    const prev = existsSync(opts.state) ? JSON.parse(readFileSync(opts.state, "utf8")) : {};
    const next = { artifact: opts.url || prev.artifact || null, publishedAt: new Date().toISOString(), ...p.nextState };
    writeFileSync(opts.state, JSON.stringify(next, null, 2) + "\n");
    err(`state 갱신 — 절 ${Object.keys(next.sections).length}`);
  } else { err("usage: runbook-publish.mjs plan|commit …"); process.exit(2); }
}
export { plan, readRemote };
