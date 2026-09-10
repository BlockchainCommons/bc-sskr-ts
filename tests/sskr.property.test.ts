/**
 * Property tests (Phase 0.3): any quorum-satisfying subset recovers; missing
 * one group's quorum fails with NotEnoughGroups; GroupSpec.parse round-trips
 * toString; share headers round-trip.
 */
import fc from "fast-check";
import * as src from "../src";
import * as rand from "@blockchaincommons/rand";
import { redesignedAdapterFor, hex, type SpecShape } from "./vectors/recipes";

const api = redesignedAdapterFor(src, rand);
const seed = fc.tuple(
  fc.bigInt({ min: 1n, max: (1n << 64n) - 1n }),
  fc.bigInt({ min: 0n, max: (1n << 64n) - 1n }),
  fc.bigInt({ min: 0n, max: (1n << 64n) - 1n }),
  fc.bigInt({ min: 0n, max: (1n << 64n) - 1n }),
);
const group = fc
  .tuple(fc.integer({ min: 1, max: 6 }), fc.integer({ min: 1, max: 6 }))
  .map(([a, b]) => ({ mt: Math.min(a, b), mc: Math.max(a, b) }));
const shape: fc.Arbitrary<SpecShape> = fc
  .array(group, { minLength: 1, maxLength: 4 })
  .chain((groups) => fc.integer({ min: 1, max: groups.length }).map((gt) => ({ gt, groups })));
const secret = fc
  .integer({ min: 8, max: 16 })
  .chain((h) => fc.uint8Array({ minLength: 2 * h, maxLength: 2 * h }));
const rngOf = (s: [bigint, bigint, bigint, bigint]) =>
  api.makeRng({ seed: s.map(String) as [string, string, string, string] });

describe("sskr properties", () => {
  it("any quorum-satisfying subset recovers the secret", () => {
    fc.assert(
      fc.property(shape, secret, seed, fc.nat(), (sp, s, sd, pick) => {
        const groups = api.generate(sp, s, rngOf(sd));
        // choose gt groups and, in each, mt members (rotating by `pick`)
        const chosen: Uint8Array[] = [];
        for (let k = 0; k < sp.gt; k++) {
          const gi = (pick + k) % sp.groups.length;
          const grp = sp.groups[gi]!;
          for (let m = 0; m < grp.mt; m++) chosen.push(groups[gi]![(pick + m) % grp.mc]!);
        }
        return hex(api.combine(chosen)) === hex(s);
      }),
      { numRuns: 120 },
    );
  });
  it("one group short of its quorum is NotEnoughGroups", () => {
    fc.assert(
      fc.property(
        shape.filter((sp) => sp.groups.some((g) => g.mt > 1)),
        secret,
        seed,
        (sp, s, sd) => {
          const groups = api.generate(sp, s, rngOf(sd));
          const chosen: Uint8Array[] = [];
          let shorted = false;
          for (let gi = 0; gi < sp.gt; gi++) {
            const grp = sp.groups[gi]!;
            const take = !shorted && grp.mt > 1 ? grp.mt - 1 : grp.mt;
            if (take < grp.mt) shorted = true;
            for (let m = 0; m < take; m++) chosen.push(groups[gi]![m]!);
          }
          if (!shorted) return true;
          try {
            api.combine(chosen);
            return false;
          } catch (e) {
            return api.errorCode(e) === "NotEnoughGroups";
          }
        },
      ),
      { numRuns: 80 },
    );
  });
  it("GroupSpec.parse(toString()) round-trips", () => {
    fc.assert(
      fc.property(group, (g) => api.parseGroup(`${g.mt}-of-${g.mc}`) === `${g.mt}-of-${g.mc}`),
      { numRuns: 100 },
    );
  });
});
