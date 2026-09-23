import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { between, ordFirst } from "./order.mjs";

const here = dirname(fileURLToPath(import.meta.url));

test("first key is a middle digit", () => assert.equal(ordFirst(), "V"));
test("between null and key, key and null", () => {
  const f = ordFirst();
  const before = between(null, f), after = between(f, null);
  assert.ok(before < f && f < after);
  assert.equal(before, "F"); assert.equal(after, "k");
});
test("adjacent digits extend the key", () => {
  const k = between("a0V", "a0W");
  assert.ok("a0V" < k && k < "a0W");
});
test("never ends with 0 and stays ordered under repeated inserts", () => {
  let lo = null, hi = null, prev = null;
  for (let i = 0; i < 200; i++) {            // 계속 맨 앞에 끼워 넣기
    const k = between(lo, hi); assert.ok(!k.endsWith("0"));
    if (prev !== null) assert.ok(k < prev);
    hi = k; prev = k;
  }
  lo = null; hi = null; prev = null;
  for (let i = 0; i < 200; i++) {            // 계속 맨 뒤에 붙이기
    const k = between(lo, hi); assert.ok(!k.endsWith("0"));
    if (prev !== null) assert.ok(k > prev);
    lo = k; prev = k;
  }
});
test("rejects reversed and prefix inputs", () => {
  assert.throws(() => between("b", "a"));
  assert.throws(() => between("ab", "a"));
});
test("html inline copy matches lib", () => {
  const lib = readFileSync(join(here, "order.mjs"), "utf8");
  const html = readFileSync(join(here, "..", "..", "templates", "board.html"), "utf8");
  const pick = (s) => s.match(/\/\*ORDER-BEGIN\*\/([\s\S]*?)\/\*ORDER-END\*\//)?.[1];
  assert.ok(pick(lib) && pick(html), "markers present");
  assert.equal(pick(html).trim(), pick(lib).trim());
});
