// 런북 HTML → 보드 DB(meta/runbook + runbook/<절id>) 게시 계획. 의존성 0.
// 런북은 로컬 파일이 정본이고 DB는 게시본이다(로컬 → DB 한 방향). 절마다 hash를 남겨,
// 내가 마지막으로 게시한 뒤 다른 세션이 그 절을 고쳤으면 쓰지 않고 충돌로 멈춘다.
import { createHash } from "node:crypto";

const SCOPE = "#rb";
const DOC_LIMIT = 240 * 1024;   // 문서 상한 256KiB에서 봉투·이스케이프 여유를 뺀 값

const sha = (s) => createHash("sha256").update(s).digest("hex").slice(0, 16);

// ── CSS 스코프 ──
// 페이지 한 장에 보드와 런북이 같이 살므로 런북 CSS를 #rb 아래로 가둔다. 스코프가 ID라 보드의 클래스 규칙보다 항상 이긴다.
// :root·html·body는 #rb 자신이 된다 — 토큰(:root{--paper…})과 다크 재정의가 #rb에 걸리고, 페이지가 #rb[data-theme]을 맞춘다.
function splitTop(s, sep) {
  const out = []; let depth = 0, q = null, cur = "";
  for (const ch of s) {
    if (q) { if (ch === q) q = null; }
    else if (ch === '"' || ch === "'") q = ch;
    else if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth--;
    else if (ch === sep && depth === 0) { out.push(cur); cur = ""; continue; }
    cur += ch;
  }
  out.push(cur);
  return out;
}
function scopeSelector(sel, scope = SCOPE) {
  const s = sel.trim();
  if (!s) return s;
  const m = s.match(/^(:root|html|body)(?![\w-])(.*)$/s);
  if (m) {
    const rest = m[2];
    // "html body" · ":root .x" 처럼 루트 뒤에 자손이 오면 그 자손을 #rb 아래에 둔다
    const r2 = rest.match(/^\s+(html|body)(?![\w-])(.*)$/s);
    return scope + (r2 ? r2[2] : rest);
  }
  if (s === "*") return `${scope}, ${scope} *`;
  return `${scope} ${s}`;
}
// 블록 단위 스캐너: 주석 제거 → 규칙/at-rule을 재귀로 돌며 셀렉터만 바꾼다.
function scopeCss(css, scope = SCOPE) {
  css = css.replace(/\/\*[\s\S]*?\*\//g, "");
  let i = 0;
  function block(untilClose) {
    let out = "";
    while (i < css.length) {
      while (i < css.length && /\s/.test(css[i])) i++;
      if (i >= css.length) break;
      if (css[i] === "}") { if (untilClose) { i++; return out; } i++; continue; }
      // 선두부(셀렉터 또는 at-rule 머리) — ; 나 { 까지
      let j = i, q = null;
      while (j < css.length) { const ch = css[j]; if (q) { if (ch === q) q = null; } else if (ch === '"' || ch === "'") q = ch; else if (ch === "{" || ch === ";" || ch === "}") break; j++; }
      const prelude = css.slice(i, j).trim();
      if (css[j] === ";" || css[j] === "}" || j >= css.length) { if (prelude) out += prelude + ";"; i = css[j] === ";" ? j + 1 : j; continue; }
      i = j + 1;   // '{' 다음
      if (prelude.startsWith("@")) {
        const name = prelude.slice(1).split(/[\s(]/)[0].toLowerCase();
        if (name === "media" || name === "supports" || name === "container" || name === "layer") out += `${prelude}{${block(true)}}`;
        else out += `${prelude}{${raw()}}`;   // keyframes·font-face·page — 셀렉터가 아니므로 그대로
      } else {
        const sel = splitTop(prelude, ",").map((x) => scopeSelector(x, scope)).join(",");
        out += `${sel}{${raw()}}`;
      }
    }
    return out;
  }
  // 짝이 맞는 } 까지 원문 그대로(선언부 · keyframes 안쪽)
  function raw() {
    let depth = 1, j = i, q = null;
    while (j < css.length) { const ch = css[j]; if (q) { if (ch === q) q = null; } else if (ch === '"' || ch === "'") q = ch; else if (ch === "{") depth++; else if (ch === "}") { depth--; if (depth === 0) break; } j++; }
    const body = css.slice(i, j).trim(); i = j + 1; return body;
  }
  return block(false);
}

// ── 분할 ──
// <section id>를 최상위 절로 본다. 절 사이에는 공백·주석만 허용한다(다른 게 있으면 어느 절에도 안 실려 사라지므로 에러).
function stripTags(s) { return s.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim(); }
function sectionSpans(html) {
  const re = /<section\b[^>]*>|<\/section\s*>/gi, spans = []; let m, depth = 0, start = -1, open = null;
  while ((m = re.exec(html))) {
    if (m[0][1] !== "/") { if (depth === 0) { start = m.index; open = m[0]; } depth++; }
    else { depth--; if (depth < 0) throw new Error("runbook: </section> 짝이 맞지 않는다"); if (depth === 0) spans.push({ start, end: m.index + m[0].length, open }); }
  }
  if (depth !== 0) throw new Error("runbook: 닫히지 않은 <section>");
  return spans;
}
// 결정 로그처럼 "#N"으로 시작하는 목록 항목에 <절id>-N 앵커를 단다 — 카드가 결정 한 건을 가리킬 수 있게.
function anchorize(secHtml, secId) {
  const seen = new Set();
  return secHtml.replace(/<li(\s[^>]*)?>(\s*<b>\s*#(\d+)\s*<\/b>)/g, (all, attrs = "", lead, n) => {
    if (/\sid\s*=/.test(attrs)) return all;
    const id = `${secId}-${n}`; if (seen.has(id)) return all; seen.add(id);
    return `<li id="${id}"${attrs}>${lead}`;
  });
}
function splitRunbook(html, { label = "런북" } = {}) {
  const title = stripTags((html.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || "");
  const bodyAt = html.search(/<body\b[^>]*>/i);   // 뷰어가 붙인 <head> 프리앰블(body 배경 등)은 버린다
  let src = bodyAt >= 0 ? html.slice(html.indexOf(">", bodyAt) + 1) : html;
  src = src.replace(/<\/body>\s*<\/html>\s*$/i, "");
  const css = [...src.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join("\n");
  src = src.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "").replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "").replace(/<title>[\s\S]*?<\/title>/gi, "").replace(/<!--[\s\S]*?-->/g, "");
  const spans = sectionSpans(src);
  if (!spans.length) throw new Error("runbook: <section id> 절이 없다");
  const sections = [], ids = new Set();
  spans.forEach((sp, k) => {
    if (k > 0) { const gap = src.slice(spans[k - 1].end, sp.start).trim(); if (gap) throw new Error(`runbook: 절 사이에 절 밖 내용이 있다 — "${gap.slice(0, 60)}"`); }
    const id = (sp.open.match(/\sid\s*=\s*"([^"]+)"/) || [])[1];
    if (!id) throw new Error(`runbook: id 없는 <section> (${k + 1}번째)`);
    if (!/^[A-Za-z0-9][\w-]*$/.test(id)) throw new Error(`runbook: 절 id "${id}"는 문서 id로 쓸 수 없다`);
    if (ids.has(id)) throw new Error(`runbook: 절 id "${id}" 중복`); ids.add(id);
    const raw = src.slice(sp.start, sp.end);
    const num = stripTags((raw.match(/<span class="n">([\s\S]*?)<\/span>/) || [])[1] || "");
    const h2 = stripTags((raw.match(/<h2[^>]*>([\s\S]*?)<\/h2>/) || [])[1] || "");
    sections.push({ id, num, title: h2, html: anchorize(raw, id) });
  });
  const head = src.slice(0, spans[0].start).trim(), foot = src.slice(spans.at(-1).end).trim();
  return { title, label, css: scopeCss(css), head, foot, sections };
}

// ── 게시 계획 ──
// remote: { shell: {data, version}|null, sections: Map<id, {data, version}> } — ArtifactData 덤프에서 만든다.
// state: 마지막 게시 기록 { shell: hash, sections: {id: hash} } | null. 이 세션·이 머신이 무엇을 올렸는가.
// 판정: 원격 hash가 state와 같으면 "내 뒤로 아무도 안 건드림" → 덮어써도 된다. 다르고 로컬과도 다르면 충돌.
function shellHash(s) { return sha(JSON.stringify([s.title, s.label, s.css, s.head, s.foot])); }
function planPublish(local, remote, state, { now = new Date().toISOString(), adopt = false } = {}) {
  const writes = [], conflicts = [], unchanged = [], docs = [];
  const base = adopt ? { shell: remote.shell?.data?.hash ?? null, sections: Object.fromEntries([...remote.sections].map(([id, r]) => [id, r.data?.hash ?? null])) } : (state || { shell: null, sections: {} });
  const judge = (id, localHash, r, baseHash) => {
    if (!r) return baseHash ? "deleted-remotely" : "new";
    const rh = r.data?.hash ?? null;
    if (rh === localHash) return "same";
    if (rh === baseHash) return "update";
    return "conflict";
  };
  const localIds = new Set(local.sections.map((s) => s.id));
  for (const s of local.sections) {
    const hash = sha(s.html), r = remote.sections.get(s.id), v = judge(s.id, hash, r, base.sections?.[s.id] ?? null);
    const doc = { id: s.id, num: s.num, title: s.title, html: s.html, hash, updatedAt: now };
    if (v === "same") { unchanged.push(s.id); continue; }
    if (v === "conflict" || v === "deleted-remotely") { conflicts.push({ id: s.id, reason: v === "conflict" ? "원격 절이 마지막 게시 뒤 바뀌었다" : "마지막 게시 뒤 원격에서 지워졌다", remoteHash: r?.data?.hash ?? null, baseHash: base.sections?.[s.id] ?? null }); continue; }
    docs.push({ collection: "runbook", id: s.id, doc, version: r?.version ?? null });
  }
  for (const [id, r] of remote.sections) {
    if (localIds.has(id)) continue;
    const bh = base.sections?.[id] ?? null;
    if ((r.data?.hash ?? null) === bh) writes.push({ op: "delete", collection: "runbook", doc_id: id, ...(r.version != null ? { if_version: r.version } : {}) });
    else conflicts.push({ id, reason: "로컬에서 지운 절을 원격에서 누가 고쳤다", remoteHash: r.data?.hash ?? null, baseHash: bh });
  }
  const shell = { schemaVersion: 1, title: local.title, label: local.label, css: local.css, head: local.head, foot: local.foot };
  shell.hash = shellHash(shell);
  const rs = remote.shell, sv = judge("meta/runbook", shell.hash, rs, base.shell ?? null);
  if (sv === "conflict") conflicts.push({ id: "meta/runbook", reason: "원격 머리말·CSS가 마지막 게시 뒤 바뀌었다", remoteHash: rs?.data?.hash ?? null, baseHash: base.shell ?? null });
  const order = local.sections.map((s) => ({ id: s.id, num: s.num, title: s.title }));
  const orderChanged = JSON.stringify(rs?.data?.order ?? null) !== JSON.stringify(order);
  // 메타는 절 목록(order)을 가지므로 절이 하나라도 바뀌면 같이 쓴다 — 페이지는 meta가 가리키는 절만 그린다. 그래서 맨 마지막에 쓴다.
  const metaNeeded = sv !== "same" || orderChanged || docs.length || writes.length;
  if (metaNeeded && sv !== "conflict") docs.push({ collection: "meta", id: "runbook", doc: { ...shell, order, updatedAt: now }, version: rs?.version ?? null, last: true });
  for (const d of docs) {
    const bytes = Buffer.byteLength(JSON.stringify(d.doc));
    if (bytes > DOC_LIMIT) throw new Error(`runbook: ${d.collection}/${d.id} ${Math.round(bytes / 1024)}KiB — 문서 상한(${DOC_LIMIT / 1024}KiB)을 넘는다. 절을 나눈다`);
  }
  const nextState = {
    shell: conflicts.some((c) => c.id === "meta/runbook") ? (base.shell ?? null) : shell.hash,
    sections: Object.fromEntries(local.sections.map((s) => { const c = conflicts.find((x) => x.id === s.id); return [s.id, c ? (base.sections?.[s.id] ?? null) : sha(s.html)]; })),
  };
  return { docs, deletes: writes, conflicts, unchanged, nextState };
}

// 덤프 읽기 — ArtifactData out_dir 파일은 본문 그대로이거나 {id,data,version} 봉투다
const unwrap = (j) => (j && typeof j === "object" && "data" in j && "version" in j) ? { data: j.data, version: j.version } : { data: j, version: null };

export { scopeCss, scopeSelector, splitRunbook, anchorize, planPublish, shellHash, sha, unwrap, DOC_LIMIT, SCOPE };
