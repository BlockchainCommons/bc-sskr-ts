/**
 * Differential harness (Phase 1.3): every corpus recipe is materialised with
 * the frozen baseline bundle (pre-redesign shamir, crypto and rand inlined)
 * AND the working tree; outcomes, including error codes, must be identical.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as baselineMod from "./baseline/sskr-baseline.mjs";
import * as randBaseline from "../../bc-rand-ts/tests/baseline/rand-baseline.mjs";
import * as src from "../src";
import * as rand from "@blockchaincommons/rand";
import {
  materialize,
  baselineAdapterFor,
  redesignedAdapterFor,
  recipeName,
} from "./vectors/recipes";
import { categories } from "./corpus/corpus";

const here = dirname(fileURLToPath(import.meta.url));
const BASELINE_SHA256 = "2b7ab05d04f40d998736408e3ecd3cdabddbd2b994003e2d05a44f7dc9b3874c";

const baseline = baselineAdapterFor(baselineMod, randBaseline);
const current = redesignedAdapterFor(src, rand);

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
      const diffs: string[] = [];
      for (const recipe of gen()) {
        n++;
        const a = materialize(baseline, recipe);
        const b = materialize(current, recipe);
        if (a !== b) diffs.push(`${recipeName(recipe)}: ${a.slice(0, 80)} !== ${b.slice(0, 80)}`);
      }
      expect(n).toBeGreaterThan(0);
      expect(diffs).toEqual([]);
    });
  }
});
