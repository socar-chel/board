// 런북 매트릭스(table.matrix) → 보드 초안. 규칙은 references/import-mapping.md.
import { parse, q, qa, kids, text, norm, classes } from "./html-lite.mjs";
import { parseHeader } from "./dates.mjs";
import { STAGES, DONE } from "./stages.mjs";
import { between } from "./order.mjs";

const KIND2TYPE = { pr: "pr", rel: "infra", docs: "doc", qa: "qa", dec: "decision", ask: "ask" };
const MID = { doc: "review", qa: "in_progress", ask: "requested", infra: "in_progress", decision: "pending", pr: "review" };
const first = (t) => STAGES[t][0], done = (t) => DONE[t][0];
const TAGCLS = ["good", "info", "warn", "bad", "dim"];

function stageFor(type, txt, tagCls, { hasTicket = false } = {}) {
  const ok = /✅/.test(txt), open = /☐/.test(txt);
  if (ok && open) return MID[type];                       // 일부 완료·일부 미완 → 진행 중
  if (ok) return type === "ask" && hasTicket ? "waiting" : done(type);   // 티켓이 붙은 요청의 ✅는 "신청함"이지 완료가 아니다
  if (open) return first(type);
  if (tagCls === "good") return done(type);
  if (tagCls === "info" || tagCls === "warn") return MID[type];
  return first(type);
}
const PR_RE = /\/pull\/(\d+)/;
// 제목은 한눈에 읽히는 한 구절만 — 나머지(경위·근거·날짜·링크 좌표)는 메모로 내린다
function shortTitle(txt) {
  const t = txt.replace(/[✅☐]/g, "").replace(/\s{2,}/g, " ").trim();
  const first = t.split(/\s[—–]\s|\s·\s|,\s|\s\(|\s→\s/)[0].replace(/\s*\(.*$/, "").trim();
  return (first.length >= 4 ? first : t).slice(0, 60);
}
function linksOf(n) { return qa(n, "a").map((a) => a.attrs.href).filter(Boolean); }
function cleanText(n) { return norm(text(n, { skip: (x) => x.tag === "span" && classes(x).includes("kind") })); }

function importRunbook(html, { year = new Date().getFullYear(), now = new Date().toISOString() } = {}) {
  const root = parse(html);
  const titleRaw = norm(text(q(root, "title") || { text: "" })).replace(/^[^|]*\|\s*/, "");
  const tm = titleRaw.match(/\b([A-Z][A-Z0-9]+-\d+)\b/);
  const ticket = tm ? tm[1] : null, title = norm(titleRaw.replace(tm ? tm[0] : "", "")) || titleRaw;
  const table = q(root, "table.matrix");
  if (!table) throw new Error("table.matrix 없음");
  const warn = [];
  // 열
  const ths = qa(q(table, "thead"), "th").slice(1);
  const cols = [{ id: "unset", label: "미정", fixed: true }];
  ths.forEach((th, i) => { const h = parseHeader(norm(text(th)), { year }); cols.push({ id: `c${i + 1}`, label: h.label, start: h.start, end: h.end, note: h.note }); });
  // 행·카드
  const rows = [], cards = []; let seq = 0;
  const idOf = () => `c_imp${String(++seq).padStart(3, "0")}`;
  const trs = qa(q(table, "tbody") || table, "tr");
  trs.forEach((tr, ri) => {
    const tds = kids(tr, "td"); if (!tds.length) return;
    const key = tds[0];
    const small = q(key, "small"), kindSpan = q(key, "span.kind");
    const label = norm(text(key, { skip: (x) => x.tag === "small" || (x.tag === "span" && classes(x).includes("kind")) }));
    const rowType = kindSpan ? KIND2TYPE[classes(kindSpan).find((c) => KIND2TYPE[c])] || null : null;
    const KIND = { pr: "code", infra: "infra", doc: "doc", qa: "qa", ask: "ask", decision: "prep" };
    const row = { id: `r${ri + 1}`, label, sub: small ? norm(text(small)) : "", kind: rowType ? KIND[rowType] : null, type: rowType };
    rows.push(row);
    tds.slice(1).forEach((td, ci) => {
      const col = cols[ci + 1]; if (!col) return;
      if (classes(td).includes("na")) return;
      const tag = q(td, "span.tag"), tagCls = tag ? classes(tag).find((c) => TAGCLS.includes(c)) : null, tagText = tag ? norm(text(tag)) : "";
      const items = qa(td, "li");
      let prevOrd = null;
      const push = (c) => { c.pos.ord = between(prevOrd, null); prevOrd = c.pos.ord; cards.push(c); };
      // 담당 기본값 — 에이전트가 하는 일(코드·문서·QA·인프라)과 사람이 움직여야 하는 일(요청·결정)을 가른다. "내 몫" 필터의 근거
      const ownerFor = (type) => ({ kind: type === "ask" || type === "decision" ? "me" : "agent", name: "" });
      const base = (type, t, extra = {}) => ({ id: idOf(), type, title: t.slice(0, 120), note: "", links: [], owner: ownerFor(type), due: null, blockedBy: [], blockedAt: null, archived: false, delayNote: null,
        branch: null, pr: null, target: null, ticket: null, stage: first(type), pos: { row: row.id, col: col.id, ord: null }, probe: null, createdAt: now, updatedAt: now, ...extra });
      const fromNode = (node, typeHint) => {
        const kindCls = node.tag === "li" ? classes(node).find((c) => KIND2TYPE[c]) : null;
        const type = (kindCls && KIND2TYPE[kindCls]) || typeHint || row.type || "pr";
        const txt = cleanText(node), links = linksOf(node);
        const prLinks = links.filter((h) => PR_RE.test(h));
        const jira = links.find((h) => /atlassian\.net\/browse\//.test(h)), issue = links.find((h) => /github\.com\/.+\/issues\/\d+/.test(h));
        const others = links.filter((h) => !PR_RE.test(h) && h !== jira && h !== issue);
        const stage = stageFor(type, txt, tagCls, { hasTicket: !!(jira || issue) }), late = tagCls === "bad" ? "런북에서 지연으로 표시" : null;
        if (type === "pr" && prLinks.length) {
          const segs = txt.split(/\s·\s/);
          prLinks.forEach((href) => {
            const num = href.match(PR_RE)[1], seg = segs.find((s) => s.includes(`#${num}`)) || `#${num}`;
            let st = shortTitle(seg.replace(/#\d+/, "").trim()); if (!st || /^[①②③④⑤⑥⑦⑧⑨⑩\s]*$/.test(st)) st = `${st.trim()} #${num}`.trim();
            push(base("pr", st, { pr: href, note: st === norm(txt) ? "" : txt, delayNote: late, links: others, stage: tagCls === "good" || /✅/.test(txt) ? "merged" : stage }));
          });
          return;
        }
        const st = shortTitle(txt) || tagText || "(제목 없음)";
        push(base(type, st, { note: st === txt.replace(/[✅☐]/g, "").trim() ? "" : txt, delayNote: late, links: others, ticket: jira ? { key: jira.split("/browse/")[1].replace(/[?#].*$/, "") } : issue ? { url: issue } : null, stage }));
      };
      if (items.length) items.forEach((li) => fromNode(li));
      else {
        const txt = cleanText(td).replace(tagText, "").trim();
        if (!txt && !linksOf(td).length) { warn.push(`빈 셀: ${row.label} × ${col.label}`); return; }
        fromNode(td, row.type);
      }
    });
  });
  if (!rows.some((r) => r.kind === "qa")) rows.push({ id: "r_qa", label: "QA", sub: "TC 작성 · 수행", kind: "qa", type: "qa" });   // QA 행은 기본 제공
  const summary = { rows: rows.length, cols: cols.length, cards: cards.length, byType: {}, warnings: warn };
  for (const c of cards) summary.byType[c.type] = (summary.byType[c.type] || 0) + 1;
  const jiraHost = (html.match(/https?:\/\/[a-z0-9.-]+\.atlassian\.net/i) || [])[0] || null;
  return { meta: { schemaVersion: 1, title, ticket, repo: null, branchPrefix: null, jiraBase: jiraHost ? jiraHost + "/browse/" : null, rows, cols, updatedAt: now }, cards, summary };
}
export { importRunbook, KIND2TYPE };
