# PR 단계 판정

실행형은 `scripts/lib/stages.mjs`의 `decidePr(view)` · `decideNoPr({branchExists})`. 입력은
`gh pr view <url> --json number,url,state,isDraft,mergedAt,reviewDecision,reviews,latestReviews,reviewRequests,comments,author,headRefName,title`.

## 먼저 거른다
작성자 본인(`author.login`)과 봇(`[bot]`로 끝나거나 `github-actions`·`dependabot`·`renovate`로 시작)의 리뷰·코멘트는 제외한다.
실측: 작성자가 리뷰 코멘트에 단 답글이 `reviews[]`에 `COMMENTED`로 7건 섞여 들어와, 거르지 않으면 "리뷰 중"으로 오판한다.

## 우선순위 (첫 매치)
| # | 조건 | 단계 |
|---|---|---|
| 1 | `state === "MERGED"` 또는 `mergedAt` | `merged` |
| 2 | `state === "CLOSED"` | `closed` |
| 3 | `isDraft` | `draft` |
| 4 | `reviewDecision === "APPROVED"` | `approved` |
| 5 | `reviewDecision === "CHANGES_REQUESTED"` | `review` |
| 6 | `reviewDecision === ""`(브랜치 보호 없음 — 실측) → 타인 `latestReviews`에 CHANGES_REQUESTED | `review` |
| 7 | 타인 `latestReviews`에 APPROVED (변경 요청 없음) | `approved` |
| 8 | 그 외 ready | `review` — 리뷰 대기/리뷰 중을 나누지 않는다(2026-09-19). 타인 리뷰·코멘트 수는 `probe.pr.otherReviews/otherComments`로 카드 첫 줄에 보인다 |

PR이 없으면: 원격 브랜치 있음 → `wip`, 없음 → `todo`. 브랜치 존재는 `gh api repos/<repo>/branches/<branch>`(로컬 체크아웃 불필요).
`pr` 필드는 비었는데 `branch`가 있으면 `gh pr list --head <branch> --state all`로 PR을 찾아 실측하고, `pr` 필드를 채우자는 **제안**을 낸다(자동으로 쓰지 않는다).

판정 근거(`decision` · 타인 리뷰 수 · 코멘트 수 · 승인/변경요청 수)는 `probe.pr`에 남겨 페이지 패널 「실측 근거」에 보인다.
