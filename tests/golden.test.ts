/**
 * Golden snapshots: seeded generation for a fixed spec list at lengths 16
 * and 32, combine from minimal and over-complete subsets, every error code
 * for invalid specs, secrets and share sets, and freeze entries for the
 * JS-only input domain and the mutability holes.
 */
import * as src from "../src";
import * as rand from "@blockchaincommons/rand";
import {
  hex,
  materialize,
  redesignedAdapterFor,
  type Recipe,
  type SpecShape,
} from "./vectors/recipes";
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

/**
 * Freeze additions: what the spec constructors, `shareBytes` and the value
 * objects do, recorded verbatim so a regression is a visible diff.
 */
describe("golden: freeze additions", () => {
  const outcome = (f: () => unknown): string => {
    try {
      const r = f();
      return typeof r === "string" ? r : JSON.stringify(r);
    } catch (e) {
      const code = src.SskrError.isSskrError(e) ? e.code : (e as Error).constructor.name;
      return `throw:${code}:${(e as Error).message}`;
    }
  };
  const secret = () => src.Secret.from(Uint8Array.from({ length: 16 }, (_, i) => i + 1));
  const rng = () => rand.SeededRng.forTesting();
  const group = (mt: number, mc: number) =>
    outcome(() => src.GroupSpec.from({ memberThreshold: mt, memberCount: mc }).toString());

  it("B1: non-integer spec fields", () => {
    expect([
      `GroupSpec 1.5-of-3: ${group(1.5, 3)}`,
      `GroupSpec 1-of-NaN: ${group(1, NaN)}`,
      `GroupSpec -1-of-3: ${group(-1, 3)}`,
      `GroupSpec 2-of-2.5: ${group(2, 2.5)}`,
      `GroupSpec 2-of-Infinity: ${group(2, Infinity)}`,
      `Spec groupThreshold NaN: ${outcome(() => `gc=${src.Spec.from({ groupThreshold: NaN, groups: [src.GroupSpec.DEFAULT] }).groupCount}`)}`,
      `generate groupThreshold 1.5 of two groups: ${outcome(() => {
        const spec = src.Spec.from({
          groupThreshold: 1.5,
          groups: [src.GroupSpec.DEFAULT, src.GroupSpec.DEFAULT],
        });
        return `${src.generateShares(spec, secret(), { rng: rng() }).length} groups`;
      })}`,
      `generate 1-of-2.5: ${outcome(() => {
        const spec = src.Spec.from({
          groupThreshold: 1,
          groups: [src.GroupSpec.from({ memberThreshold: 1, memberCount: 2.5 })],
        });
        return `${src.generateShares(spec, secret(), { rng: rng() })[0]?.length} shares`;
      })}`,
    ]).toMatchSnapshot();
  });

  it("B2: a zero member threshold", () => {
    expect([
      `GroupSpec 0-of-3: ${group(0, 3)}`,
      `GroupSpec.parse("0-of-3"): ${outcome(() => src.GroupSpec.parse("0-of-3").toString())}`,
      `generate with 0-of-3: ${outcome(() => {
        const spec = src.Spec.from({
          groupThreshold: 1,
          groups: [src.GroupSpec.from({ memberThreshold: 0, memberCount: 3 })],
        });
        return `${src.generateShares(spec, secret(), { rng: rng() })[0]?.length} shares`;
      })}`,
    ]).toMatchSnapshot();
  });

  it("B3: shareBytes header fields outside their width", () => {
    const spec = src.Spec.from({
      groupThreshold: 1,
      groups: [src.GroupSpec.from({ memberThreshold: 2, memberCount: 3 })],
    });
    const share = src.generateShares(spec, secret(), { rng: rng() })[0]![0]!;
    const header = (patch: Partial<src.SskrShare>) =>
      outcome(() => hex(src.shareBytes({ ...share, ...patch }).subarray(0, 5)));
    expect([
      `as generated: ${header({})}`,
      `identifier 0x1ffff: ${header({ identifier: 0x1ffff })}`,
      `identifier -1: ${header({ identifier: -1 })}`,
      `groupIndex 17: ${header({ groupIndex: 17 })}`,
      `groupThreshold 17: ${header({ groupThreshold: 17 })}`,
      `groupCount 0: ${header({ groupCount: 0 })}`,
      `memberThreshold 0: ${header({ memberThreshold: 0 })}`,
      `memberIndex 1.5: ${header({ memberIndex: 1.5 })}`,
      `memberIndex NaN: ${header({ memberIndex: NaN })}`,
      `groupThreshold 2 over groupCount 1: ${header({ groupThreshold: 2, groupCount: 1 })}`,
    ]).toMatchSnapshot();
  });

  it("A1/A2: aliasing and mutability of the value objects", () => {
    const a = secret();
    const b = secret();
    const equalBefore = a.equals(b);
    b.bytes[0] = 0;
    const spec = src.Spec.from({
      groupThreshold: 1,
      groups: [src.GroupSpec.DEFAULT, src.GroupSpec.DEFAULT],
    });
    const pushed = outcome(() => {
      (spec.groups as src.GroupSpec[]).push(src.GroupSpec.DEFAULT);
      return `groupCount after push=${spec.groupCount}`;
    });
    const share = src.generateShares(spec, secret(), { rng: rng() })[0]![0]!;
    expect([
      `secret.bytes aliases the secret: equal before=${equalBefore}, after mutating bytes[0]=${a.equals(b)}`,
      `spec.groups push: ${pushed}`,
      `frozen: spec=${Object.isFrozen(spec)} groups=${Object.isFrozen(spec.groups)} DEFAULT=${Object.isFrozen(src.GroupSpec.DEFAULT)} share=${Object.isFrozen(share)}`,
    ]).toMatchSnapshot();
  });
});
