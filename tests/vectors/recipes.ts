/**
 * Vector recipes: a recipe names an operation and its inputs; `materialize`
 * runs it through a `VectorApi` and returns one outcome string, so the same
 * recipe drives the golden file, the differential and the Rust harness.
 * Adapters bridge the frozen baseline surface and the current one.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

export type Bytes = { hex: string } | { cycle: number; start?: number } | { text: string };
/**
 * A recipe integer. `NaN` and the infinities have no JSON form, so they
 * travel as strings; a `bigint` travels as its decimal digits followed by
 * `n`, which JSON keeps exact where a `number` above `2^53 - 1` would not be.
 */
export type Num = number | "NaN" | "Infinity" | "-Infinity" | `${bigint}n`;
export const num = (v: Num): number | bigint => {
  if (typeof v === "number") return v;
  if (v.endsWith("n")) return BigInt(v.slice(0, -1));
  return Number(v);
};
/** Seeded xoshiro state (four decimal u64 strings) or the counter "fake" generator (0, 17, 34, …). */
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
/** One generation: a spec and a secret. */
export interface GenStep {
  spec: SpecShape;
  secret: Bytes;
}
/** A generation on a fresh generator, optionally followed by more steps on the same generator. */
export interface GenSpec extends GenStep {
  rng: RngSpec;
  then?: GenStep[];
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
  /** Build a Spec; returns `gc=<groups>,sc=<shares>,groups=<g,…>`. */
  validateSpec(spec: SpecShape): string;
  /** Build a Secret; returns its length. */
  validateSecret(bytes: Uint8Array): number;
  /** Serialize a hand-built share; returns the hex of its header bytes. */
  shareHeader(header: Record<keyof HeaderShape, number | bigint>, value: Uint8Array): string;
  makeRng(spec: RngSpec): RngLike;
  /** The error's code, a wrapped Shamir failure as `Shamir(<cause>)`; `undefined` for a non-package error. */
  errorCode(e: unknown): string | undefined;
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
const stepName = (s: GenStep): string => `${specName(s.spec)} len=${toBytes(s.secret).length}`;

export function recipeName(r: Recipe): string {
  switch (r.k) {
    case "generate":
      return `generate ${stepName(r)} ${rngName(r.rng)}${(r.then ?? [])
        .map((s) => ` then ${stepName(s)}`)
        .join("")}`;
    case "combine":
      if ("shares" in r) return `combine explicit ${r.shares.length} shares`;
      return `combine ${stepName(r.from)} ${rngName(r.from.rng)} pick=${r.pick
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
const numHeader = (h: HeaderShape): Record<keyof HeaderShape, number | bigint> => ({
  identifier: num(h.identifier),
  groupIndex: num(h.groupIndex),
  groupThreshold: num(h.groupThreshold),
  groupCount: num(h.groupCount),
  memberIndex: num(h.memberIndex),
  memberThreshold: num(h.memberThreshold),
});

export interface MaterializeOptions {
  /** Append `:<message>` to every thrown outcome (the golden file and the Rust harness compare messages). */
  messages?: boolean;
}

export function materialize(
  api: VectorApi,
  r: Recipe,
  { messages = false }: MaterializeOptions = {},
): Outcome {
  const failure = (e: unknown): string => {
    const code = api.errorCode(e) ?? (e as Error).name;
    return messages ? `throw:${code}:${(e as Error).message}` : `throw:${code}`;
  };
  const generation = (g: GenSpec): string => {
    const rng = api.makeRng(g.rng);
    const step = (s: GenStep): string => {
      try {
        return api
          .generate(s.spec, toBytes(s.secret), rng)
          .map((grp) => grp.map(hex).join(","))
          .join(";");
      } catch (e) {
        return failure(e);
      }
    };
    return [g, ...(g.then ?? [])].map(step).join(" | ");
  };
  try {
    switch (r.k) {
      case "generate":
        return generation(r);
      case "combine": {
        let shares: Uint8Array[];
        if ("shares" in r) shares = r.shares.map(toBytes);
        else {
          const all = api.generate(r.from.spec, toBytes(r.from.secret), api.makeRng(r.from.rng));
          shares = r.pick.map(([g, m]) => new Uint8Array(all[g][m]));
          if (r.corrupt) shares[r.corrupt.share][r.corrupt.byte] ^= r.corrupt.mask;
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
    return failure(e);
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

/** Baseline surface: `Spec.new`, `GroupSpec.new`, `Secret.new`, `sskrGenerateUsing`, `sskrCombine`. */
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
      const groups = spec
        .groups()
        .map((g: any) => `${g.memberThreshold()}-of-${g.memberCount()}`)
        .join(",");
      return `gc=${spec.groupCount()},sc=${spec.shareCount()},groups=${groups}`;
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
    errorCode: (e) => {
      const type: unknown = (e as any)?.type;
      if (typeof type !== "string") return undefined;
      return type === "ShamirError" ? `Shamir(${(e as any).shamirError?.type})` : type;
    },
  };
}

/** Current surface: `Spec.from`, `GroupSpec.from`, `Secret.from`, `generateShares`, `combineShares`, `shareBytes`. */
export function currentAdapterFor(m: any, rand: any): VectorApi {
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
      return `gc=${spec.groupCount},sc=${spec.shareCount},groups=${spec.groups.map(String).join(",")}`;
    },
    validateSecret: (b) => m.Secret.from(b).byteLength,
    shareHeader: (header, value) =>
      hex(m.shareBytes({ ...header, value: m.Secret.from(value) }).subarray(0, 5)),
    makeRng,
    errorCode: (e) => {
      if (!m.SskrError.isSskrError(e)) return undefined;
      const { code, details } = e as any;
      return code === "Shamir" ? `Shamir(${details.cause.code})` : code;
    },
  };
}
