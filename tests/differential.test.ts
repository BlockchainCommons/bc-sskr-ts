/**
 * Differential harness: every corpus recipe is materialised with the frozen
 * baseline bundle (its own shamir and rand inlined) AND the working tree;
 * outcomes, including error codes and wrapped Shamir causes, must be
 * identical except for the allowed differences listed below, each with an
 * asserted hit count. Recipe kinds the baseline cannot run
 * (`BASELINE_UNSUPPORTED`) and categories it cannot take at all
 * (`NO_BASELINE`) are counted and checked against the Rust harness only.
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
  currentAdapterFor,
  recipeName,
} from "./vectors/recipes";
import { categories, NO_BASELINE } from "./corpus/corpus";

const here = dirname(fileURLToPath(import.meta.url));
const BASELINE_SHA256 = "103ef8d089b8a8aa898abf44a1e50a2429dd8d9f24587e327756d1c953dbca95";

const baseline = baselineAdapterFor(baselineMod, randBaseline);
const current = currentAdapterFor(src, rand);

/** The only allowed differences, each keyed by the category it may appear in. */
const ALLOWED_DIFFERENCES: { id: string; category: string; trees: string[]; hits: number }[] = [
  {
    // A spec field that is not a usize (NaN, a fraction, a negative, an
    // infinity, a number above 2^64) is `InvalidParameter` in the tree. The
    // baseline built the spec (`"1.5-of-3"`, `"1-of-NaN"`) or reported a
    // reference code and, on the two generate rows, its inlined shamir
    // leaked a `TypeError` for a fractional group threshold and yielded
    // three shares for a "2.5-member" group.
    id: "spec-field-domain",
    category: "domain",
    trees: ["throw:InvalidParameter"],
    hits: 11,
  },
  {
    // `GroupSpec.parse` of a threshold or count between 2^53 and 2^64 - 1:
    // the reference parses it as a usize and reports `GroupSpec::new`'s
    // code; the baseline's safe-integer gate reported `GroupSpecInvalid`.
    id: "parse-wide-usize",
    category: "parse",
    trees: ["throw:MemberThresholdInvalid", "throw:MemberCountInvalid"],
    hits: 3,
  },
];

describe("differential: baseline vs working tree", () => {
  it("baseline bundle integrity", () => {
    const sha = createHash("sha256")
      .update(readFileSync(join(here, "baseline/sskr-baseline.mjs")))
      .digest("hex");
    expect(sha).toBe(BASELINE_SHA256);
  });
  for (const [name, gen] of Object.entries(categories)) {
    it(`category ${name}`, { timeout: 300_000 }, () => {
      const allowed = ALLOWED_DIFFERENCES.find((d) => d.category === name);
      let n = 0;
      let skipped = 0;
      let allowedHits = 0;
      const diffs: string[] = [];
      const engineErrors: string[] = [];
      for (const recipe of gen()) {
        n++;
        const b = materialize(current, recipe);
        if (name in NO_BASELINE) {
          if (/^throw:(TypeError|RangeError)$/.test(b)) engineErrors.push(recipeName(recipe));
          continue;
        }
        if (BASELINE_UNSUPPORTED.has(recipe.k)) {
          skipped++;
          continue;
        }
        const a = materialize(baseline, recipe);
        if (a === b) continue;
        if (allowed !== undefined && allowed.trees.includes(b)) allowedHits++;
        else diffs.push(`${recipeName(recipe)}: ${a.slice(0, 80)} !== ${b.slice(0, 80)}`);
      }
      expect(n).toBeGreaterThan(0);
      expect(diffs).toEqual([]);
      expect(engineErrors).toEqual([]);
      if (name in NO_BASELINE) expect(n).toBe(NO_BASELINE[name]);
      // The hand-built share headers: the baseline exports no share constructor.
      expect(skipped).toBe(name === "domain" ? 14 : 0);
      if (allowed !== undefined) expect(allowedHits).toBe(allowed.hits);
    });
  }
});
