// PR·브랜치·GitHub Issue 실측. gh 호출은 run() 주입으로 테스트한다.
import { decidePr, decideNoPr } from "./stages.mjs";

const PR_FIELDS = "number,url,state,isDraft,mergedAt,reviewDecision,reviews,latestReviews,reviewRequests,comments,author,headRefName,title";
const PR_RE = /github\.com\/([^/]+\/[^/]+)\/pull\/(\d+)/;
const ISSUE_RE = /github\.com\/([^/]+\/[^/]+)\/issues\/(\d+)/;

function prProbe(view, at) {
  const { stage, evidence } = decidePr(view);
  return { stage, at, ok: true, err: null, pr: { number: view.number, url: view.url, title: view.title || null, state: view.state, mergedAt: view.mergedAt || null, isDraft: !!view.isDraft, headRefName: view.headRefName || null, decision: evidence.decision,
    otherReviews: evidence.otherReviews, otherComments: evidence.otherComments, approvals: evidence.approvals, changesRequested: evidence.changesRequested, reviewRequests: evidence.reviewRequests },
    branch: { exists: view.state === "OPEN" ? true : null } };
}

// run(cmd, args) → stdout 문자열 (동기). 실패는 throw.
async function probeCards(dump, { run, now = () => new Date().toISOString() }) {
  const meta = dump.meta || {}, repo = meta.repo || null;
  const updates = [], errors = [], jira = [], suggestions = [];
  const known = new Set();
  for (const c of dump.cards || []) {
    if (c.archived) continue;
    const at = now();
    if (c.type === "pr") {
      try {
        let view = null, prUrl = c.pr || null;
        if (!prUrl && c.branch && repo) {
          const list = JSON.parse(run("gh", ["pr", "list", "--repo", repo, "--head", c.branch, "--state", "all", "--json", "number,url,state", "--limit", "5"]) || "[]");
          const pick = list.find((p) => p.state === "OPEN") || list.find((p) => p.state === "MERGED") || list[0];
          if (pick) { prUrl = pick.url; suggestions.push({ id: c.id, field: "pr", value: pick.url, why: `브랜치 ${c.branch}의 PR #${pick.number}` }); }
        }
        if (prUrl) {
          view = JSON.parse(run("gh", ["pr", "view", prUrl, "--json", PR_FIELDS]));
          const m = prUrl.match(PR_RE); if (m) known.add(`${m[1].toLowerCase()}#${m[2]}`); known.add(String(view.number));
          updates.push({ id: c.id, probe: prProbe(view, at) });
        } else if (c.branch && repo) {
          let exists = false;
          try { run("gh", ["api", `repos/${repo}/branches/${encodeURIComponent(c.branch)}`, "--jq", ".name"]); exists = true; } catch (e) { if (!/404|Not Found/i.test(String(e.message || e))) throw e; }
          const d = decideNoPr({ branchExists: exists });
          updates.push({ id: c.id, probe: { stage: d.stage, at, ok: true, err: null, pr: null, branch: { exists } } });
        } else {
          updates.push({ id: c.id, probe: { stage: "todo", at, ok: true, err: null, pr: null, branch: { exists: false } } });
        }
      } catch (e) {
        const msg = String(e.message || e).split("\n")[0].slice(0, 200);
        errors.push({ id: c.id, err: msg });
        updates.push({ id: c.id, probe: { ok: false, err: msg, at } });   // stage·pr는 남긴다(부분 병합)
      }
    }
    if (c.ticket?.url && ISSUE_RE.test(c.ticket.url)) {
      try {
        const v = JSON.parse(run("gh", ["issue", "view", c.ticket.url, "--json", "state,title,assignees,number"]));
        const t = { url: c.ticket.url, status: v.state, title: v.title, assignee: (v.assignees || []).map((a) => a.login).join(", ") || null, at, ok: true, err: null };
        const u = updates.find((x) => x.id === c.id); if (u) u.probe.ticket = t; else updates.push({ id: c.id, probe: { ticket: t, at, ok: true, err: null } });
      } catch (e) {
        const msg = String(e.message || e).split("\n")[0].slice(0, 200); errors.push({ id: c.id, err: msg });
        const u = updates.find((x) => x.id === c.id); const t = { url: c.ticket.url, at, ok: false, err: msg }; if (u) u.probe.ticket = t; else updates.push({ id: c.id, probe: { ticket: t, at } });
      }
    }
    if (c.ticket?.key) jira.push({ id: c.id, key: c.ticket.key });
  }
  // 미등록 PR — 티켓 키(제목 검색)와 브랜치 접두로 찾되 카드에 붙은 것은 뺀다. 자동 생성하지 않고 보고만.
  let unregistered = [];
  if (repo && (meta.ticket || meta.branchPrefix)) {
    try {
      const found = new Map();
      if (meta.ticket) for (const p of JSON.parse(run("gh", ["pr", "list", "--repo", repo, "--state", "all", "--search", `${meta.ticket} in:title`, "--json", "number,url,title,headRefName,isDraft,state", "--limit", "100"]) || "[]")) found.set(p.number, p);
      if (meta.branchPrefix) for (const p of JSON.parse(run("gh", ["pr", "list", "--repo", repo, "--state", "all", "--json", "number,url,title,headRefName,isDraft,state", "--limit", "200"]) || "[]")) if ((p.headRefName || "").startsWith(meta.branchPrefix)) found.set(p.number, p);
      unregistered = [...found.values()].filter((p) => !known.has(String(p.number)) && !known.has(`${repo.toLowerCase()}#${p.number}`)).sort((a, b) => a.number - b.number);
    } catch (e) { errors.push({ id: null, err: "미등록 탐색 실패: " + String(e.message || e).split("\n")[0].slice(0, 200) }); }
  }
  return { updates, errors, jira, suggestions, unregistered, probed: updates.length };
}
export { probeCards, prProbe, PR_FIELDS };
