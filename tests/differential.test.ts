/**
 * Differential harness: every corpus recipe is materialised with the frozen
 * baseline bundle (pre-redesign shamir and rand inlined) AND the working
 * tree; outcomes, including error codes, must be identical except for the
 * enumerated tombstones.
 *
 * - **T1** (JS-only domain): every `domain` recipe throws
 *   `InvalidParameter` in the tree. On the two `generate` rows, the
 *   baseline's inlined pre-redesign shamir leaks a `TypeError` for a
 *   fractional threshold and silently yields one share for a "2.5-member"
 *   group, where the tree's shamir throws `InvalidParameter`, wrapped here
 *   as `Shamir`. That count is pinned.
 * - **T2** (zero member threshold): the baseline accepts `1/[0-of-1]`
 *   (`gc=1,sc=1`); the tree rejects it (`MemberThresholdInvalid`).
 *
 * Recipe kinds the baseline cannot run (`BASELINE_UNSUPPORTED`) are skipped
 * and counted.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as baselineMod from "./baseline/sskr-baseline.mjs";
import * as randBaseline from "./baseline/rand-baseline.mjs";
import * as src from "../src";
import * as rand from "@blockchaincommons/rand";
import {
  BASELINE_UNSUPPORTED,
  materialize,
  baselineAdapterFor,
  redesignedAdapterFor,
  recipeName,
  type Recipe,
} from "./vectors/recipes";
import { categories } from "./corpus/corpus";

const here = dirname(fileURLToPath(import.meta.url));
const BASELINE_SHA256 = "103ef8d089b8a8aa898abf44a1e50a2429dd8d9f24587e327756d1c953dbca95";

const baseline = baselineAdapterFor(baselineMod, randBaseline);
const current = redesignedAdapterFor(src, rand);

const TOMBSTONES = {
  T1: {
    landed: true,
    category: "domain",
    tree: "throw:InvalidParameter",
    beforeLanding: { tree: "throw:Shamir", rows: 2 },
  },
  T2: {
    landed: true,
    matches: (r: Recipe) =>
      (r.k === "spec" && r.spec.groups.some((g) => g.mt === 0)) ||
      (r.k === "parse" && /^\+?0+-of-/.test(r.s)),
    tree: "throw:MemberThresholdInvalid",
  },
  // T3: `GroupSpec.parse` of a threshold or count between 2^53 and 2^64 − 1.
  // The reference parses it as a `usize` and reports `GroupSpec::new`'s code;
  // the baseline's safe-integer gate reported `GroupSpecInvalid`.
  T3: {
    landed: true,
    matches: (r: Recipe) =>
      r.k === "parse" &&
      r.s
        .split("-")
        .filter((p) => /^\+?\d+$/.test(p))
        .some(
          (p) => BigInt(p) > BigInt(Number.MAX_SAFE_INTEGER) && BigInt(p) <= 0xffffffffffffffffn,
        ),
    trees: new Set(["throw:MemberThresholdInvalid", "throw:MemberCountInvalid"]),
    rows: 3,
  },
};

describe("differential: baseline vs working tree", () => {
  it("baseline bundle integrity", () => {
    const sha = createHash("sha256")
      .update(readFileSync(join(here, "baseline/sskr-baseline.mjs")))
      .digest("hex");
    expect(sha).toBe(BASELINE_SHA256);
  });
  for (const [name, gen] of Object.entries(categories)) {
    it(`category ${name}`, { timeout: 300_000 }, () => {
      let n = 0;
      let skipped = 0;
      let t1 = 0;
      let t2 = 0;
      let t3 = 0;
      const diffs: string[] = [];
      const { T1, T2, T3 } = TOMBSTONES;
      const t1Accepted = T1.landed ? T1.tree : T1.beforeLanding.tree;
      for (const recipe of gen()) {
        n++;
        if (BASELINE_UNSUPPORTED.has(recipe.k)) {
          skipped++;
          continue;
        }
        const a = materialize(baseline, recipe);
        const b = materialize(current, recipe);
        if (a === b) continue;
        if (name === T1.category && b === t1Accepted) t1++;
        else if (T2.landed && T2.matches(recipe) && b === T2.tree) t2++;
        else if (T3.landed && T3.matches(recipe) && T3.trees.has(b)) t3++;
        else diffs.push(`${recipeName(recipe)}: ${a.slice(0, 80)} !== ${b.slice(0, 80)}`);
      }
      expect(n).toBeGreaterThan(0);
      expect(diffs).toEqual([]);
      if (name === "domain") {
        expect(skipped).toBe(14);
        expect(t1).toBe(T1.landed ? n - skipped : T1.beforeLanding.rows);
      } else {
        expect(skipped).toBe(0);
      }
      if (T2.landed && (name === "specs" || name === "parse")) expect(t2).toBe(1);
      if (T3.landed && name === "parse") expect(t3).toBe(T3.rows);
    });
  }
});
