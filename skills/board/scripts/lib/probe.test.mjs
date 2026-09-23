import { test } from "node:test";
import assert from "node:assert/strict";
import { probeCards } from "./probe.mjs";

const view = (n, extra = {}) => JSON.stringify({ number: n, url: `https://github.com/acme/repo/pull/${n}`, state: "OPEN", isDraft: false, mergedAt: null, reviewDecision: "", reviews: [], latestReviews: [], reviewRequests: [], comments: [], author: { login: "me" }, headRefName: `feat/${n}`, title: `PR ${n}`, ...extra });
function fakeRun(calls) {
  return (cmd, args) => {
    calls.push(args.join(" "));
    const a = args.join(" ");
    if (a.startsWith("pr view https://github.com/acme/repo/pull/813")) return view(813, { comments: [{ author: { login: "roman" } }] });
    if (a.startsWith("pr view https://github.com/acme/repo/pull/999")) throw new Error("GraphQL: Could not resolve to a PullRequest");
    if (a.startsWith("pr list --repo acme/repo --head feat/x")) return JSON.stringify([{ number: 820, url: "https://github.com/acme/repo/pull/820", state: "OPEN" }]);
    if (a.startsWith("pr view https://github.com/acme/repo/pull/820")) return view(820, { isDraft: true });
    if (a.startsWith("pr list --repo acme/repo --head feat/none")) return "[]";
    if (a.startsWith("api repos/acme/repo/branches/feat%2Fnone")) return "feat/none";
    if (a.startsWith("api repos/acme/repo/branches/feat%2Fgone")) throw new Error("HTTP 404: Not Found");
    if (a.startsWith("pr list --repo acme/repo --head feat/gone")) return "[]";
    if (a.startsWith("issue view https://github.com/acme/repo/issues/42")) return JSON.stringify({ state: "OPEN", title: "iss", assignees: [{ login: "luke" }], number: 42 });
    if (a.includes("--search ACME-1 in:title")) return JSON.stringify([{ number: 813, url: "https://github.com/acme/repo/pull/813", headRefName: "feat/813", title: "ACME-1 a", state: "OPEN" }, { number: 830, url: "https://github.com/acme/repo/pull/830", headRefName: "feature/ACME-1-new", title: "ACME-1 b", state: "OPEN" }]);
    if (a.startsWith("pr list --repo acme/repo --state all --json") ) return JSON.stringify([{ number: 831, url: "https://github.com/acme/repo/pull/831", headRefName: "feature/ACME-1-x", title: "x", state: "OPEN" }, { number: 700, url: "https://github.com/acme/repo/pull/700", headRefName: "other", title: "y", state: "OPEN" }]);
    throw new Error("unexpected: " + a);
  };
}
const dump = { meta: { repo: "acme/repo", ticket: "ACME-1", branchPrefix: "feature/ACME-1" }, cards: [
  { id: "a", type: "pr", pr: "https://github.com/acme/repo/pull/813" },
  { id: "b", type: "pr", branch: "feat/x" },
  { id: "c", type: "pr", branch: "feat/none" },
  { id: "d", type: "pr", branch: "feat/gone" },
  { id: "e", type: "pr", pr: "https://github.com/acme/repo/pull/999" },
  { id: "f", type: "ask", ticket: { url: "https://github.com/acme/repo/issues/42" } },
  { id: "g", type: "ask", ticket: { key: "ISE-1624" } },
  { id: "h", type: "pr", pr: "https://github.com/acme/repo/pull/813", archived: true },
] };

test("probe: stages, suggestions, branch-only, failures, issues, jira list, unregistered", async () => {
  const calls = [];
  const r = await probeCards(dump, { run: fakeRun(calls), now: () => "T" });
  const by = Object.fromEntries(r.updates.map((u) => [u.id, u.probe]));
  assert.equal(by.a.stage, "review"); assert.equal(by.a.pr.number, 813); assert.equal(by.a.pr.otherComments, 1); assert.equal(by.a.pr.title, "PR 813");
  assert.equal(by.b.stage, "draft"); assert.deepEqual(r.suggestions[0], { id: "b", field: "pr", value: "https://github.com/acme/repo/pull/820", why: "브랜치 feat/x의 PR #820" });
  assert.equal(by.c.stage, "wip"); assert.equal(by.c.branch.exists, true);
  assert.equal(by.d.stage, "todo"); assert.equal(by.d.branch.exists, false);
  assert.equal(by.e.ok, false); assert.match(by.e.err, /Could not resolve/); assert.equal(by.e.stage, undefined);
  assert.equal(by.f.ticket.status, "OPEN"); assert.equal(by.f.ticket.assignee, "luke");
  assert.deepEqual(r.jira, [{ id: "g", key: "ISE-1624" }]);
  assert.deepEqual(r.unregistered.map((p) => p.number), [830, 831]);
  assert.equal(r.errors.length, 1);
  assert.ok(!calls.some((c) => c.includes("archived")));
});
