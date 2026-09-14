/**
 * Deterministic differential corpus. Pure and deterministic.
 */
import {
  num,
  type Recipe,
  type Bytes,
  type RngSpec,
  type SpecShape,
  type GenSpec,
  type GroupShape,
  type Num,
  type HeaderShape,
  toBytes,
} from "../vectors/recipes";

const cyc = (n: number, start = 0): Bytes => ({ cycle: n, start });
const h = (hex: string): Bytes => ({ hex });
export const SEEDS: RngSpec[] = [
  {
    seed: [
      "17295166580085024720",
      "422929670265678780",
      "5577237070365765850",
      "7953171132032326923",
    ],
  },
  { seed: ["1", "1", "1", "1"] },
  { seed: ["81985529216486895", "18364758544493064720", "3735928559", "14627333968358932480"] },
  { seed: ["0", "0", "0", "1"] },
];
export const FAKE: RngSpec = { fake: true };
const g = (mt: Num, mc: Num) => ({ mt, mc });
const spec = (gt: Num, ...groups: { mt: Num; mc: Num }[]): SpecShape => ({ gt, groups });

/** Every (t, n) with 1 ≤ t ≤ n ≤ 5. */
const SMALL: GroupShape[] = [];
for (let mc = 1; mc <= 5; mc++) for (let mt = 1; mt <= mc; mt++) SMALL.push(g(mt, mc));
const PICKED = [g(1, 1), g(1, 2), g(2, 2), g(2, 3), g(3, 5), g(1, 5)];
const TRIO = [g(1, 1), g(2, 3), g(3, 5)];

export function* shapes(): Generator<SpecShape> {
  for (const s of SMALL) yield spec(1, s);
  for (const a of PICKED) for (const b of PICKED) for (const gt of [1, 2]) yield spec(gt, a, b);
  for (const a of TRIO)
    for (const b of TRIO) for (const c of TRIO) for (const gt of [1, 2, 3]) yield spec(gt, a, b, c);
  for (const gt of [1, 2, 3, 4]) yield spec(gt, g(2, 3), g(2, 3), g(2, 3), g(2, 3));
  yield spec(2, g(1, 1), g(3, 5), g(2, 3), g(4, 4));
  yield spec(16, ...Array.from({ length: 16 }, () => g(16, 16)));
  yield spec(1, ...Array.from({ length: 16 }, (_, i) => g(1 + (i % 3), 3 + (i % 3))));
}
export const RUST_3_5: GenSpec = {
  spec: spec(1, g(3, 5)),
  secret: h("0ff784df000c4380a5ed683f7e6e3dcf"),
  rng: FAKE,
};
export const RUST_2_7: GenSpec = {
  spec: spec(1, g(2, 7)),
  secret: h("204188bfa6b440a1bdfd6753ff55a8241e07af5c5be943db917e3efabc184b1a"),
  rng: FAKE,
};
export const RUST_2_3_2_3: GenSpec = {
  spec: spec(2, g(2, 3), g(2, 3)),
  secret: h("204188bfa6b440a1bdfd6753ff55a8241e07af5c5be943db917e3efabc184b1a"),
  rng: FAKE,
};
export const README: GenSpec = {
  spec: spec(2, g(2, 3), g(3, 5)),
  secret: { text: "my secret belongs to me." },
  rng: SEEDS[0],
};

function* generate(): Generator<Recipe> {
  for (const s of shapes()) {
    const big = s.groups.length >= 4;
    for (const [si, rng] of SEEDS.entries()) {
      if (big && si >= 2) continue;
      for (const len of [16, 32])
        yield { k: "generate", spec: s, secret: cyc(len, 0x20 + si), rng };
    }
  }
  for (const gs of [RUST_3_5, RUST_2_7, RUST_2_3_2_3, README]) yield { k: "generate", ...gs };
  for (const len of [18, 20, 30])
    yield { k: "generate", spec: spec(2, g(2, 3), g(3, 5)), secret: cyc(len, 9), rng: FAKE };
}
function* subsets(n: number, max: number): Generator<number[]> {
  for (let m = 1; m < 1 << n; m++) {
    const s: number[] = [];
    for (let i = 0; i < n; i++) if (m & (1 << i)) s.push(i);
    if (s.length <= max) yield s;
  }
}
const positions = (s: SpecShape): [number, number][] =>
  s.groups.flatMap((grp, gi) =>
    Array.from({ length: Number(num(grp.mc)) }, (_, mi) => [gi, mi] as [number, number]),
  );
function* combine(): Generator<Recipe> {
  const bases: GenSpec[] = [
    RUST_3_5,
    RUST_2_3_2_3,
    { spec: spec(2, g(1, 1), g(3, 5), g(2, 3)), secret: cyc(16, 0x30), rng: SEEDS[0] },
    { spec: spec(1, g(2, 3), g(2, 3)), secret: cyc(32, 0x40), rng: SEEDS[1] },
  ];
  for (const from of bases) {
    const pos = positions(from.spec);
    for (const idx of subsets(pos.length, 6))
      yield { k: "combine", from, pick: idx.map((i) => pos[i]) };
    // a quorum-satisfying pick, corrupted in every header byte and one value byte
    const pick = pos.slice(0, Math.max(2, Number(num(from.spec.gt)) * 2));
    for (const byte of [0, 1, 2, 3, 4, 5, 12])
      for (const mask of [0x01, 0x10, 0x80]) {
        yield { k: "combine", from, pick, corrupt: { share: 0, byte, mask } };
        yield { k: "combine", from, pick, corrupt: { share: pick.length - 1, byte, mask } };
      }
  }
  // duplicates beyond the threshold: the members collected stop at the
  // threshold, so a repeat of an ignored member passes and a repeat of a
  // collected one is DuplicateMemberIndex (the reference does the same)
  const from23: GenSpec = { spec: spec(1, g(2, 3)), secret: cyc(16, 0x20), rng: SEEDS[0] };
  yield {
    k: "combine",
    from: from23,
    pick: [
      [0, 0],
      [0, 1],
      [0, 2],
      [0, 2],
    ],
  };
  yield {
    k: "combine",
    from: from23,
    pick: [
      [0, 0],
      [0, 1],
      [0, 2],
      [0, 1],
    ],
  };
  // explicit
  const S35 = [
    "001100020000112233445566778899aabbccddeeff",
    "0011000201d43099fe444807c46921a4f33a2a798b",
    "0011000202d9ad4e3bec2e1a7485698823abf05d36",
    "00110002030d8cf5f6ec337bc764d1866b5d07ca42",
    "00110002041aa7fe3199bc5092ef3816b074cabdf2",
  ].map(h);
  yield { k: "combine", shares: [] };
  yield { k: "combine", shares: [S35[1], S35[2], S35[4]] };
  yield { k: "combine", shares: [S35[0], S35[1], S35[2], S35[3], S35[4]] };
  yield { k: "combine", shares: [S35[0], S35[1]] }; // below quorum
  yield { k: "combine", shares: [S35[0], S35[0], S35[1]] }; // duplicate member
  yield {
    k: "combine",
    shares: [S35[0], h("0012" + "000201d43099fe444807c46921a4f33a2a798b"), S35[2]],
  }; // identifier mismatch
  yield {
    k: "combine",
    shares: [S35[0], h("0011000211d43099fe444807c46921a4f33a2a798b"), S35[2]],
  }; // reserved bits
  yield { k: "combine", shares: [h("00110002")] }; // short
  yield { k: "combine", shares: [h("0011000200aabb")] }; // value too short for a secret
  yield { k: "combine", shares: [S35[0], h("0011000201d43099fe444807c46921a4f33a2a79"), S35[2]] }; // value length mismatch
  yield {
    k: "combine",
    shares: [S35[0], h("0011001201d43099fe444807c46921a4f33a2a798b"), S35[2]],
  }; // member threshold mismatch
  yield { k: "combine", shares: [h("0011300200112233445566778899aabbccddeeff00")] }; // gt > gc
  yield { k: "combine", shares: [S35[0], h("0011010201d43099fe444807c46921a4f33a2a798b")] }; // group threshold mismatch
  // Two splits of `2/[2-of-3,2-of-3]` with the counter generator, so both
  // carry identifier 0011: A of the Rust test secret (2041…4b1a), B of the
  // bytes 0x50…0x6f. Shares are named by split, group and member.
  const A00 = h("0011110100ce5cce1ad9fe9cefa4707449576e8eadfc7d107c5a9e812b21f80aeca635cacd");
  const A01 = h("001111010184190ee2fcc276947ad68a6eef10694c784811720d350b061029440281a5a550");
  const A10 = h("00111111004d741d38fcc276947ad68a6eef10694c784811720d350b061029440281a5a550");
  const A11 = h("0011111101b39fde657f5bfe7d5dd8756d20a28c322ea751df1156f0b3e4e3429182843b1c");
  const B01 = h("0011110101a9af1649cc9f6a39bae91c4f6231c497d281742758affe5a2ed9888af60150f4");
  const B10 = h("0011111100e14f4ceecc9f6a39bae91c4f6231c497d281742758affe5a2ed9888af60150f4");
  const B11 = h("0011111101020375c1cbf1bf85bb81cff5003a744e0d3779438dc1f959fdb189ea460a3292");
  // a whole foreign group: both groups recover, the master checksum fails
  yield { k: "combine", shares: [A00, A01, B10, B11] };
  // one foreign member: group 0 fails its recovery and is skipped
  yield { k: "combine", shares: [A00, B01, A10, A11] };
  // the same mix under `1/[2-of-3,2-of-3]`: group 0 is skipped, group 1 recovers
  yield {
    k: "combine",
    shares: [
      h("00110101002dcd14c2252dc8489af3985030e74d5a48e8eff1478ab86e65b43869bf39d556"),
      h("0011010101f398b14e077ff78f453db5cdea921a62136be39bc54f3540870d77e728a2d8ad"),
      h("00110111002dcd14c2252dc8489af3985030e74d5a48e8eff1478ab86e65b43869bf39d556"),
      h("0011011101a1dfdd798388aada635b9974472b4fc59a32ae520c42c9f6a0af70149b882487"),
    ],
  };
}
function* parse(): Generator<Recipe> {
  for (const s of [
    "2-of-3",
    "1-of-1",
    "16-of-16",
    "+2-of-3",
    "2-of-+3",
    "0-of-3",
    "4-of-3",
    "2-of-17",
    "2-of-0",
    "2-of-3-of-4",
    "2of3",
    "2-off-3",
    "2.0-of-3",
    "2-of-3x",
    " 2-of-3",
    "2-of-3 ",
    "-2-of-3",
    "2--of-3",
    "-of-3",
    "2-of-",
    "",
    "a-of-b",
    "２-of-3",
    "99999999999999999999-of-3",
    "1-of-3",
    // The reference parses any decimal up to u64::MAX as a usize and then
    // applies GroupSpec::new's checks; only beyond u64::MAX is it a parse error.
    "9007199254740991-of-3",
    "9007199254740993-of-3",
    "2-of-9007199254740993",
    "18446744073709551615-of-3",
    "18446744073709551616-of-3",
    // usize::from_str: leading zeros pass; non-ASCII digits, trailing
    // whitespace and exponents do not.
    "0002-of-0003",
    "2-of-03",
    "\u0663-of-3",
    "\u{1d7d0}-of-3",
    "2-of-3\n",
    "1e1-of-16",
  ])
    yield { k: "parse", s };
}
function* specs(): Generator<Recipe> {
  for (const s of [
    spec(0, g(1, 1)),
    spec(2, g(1, 1)),
    spec(1, g(0, 1)),
    spec(1, g(2, 1)),
    spec(1, g(1, 0)),
    spec(1, g(1, 17)),
    spec(1, g(16, 16)),
    spec(1, ...Array.from({ length: 17 }, () => g(1, 1))),
    spec(16, ...Array.from({ length: 16 }, () => g(1, 1))),
    spec(1),
    spec(2, g(2, 3), g(3, 5)),
  ])
    yield { k: "spec", spec: s };
}
function* secrets(): Generator<Recipe> {
  for (const n of [0, 1, 15, 16, 17, 18, 31, 32, 33, 34, 64]) yield { k: "secret", data: cyc(n) };
  yield { k: "secret", data: { text: "my secret belongs to me." } };
}

/**
 * Consecutive generations on one generator: the second draws from where the
 * first stopped, whether the first succeeded or failed one level down.
 */
function* sequences(): Generator<Recipe> {
  const s32 = cyc(32, 0x20);
  yield {
    k: "generate",
    spec: spec(2, g(2, 3), g(3, 5)),
    secret: s32,
    rng: SEEDS[0],
    then: [{ spec: spec(1, g(2, 3)), secret: s32 }],
  };
  yield {
    k: "generate",
    spec: spec(2, g(2, 3), g(0, 2)),
    secret: s32,
    rng: SEEDS[0],
    then: [{ spec: spec(1, g(2, 3)), secret: s32 }],
  };
  const s16 = cyc(16, 0x21);
  yield {
    k: "generate",
    spec: spec(1, g(1, 1)),
    secret: s16,
    rng: SEEDS[1],
    then: [{ spec: spec(1, g(2, 3)), secret: s16 }],
  };
}

/**
 * A zero member threshold, which the reference accepts at construction and
 * rejects at generation one level down (`Shamir`, cause `InvalidThreshold`)
 * after the identifier and every earlier split have drawn.
 */
function* zero(): Generator<Recipe> {
  for (const s of ["+0-of-3", "00-of-3", "0-of-16", "0-of-17"]) yield { k: "parse", s };
  for (const s of [spec(1, g(0, 16)), spec(2, g(2, 3), g(0, 2))]) yield { k: "spec", spec: s };
  const secret = cyc(16, 0x20);
  yield { k: "generate", spec: spec(1, g(0, 3)), secret, rng: SEEDS[0] };
  yield { k: "generate", spec: spec(2, g(2, 3), g(0, 2)), secret, rng: SEEDS[0] };
  yield { k: "combine", from: { spec: spec(1, g(0, 3)), secret, rng: SEEDS[0] }, pick: [[0, 0]] };
}

/**
 * Spec fields beyond the safe-integer range, as bigints (exact) and as
 * unsafe numbers (every usize that rounds to the same double has the same
 * outcome, because each check compares with at most 16 or with the group
 * count). The reference's checks and codes apply; a bigint outside
 * `[0, 2^64 - 1]` and the number `2^64` (not a JSON u64) are js-only.
 */
function* wide(): Generator<Recipe> {
  const ONES = Array.from({ length: 17 }, () => g(1, 1));
  for (const s of [
    spec("9007199254740992n", g(2, 3)),
    spec("18446744073709551615n", ...ONES),
    spec("17n", ...ONES),
    spec(1, g("9007199254740992n", 3)),
    spec(1, g("9007199254740993n", 3)),
    spec(1, g(1, "9007199254740992n")),
    spec(1, g("18446744073709551615n", "18446744073709551615n")),
    spec("2n", g("2n", "3n"), g(3, 5)),
    spec(1, g("0n", "3n")),
    spec(9007199254740992, g(2, 3)),
    spec(1, g(9007199254740992, 3)),
    spec(1, g(1, 9007199254740992)),
    spec(1, g("-1n", 3)),
    spec(1, g(1, "18446744073709551616n")),
    spec("-1n", g(1, 1)),
    spec("18446744073709551616n", g(1, 1)),
    spec(1, g(2 ** 64, 3)),
  ])
    yield { k: "spec", spec: s };
  yield {
    k: "generate",
    spec: spec("2n", g("2n", "3n"), g("3n", "5n")),
    secret: cyc(16, 0x20),
    rng: SEEDS[0],
  };
}

/**
 * The JS-only input domain: spec fields the reference's `usize` cannot
 * express and hand-built share headers outside their width. Every row
 * throws `InvalidParameter`; the Rust harness counts them as `js-only`.
 */
function* domain(): Generator<Recipe> {
  const secret = cyc(16, 1);
  for (const s of [
    spec("NaN", g(1, 1)),
    spec(1.5, g(1, 1), g(1, 1)),
    spec(-1, g(1, 1)),
    spec(1, g(1.5, 3)),
    spec(1, g(1, "NaN")),
    spec(1, g(-1, 3)),
    spec(1, g(2, 2.5)),
    spec(1, g("Infinity", 3)),
    spec(1, g(2 ** 65, 3)),
  ])
    yield { k: "spec", spec: s };
  yield { k: "generate", spec: spec(1.5, g(1, 1), g(1, 1)), secret, rng: FAKE };
  yield { k: "generate", spec: spec(1, g(1, 2.5)), secret, rng: FAKE };
  const ok: HeaderShape = {
    identifier: 0x7eb5,
    groupIndex: 0,
    groupThreshold: 1,
    groupCount: 1,
    memberIndex: 0,
    memberThreshold: 2,
  };
  const patches: [string, Partial<HeaderShape>][] = [
    ["valid", {}],
    ["identifier-u16-overflow", { identifier: 0x1ffff }],
    ["identifier-negative", { identifier: -1 }],
    ["identifier-fraction", { identifier: 1.5 }],
    ["groupIndex-17", { groupIndex: 17 }],
    ["groupThreshold-17", { groupThreshold: 17 }],
    ["groupThreshold-0", { groupThreshold: 0 }],
    ["groupCount-0", { groupCount: 0 }],
    ["memberThreshold-0", { memberThreshold: 0 }],
    ["memberThreshold-17", { memberThreshold: 17 }],
    ["memberIndex-fraction", { memberIndex: 1.5 }],
    ["memberIndex-NaN", { memberIndex: "NaN" }],
    ["memberIndex-16", { memberIndex: 16 }],
    ["groupThreshold-over-groupCount", { groupThreshold: 2, groupCount: 1 }],
  ];
  for (const [note, patch] of patches)
    yield { k: "shareBytes", header: { ...ok, ...patch }, value: secret, note };
}

export const categories: Record<string, () => Generator<Recipe>> = {
  generate,
  combine,
  parse,
  specs,
  secrets,
  sequences,
  zero,
  wide,
  domain,
};
/**
 * Categories the frozen baseline cannot take at all, with their row counts;
 * only the Rust harness pins their outcomes.
 */
export const NO_BASELINE: Record<string, number> = { wide: 18 };
export function* allRecipes(): Generator<Recipe> {
  for (const gen of Object.values(categories)) yield* gen();
}
/** Golden subset: one seed per shape (all fake/Rust ones), combine subsets ≤ 4 and every explicit case, every other category whole. */
export function* goldenRecipes(): Generator<Recipe> {
  for (const r of generate())
    if (r.k === "generate" && ("fake" in r.rng || r.rng === SEEDS[0])) yield r;
  for (const r of combine()) {
    if (r.k === "combine" && "pick" in r && r.pick.length > 4 && !r.corrupt) continue;
    yield r;
  }
  yield* parse();
  yield* specs();
  yield* secrets();
  yield* sequences();
  yield* zero();
  yield* wide();
  yield* domain();
}

/** The minimal quorum of a spec: the first `gt` groups, each's first `mt` members. */
const quorum = (s: SpecShape): [number, number][] =>
  s.groups
    .slice(0, Number(num(s.gt)))
    .flatMap((grp, gi) =>
      Array.from({ length: Number(num(grp.mt)) }, (_, mi) => [gi, mi] as [number, number]),
    );

/**
 * The header sweep: every single-byte substitution (masks 1..255) of the
 * first seven bytes and the last byte of the first and the last share of a
 * quorum, over four splits: 16,320 rows. Not in `categories` or the golden
 * file; `bun run vectors:sweep` materialises it and CI replays it against
 * the reference.
 */
export function* sweep(): Generator<Recipe> {
  const bases: GenSpec[] = [
    RUST_2_3_2_3,
    { spec: spec(2, g(1, 1), g(3, 5), g(2, 3)), secret: cyc(16, 0x30), rng: SEEDS[0] },
    { spec: spec(1, g(2, 3), g(2, 3)), secret: cyc(32, 0x40), rng: SEEDS[1] },
    { spec: spec(1, g(3, 5)), secret: cyc(18, 0x60), rng: SEEDS[0] },
  ];
  for (const from of bases) {
    const pick = quorum(from.spec);
    const last = 5 + toBytes(from.secret).length - 1;
    for (const share of [0, pick.length - 1])
      for (const byte of [0, 1, 2, 3, 4, 5, 6, last])
        for (let mask = 1; mask <= 255; mask++)
          yield { k: "combine", from, pick, corrupt: { share, byte, mask } };
  }
}
