import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { toBatch, parseVersions } from "./probe-to-batch.mjs";

test("parseVersions reads listing text, inline json lines and a plain map", () => {
  assert.deepEqual(parseVersions('- "c_s001"  1024 bytes  version 2  "/x/c_s001.json"\n- "c_s002"  602 bytes  version 1'), { c_s001: 2, c_s002: 1 });
  assert.deepEqual(parseVersions('{"id":"sync","data":{"at":null,"x":{"y":1}},"version":3,"updatedAt":"T"}'), { sync: 3 });
  assert.deepEqual(parseVersions('{"a":5}'), { a: 5 });
});
test("toBatch merges jira, pins versions, reports missing", () => {
  const dir = mkdtempSync(join(tmpdir(), "board-p2b-"));
  const probe = { updates: [{ id: "a", probe: { stage: "wip", ok: true } }], jira: [{ id: "b", key: "K-1" }, { id: "c", key: "K-2" }] };
  const r = toBatch(probe, [{ id: "b", key: "K-1", status: "Open", assignee: "x", ok: true }], dir, "T", { a: 2, b: 1 });
  const w = Object.fromEntries(r.batches[0].map((x) => [x.doc_id, x]));
  assert.equal(w.a.if_version, 2); assert.equal(w.c.if_version, undefined); assert.deepEqual(r.missingVersions, ["c"]);
  assert.equal(JSON.parse(readFileSync(w.b.file_path, "utf8")).probe.ticket.status, "Open");
  assert.equal(JSON.parse(readFileSync(w.c.file_path, "utf8")).probe.ticket.ok, false);
  assert.equal(r.sync.failed, 1); assert.equal(r.sync.probed, 3);
});
