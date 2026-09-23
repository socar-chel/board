// Fractional index — 두 키 사이에 항상 새 키를 만들 수 있는 문자열 순서 키.
// 드롭 한 번이 카드 한 장의 update로 끝나야 하므로(정수 재번호는 칸 전체를 다시 쓴다) 이 방식을 쓴다.
// ORDER-BEGIN…END 블록은 templates/board.html에 그대로 복제된다 — order.test.mjs가 동일성을 검사한다.
/*ORDER-BEGIN*/
const ORD_DIGITS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const ORD_BASE = ORD_DIGITS.length;
function ordVal(ch) { const v = ORD_DIGITS.indexOf(ch); if (v < 0) throw new Error("order: bad digit " + ch); return v; }
// a < b 인 두 키 사이의 키. a=null 은 -∞, b=null 은 +∞. 결과는 '0'으로 끝나지 않는다(그래야 그 앞에 또 넣을 수 있다).
function between(a, b) {
  a = a || "";
  if (b != null && a !== "" && !(a < b)) throw new Error("order: a must be < b (" + a + " >= " + b + ")");
  if (b === "") throw new Error("order: b must not be empty");
  let out = "", i = 0, hi = b;
  for (;;) {
    const da = i < a.length ? ordVal(a[i]) : 0;
    const db = hi == null ? ORD_BASE : (i < hi.length ? ordVal(hi[i]) : ORD_BASE);
    if (hi != null && i >= hi.length) throw new Error("order: b is a prefix of a");
    if (db - da > 1) return out + ORD_DIGITS[Math.floor((da + db) / 2)];
    out += ORD_DIGITS[da];
    if (db - da === 1) hi = null;
    i++;
  }
}
function ordFirst() { return between(null, null); }
function ordCompare(x, y) { return x < y ? -1 : x > y ? 1 : 0; }
/*ORDER-END*/
export { between, ordFirst, ordCompare, ORD_DIGITS };
