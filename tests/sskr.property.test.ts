/**
 * Property tests: any quorum-satisfying subset recovers; missing
 * one group's quorum fails with NotEnoughGroups; GroupSpec.parse round-trips
 * toString; share headers round-trip.
 */
import fc from "fast-check";
import * as src from "../src";
import * as rand from "@blockchaincommons/rand";
import { currentAdapterFor, hex } from "./vectors/recipes";

/** A spec shape whose fields are plain numbers (the recipe type also allows `NaN` spelled as a string). */
interface NumericShape {
  gt: number;
  groups: { mt: number; mc: number }[];
}

const api = currentAdapterFor(src, rand);
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
  /** Values outside the usize domain in either of its TypeScript forms. */
  const nonUsize = fc.oneof(
    fc.constantFrom(NaN, Infinity, -Infinity, null, undefined, "2", 2 ** 65, 1e300),
    fc.double({ noInteger: true, noNaN: true }),
    fc.integer({ max: -1 }),
    fc.bigInt({ max: -1n }),
    fc.bigInt({ min: 1n << 64n }),
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
  it("a member threshold above 16 in either form is MemberThresholdInvalid up to 2^64", () => {
    const wide = fc.oneof(
      fc.bigInt({ min: 17n, max: (1n << 64n) - 1n }),
      fc.integer({ min: 17, max: 2 ** 31 }).map((n) => n * 2 ** 33), // integer-valued doubles up to 2^64
    );
    fc.assert(
      fc.property(wide, fc.integer({ min: 1, max: 16 }), (mt, mc) => {
        try {
          src.GroupSpec.from({ memberThreshold: mt, memberCount: mc });
          return false;
        } catch (e) {
          return src.SskrError.isSskrError(e) && e.code === "MemberThresholdInvalid";
        }
      }),
      { numRuns: 200 },
    );
  });
  it("number and bigint spec fields generate identical shares", () => {
    fc.assert(
      fc.property(shape, secret, seed, (sp, s, sd) => {
        const asBigints = {
          gt: `${BigInt(sp.gt)}n` as const,
          groups: sp.groups.map((g) => ({
            mt: `${BigInt(g.mt)}n` as const,
            mc: `${BigInt(g.mc)}n` as const,
          })),
        };
        const a = api.generate(sp, s, rngOf(sd)).flat().map(hex).join(",");
        const b = api.generate(asBigints, s, rngOf(sd)).flat().map(hex).join(",");
        return a === b;
      }),
      { numRuns: 60 },
    );
  });
  /** A deliberately ill-typed argument, as a JavaScript caller can pass one. */
  const ill = (v: unknown): number => v as number;
  it("every spec or header field outside its domain throws InvalidParameter", () => {
    fc.assert(
      fc.property(
        nonUsize,
        fc.integer({ min: 1, max: 16 }),
        (v, n) =>
          isInvalidParameter(
            () => src.GroupSpec.from({ memberThreshold: ill(v), memberCount: n }),
            "memberThreshold",
          ) &&
          isInvalidParameter(
            () => src.GroupSpec.from({ memberThreshold: 1, memberCount: ill(v) }),
            "memberCount",
          ) &&
          isInvalidParameter(
            () => src.Spec.from({ groupThreshold: ill(v), groups: [src.GroupSpec.DEFAULT] }),
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
          isInvalidParameter(
            () => src.shareBytes({ ...base, identifier: ill(id) }),
            "identifier",
          ) &&
          isInvalidParameter(
            () => src.shareBytes({ ...base, groupIndex: ill(ix) }),
            "groupIndex",
          ) &&
          isInvalidParameter(
            () => src.shareBytes({ ...base, memberIndex: ill(ix) }),
            "memberIndex",
          ) &&
          isInvalidParameter(
            () => src.shareBytes({ ...base, memberThreshold: ill(ct) }),
            "memberThreshold",
          ),
      ),
    );
  });
  it("a share object at any position has exactly the outcome of its bytes", () => {
    const base = src
      .generateShares(
        src.Spec.from({
          groupThreshold: 2,
          groups: [src.GroupSpec.parse("2-of-3"), src.GroupSpec.parse("2-of-3")],
        }),
        src.Secret.from(Uint8Array.from({ length: 16 }, (_, i) => i + 1)),
        { rng: rand.SeededRng.forTesting() },
      )
      .flat();
    const validBytes = base.map((s) => src.shareBytes(s));
    const corrupted = fc
      .tuple(fc.constantFrom(...validBytes), fc.nat({ max: 5 }), fc.integer({ min: 1, max: 255 }))
      .map(([b, i, mask]) => {
        const c = new Uint8Array(b);
        c[i] ^= mask;
        return c;
      });
    const field = (max: number) =>
      fc.option(fc.oneof(fc.integer({ min: -1, max: max + 1 }), fc.constant(1.5)), {
        nil: undefined,
      });
    const object = fc
      .record({
        share: fc.constantFrom(...base),
        identifier: fc.option(fc.constantFrom(-1, 0x10000, 0x7eb5), { nil: undefined }),
        groupIndex: field(16),
        groupThreshold: field(17),
        groupCount: field(17),
        memberIndex: field(16),
        memberThreshold: field(17),
        value: fc.option(fc.constantFrom(src.Secret.from(new Uint8Array(18))), { nil: undefined }),
      })
      .map(({ share, ...patch }) => {
        const out: Record<string, unknown> = { ...share };
        for (const [k, v] of Object.entries(patch)) if (v !== undefined) out[k] = v;
        return out as unknown as src.SskrShare;
      });
    const element = fc.oneof(fc.constantFrom(...validBytes), corrupted, object);
    const outcome = (f: () => src.Secret): string => {
      try {
        return hex(f().bytes);
      } catch (e) {
        return src.SskrError.isSskrError(e)
          ? `throw:${e.code}`
          : `engine:${(e as Error).constructor.name}`;
      }
    };
    fc.assert(
      fc.property(fc.array(element, { minLength: 1, maxLength: 8 }), (xs) => {
        // The oracle walks the array in order: bytes are parsed, an object is
        // serialised then parsed; the first error wins; otherwise the bytes combine.
        const oracle = outcome(() => {
          const parsed = xs.map((x) =>
            src.parseShare(x instanceof Uint8Array ? x : src.shareBytes(x)),
          );
          return src.combineShares(parsed.map((p) => src.shareBytes(p)));
        });
        return outcome(() => src.combineShares(xs)) === oracle;
      }),
      { numRuns: 300 },
    );
  });
  it("any value at any argument position is a success or an SskrError, never an engine error", () => {
    const spec = src.Spec.from({ groupThreshold: 1, groups: [src.GroupSpec.DEFAULT] });
    const secret = src.Secret.from(new Uint8Array(16));
    const rng = () => rand.SeededRng.forTesting();
    const noEngineError = (f: () => unknown): boolean => {
      try {
        f();
        return true;
      } catch (e) {
        return src.SskrError.isSskrError(e);
      }
    };
    // The generator itself is rand's contract, checked there; no `rng` key here.
    const options = fc
      .anything()
      .filter((v) => !(typeof v === "object" && v !== null && "rng" in v));
    fc.assert(
      fc.property(fc.anything(), options, (v, o) => {
        const x = v as never;
        return (
          noEngineError(() => src.Secret.from(x)) &&
          noEngineError(() => src.Secret.fromText(x)) &&
          noEngineError(() => src.GroupSpec.from(x)) &&
          noEngineError(() => src.GroupSpec.parse(x)) &&
          noEngineError(() => src.Spec.from(x)) &&
          noEngineError(() => src.Spec.from({ groupThreshold: 1, groups: x })) &&
          noEngineError(() => src.Spec.from({ groupThreshold: 1, groups: [x] })) &&
          noEngineError(() => src.parseShare(x)) &&
          noEngineError(() => src.shareBytes(x)) &&
          noEngineError(() => src.combineShares(x)) &&
          noEngineError(() => src.combineShares([x])) &&
          noEngineError(() => src.generateShares(x, secret, { rng: rng() })) &&
          noEngineError(() => src.generateShares(spec, x, { rng: rng() })) &&
          noEngineError(() => src.generateShares(spec, secret, o as never)) &&
          noEngineError(() => secret.equals(v))
        );
      }),
      { numRuns: 300 },
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
