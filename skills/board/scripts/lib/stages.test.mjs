import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { STAGES, DONE, STAGE_LABEL, decidePr, decideNoPr, isDone } from "./stages.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const me = { login: "chel" };
const r = (login, state) => ({ author: { login }, state });
const c = (login) => ({ author: { login } });
const base = { state: "OPEN", isDraft: false, mergedAt: null, reviewDecision: "", reviews: [], latestReviews: [], comments: [], author: me, reviewRequests: [] };

test("every stage has a label and done sets are subsets", () => {
  for (const [t, list] of Object.entries(STAGES)) {
    for (const s of list) assert.ok(STAGE_LABEL[s], `label for ${t}.${s}`);
    for (const d of DONE[t]) assert.ok(list.includes(d), `${t}.${d} in stages`);
  }
  assert.ok(isDone("pr", "merged") && !isDone("qa", "fail"));
});
test("merged / closed / draft precedence", () => {
  assert.equal(decidePr({ ...base, state: "MERGED", mergedAt: "2026-09-17T00:00:00Z" }).stage, "merged");
  assert.equal(decidePr({ ...base, state: "CLOSED" }).stage, "closed");
  assert.equal(decidePr({ ...base, isDraft: true, reviewDecision: "APPROVED" }).stage, "draft");
});
test("reviewDecision wins when present", () => {
  assert.equal(decidePr({ ...base, reviewDecision: "APPROVED" }).stage, "approved");
  assert.equal(decidePr({ ...base, reviewDecision: "CHANGES_REQUESTED" }).stage, "review");
});
test("#813 shape: no branch protection, only author's own COMMENTED replies → review", () => {
  const v = { ...base, reviews: [r("chel", "COMMENTED"), r("chel", "COMMENTED")], latestReviews: [r("chel", "COMMENTED")], reviewRequests: [{ login: "roman" }] };
  const d = decidePr(v);
  assert.equal(d.stage, "review");
  assert.equal(d.evidence.otherReviews, 0);
});
test("other's COMMENTED review → review; latestReviews APPROVED without decision → approved", () => {
  assert.equal(decidePr({ ...base, reviews: [r("roman", "COMMENTED")] }).stage, "review");
  assert.equal(decidePr({ ...base, latestReviews: [r("roman", "APPROVED")] }).stage, "approved");
  assert.equal(decidePr({ ...base, latestReviews: [r("roman", "APPROVED"), r("lucas", "CHANGES_REQUESTED")] }).stage, "review");
});
test("bots are ignored", () => {
  assert.equal(decidePr({ ...base, comments: [c("github-actions[bot]"), c("sdd-audit[bot]")] }).stage, "review");
  assert.equal(decidePr({ ...base, comments: [c("roman")] }).stage, "review");
});
test("no PR: branch → wip, none → todo", () => {
  assert.equal(decideNoPr({ branchExists: true }).stage, "wip");
  assert.equal(decideNoPr({ branchExists: false }).stage, "todo");
});
test("html inline copy matches lib", () => {
  const lib = readFileSync(join(here, "stages.mjs"), "utf8");
  const html = readFileSync(join(here, "..", "..", "templates", "board.html"), "utf8");
  const pick = (s) => s.match(/\/\*STAGES-BEGIN\*\/([\s\S]*?)\/\*STAGES-END\*\//)?.[1];
  assert.ok(pick(lib) && pick(html), "markers present");
  assert.equal(pick(html).trim(), pick(lib).trim());
});
