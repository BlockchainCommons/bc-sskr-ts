/**
 * Property tests: any quorum-satisfying subset recovers; missing
 * one group's quorum fails with NotEnoughGroups; GroupSpec.parse round-trips
 * toString; share headers round-trip.
 */
import fc from "fast-check";
import * as src from "../src";
import * as rand from "@blockchaincommons/rand";
import { redesignedAdapterFor, hex } from "./vectors/recipes";

/** A spec shape whose fields are plain numbers (the recipe type also allows `NaN` spelled as a string). */
interface NumericShape {
  gt: number;
  groups: { mt: number; mc: number }[];
}

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
const shape: fc.Arbitrary<NumericShape> = fc
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
          const grp = sp.groups[gi];
          for (let m = 0; m < grp.mt; m++) chosen.push(groups[gi][(pick + m) % grp.mc]);
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
            const grp = sp.groups[gi];
            const take = !shorted && grp.mt > 1 ? grp.mt - 1 : grp.mt;
            if (take < grp.mt) shorted = true;
            for (let m = 0; m < take; m++) chosen.push(groups[gi][m]);
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
  const nonUsize = fc.oneof(
    fc.constantFrom(NaN, Infinity, -Infinity),
    fc.double({ noInteger: true, noNaN: true }),
    fc.integer({ max: -1 }),
  );
  const isInvalidParameter = (f: () => unknown, parameter: string): boolean => {
    try {
      f();
      return false;
    } catch (e) {
      return (
        src.SskrError.isSskrError(e) &&
        e.is("InvalidParameter") &&
        e.details.code === "InvalidParameter" &&
        e.details.parameter === parameter
      );
    }
  };
  it("every non-integer or out-of-range spec or header field throws InvalidParameter", () => {
    fc.assert(
      fc.property(
        nonUsize,
        fc.integer({ min: 1, max: 16 }),
        (v, n) =>
          isInvalidParameter(
            () => src.GroupSpec.from({ memberThreshold: v, memberCount: n }),
            "memberThreshold",
          ) &&
          isInvalidParameter(
            () => src.GroupSpec.from({ memberThreshold: 1, memberCount: v }),
            "memberCount",
          ) &&
          isInvalidParameter(
            () => src.Spec.from({ groupThreshold: v, groups: [src.GroupSpec.DEFAULT] }),
            "groupThreshold",
          ),
      ),
    );
    const base = src.generateShares(
      src.Spec.from({ groupThreshold: 1, groups: [src.GroupSpec.DEFAULT] }),
      src.Secret.from(new Uint8Array(16)),
      { rng: rand.SeededRng.forTesting() },
    )[0][0];
    const outOfWidth = fc.oneof(nonUsize, fc.integer({ min: 0x10000, max: 0x1ffff }));
    const outOfNibble = fc.oneof(nonUsize, fc.integer({ min: 16, max: 1000 }));
    const outOfCount = fc.oneof(nonUsize, fc.constant(0), fc.integer({ min: 17, max: 1000 }));
    fc.assert(
      fc.property(
        outOfWidth,
        outOfNibble,
        outOfCount,
        (id, ix, ct) =>
          isInvalidParameter(() => src.shareBytes({ ...base, identifier: id }), "identifier") &&
          isInvalidParameter(() => src.shareBytes({ ...base, groupIndex: ix }), "groupIndex") &&
          isInvalidParameter(() => src.shareBytes({ ...base, memberIndex: ix }), "memberIndex") &&
          isInvalidParameter(
            () => src.shareBytes({ ...base, memberThreshold: ct }),
            "memberThreshold",
          ),
      ),
    );
  });
  it("generateShares returns exactly spec.shareCount shares", () => {
    fc.assert(
      fc.property(shape, secret, seed, (sp, s, sd) => {
        const groups = api.generate(sp, s, rngOf(sd));
        const expected = sp.groups.reduce((sum, g) => sum + g.mc, 0);
        return groups.reduce((sum, g) => sum + g.length, 0) === expected;
      }),
      { numRuns: 100 },
    );
  });
  it("mutating secret.bytes does not change the secret", () => {
    fc.assert(
      fc.property(secret, fc.nat(), fc.integer({ min: 1, max: 255 }), (s, pos, mask) => {
        const a = src.Secret.from(s);
        const b = src.Secret.from(s);
        const view = a.bytes;
        view[pos % view.length] ^= mask;
        return a.equals(b) && a.bytes[pos % view.length] === s[pos % view.length];
      }),
      { numRuns: 100 },
    );
  });
});
