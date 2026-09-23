// 카드 타입별 단계 어휘와 PR 단계 판정. schema.md 「단계 어휘」가 정본이고 이 파일이 그 실행형이다.
// STAGES-BEGIN…END 블록은 templates/board.html에 그대로 복제된다 — stages.test.mjs가 동일성을 검사한다.
/*STAGES-BEGIN*/
const STAGES = {
  pr:       ["todo", "wip", "draft", "review", "approved", "merged", "closed"],
  doc:      ["todo", "draft", "review", "published"],
  qa:       ["todo", "in_progress", "pass", "fail", "blocked"],
  ask:      ["todo", "requested", "waiting", "done"],
  infra:    ["planned", "requested", "in_progress", "done"],
  decision: ["pending", "decided"],
};
const DONE = { pr: ["merged", "closed"], doc: ["published"], qa: ["pass"], ask: ["done"], infra: ["done"], decision: ["decided"] };
const STAGE_LABEL = {
  todo: "착수 전", wip: "작업 중", draft: "draft", approved: "승인", merged: "머지", closed: "닫힘",
  review: "리뷰", published: "게시", in_progress: "진행", pass: "pass", fail: "fail", blocked: "blocked",
  requested: "요청함", waiting: "회신 대기", done: "완료", planned: "예정", pending: "대기", decided: "결정됨",
};
const TYPE_LABEL = { pr: "PR", doc: "문서", qa: "QA", ask: "요청", infra: "인프라", decision: "결정" };
const TYPE_ICON = { pr: "⟨/⟩", doc: "¶", qa: "✓", ask: "✉", infra: "⇪", decision: "◆" };
function isDone(type, stage) { return (DONE[type] || []).includes(stage); }
function stageIndex(type, stage) { return (STAGES[type] || []).indexOf(stage); }
/*STAGES-END*/

const isBot = (login) => /\[bot\]$/i.test(login || "") || /^(github-actions|dependabot|renovate)/i.test(login || "");

// gh pr view --json state,isDraft,mergedAt,reviewDecision,reviews,latestReviews,reviewRequests,comments,author 결과로 판정.
// 작성자 본인의 답글이 reviews[]에 COMMENTED로 섞이므로(실측) 본인·봇은 먼저 걸러낸다.
function decidePr(v) {
  const me = v?.author?.login;
  const other = (x) => { const l = x?.author?.login; return !!l && l !== me && !isBot(l); };
  const latest = (v.latestReviews || []).filter(other);
  const reviews = (v.reviews || []).filter(other);
  const comments = (v.comments || []).filter(other);
  const evidence = {
    decision: v.reviewDecision ?? "",
    changesRequested: latest.filter((r) => r.state === "CHANGES_REQUESTED").length,
    approvals: latest.filter((r) => r.state === "APPROVED").length,
    otherReviews: reviews.length,
    otherComments: comments.length,
    reviewRequests: (v.reviewRequests || []).length,
  };
  let stage;
  if (v.state === "MERGED" || v.mergedAt) stage = "merged";
  else if (v.state === "CLOSED") stage = "closed";
  else if (v.isDraft) stage = "draft";
  else if (v.reviewDecision === "APPROVED") stage = "approved";
  else if (v.reviewDecision === "CHANGES_REQUESTED") stage = "review";
  else if (evidence.changesRequested > 0) stage = "review";
  else if (evidence.approvals > 0) stage = "approved";
  else stage = "review";   // ready면 리뷰 — 타인 리뷰·코멘트 수는 evidence로 카드 첫 줄에 따로 보인다
  return { stage, evidence };
}
function decideNoPr({ branchExists }) { return { stage: branchExists ? "wip" : "todo", evidence: { branchExists: !!branchExists } }; }

export { STAGES, DONE, STAGE_LABEL, TYPE_LABEL, TYPE_ICON, isDone, stageIndex, decidePr, decideNoPr, isBot };
