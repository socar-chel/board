// 열(시간) 정의 도우미 — 주 단위 열 생성, 런북 열 헤더의 기간 파싱, 오늘이 속한 열 판정.
const pad = (n) => String(n).padStart(2, "0");
const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromISO = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const addDays = (iso, n) => { const d = fromISO(iso); d.setDate(d.getDate() + n); return toISO(d); };
const md = (iso) => { const [, m, d] = iso.split("-").map(Number); return `${m}/${d}`; };

// 주 단위 열 N개. start는 그대로 첫 열의 시작일(정렬하지 않는다 — 사용자가 고른 날이 기준).
function weekColumns(startISO, n) {
  const cols = [];
  for (let i = 0; i < n; i++) {
    const start = addDays(startISO, i * 7), end = addDays(start, 6);
    cols.push({ id: `w${i + 1}`, label: `W${i + 1}`, start, end, note: "" });
  }
  return cols;
}

// "Phase 1 핵심 경로 (9/10~17)" · "Phase 3 CBT·오픈 (9/28~10/8 · 10/13)" · "Phase 0 선행" → {label,start,end,note}
const HEADER_RE = /^(.+?)\s*\((\d{1,2})\/(\d{1,2})\s*[~–\-]\s*(?:(\d{1,2})\/)?(\d{1,2})\s*(.*?)\)\s*$/;
function parseHeader(text, { year = new Date().getFullYear() } = {}) {
  const t = String(text).replace(/\s+/g, " ").trim();
  const m = t.match(HEADER_RE);
  if (!m) return { label: t, start: null, end: null, note: "" };
  const [, label, sm, sd, em, ed, rest] = m;
  const startM = Number(sm), endM = em ? Number(em) : startM;
  let sy = year, ey = year;
  if (endM < startM) ey = year + 1;
  const start = `${sy}-${pad(startM)}-${pad(Number(sd))}`, end = `${ey}-${pad(endM)}-${pad(Number(ed))}`;
  const note = rest.replace(/^[\s·,;]+/, "").trim();
  return { label: label.trim(), start, end, note };
}

function colLabelWithRange(col) {
  if (!col.start || !col.end) return col.label;
  return `${col.label} (${md(col.start)}~${md(col.end)})`;
}
function todayISO(now = new Date()) { return toISO(now); }
function colForDate(cols, iso) { return cols.find((c) => c.start && c.end && c.start <= iso && iso <= c.end) || null; }

export { toISO, fromISO, addDays, weekColumns, parseHeader, colLabelWithRange, todayISO, colForDate, HEADER_RE };
