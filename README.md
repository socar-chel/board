# board

행(앱 · 리포 · 업무 종류) × 열(시간) 격자에 카드를 놓는 **작업 보드**. Claude Code 스킬 하나로,
보드는 Claude 아티팩트(HTML 한 장 + 아티팩트 DB)이고 사용자는 브라우저에서 드래그로, 에이전트는 도구로 같은 데이터를 고친다.
한 페이지에 탭이 둘이다 — 「진행」(격자)과 「런북」(작업 서사·절차·결정 로그를 절 단위로 게시). 카드는 런북의 절·결정 한 건으로 딥링크한다.

- 카드 타입 6종: PR · 문서 · QA · 요청(티켓 첨부) · 인프라 · 결정. 타입마다 단계가 다르고 카드 위 스텝 바로 보인다.
- **PR 카드는 사람이 못 옮긴다** — `gh`로 실측한 단계(착수 전 → 작업 중 → draft → 리뷰 대기 → 리뷰 중 → 승인 → 머지)가 정본이다.
- 막힘(`blockedBy`)·기한·담당·티켓 상태가 카드에 보인다. 완료는 흐리게, "내 몫" 필터.
- 스냅샷 `board.json`을 로컬에 남긴다(리포가 추적하는 경로면 git diff로 "언제 옮겼나"를 답한다). `restore`로 되돌린다.
- 런북은 로컬 HTML이 정본이다. `/board runbook`이 절 단위로 게시하고, 다른 세션이 먼저 고친 절이 있으면 덮지 않고 멈춘다.

```bash
npx skills add socar-chel/board -g
```

설치본은 그 시점의 복사본이라 리포가 바뀌어도 따라오지 않는다 — `npx skills update board -g`로 갱신한다.

설치 후 Claude Code에서:

```
/board new 파트너 채널 연동 --start 2026-09-15 --weeks 6
/board sync
/board runbook .task-docs/ACME-1234/runbook.html
/board import .task-docs/ACME-1234/runbook.html
```

카드 추가·편집은 채팅으로 한다("T4 행 Phase 2에 QA 카드 추가").

## 구조

```
skills/board/
  SKILL.md              명령별 절차(에이전트가 어떤 도구를 어떤 순서로 부르나)
  schema.md             DB 스키마 · 단계 어휘 · 쓰기 주체 규칙 (정본)
  templates/board.html  페이지(의존성 0). ?demo 로 열면 샘플 렌더
  scripts/              probe-github · snapshot · restore · import-runbook · runbook-publish (node, 의존성 0)
  references/           PR 판정 · import 매핑 · 보고 서식 · 수명주기 스킬 연동 · 백로그
```

```bash
node --test "skills/board/scripts/**/*.test.mjs"
```

## 왜 직접 만들었나

GitHub Projects v2 · Plane · Notion · Linear · Jira를 비교했다. 행×시간 격자와 PR 상태 자동 반영을 동시에 주는 것은
GitHub Projects(org 프로젝트 권한 필요)와 Plane Pro(유료 + org GitHub App)뿐이고, 둘 다 PR 이전 단계와 타입별 단계·시각 분기가 없다.
이 보드는 이미 로그인된 `gh`로 **읽기만** 하므로 org에 아무것도 요구하지 않는다.

MIT
