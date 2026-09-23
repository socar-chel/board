import { test } from "node:test";
import assert from "node:assert/strict";
import { weekColumns, parseHeader, colForDate, colLabelWithRange, addDays } from "./dates.mjs";

test("weekColumns: 7-day windows from the given start", () => {
  const cols = weekColumns("2026-09-15", 3);
  assert.equal(cols.length, 3);
  assert.deepEqual([cols[0].start, cols[0].end], ["2026-09-15", "2026-09-21"]);
  assert.deepEqual([cols[2].start, cols[2].end], ["2026-09-29", "2026-10-05"]);
  assert.equal(colLabelWithRange(cols[0]), "W1 (9/15~9/21)");
});
test("parseHeader: same-month range", () => {
  assert.deepEqual(parseHeader("Phase 1 핵심 경로 (9/10~17)", { year: 2026 }), { label: "Phase 1 핵심 경로", start: "2026-09-10", end: "2026-09-17", note: "" });
});
test("parseHeader: cross-month range with trailing note", () => {
  assert.deepEqual(parseHeader("Phase 3 CBT·오픈 (9/28~10/8 · 10/13)", { year: 2026 }), { label: "Phase 3 CBT·오픈", start: "2026-09-28", end: "2026-10-08", note: "10/13" });
});
test("parseHeader: no range, year rollover", () => {
  assert.deepEqual(parseHeader("Phase 0 선행"), { label: "Phase 0 선행", start: null, end: null, note: "" });
  assert.deepEqual(parseHeader("연말 (12/20~1/10)", { year: 2026 }).end, "2027-01-10");
});
test("colForDate picks the containing column", () => {
  const cols = [{ id: "unset", label: "미정" }, ...weekColumns("2026-09-15", 2)];
  assert.equal(colForDate(cols, "2026-09-23").id, "w2");
  assert.equal(colForDate(cols, "2026-10-01"), null);
  assert.equal(addDays("2026-02-28", 1), "2026-03-01");
});
