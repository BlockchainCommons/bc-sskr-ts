/**
 * Vector recipes: a recipe names an operation and its inputs; `materialize`
 * runs it through a `VectorApi` and returns one outcome string, so the same
 * recipe drives the golden file, the differential and the Rust harness.
 * Adapters bridge the pre- and post-redesign surfaces.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

export type Bytes = { hex: string } | { cycle: number; start?: number } | { text: string };
/**
 * A JavaScript `number` that must survive JSON: `NaN` and the infinities
 * have no JSON form, so they travel as strings.
 */
export type Num = number | "NaN" | "Infinity" | "-Infinity";
export const num = (v: Num): number => (typeof v === "number" ? v : Number(v));
export type RngSpec = { seed: [string, string, string, string] } | { fake: true };
export interface GroupShape {
  mt: Num;
  mc: Num;
}
export interface SpecShape {
  gt: Num;
  groups: GroupShape[];
}
/** The six header fields of a hand-built share. */
export interface HeaderShape {
  identifier: Num;
  groupIndex: Num;
  groupThreshold: Num;
  groupCount: Num;
  memberIndex: Num;
  memberThreshold: Num;
}
export interface GenSpec {
  spec: SpecShape;
  secret: Bytes;
  rng: RngSpec;
}
export interface Corruption {
  /** Position in the picked list. */
  share: number;
  byte: number;
  mask: number;
}
export type Recipe =
  | ({ k: "generate" } & GenSpec)
  | { k: "combine"; shares: Bytes[] }
  | { k: "combine"; from: GenSpec; pick: [number, number][]; corrupt?: Corruption }
  | { k: "parse"; s: string }
  | { k: "spec"; spec: SpecShape }
  | { k: "secret"; data: Bytes }
  /** `shareBytes` over a hand-built share: the header hex, or `throw:<code>`. */
  | { k: "shareBytes"; header: HeaderShape; value: Bytes; note?: string };
export type Outcome = string;

export interface RngLike {
  fill(dest: Uint8Array): void;
}
export interface VectorApi {
  generate(spec: SpecShape, secret: Uint8Array, rng: RngLike): Uint8Array[][];
  combine(shares: Uint8Array[]): Uint8Array;
  /** `GroupSpec.parse(s).toString()` */
  parseGroup(s: string): string;
  /** Build a Spec; returns `gc=<groups>,sc=<shares>`. */
  validateSpec(spec: SpecShape): string;
  /** Build a Secret; returns its length. */
  validateSecret(bytes: Uint8Array): number;
  /** Serialize a hand-built share; returns the hex of its header bytes. */
  shareHeader(header: Record<keyof HeaderShape, number>, value: Uint8Array): string;
  makeRng(spec: RngSpec): RngLike;
  errorCode(e: unknown): string;
}

export function toBytes(b: Bytes): Uint8Array {
  if ("hex" in b) return Uint8Array.from(Buffer.from(b.hex, "hex"));
  if ("text" in b) return new TextEncoder().encode(b.text);
  const start = b.start ?? 0;
  return Uint8Array.from({ length: b.cycle }, (_, i) => (start + i) & 0xff);
}
export const hex = (u: Uint8Array): string => Buffer.from(u).toString("hex");
const specName = (s: SpecShape): string =>
  `${s.gt}/[${s.groups.map((g) => `${g.mt}-of-${g.mc}`).join(",")}]`;
const rngName = (r: RngSpec): string => ("fake" in r ? "fake" : `seed=${r.seed[0].slice(0, 6)}`);

export function recipeName(r: Recipe): string {
  switch (r.k) {
    case "generate":
      return `generate ${specName(r.spec)} len=${toBytes(r.secret).length} ${rngName(r.rng)}`;
    case "combine":
      if ("shares" in r) return `combine explicit ${r.shares.length} shares`;
      return `combine ${specName(r.from.spec)} len=${toBytes(r.from.secret).length} ${rngName(r.from.rng)} pick=${r.pick
        .map(([g, m]) => `${g}.${m}`)
        .join(
          ",",
        )}${r.corrupt ? ` corrupt(${r.corrupt.share},${r.corrupt.byte},${r.corrupt.mask})` : ""}`;
    case "parse":
      return `parse ${JSON.stringify(r.s)}`;
    case "spec":
      return `spec ${specName(r.spec)}`;
    case "secret":
      return `secret len=${toBytes(r.data).length}`;
    case "shareBytes":
      return `shareBytes ${r.note ?? ""} [${Object.values(r.header).join(",")}]`;
  }
}

/** Recipe kinds the frozen baseline bundle cannot run (its share class is not exported). */
export const BASELINE_UNSUPPORTED: ReadonlySet<Recipe["k"]> = new Set<Recipe["k"]>(["shareBytes"]);
const numHeader = (h: HeaderShape): Record<keyof HeaderShape, number> => ({
  identifier: num(h.identifier),
  groupIndex: num(h.groupIndex),
  groupThreshold: num(h.groupThreshold),
  groupCount: num(h.groupCount),
  memberIndex: num(h.memberIndex),
  memberThreshold: num(h.memberThreshold),
});

export function materialize(api: VectorApi, r: Recipe): Outcome {
  try {
    switch (r.k) {
      case "generate":
        return api
          .generate(r.spec, toBytes(r.secret), api.makeRng(r.rng))
          .map((g) => g.map(hex).join(","))
          .join(";");
      case "combine": {
        let shares: Uint8Array[];
        if ("shares" in r) shares = r.shares.map(toBytes);
        else {
          const all = api.generate(r.from.spec, toBytes(r.from.secret), api.makeRng(r.from.rng));
          shares = r.pick.map(([g, m]) => new Uint8Array(all[g]![m]!));
          if (r.corrupt) shares[r.corrupt.share]![r.corrupt.byte] ^= r.corrupt.mask;
        }
        return hex(api.combine(shares));
      }
      case "parse":
        return api.parseGroup(r.s);
      case "spec":
        return api.validateSpec(r.spec);
      case "secret":
        return `len=${api.validateSecret(toBytes(r.data))}`;
      case "shareBytes":
        return api.shareHeader(numHeader(r.header), toBytes(r.value));
    }
  } catch (e) {
    return `throw:${api.errorCode(e)}`;
  }
}

const FAKE: RngLike = {
  fill(dest) {
    let b = 0;
    for (let i = 0; i < dest.length; i++) {
      dest[i] = b;
      b = (b + 17) & 0xff;
    }
  },
};
/** The error code, with the old enum's `ShamirError` spelled `Shamir`. */
const normalizeCode = (c: string): string => (c === "ShamirError" ? "Shamir" : c);

/** Pre-redesign surface: `Spec.new`, `GroupSpec.new`, `Secret.new`, `sskrGenerateUsing`, `sskrCombine`. */
export function baselineAdapterFor(m: any, randBaseline: any): VectorApi {
  const wrap = (rng: RngLike) => ({
    fillRandomData: (d: Uint8Array) => rng.fill(d),
    fillBytes: (d: Uint8Array) => rng.fill(d),
    randomData: (n: number) => {
      const d = new Uint8Array(n);
      rng.fill(d);
      return d;
    },
    nextU32: () => {
      throw new Error("unused");
    },
    nextU64: () => {
      throw new Error("unused");
    },
  });
  const specOf = (s: SpecShape) =>
    m.Spec.new(
      num(s.gt),
      s.groups.map((g) => m.GroupSpec.new(num(g.mt), num(g.mc))),
    );
  return {
    generate: (spec, secret, rng) =>
      m.sskrGenerateUsing(specOf(spec), m.Secret.new(secret), wrap(rng)),
    combine: (shares) => m.sskrCombine(shares).getData(),
    parseGroup: (s) => m.GroupSpec.parse(s).toString(),
    validateSpec: (s) => {
      const spec = specOf(s);
      return `gc=${spec.groupCount()},sc=${spec.shareCount()}`;
    },
    validateSecret: (b) => m.Secret.new(b).len(),
    shareHeader: () => {
      throw new Error("baseline: no share constructor");
    },
    makeRng: (spec) => {
      if ("fake" in spec) return FAKE;
      const g = new randBaseline.SeededRandomNumberGenerator(spec.seed.map(BigInt));
      return { fill: (d) => g.fillRandomData(d) };
    },
    errorCode: (e) => normalizeCode((e as any)?.type ?? (e as Error).name),
  };
}

/** Redesigned surface (D1/W2–W5), falling back to the baseline shape while it is current. */
export function redesignedAdapterFor(m: any, rand: any): VectorApi {
  const makeRng = (spec: RngSpec): RngLike => {
    if ("fake" in spec) return FAKE;
    const g = new rand.SeededRng(spec.seed.map(BigInt));
    return { fill: (d) => g.fillBytes(d) };
  };
  const wrap = (rng: RngLike) => ({
    fillBytes: (d: Uint8Array) => rng.fill(d),
    nextU32: () => {
      throw new Error("unused");
    },
    nextU64: () => {
      throw new Error("unused");
    },
  });
  if (m.SSKRErrorType !== undefined) return baselineAdapterFor(m, rand);
  const specOf = (s: SpecShape) =>
    m.Spec.from({
      groupThreshold: num(s.gt),
      groups: s.groups.map((g) =>
        m.GroupSpec.from({ memberThreshold: num(g.mt), memberCount: num(g.mc) }),
      ),
    });
  return {
    generate: (spec, secret, rng) =>
      m
        .generateShares(specOf(spec), m.Secret.from(secret), { rng: wrap(rng) })
        .map((g: any[]) => g.map((s: any) => m.shareBytes(s))),
    combine: (shares) => m.combineShares(shares).bytes,
    parseGroup: (s) => m.GroupSpec.parse(s).toString(),
    validateSpec: (s) => {
      const spec = specOf(s);
      return `gc=${spec.groupCount},sc=${spec.shareCount}`;
    },
    validateSecret: (b) => m.Secret.from(b).byteLength,
    shareHeader: (header, value) =>
      hex(m.shareBytes({ ...header, value: m.Secret.from(value) }).subarray(0, 5)),
    makeRng,
    errorCode: (e) => (m.SskrError.isSskrError(e) ? (e as any).code : (e as Error).name),
  };
}
