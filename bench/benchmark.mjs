/**
 * Baseline vs working tree micro-benchmarks (Phase 2.3).
 *
 *   bun run build && bun bench/benchmark.mjs
 */
import * as baseline from "../tests/baseline/sskr-baseline.mjs";
import * as current from "../dist/index.mjs";

const secret = Uint8Array.from({ length: 32 }, (_, i) => (i * 7 + 3) & 0xff);
const rng = {
  fillRandomData(d) { for (let i = 0; i < d.length; i++) d[i] = (i * 31 + 11) & 0xff; },
  fillBytes(d) { this.fillRandomData(d); },
  nextU32() { throw new Error("unused"); },
  nextU64() { throw new Error("unused"); },
};
const bSpec = baseline.Spec.new(2, [baseline.GroupSpec.new(2, 3), baseline.GroupSpec.new(3, 5)]);
const cSpec = current.Spec.from({ groupThreshold: 2, groups: [current.GroupSpec.from({ memberThreshold: 2, memberCount: 3 }), current.GroupSpec.from({ memberThreshold: 3, memberCount: 5 })] });

function time(fn, iters = 5) {
  fn();
  let best = Infinity;
  for (let i = 0; i < iters; i++) { const t0 = performance.now(); fn(); best = Math.min(best, performance.now() - t0); }
  return best;
}
const cases = {
  "generate [2-of-3, 3-of-5] + combine ×500": [
    () => { for (let i = 0; i < 500; i++) { const s = baseline.sskrGenerateUsing(bSpec, baseline.Secret.new(secret), rng); baseline.sskrCombine([s[0][0], s[0][2], s[1][0], s[1][1], s[1][4]]); } },
    () => { for (let i = 0; i < 500; i++) { const s = current.generateShares(cSpec, current.Secret.from(secret), { rng }); current.combineShares([s[0][0], s[0][2], s[1][0], s[1][1], s[1][4]]); } },
  ],
  "combine from bytes ×500": (() => {
    const bs = baseline.sskrGenerateUsing(bSpec, baseline.Secret.new(secret), rng);
    const pick = [bs[0][0], bs[0][2], bs[1][0], bs[1][1], bs[1][4]];
    return [() => { for (let i = 0; i < 500; i++) baseline.sskrCombine(pick); }, () => { for (let i = 0; i < 500; i++) current.combineShares(pick); }];
  })(),
};
console.log(`${"case".padEnd(40)} ${"baseline".padStart(10)} ${"current".padStart(10)} ${"speedup".padStart(8)}`);
for (const [name, [b, c]] of Object.entries(cases)) {
  const tb = time(b), tc = time(c);
  console.log(`${name.padEnd(40)} ${tb.toFixed(1).padStart(8)}ms ${tc.toFixed(1).padStart(8)}ms ${(tb / tc).toFixed(2).padStart(7)}×`);
}
