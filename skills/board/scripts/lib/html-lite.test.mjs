import { test } from "node:test";
import assert from "node:assert/strict";
import { parse, q, qa, text, norm, kids } from "./html-lite.mjs";

test("parses nested tags, attrs, entities, void and self-closing", () => {
  const root = parse(`<div class="a b"><p>x &amp; y<br>z</p><img src="i.png"/><span class='k'>&#39;q&#39; &nbsp;</span></div>`);
  const div = q(root, "div.a.b"); assert.ok(div);
  assert.equal(norm(text(q(root, "p"))), "x & y z".replace(" z", "z") === "" ? "" : "x & yz");
  assert.equal(text(q(root, "span.k")), "'q'  ");
  assert.equal(q(root, "img").attrs.src, "i.png");
});
test("table structure and kids", () => {
  const root = parse(`<table class="matrix"><thead><tr><th>A</th><th>B (9/1~7)</th></tr></thead><tbody><tr><td class="key">T1<small>svc</small></td><td class="na">—</td></tr></tbody></table>`);
  const ths = qa(root, "th"); assert.equal(ths.length, 2); assert.equal(text(ths[1]), "B (9/1~7)");
  const tr = qa(q(root, "tbody"), "tr")[0]; assert.equal(kids(tr, "td").length, 2);
  assert.equal(norm(text(kids(tr, "td")[0], { skip: (n) => n.tag === "small" })), "T1");
});
test("skips comments, script and style", () => {
  const root = parse(`<!-- c --><style>.x{}</style><script>if (a < b) {}</script><b>ok</b>`);
  assert.equal(text(q(root, "b")), "ok"); assert.equal(qa(root, "b").length, 1);
});
