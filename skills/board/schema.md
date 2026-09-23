# 보드 DB 스키마 (정본)

아티팩트 `db` 저장소(JSON 문서, 컬렉션/문서 경로)의 구조와 **누가 어떤 필드를 쓰는가**의 규칙이다.
페이지(`templates/board.html`)와 스크립트·에이전트 절차(`SKILL.md`)는 전부 이 문서를 따른다.
단계 어휘의 실행형은 `scripts/lib/stages.mjs`이고, 페이지에 같은 블록이 복제되어 있다(테스트가 동일성 검사).

## 컬렉션

| 경로 | 문서 수 | 쓰는 주체 | 내용 |
|---|---|---|---|
| `meta/board` | 1 | 페이지(헤더 편집) · 에이전트(`new`·`import`, 사용자 지시) | 제목·행·열 정의 |
| `meta/sync` | 1 | 에이전트만 | 마지막 실측 기록 |
| `cards/<id>` | 카드 수 | 페이지(위치·단계·핵심 필드) · 에이전트(`probe`, 사용자 지시 시 핵심 필드) | 카드 |
| `meta/runbook` | 0~1 | 에이전트만(`runbook`) | 런북 머리말·꼬리말·CSS·절 순서 |
| `runbook/<절id>` | 절 수 | 에이전트만(`runbook`) | 런북 절 본문 |

문서 상한 5,000 · 문서당 256KiB. 카드만 문서이므로 상한과 무관하다. 실측 이력은 DB에 쌓지 않는다(`board.json`의 git 히스토리).

## `meta/board`

```json
{
  "schemaVersion": 1,
  "title": "파트너 채널 연동",
  "ticket": "ACME-1234",
  "repo": "acme/partner-app",
  "branchPrefix": "feature/ACME-1234",
  "jiraBase": "https://acme.atlassian.net/browse/",
  "rows": [ { "id": "r_t1", "label": "T1", "sub": "service-server 파트너 채널 연동", "kind": "code", "type": "pr" } ],
  "cols": [
    { "id": "unset", "label": "미정", "fixed": true },
    { "id": "p1", "label": "M1 핵심 경로", "start": "2026-09-10", "end": "2026-09-17", "note": "" }
  ],
  "updatedAt": "2026-09-19T06:00:00.000Z"
}
```

- `cols[]` — 열은 **마일스톤**(`M0 선행`·`M1 핵심 경로`…): 목표 하나를 향한 기간이고 끝나는 날이 체크포인트. "Phase"(프로젝트 단위 어휘)·"단계"(카드 스텝 바 어휘)는 열 이름에 쓰지 않는다. 첫 열 `unset`(미정)은 고정.
- `rows[].kind` — 행의 **작업 종류**(사람이 읽는 분류): `code · infra · qa · doc · prep(사전 준비) · ask(외부 요청)`. 헤더에 칩으로 보인다.
  `rows[].sub`가 헤더의 주 텍스트(예: `service-server`), `label`은 보조(예: `T1`) — 에이전트 좌표는 label, 사람이 읽는 이름은 sub.
- `rows[].type` — 그 행에서 `+`로 만든 카드의 기본 타입. `kind`를 고르면 자동으로 채워진다(prep은 infra).
- `cols[0]`는 항상 `{id:"unset", fixed:true}` — 시점 미정 카드가 사는 열. 이동·삭제 불가.
- `cols[].start/end`는 `YYYY-MM-DD`. 오늘이 `[start,end]`에 들면 페이지가 "지금" 열로 강조한다.
- 행·열은 배열이다(별도 컬렉션이 아님): 개수가 작고 편집이 드물며, 헤더 편집이 한 문서 원자 쓰기로 끝나야 순서와 카드 위치가 어긋나지 않는다. `update`에서 배열은 통째 교체되므로 **행·열 편집은 항상 배열 전체를 보낸다.**
- `repo`·`branchPrefix`·`ticket`은 `sync`의 미등록 PR 탐색 키. `jiraBase`는 티켓 키(`ISE-1624`)를 링크로 만드는 접두 — 없으면 키만 글자로 보인다.

## `meta/sync`

```json
{ "at": "2026-09-19T06:00:00.000Z", "by": "agent", "probed": 12, "failed": 1,
  "failures": [{ "id": "c_imp033", "what": "Jira ISE-1624", "err": "미실측 (Jira MCP 없음)" }], "schemaVersion": 1 }
```

## `cards/<id>`

```json
{
  "id": "c_m1x9k2ab", "type": "pr",
  "title": "#813 월렛 결제 게이트웨이", "note": "", "links": [],
  "owner": { "kind": "me", "name": "" }, "due": null,
  "blockedBy": [], "blockedAt": null, "archived": false,
  "branch": "feature/ACME-1234-partner-phase1-payment", "pr": "https://github.com/acme/partner-app/pull/813",
  "target": null, "ticket": null,
  "stage": "review",
  "pos": { "row": "r_t1", "col": "p1", "ord": "a0V" },
  "probe": { "stage": "review", "at": "…", "ok": true,
             "pr": { "number": 813, "state": "OPEN", "isDraft": false, "decision": "", "otherReviews": 1, "otherComments": 0 },
             "branch": { "exists": true }, "ticket": null },
  "createdAt": "…", "updatedAt": "…"
}
```

| 필드 | 타입 | 의미 |
|---|---|---|
| `type` | `pr · doc · qa · ask · infra · decision` | 카드 타입. 단계 어휘를 결정 |
| `title` `note` | string | 제목 · 메모. 카드에는 메모 첫 줄만 한 줄로(말줄임) 보이고 전문은 패널·툴팁 |
| `delayNote` | string \| null | 지연 사유(사람이 적음). 카드 넷째 줄 「지연」은 이 값 + 자동 판정(기한 지남 · 놓인 열 기간 지남 · 막힘)이고, 미완료일 때만 뜬다 |
| `links[]` | string[] | 문서·리포트 등 URL |
| `owner` | `{kind: me\|agent\|person\|external, name}` | 담당. "내 몫" 필터는 `kind==="me"`. 기본값: 코드·문서·QA·인프라 → `agent`, 요청·결정 → `me` |
| `due` | `YYYY-MM-DD` \| null | 기한. 지났고 미완료면 강조 |
| `blockedBy[]` `blockedAt` | 카드 id[] · ISO | 막힘. 참조 카드 중 미완료가 하나라도 있으면 막힌 것으로 표시. `blockedAt`은 빈 배열→채워질 때 페이지가 찍는다 |
| `archived` | boolean | 보관. 하드 삭제는 없다. 보관함에서 복구 |
| `branch` `pr` | string \| null | PR 타입의 실측 키. `pr`은 URL |
| `target` | string \| null | 요청 타입의 대상(팀/사람/외부사) |
| `env` | `dev · test · prod` \| null | 인프라 타입의 환경. 카드 헤더에 태그로(PROD는 빨강). dev는 개발과 같이, prod는 티켓을 미리(`requested`) 내고 생성은 배포 직전(`in_progress`) |
| `ticket` | `{key}` 또는 `{url}` \| null | Jira 키(`ISE-1624`) 또는 GitHub Issue URL |
| `stage` | string | 수동 단계. **pr 타입은 무시**(`probe.stage`가 표시 단계) |
| `pos` | `{row, col, ord}` | 위치. `ord`는 fractional index(`scripts/lib/order.mjs`) |
| `probe` | object \| null | 에이전트 실측 결과. 아래 참조 |

### `probe`

```
probe.stage      pr 타입의 판정 단계 (todo·wip·draft·review·approved·merged·closed)
probe.at         실측 시각(ISO)
probe.ok         false면 실측 실패 — 페이지는 "실측 실패 · 마지막 값 <at>" 표시, 이전 값 유지
probe.err        실패 사유
probe.pr         { number, url, title, state, isDraft, decision, otherReviews, otherComments, approvals, changesRequested }
                 title은 GitHub PR 제목 — 카드 제목이 "① #811"처럼 번호뿐이면 페이지가 이 제목을 대신 보여주고, 아니면 작은 부제로 붙인다
probe.branch     { exists }
probe.ticket     { key|url, status, assignee, title, at, ok, err }
```

## 런북 — `meta/runbook` · `runbook/<절id>`

로컬 런북 HTML(정본)을 `scripts/runbook-publish.mjs`가 쪼개 만든다. 페이지는 읽기만 하고, `meta/runbook`이 있을 때만 「런북」 탭을 보인다.

```json
// meta/runbook
{ "schemaVersion": 1, "title": "🧾 런북 | …", "label": "런북",
  "css": "#rb{--paper:…}#rb .doc{…}…",          // 런북의 <style> 전부를 #rb 아래로 가둔 것
  "head": "<div class=\"doc\"><div class=\"col\"><nav class=\"toc\">…<h1>…",   // 첫 절 앞
  "foot": "<footer>…</footer></div></div>",      // 마지막 절 뒤
  "order": [{ "id": "a1", "num": "A1", "title": "남은 일" }, { "id": "c", "num": "C", "title": "결정 로그" }],
  "hash": "…", "updatedAt": "…" }
// runbook/c
{ "id": "c", "num": "C", "title": "결정 로그", "html": "<section id=\"c\">…<li id=\"c-84\"><b>#84</b> …</section>", "hash": "…", "updatedAt": "…" }
```

- 페이지는 `head + order 순서의 절 html + foot`을 `#rb`에 그린다. `order`에 있는데 문서가 없는 절은 「불러오는 중」 자리로 둔다.
- **CSS 스코프**: `:root`·`html`·`body` → `#rb`, 나머지 셀렉터 → `#rb <셀렉터>`. 다크 재정의(`:root[data-theme="dark"]` 등)는 `#rb[data-theme]`이 되고 페이지가 테마를 `#rb`에 맞춘다.
  스코프가 ID라 보드 CSS의 클래스 규칙보다 항상 이긴다. 런북의 `<script>`와 HTML 주석은 게시 때 빠진다.
- `hash`는 본문(절) 또는 머리말·CSS(meta)의 sha256 앞 16자. 게시 기록(`runbook.publish.json`, 로컬)의 값과 원격 값이 다르면 충돌이다.
- 문서 하나는 240KiB를 넘지 못한다(상한 256KiB에서 여유를 뺀 값) — 스크립트가 거부한다.
- 카드 → 런북 딥링크는 `links[]`의 `#runbook/<절id>` · `#runbook/<절id>-<N>`. 스키마 필드를 따로 두지 않는다.
- `board.json` 스냅샷에는 런북이 들어가지 않는다 — 로컬 런북 파일이 정본이라 되돌릴 때는 그 파일을 다시 게시한다.

## 쓰기 주체 규칙 (last-writer-wins 대응의 핵심)

`update`는 최상위 키 단위로 병합되고 중첩 객체는 재귀 병합, **배열은 통째 교체**된다. 그래서:

1. **페이지**는 `pos`·`stage`·핵심 필드(`title` `note` `delayNote` `links` `owner` `due` `blockedBy` `blockedAt` `archived` `branch` `pr` `target` `env` `ticket` `updatedAt`)를 쓴다. `probe`는 절대 쓰지 않는다.
2. **에이전트 `sync`**는 `probe`만 `update`한다. 핵심 필드는 사용자가 채팅으로 시킬 때만 쓰고, 그때도 `update`.
3. **생성 이후 `set` 금지** — `set`은 전체 교체라 상대의 필드를 지운다. 생성은 `set` 한 번(id는 `c_` + base36(ms) + 난수 4자).
4. `pos`가 중첩 객체이므로 `update({pos:{col:"p2"}})`만 보내도 `row`·`ord`가 보존된다.
5. 에이전트의 모든 기존 문서 쓰기(`update`·`set`·batch 항목)는 **`if_version`이 필수다** — 없으면 `version_mismatch`로 거부된다(실측 2026-09-19).
   버전은 `get`/`list` 결과 텍스트에만 실리고 `out_dir` 파일에는 없다 — 결과 텍스트의 `"<id>"  N bytes  version V` 줄을 파일로 남겨
   `probe-to-batch.mjs --versions`·`restore.mjs --versions`에 넘긴다. 충돌하면 그 문서만 재읽기 1회 후 재시도, 그래도 실패면 보고.
6. 배열 필드(`links` `blockedBy` `rows` `cols`)를 에이전트가 고칠 때는 최신 값을 읽은 뒤 전체를 보낸다.
7. **런북 문서(`meta/runbook`·`runbook/*`)는 에이전트만 쓰고 항상 `set`(전체 교체)이다** — 필드를 나눠 쓰는 다른 주체가 없다.
   동시 게시는 문서 버전(`if_version`)과 절 hash(게시 기록 대조) 두 겹으로 막는다.

## 단계 어휘

| type | stages | done |
|---|---|---|
| pr | todo · wip · draft · review(ready — 리뷰·코멘트 수는 probe에) · approved · merged · closed | merged · closed |
| doc | todo(작성 전) · draft(초안 있음 — 링크 필수) · review · published | published |
| qa | todo · in_progress · pass · fail · blocked | pass |
| ask | todo · requested · waiting · done | done |
| infra | planned · requested(티켓 냄) · in_progress(만드는 중) · done | done |
| decision | pending · decided | decided |

카드의 스텝 바는 **순서대로 지나가는 경로만** 그린다. `closed`(pr)·`fail`·`blocked`(qa)는 다음 칸이 아니라 갈림길이라
바 옆의 태그로 표시하고, 바 클릭으로는 못 들어간다(패널 select로만). 페이지의 `OFFPATH` 상수가 그 목록이다.

타입 어휘 밖의 값은 페이지가 **「단계 오류 · <값>」 경고 칩**으로 보여주고 완료 처리도 하지 않는다 — 다른 타입의 라벨을 빌려 주지 않는다(qa 카드에 `done`을 쓰면 「완료」가 아니라 「단계 오류 · done」이 뜬다. 완료는 `pass`). 에이전트가 단계를 쓸 때는 이 표의 그 타입 열에서만 고른다. 어휘가 바뀌면 `schemaVersion`을 올리고 `scripts/migrate-<v>.mjs`로 덤프→batch 페이로드를 만든다.

## `board.json` (스냅샷)

```json
{ "artifact": { "url": "https://claude.ai/artifact/…" }, "exportedAt": "…", "meta": { …meta/board… }, "sync": { …meta/sync… }, "cards": [ …정렬된 카드… ] }
```

`scripts/snapshot.mjs`가 카드를 `pos.row(행 순서) → pos.col(열 순서) → ord`로 정렬하고 키를 고정 순서로 써서 git diff가 읽히게 한다.
`restore`는 이 파일을 다시 DB에 쓴다(DB에만 있는 카드는 `archived:true`로 남긴다). 런북은 스냅샷에 없다 — 로컬 런북 파일을 `runbook`으로 다시 게시한다.

`board.json`은 로컬 백업이다. 두는 경로를 리포가 추적하면 git 히스토리가 "언제 옮겼나"에 답하지만, `.task-docs/`처럼 무시되는 경로면
히스토리는 없고 마지막 스냅샷만 남는다.
