import { test } from "node:test";
import assert from "node:assert/strict";
import { scopeCss, splitRunbook, planPublish, sha, shellHash } from "./runbook.mjs";

test("scopeCss — :root·html·body become #rb, others are prefixed", () => {
  const css = `:root{--a:1} html{scroll-behavior:smooth} body{margin:0} .x,.y b{color:red} * {box-sizing:border-box}`;
  assert.equal(scopeCss(css), "#rb{--a:1}#rb{scroll-behavior:smooth}#rb{margin:0}#rb .x,#rb .y b{color:red}#rb, #rb *{box-sizing:border-box}");
});
test("scopeCss — theme selectors keep their attribute on #rb", () => {
  const css = `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --p:#000 } } :root[data-theme="dark"] { --p:#000 }`;
  assert.equal(scopeCss(css), `@media (prefers-color-scheme: dark){#rb:not([data-theme="light"]){--p:#000}}#rb[data-theme="dark"]{--p:#000}`);
});
test("scopeCss — nested media recurse, keyframes and comments untouched, commas inside :is() kept", () => {
  const css = `/* c */ @media (min-width: 1600px) { .col .toc { top: 1px } } @keyframes f { 0% { opacity: 0 } 100% { opacity: 1 } } :is(.a, .b) i { x: y }`;
  assert.equal(scopeCss(css), "@media (min-width: 1600px){#rb .col .toc{top: 1px}}@keyframes f{0% { opacity: 0 } 100% { opacity: 1 }}#rb :is(.a, .b) i{x: y}");
});
test("scopeCss — content strings with braces survive", () => {
  assert.equal(scopeCss(`.k::before { content: "{"; }`), `#rb .k::before{content: "{";}`);
});

const RB = (mid) => `<title>🧾 런북 | T-1 제목</title><style>:root{--a:1}</style>
<div class="doc"><div class="col"><nav class="toc"></nav><script>alert(1)</script><h1>제목</h1>
${mid}
<footer>꼬리</footer></div></div>`;
const SECS = `<section id="a1"><div class="shead"><span class="n">A1</span><h2>남은 일</h2></div><p>본문</p></section>
<!-- 사이 주석은 허용 -->
<section id="c"><div class="shead"><span class="n">C</span><h2>결정 로그</h2></div><ul><li><b>#1</b> 첫 결정</li><li class="x"><b>#2</b> 둘</li><li id="keep"><b>#3</b> 셋</li></ul></section>`;

test("splitRunbook — sections, head/foot, scripts·comments dropped, decision anchors", () => {
  const r = splitRunbook(RB(SECS));
  assert.equal(r.title, "🧾 런북 | T-1 제목");
  assert.deepEqual(r.sections.map((s) => [s.id, s.num, s.title]), [["a1", "A1", "남은 일"], ["c", "C", "결정 로그"]]);
  assert.ok(!r.head.includes("<script") && r.head.includes("<h1>제목</h1>") && r.head.startsWith('<div class="doc">'));
  assert.ok(r.foot.includes("<footer>꼬리</footer>") && r.foot.endsWith("</div></div>"));
  const c = r.sections[1].html;
  assert.ok(c.includes('<li id="c-1"><b>#1</b>') && c.includes('<li id="c-2" class="x"><b>#2</b>') && c.includes('<li id="keep"><b>#3</b>'));
  assert.equal(r.css, "#rb{--a:1}");
});
test("splitRunbook — viewer preamble in <head> is ignored", () => {
  const html = `<!doctype html><html><head><style>body{background:#faf9f5}</style></head><body>${RB(SECS)}</body></html>`;
  assert.equal(splitRunbook(html).css, "#rb{--a:1}");
});
test("splitRunbook — content between sections is an error (it would vanish)", () => {
  assert.throws(() => splitRunbook(RB(`<section id="a"></section><p>떠돌이</p><section id="b"></section>`)), /절 밖 내용/);
  assert.throws(() => splitRunbook(RB(`<section id="a"></section><section id="a"></section>`)), /중복/);
  assert.throws(() => splitRunbook(RB(`<section></section>`)), /id 없는/);
});

const local = splitRunbook(RB(SECS));
const h = Object.fromEntries(local.sections.map((s) => [s.id, sha(s.html)]));
const remoteOf = (m, shell = null) => ({ shell, sections: new Map(Object.entries(m).map(([id, [hash, v]]) => [id, { data: { id, hash }, version: v }])) });

test("planPublish — first publish writes every section then meta last", () => {
  const p = planPublish(local, remoteOf({}), null, { now: "N" });
  assert.deepEqual(p.docs.map((d) => `${d.collection}/${d.id}`), ["runbook/a1", "runbook/c", "meta/runbook"]);
  assert.ok(p.docs.at(-1).last && p.docs.at(-1).doc.order.length === 2);
  assert.equal(p.conflicts.length, 0);
  assert.deepEqual(p.nextState.sections, h);
});
test("planPublish — unchanged sections are skipped, untouched remote is overwritten with its version", () => {
  const shell = { ...local, sections: undefined };
  const sh = shellHash({ title: local.title, label: local.label, css: local.css, head: local.head, foot: local.foot });
  const order = local.sections.map((s) => ({ id: s.id, num: s.num, title: s.title }));
  const remote = remoteOf({ a1: [h.a1, 3], c: ["old", 5] }, { data: { hash: sh, order }, version: 9 });
  const p = planPublish(local, remote, { shell: sh, sections: { a1: h.a1, c: "old" } });
  assert.deepEqual(p.unchanged, ["a1"]);
  assert.deepEqual(p.docs.map((d) => [d.id, d.version]), [["c", 5], ["runbook", 9]]);
  void shell;
});
test("planPublish — a section someone else changed since my last publish is a conflict", () => {
  const p = planPublish(local, remoteOf({ a1: ["theirs", 3], c: [h.c, 5] }), { shell: null, sections: { a1: "mine-before", c: h.c } });
  assert.deepEqual(p.conflicts.map((c) => c.id), ["a1"]);
  assert.equal(p.nextState.sections.a1, "mine-before");   // 충돌 절은 기준을 옮기지 않는다
});
test("planPublish — a remote section gone from local is deleted only if untouched", () => {
  const p1 = planPublish(local, remoteOf({ a1: [h.a1, 1], c: [h.c, 1], old: ["o", 7] }), { shell: null, sections: { a1: h.a1, c: h.c, old: "o" } });
  assert.deepEqual(p1.deletes, [{ op: "delete", collection: "runbook", doc_id: "old", if_version: 7 }]);
  const p2 = planPublish(local, remoteOf({ a1: [h.a1, 1], c: [h.c, 1], old: ["edited", 7] }), { shell: null, sections: { a1: h.a1, c: h.c, old: "o" } });
  assert.deepEqual(p2.conflicts.map((c) => c.id), ["old"]);
});
test("planPublish — --adopt takes the remote as the base (another machine published it)", () => {
  const p = planPublish(local, remoteOf({ a1: ["theirs", 3] }), null, { adopt: true });
  assert.equal(p.conflicts.length, 0);
  assert.deepEqual(p.docs.map((d) => d.id), ["a1", "c", "runbook"]);
});
test("planPublish — oversized section is refused", () => {
  const big = { ...local, sections: [{ id: "c", num: "C", title: "c", html: "x".repeat(250 * 1024) }] };
  assert.throws(() => planPublish(big, remoteOf({}), null), /문서 상한/);
});
