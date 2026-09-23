// 런북 매트릭스 파싱용 최소 HTML 파서. 의존성 0. 잘 닫힌 마크업(템플릿이 생성한 HTML)만 가정한다.
// 트리: { tag, attrs, children, parent } · 텍스트: { text }
const VOID = new Set(["br", "img", "hr", "meta", "link", "input", "col", "wbr", "source"]);
const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", middot: "·", hellip: "…", mdash: "—", ndash: "–", rarr: "→", larr: "←" };
function decode(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === "#") { const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) ? String.fromCodePoint(n) : m; }
    return ENT[e.toLowerCase()] ?? m;
  });
}
function parseAttrs(s) {
  const attrs = {}; const re = /([^\s=\/"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g; let m;
  while ((m = re.exec(s))) attrs[m[1].toLowerCase()] = decode(m[2] ?? m[3] ?? m[4] ?? "");
  return attrs;
}
function parse(html) {
  const root = { tag: "#root", attrs: {}, children: [], parent: null };
  let cur = root, i = 0;
  const push = (n) => { n.parent = cur; cur.children.push(n); return n; };
  while (i < html.length) {
    const lt = html.indexOf("<", i);
    if (lt < 0) { push({ text: decode(html.slice(i)) }); break; }
    if (lt > i) push({ text: decode(html.slice(i, lt)) });
    if (html.startsWith("<!--", lt)) { const e = html.indexOf("-->", lt); i = e < 0 ? html.length : e + 3; continue; }
    if (html.startsWith("<!", lt) || html.startsWith("<?", lt)) { const e = html.indexOf(">", lt); i = e < 0 ? html.length : e + 1; continue; }
    const gt = findTagEnd(html, lt);
    const raw = html.slice(lt + 1, gt);
    i = gt + 1;
    if (raw[0] === "/") { const tag = raw.slice(1).trim().toLowerCase(); let n = cur; while (n && n.tag !== tag) n = n.parent; if (n && n.parent) cur = n.parent; continue; }
    const m = raw.match(/^([a-zA-Z][\w:-]*)\s*([\s\S]*?)\s*(\/?)$/); if (!m) continue;
    const tag = m[1].toLowerCase(), node = push({ tag, attrs: parseAttrs(m[2]), children: [] });
    if (tag === "script" || tag === "style") { const end = html.indexOf(`</${tag}`, i); node.children.push({ text: html.slice(i, end < 0 ? html.length : end) }); i = end < 0 ? html.length : html.indexOf(">", end) + 1; continue; }
    if (!m[3] && !VOID.has(tag)) cur = node;
  }
  return root;
}
function findTagEnd(html, lt) { let q = null; for (let j = lt + 1; j < html.length; j++) { const ch = html[j]; if (q) { if (ch === q) q = null; } else if (ch === '"' || ch === "'") q = ch; else if (ch === ">") return j; } return html.length; }
const classes = (n) => (n.attrs?.class || "").split(/\s+/).filter(Boolean);
const hasClass = (n, c) => classes(n).includes(c);
function* walk(n) { if (!n.children) return; for (const c of n.children) { if (c.tag) { yield c; yield* walk(c); } } }
function find(n, pred) { for (const c of walk(n)) if (pred(c)) return c; return null; }
function findAll(n, pred) { const out = []; for (const c of walk(n)) if (pred(c)) out.push(c); return out; }
// 간단 셀렉터: "tag.class.class" 한 단계만
function sel(spec) { const [tag, ...cls] = spec.split("."); return (n) => (!tag || n.tag === tag) && cls.every((c) => hasClass(n, c)); }
const q = (n, spec) => find(n, sel(spec)); const qa = (n, spec) => findAll(n, sel(spec));
const kids = (n, spec) => (n.children || []).filter((c) => c.tag && sel(spec)(c));
function text(n, { skip = () => false } = {}) {
  if (n.text != null) return n.text;
  if (skip(n)) return "";
  return (n.children || []).map((c) => text(c, { skip })).join("");
}
const norm = (s) => s.replace(/ /g, " ").replace(/\s+/g, " ").trim();
export { parse, find, findAll, q, qa, kids, text, norm, classes, hasClass, decode, walk };
