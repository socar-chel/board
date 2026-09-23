# 런북 매트릭스 → 카드 매핑

실행형은 `scripts/lib/import.mjs`(`importRunbook(html, {year})`). 대상은 `table.matrix` 하나.

| 원본 | 결과 |
|---|---|
| `<title>… \| KEY-123 제목</title>` | `meta.ticket = KEY-123`, `meta.title = 제목` |
| `thead th[1..]` | 열. `이름 (M/D~[M/]D [· 메모])` → `{label, start, end, note}`. 괄호 없으면 기간 없음. 맨 앞에 `unset`(미정) 삽입 |
| `tr > td.key` | 행. 첫 텍스트 = label, `small` = sub, `span.kind` = 기본 타입 |
| `td.na` · 빈 셀 | 건너뜀(빈 셀은 경고) |
| `span.tag.{good\|info\|warn\|bad\|dim}` | 셀 상태 → 단계 힌트 |
| `ul.items > li.{pr\|rel\|docs\|qa\|dec\|ask}` | li마다 카드. kind→type: `pr→pr` `rel→infra` `docs→doc` `qa→qa` `dec→decision` `ask→ask` |
| li(또는 셀)에 `a[href*="/pull/"]` n개 | **PR 카드 n개**. 제목 = ` · `로 나눈 조각 중 `#NNN`이 든 것, `pr` = href, 메모 = li 전체 텍스트 |
| `a[href*="atlassian.net/browse/KEY"]` | `ticket = {key}` |
| `a[href*="/issues/N"]` | `ticket = {url}` |
| 그 외 링크 | `links[]` |
| `ul.items` 없음 | PR 링크가 있으면 PR 카드, 없으면 행 기본 타입 카드 1개(제목 = 셀 텍스트에서 태그 문구 제외) |

## 단계
`✅`와 `☐`가 함께 → 중간 단계(일부 완료) · `✅` → 그 타입의 done(단, **티켓이 붙은 요청 카드의 ✅는 "신청함"이므로 `waiting`**) · `☐` → 첫 단계 · 없으면 태그로: `good`→done, `info`/`warn`→중간(doc review · qa in_progress · ask requested · infra in_progress · decision pending · pr review), `dim`→첫, `bad`→첫 + `delayNote: "런북에서 지연으로 표시"`.
PR 카드의 단계는 힌트일 뿐이다 — `sync`가 `probe.stage`로 덮는다.

## 제목·id
제목은 120자에서 자른다. id는 `c_impNNN`(순번)이라 같은 파일을 두 번 import하면 **같은 id로 덮어쓴다** — 재실행 전 기존 카드를 보관하거나 `restore`로 되돌린다.
