/**
 * Golden snapshots (Phase 0.2): seeded generation for the plan's spec list at
 * lengths 16 and 32, combine from minimal and over-complete subsets, and
 * every error code for invalid specs, secrets and share sets.
 */
import * as src from "../src";
import * as rand from "@blockchaincommons/rand";
import { materialize, redesignedAdapterFor, type Recipe, type SpecShape } from "./vectors/recipes";
import { SEEDS, categories } from "./corpus/corpus";

const api = redesignedAdapterFor(src, rand);
const run = (r: Recipe) => materialize(api, r);
const g = (mt: number, mc: number) => ({ mt, mc });
const SPECS: [string, SpecShape][] = [
  ["1-of-1", { gt: 1, groups: [g(1, 1)] }],
  ["1-of-3", { gt: 1, groups: [g(1, 3)] }],
  ["2-of-3", { gt: 1, groups: [g(2, 3)] }],
  ["3-of-5", { gt: 1, groups: [g(3, 5)] }],
  ["2-of-7", { gt: 1, groups: [g(2, 7)] }],
  ["[2-of-3, 2-of-3] gt=2", { gt: 2, groups: [g(2, 3), g(2, 3)] }],
  ["[1-of-1, 3-of-5, 2-of-3] gt=2", { gt: 2, groups: [g(1, 1), g(3, 5), g(2, 3)] }],
  ["16 groups of 16", { gt: 16, groups: Array.from({ length: 16 }, () => g(16, 16)) }],
];

describe("golden: generation", () => {
  for (const [name, spec] of SPECS) {
    it(name, () => {
      expect(
        [16, 32].map((len) =>
          run({ k: "generate", spec, secret: { cycle: len, start: 1 }, rng: SEEDS[0]! }),
        ),
      ).toMatchSnapshot();
    });
  }
});
describe("golden: combine", () => {
  it("minimal and over-complete subsets of [2-of-3, 2-of-3] gt=2", () => {
    const from = {
      spec: { gt: 2, groups: [g(2, 3), g(2, 3)] },
      secret: { cycle: 16, start: 1 },
      rng: SEEDS[0]!,
    };
    const picks: [number, number][][] = [
      [
        [0, 0],
        [0, 1],
        [1, 0],
        [1, 1],
      ],
      [
        [0, 0],
        [0, 1],
        [0, 2],
        [1, 0],
        [1, 1],
        [1, 2],
      ],
      [
        [0, 2],
        [1, 2],
        [0, 0],
        [1, 0],
      ],
      [
        [0, 0],
        [0, 1],
      ],
      [
        [0, 0],
        [1, 1],
      ],
    ];
    expect(picks.map((pick) => run({ k: "combine", from, pick }))).toMatchSnapshot();
  });
});
describe("golden: error codes", () => {
  for (const cat of ["parse", "specs", "secrets"]) {
    it(cat, () => {
      const out: string[] = [];
      for (const r of categories[cat]!()) out.push(`${JSON.stringify(r)} → ${run(r)}`);
      expect(out).toMatchSnapshot();
    });
  }
  it("share sets", () => {
    const out: string[] = [];
    for (const r of categories["combine"]!())
      if (r.k === "combine" && "shares" in r) out.push(`${r.shares.length} shares → ${run(r)}`);
    expect(out).toMatchSnapshot();
  });
});
