---
name: board
description: 작업 보드 — 행(앱/리포/타입) × 열(시간) 격자에 카드(PR·문서·QA·요청·인프라·결정)를 놓는 「진행」 탭과, 같은 페이지의 「런북」 탭(작업 서사·절차·결정 로그)을 가진 Claude 아티팩트를 만들고(new), GitHub PR·브랜치·Jira/Issue 상태를 실측해 갱신하고(sync), 런북 HTML을 절 단위로 게시하고(runbook), 스냅샷을 남기고(restore), 기존 런북 매트릭스를 옮긴다(import). 사용자는 브라우저에서 드래그로, 에이전트는 ArtifactData로 같은 DB를 고친다. "/board", "작업 보드", "진행판", "보드 만들어줘", "보드 동기화", "board sync", "카드 추가해줘", "보드에 올려줘", "런북 탭에 게시" 키워드로 트리거.
---

# board — 작업 보드 (진행 격자 + 런북 탭)

**한 줄**: 아티팩트 HTML 한 장(`templates/board.html`) + 아티팩트 `db`. 페이지에는 탭이 둘이다 — 「진행」(행 × 시간 격자)과
「런북」(작업 서사를 절 단위로 게시한 문서). 상태는 진행 탭이, 서사·절차·결정 로그는 런북 탭이 정본이고 둘은 같은 내용을
적지 않는다 — 카드는 런북의 해당 절로 가는 딥링크만 갖는다. 행·열·카드·런북 절은 전부 DB 문서이고,
사용자는 페이지에서 드래그·패널로, 에이전트는 `ArtifactData` 도구로 같은 문서를 고친다. GitHub·Jira 실측은
에이전트만 한다(페이지는 외부를 못 부른다). 스키마와 **누가 어떤 필드를 쓰는가**는 [schema.md](schema.md)가 정본이다.

`<skill>`은 이 스킬 디렉터리(`~/.claude/skills/board`), `<scripts>`는 `<skill>/scripts`다. 스크립트는 전부 의존성 0의 node이고
`ArtifactData`를 직접 못 부르므로 **데이터는 에이전트를 경유한다**: 도구 결과를 스크래치패드에 파일로 쓰고 → 스크립트 stdin →
결과 JSON을 읽어 → 도구로 쓴다.

## 명령

| 명령 | 하는 일 |
|---|---|
| `/board new <제목> [--file 경로] [--start YYYY-MM-DD --weeks N] [--repo owner/name] [--ticket KEY] [--jira https://<site>.atlassian.net]` | 아티팩트 게시 + DB 시드 + `board.json` |
| `/board sync [--file 경로]` | PR·브랜치·Issue·Jira 실측 → `probe` 갱신 → 스냅샷 → 보고 |
| `/board open [--file 경로]` | 보드 열기 |
| `/board restore <board.json>` | 스냅샷을 DB로 되돌린다(확인 후) |
| `/board runbook <runbook.html> [--file 경로]` | 런북 HTML을 런북 탭에 게시한다(절 단위 · 충돌 검사) |
| `/board import <runbook.html 또는 URL> [--file 경로]` | 런북 매트릭스를 카드로 옮긴다(1회성) |

카드 **추가·편집은 명령이 아니라 채팅**이다("T4 행 Phase 2에 QA 카드 추가", "#813 카드를 미정으로") — 「채팅 편집 규칙」대로 쓴다.

### 파일 위치 (`--file`)
보드의 로컬 정체성은 `board.json` 하나다(`artifact.url` + 최신 스냅샷). 경로는 **호출자가 정한다**:
- `/task`가 부를 때: `<리포 루트>/.task-docs/<티켓>/board.json`
- 단독: `--file`이 없으면 cwd가 git 리포면 `<리포 루트>/.task-docs/<티켓|슬러그>/board.json`, 아니면 `./board.json`. 어느 쪽이든 **처음 만들 때 경로를 한 줄로 확인받는다.**

`--file`이 없고 파일도 못 찾으면 `Artifact list`에서 `📋 작업 보드 |` 제목(옛 이름 `📋 보드 |` 포함)을 찾는다. 후보가 둘 이상이면 묻는다.

## `new`

1. 인자 파싱. `--start` 없으면 오늘, `--weeks` 없으면 6. `--repo` 없으면 `gh repo view --json nameWithOwner`(cwd가 리포일 때).
2. `Artifact list`로 같은 제목의 `📋 작업 보드 |`(옛 `📋 보드 |`)가 있는지 본다 — 있으면 새로 만들지 않고 그 URL을 쓴다(주제당 URL 하나).
3. **행 정의를 한 번 묻는다**: "행을 나열해 주세요 (예: `T1 service-server`, `T4 customer-web`, `사람·외부`)". 답이 없으면 행 하나(`main`).
   호출자가 행을 정해 넘겼으면(작업 수명주기 스킬이 티켓 범위에서 추정한 경우) 묻지 않는다 — 틀리면 사용자가 헤더에서 고친다.
   행 id는 `r_` + 슬러그, `kind`(코드·인프라·QA·문서·사전 준비·외부 요청)는 이름으로 추정(`ops`·`환경`→infra, `사람`·`외부`→ask, 그 외 code),
   `sub`에 사람이 읽는 이름(리포·서비스), `label`에 좌표(T1). **QA 행(`kind: qa`, "TC 작성 · 수행")은 사용자가 말하지 않아도 기본으로 넣는다** — 없으면 QA 카드가 코드 행에 섞인다.
4. `<skill>/templates/board.html`을 스크래치패드로 복사하고 `<title>`의 `BOARD-TITLE`을 제목으로 바꾼다. 나머지는 손대지 않는다.
5. `Artifact` 게시: `title` `📋 작업 보드 | <제목>`, `icon` `board`, `description` 한 줄,
   `capabilities: {"db": {"rules": [{"path": "", "read": "view", "write": "admin"}]}, "user": {}, "comments": {"composer_only": true}}` — 링크로 온 사내 사용자는 읽기만, 소유자·편집자만 쓴다. `comments`는 카드의 「Claude에게 묻기」 버튼이 셸 코멘트 창을 여는 데만 쓴다(composer_only라 동의 프롬프트 없음, 공개 공유 가능 유지).
6. `ArtifactData` `batch`로 시드: `meta/board`(schema.md 형태, `cols` = `unset` + `node <scripts>/…`가 아니라 아래 규칙으로 주 단위 N개:
   `{id:"w<i>", label:"M<i>", start, end}`, 7일 간격, 첫 열 start = `--start`). 열 어휘는 **마일스톤(M0·M1…)** — "Phase"·"단계"는 쓰지 않는다(2026-09-19 사용자 결정) · `meta/sync` `{at:null, by:"agent", probed:0, failed:0, schemaVersion:1}`.
7. `ArtifactData get meta/board` + `get meta/sync`를 `out_dir`로 받아 `node <scripts>/assemble-dump.mjs <dir> --url <url> | node <scripts>/snapshot.mjs --out <board.json>`.
8. 보고: URL · 파일 경로 · "카드는 페이지의 `+` 또는 채팅으로 추가".

## `sync`

1. `board.json`에서 `artifact.url`·`meta.repo`를 읽는다(없으면 「파일 위치」 탐색).
2. 덤프: `ArtifactData get meta/board` + `ArtifactData list cards`(`query.limit` 1000, archived 포함)를 **`out_dir: <scratch>/sync`**로 받는다
   (문서가 파일로 떨어진다). 도구 결과 텍스트의 `"<id>"  N bytes  version V` 줄들을 그대로 `<scratch>/sync/versions.txt`에 쓴다 —
   **기존 문서 `update`는 `if_version`이 필수**라(실측: 없으면 `version_mismatch`로 거부) 버전이 여기서만 나온다.
   `node <scripts>/assemble-dump.mjs <scratch>/sync --url <url> --out <scratch>/sync/dump.json`.
3. `node <scripts>/probe-github.mjs < dump.json > probe.json` (`--repo`로 meta.repo를 덮을 수 있다). **리포 안
   (cwd가 git 리포)에서 돌린다** — 브랜치 실측이 git을 부르므로 스크래치 cwd에서는 브랜치 카드가 "깃 저장소가
   아닙니다"로 실패한다. 카드 `pr`은 **URL 문자열**이어야 한다(schema.md) — 숫자로 넣으면 그 카드 실측이
   `prUrl.match is not a function`으로 죽는다(2026-09-23 실측 — 채팅 편집으로 pr을 채울 때 URL로 쓴다). 결과:
   `updates[{id, probe}]` · `suggestions[{id, field, value, why}]` · `jira[{id, key}]` · `unregistered[]` · `errors[]`.
4. **Jira**: `jira[]`의 키마다 Atlassian MCP `getJiraIssue`(cloudId는 사이트 호스트, fields: summary·status·assignee)를 부르고
   `<scratch>/sync/jira.json`에 `[{id, key, status: <status.name>, assignee: <displayName|null>, title, ok, err}]`로 쓴다.
   실패(403·미존재)는 `{id, key, ok:false, err}` — 카드에는 "실측 실패 · 마지막 값"으로 보이고 이전 값은 부분 병합으로 남는다.
   MCP가 없거나 전부 실패해도 다음 단계로 간다(보고에 적는다).
5. `node <scripts>/probe-to-batch.mjs probe.json --out-dir <scratch>/sync --jira jira.json --versions versions.txt > batch.json`
   → `batches[]`(≤50건, 항목마다 `file_path`·`if_version`) 를 순서대로 `ArtifactData batch`에 넘긴다. **`probe`만 쓴다.**
   `version_mismatch`가 나면 그 문서만 다시 `get`해 버전을 고치고 재시도한다(사용자가 그 사이 드래그했다는 뜻이고, 필드가 분리돼 있어 내용 충돌은 없다).
6. `ArtifactData get meta/sync`(버전 확보) → `update meta/sync` `{at, by:"agent", probed, failed, schemaVersion:1}` + `if_version`. 값은 batch.json의 `sync`.
7. 다시 `get meta/board` + `list cards`(out_dir) → `assemble-dump.mjs` → `node <scripts>/snapshot.mjs --out <board.json>`.
8. 보고 — 서식은 [references/sync-report.md](references/sync-report.md). 반드시 들어가는 것: 단계가 바뀐 카드(전 → 후), 실측 실패, `suggestions`(브랜치로 찾은 PR을 `pr` 필드에 채울지 — **사용자가 OK하면** `update {pr}` + `if_version`), **미등록 PR 목록**(카드를 만들지 않는다 — 사용자가 행을 정해주면 그때 만든다).

## `runbook`

런북은 **로컬 HTML 파일이 정본**이고 DB는 게시본이다(로컬 → DB 한 방향). 페이지는 런북을 읽기만 한다.
게시할 때 스크립트가 `<section id>` 절마다 문서 하나(`runbook/<절id>`)로 쪼개고, CSS는 `#rb` 아래로 가두고, 스크립트는 뺀다
([schema.md](schema.md) 「런북」). 페이지를 재게시하지 않으므로 런북을 몇 번 고쳐도 아티팩트 버전 충돌이 없다.

게시 기록(`runbook.publish.json`)은 런북 파일 옆에 둔다 — 절마다 "내가 마지막으로 올린 hash"다. 원격 절의 hash가 이 기록과
다르면 **다른 세션이 내 뒤에 그 절을 고친 것**이라 쓰지 않고 멈춘다(결정 번호 채번이 겹치는 사고를 여기서 막는다).

1. `board.json`에서 `artifact.url`을 읽는다(없으면 「파일 위치」 탐색).
2. 덤프: `ArtifactData get meta/runbook` + `ArtifactData list runbook`(`query.limit` 1000)을 **`out_dir: <scratch>/rb/remote`**로 받는다.
   결과 텍스트의 `"<id>"  N bytes  version V` 줄을 `<scratch>/rb/versions.txt`에 쓴다(기존 문서 쓰기는 `if_version` 필수). 처음이면 둘 다 비어 있다.
3. `node <scripts>/runbook-publish.mjs plan <runbook.html> --remote <scratch>/rb/remote --out-dir <scratch>/rb --versions <scratch>/rb/versions.txt --state <runbook 디렉터리>/runbook.publish.json > <scratch>/rb/plan.json`
   - stderr: `절 N · 쓰기 N · 삭제 N · 그대로 N · 충돌 N`.
   - **exit 3 = 충돌**: `batches`가 비어 있다. 아무것도 쓰지 않는다. `<scratch>/rb/conflicts/<id>.remote.html`(다른 세션의 본문)을
     로컬 런북에 병합하고 — 결정 로그는 원격 항목을 살리고 내 항목 번호를 뒤로 민다 — 2단계부터 다시 한다. 절 일부만 올리지 않는다.
   - 기록 파일이 없는데 원격이 이미 있으면(다른 머신·세션이 게시함) 원격을 받아 로컬이 그 내용을 반영했는지 확인한 뒤 `--adopt`로 다시 계획한다.
   - 절 하나가 240KiB를 넘으면 에러다 — 그 절을 둘로 나눈다(결정 로그는 오래된 항목을 별도 절로).
4. `plan.batches`를 순서대로 `ArtifactData batch`에 넘긴다(항목마다 `file_path`·`if_version`, `meta/runbook`은 맨 끝).
   `version_mismatch`면 그 사이 누가 게시한 것이다 — 2단계부터 다시.
5. 전부 성공한 뒤에만: `node <scripts>/runbook-publish.mjs commit --plan <scratch>/rb/plan.json --state <…>/runbook.publish.json --url <url>`.
6. 보고: 쓴 절 목록 · 그대로 · 삭제 · 충돌(있었다면 무엇을 병합했나).

런북 작성 규칙(페이지가 기대하는 것):
- 최상위 `<section id>`만 절이 된다. 절 사이에 절 밖 내용이 있으면 게시가 거부된다(어느 절에도 안 실려 사라지므로).
- **절 id는 문서 id다** — 영숫자로 시작하고 영숫자·`-`·`_`만(`a1`, `a1-1`, `c`). 바꾸면 그 절을 가리키던 카드 링크가 끊긴다.
- "#N"으로 시작하는 목록 항목(`<li><b>#84</b> …`)에는 게시 때 `<절id>-N` 앵커가 자동으로 붙는다(결정 로그 `c-84`). 번호를 다시 매기지 않는다.
- 런북 안의 `<script>`는 게시 때 빠진다. 목차(`nav.toc`)의 강조·앵커 이동은 페이지가 한다.
- 상태 요약(매트릭스·「내가 할 일」·트랙 표)은 런북에 쓰지 않는다 — 진행 탭이 정본이다.

## `open`
`board.json`의 URL로 `Artifact open`. 없으면 「파일 위치」 탐색.

## `restore`
1. 현재 DB 덤프를 받는다(sync 2단계와 같음) → `current.json`.
2. `node <scripts>/restore.mjs <board.json> --out-dir <scratch>/restore --current current.json --versions versions.txt > plan.json`.
3. 요약(meta N · 카드 N · 보관 전환 N)을 보여주고 **확인을 받는다.** DB에만 있는 카드는 지우지 않고 `archived:true`가 된다.
4. `plan.batches`를 순서대로 `ArtifactData batch`(각 entry는 `file_path` 참조; 이미 있는 문서는 `current.json` 덤프의 버전으로 `if_version`이 붙어 있다). 끝나면 `sync` 7단계처럼 스냅샷을 다시 쓴다.

## `import`
1. 입력이 URL이면 로컬 사본을 먼저 찾는다: `<리포>/.task-docs/<티켓>/runbook.html`. 없으면 `Artifact read`로 받는다(WebFetch는 403).
2. `node <scripts>/import-runbook.mjs <runbook.html> --year <연도> [--repo owner/name] [--branch-prefix P] > draft.json`.
   stderr 요약(행·열·타입별 카드 수·빈 셀 경고)을 그대로 보여주고, 카드 제목 목록을 타입별로 요약해 **확인을 받는다.** 규칙은 [references/import-mapping.md](references/import-mapping.md).
3. 보드가 없으면 `new`의 4~5단계로 게시(제목·티켓은 초안의 meta). 있으면 기존 `meta/board`의 열은 유지하고 초안의 열 중 같은 label이 없는 것만 append, 행은 초안으로 교체(카드 `pos.row`가 초안 행 id를 가리킨다).
4. `ArtifactData batch`로 `meta/board` set + 카드 set(≤50건씩, `file_path` 또는 inline).
5. `sync`를 한 번 돌린다(PR 단계는 실측이 정본).

## 채팅 편집 규칙 (카드 추가·수정)

- **제목은 제목만 보고 무슨 작업인지 한눈에 읽혀야 한다** — 한 구절(≤40자), 경위·근거·날짜·결정 번호·문서 좌표(#67, A2)는 `note`로.
  "스택 ① 어댑터·라우팅·ERP + ② 확정 정산·sweep — 게이트·audit ✅, #813 최신 merge 완료(9/19). 상세 A2·#66·#67"은 제목이 아니라
  "admin 어댑터·라우팅·확정 정산" + 메모다(2026-09-19 사용자 교정 — 중요). PR 번호·상태는 카드가 실측으로 따로 보여준다.
- **카드는 네 줄이다** — ① 타입 + 현재 상태(실측·자동) ② 제목 ③ 설명 한 줄(`note` 첫 줄, 말줄임) ④ 지연일 때만 「지연 · 사유」.
  `note`에는 **무엇을·왜**만 적고 진행 경위("리뷰 반영 → 재리뷰 대기")는 적지 않는다 — 진행 상태는 ①이 실측으로 보여주므로 겹친다.
  지연 사유는 `delayNote`에. 기한 지남·열 기간 지남·막힘은 자동으로 붙으니 그것만이면 비워 둔다.
- **단계 값은 타입 어휘(schema.md 표) 안에서만 쓴다.** 완료는 타입마다 다르다 — pr `merged` · doc `published` · **qa `pass`** · ask/infra `done` ·
  decision `decided`. 어휘 밖 값(QA에 `done` 등)을 쓰면 카드가 흐려지지 않고 첫 줄에 빨간 "단계 값 오류"가 뜬다(2026-09-22 실제 사고).
  쓰기 전에 `STAGES[type].includes(stage)`로 확인한다.
- **카드는 "끝나는 상태가 있는 작업" 단위다.** 그 작업 안의 한 동작(리뷰어 지정·ready 전환·머지 버튼·티켓 상태 전환)은 카드가
  아니라 그 카드의 단계·`delayNote`다. 런북 「내가 할 일」의 한 줄을 그대로 카드로 옮기지 않는다(2026-09-22 사용자 교정).
- **행 이름은 리포 이름만**(`service-server`·`customer-web`), 코드가 아닌 행은 명사 하나(`ops`·`문서`·`QA`·`외부`). 설명은 카드 제목이 하므로
  행 이름에 붙이지 않고, 같은 리포에 행을 둘 만들지 않는다(2026-09-19 사용자 결정). `label`에는 T0·T1 같은 짧은 번호만.
- **인프라 카드는 `env`를 준다**(dev · test · prod). dev·test는 개발 열에 두고, **prod는 배포 열에 두되 티켓은 개발 중에 미리 낸다** —
  티켓 키를 `ticket`에 넣고 단계를 `requested`로, 실제 생성에 들어가면 `in_progress`. 한 작업이 dev·prod 양쪽에 있으면 카드 두 장이다.

- 필드 이름·타입은 schema.md. 새 카드는 `set` 한 번(id `c_` + base36(ms) + 난수 4자, `createdAt`·`updatedAt` 채움, `probe:null`).
  `pos.ord`는 그 칸의 마지막 카드 ord 뒤: `between(last, null)` — `node -e 'import("<scripts>/lib/order.mjs").then(m=>console.log(m.between(process.argv[1]||null,null)))' -- "<last ord>"`.
- 기존 카드는 **항상 `update`**(부분), `probe`는 건드리지 않는다. **`if_version`은 선택이 아니라 필수다** — 먼저 `get`으로 읽은 `version`을 넘긴다(없으면 `version_mismatch`로 거부된다). 충돌하면 한 번 다시 읽고 재시도, 또 실패면 보고.
- 배열(`links` `blockedBy` `rows` `cols`)은 최신 값을 읽은 뒤 **전체**를 보낸다.
- PR 카드의 단계는 쓰지 않는다 — `sync`가 채운다.
- **단계 값은 그 타입의 어휘에서만 고른다**(schema.md 「단계 어휘」). 완료는 타입마다 다르다 — qa `pass` · doc `published` · ask/infra `done` · decision `decided`. qa 카드에 `done`을 쓰면 페이지가 「단계 오류」로 표시하고 완료(흐림)로 치지 않는다(2026-09-22 사용자 교정 — 「완료」 글자와 흐림이 어긋나는 카드가 생겼다).
- **메모에 PR 번호·상태(머지·draft·리뷰 대기)를 적지 않는다** — 카드가 실측으로 보여주므로 중복이다. 메모는 카드가 모르는 것(경위·조건·좌표)만.
- **담당 기본값**: 코드·문서·QA·인프라 카드는 `owner.kind = "agent"`, 요청·결정 카드는 `"me"`. "내 몫" 필터는 사람이 움직여야 하는 카드만 남겨야 의미가 있다 — 전부 `me`로 두면 필터가 죽는다(2026-09-19 교정).
- **문서 카드가 `draft` 이상이면 `links[]`에 문서 URL이 있어야 한다** — 카드에 링크 칩으로 보이고, 없으면 "링크 없음" 경고 칩이 뜬다. 작성 전이면 `todo`. 사용자가 "머지됐다"고 해도 `sync`로 실측한다.
- 행·열 추가는 `meta/board.rows`/`cols` 전체 배열 `update`. `cols[0]`은 `unset` 고정.
- 삭제 요청은 `archived:true`. 하드 삭제는 사용자가 "완전히 지워"라고 명시할 때만 `delete`.
- **런북 딥링크** — 카드 `links[]`에 `#runbook/<절id>`(절) 또는 `#runbook/c-84`(결정 한 건)를 넣으면 「런북 C #84」 칩이 되고,
  누르면 런북 탭의 그 위치가 열린다(접힌 결정 로그도 펼친다). 에이전트가 런북에 결정 항목·이어받기 항목을 쓸 때 **관련 카드에 같이 넣는다**
  (배열이므로 최신 `links`를 읽고 전체를 `update` + `if_version`). `sync`는 링크를 건드리지 않는다.
  카드 `note`에 절 좌표(A2·#67)를 적는 대신 이 링크를 쓴다.

## 보고·톤
- 실측 시각을 항상 적는다. 실패는 숨기지 않는다("Jira 3건 실측 실패 · 403").
- 카드 생성·행 지정처럼 판단이 필요한 것은 묻는다. 위치·행은 추측하지 않는다.
- 이 스킬은 개인 경로·외부 지식베이스를 참조하지 않는다. 팀에 공유해도 그대로 동작해야 한다.

## 참고
- [schema.md](schema.md) — DB 스키마 · 단계 어휘 · 쓰기 주체 · 런북 문서
- [references/pr-stages.md](references/pr-stages.md) — PR 단계 판정
- [references/import-mapping.md](references/import-mapping.md) — 런북 → 카드
- [references/sync-report.md](references/sync-report.md) — sync 보고 서식
- [references/task-integration.md](references/task-integration.md) — 작업 수명주기 스킬과 붙이는 법
- [references/backlog.md](references/backlog.md) — 다음 판 후보
