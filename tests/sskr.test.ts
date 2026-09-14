// Tests ported from bc-sskr-rust, plus the TypeScript input contract.

import { runInNewContext } from "node:vm";
import { vi } from "vitest";
import type { RandomNumberGenerator } from "@blockchaincommons/rand";
import { RandError, SeededRng, fillRandomBytes } from "@blockchaincommons/rand";
import { nextInClosedRangeU64 } from "@blockchaincommons/rand/samplers";
import { ShamirError } from "@blockchaincommons/shamir";
import {
  Secret,
  GroupSpec,
  Spec,
  SskrError,
  generateShares,
  combineShares,
  shareBytes,
  parseShare,
  isSskrShare,
  SHARE_HEADER_LENGTH,
  MIN_SHARE_LENGTH,
  MIN_SECRET_LENGTH,
  MAX_SECRET_LENGTH,
  MAX_GROUP_COUNT,
  MAX_SHARE_COUNT,
  type SskrShare,
} from "../src/index.js";

/** The counter generator the Rust tests use: 0, 17, 34, … */
function fakeRng(): RandomNumberGenerator {
  return {
    nextU32: () => {
      throw new Error("not implemented");
    },
    nextU64: () => {
      throw new Error("not implemented");
    },
    fillBytes(data) {
      let b = 0;
      for (let i = 0; i < data.length; i++) {
        data[i] = b;
        b = (b + 17) & 0xff;
      }
    },
  };
}
const hexToBytes = (hex: string): Uint8Array => Uint8Array.from(Buffer.from(hex, "hex"));
const bytesToHex = (b: Uint8Array): string => Buffer.from(b).toString("hex");
const g = (memberThreshold: number, memberCount: number) =>
  GroupSpec.from({ memberThreshold, memberCount });
const spec = (groupThreshold: number, ...groups: GroupSpec[]) =>
  Spec.from({ groupThreshold, groups });
const code = (f: () => unknown): string => {
  try {
    f();
    return "ok";
  } catch (e) {
    expect(SskrError.isSskrError(e)).toBe(true);
    return (e as SskrError).code;
  }
};

describe("constants", () => {
  it("match the reference", () => {
    expect([
      MIN_SECRET_LENGTH,
      MAX_SECRET_LENGTH,
      MAX_SHARE_COUNT,
      MAX_GROUP_COUNT,
      SHARE_HEADER_LENGTH,
      MIN_SHARE_LENGTH,
    ]).toEqual([16, 32, 16, 16, 5, 21]);
  });
});

describe("generateShares / combineShares", () => {
  it("3-of-5 (Rust test_split_3_5)", () => {
    const secret = Secret.from(hexToBytes("0ff784df000c4380a5ed683f7e6e3dcf"));
    const groups = generateShares(spec(1, g(3, 5)), secret, { rng: fakeRng() });
    expect(groups.length).toBe(1);
    const shares = groups[0];
    expect(shares.map((s) => bytesToHex(shareBytes(s)))).toEqual([
      "001100020000112233445566778899aabbccddeeff",
      "0011000201d43099fe444807c46921a4f33a2a798b",
      "0011000202d9ad4e3bec2e1a7485698823abf05d36",
      "00110002030d8cf5f6ec337bc764d1866b5d07ca42",
      "00110002041aa7fe3199bc5092ef3816b074cabdf2",
    ]);
    expect(shares[0]).toMatchObject({
      identifier: 0x0011,
      groupIndex: 0,
      groupThreshold: 1,
      groupCount: 1,
      memberIndex: 0,
      memberThreshold: 3,
    });
    expect(combineShares([shares[1], shares[2], shares[4]]).equals(secret)).toBe(true);
    expect(combineShares([shares[1], shares[2], shares[4]].map(shareBytes)).equals(secret)).toBe(
      true,
    );
  });
  it("2-of-7 over a 32-byte secret (Rust test_split_2_7)", () => {
    const secret = Secret.from(
      hexToBytes("204188bfa6b440a1bdfd6753ff55a8241e07af5c5be943db917e3efabc184b1a"),
    );
    const shares = generateShares(spec(1, g(2, 7)), secret, { rng: fakeRng() })[0];
    expect(shares.length).toBe(7);
    expect(bytesToHex(shareBytes(shares[0]))).toBe(
      "00110001002dcd14c2252dc8489af3985030e74d5a48e8eff1478ab86e65b43869bf39d556",
    );
    expect(combineShares([shares[3], shares[4]]).equals(secret)).toBe(true);
  });
  it("[2-of-3, 2-of-3] gt=2 (Rust test_split_2_3_2_3)", () => {
    const secret = Secret.from(
      hexToBytes("204188bfa6b440a1bdfd6753ff55a8241e07af5c5be943db917e3efabc184b1a"),
    );
    const groups = generateShares(spec(2, g(2, 3), g(2, 3)), secret, { rng: fakeRng() });
    expect(groups.map((grp) => grp.length)).toEqual([3, 3]);
    expect(bytesToHex(shareBytes(groups[0][0]))).toBe(
      "0011110100ce5cce1ad9fe9cefa4707449576e8eadfc7d107c5a9e812b21f80aeca635cacd",
    );
    expect(bytesToHex(shareBytes(groups[1][0]))).toBe(
      "00111111004d741d38fcc276947ad68a6eef10694c784811720d350b061029440281a5a550",
    );
    expect(
      combineShares([groups[0][0], groups[0][1], groups[1][0], groups[1][2]]).equals(secret),
    ).toBe(true);
    expect(code(() => combineShares([groups[0][0], groups[0][1], groups[1][0]]))).toBe(
      "NotEnoughGroups",
    );
  });
  it("README example, secure RNG by default", () => {
    const secret = Secret.fromText("my secret belongs to me.");
    const groups = generateShares(spec(2, g(2, 3), g(3, 5)), secret);
    expect(groups.map((grp) => grp.length)).toEqual([2, 3, 5].slice(1));
    const picked = [groups[0][0], groups[0][2], groups[1][0], groups[1][1], groups[1][4]];
    expect(combineShares(picked).equals(secret)).toBe(true);
    expect(new TextDecoder().decode(combineShares(picked).bytes)).toBe("my secret belongs to me.");
    // two runs differ in their identifier
    expect(generateShares(spec(1, g(1, 1)), secret)[0][0].identifier).not.toBe(
      groups[0][0].identifier,
    );
  });
  it("1-of-N groups and extra shares above the group threshold", () => {
    const secret = Secret.fromText("my secret belongs to me.");
    for (const s of [spec(1, g(1, 3)), spec(1, g(1, 1)), spec(1, g(2, 3))]) {
      expect(combineShares(generateShares(s, secret).flat()).equals(secret)).toBe(true);
    }
    const flat = generateShares(spec(1, g(2, 3), g(2, 3)), secret).flat();
    expect(combineShares([flat[0], flat[1], flat[3]]).equals(secret)).toBe(true);
  });
});

describe("share wire form", () => {
  it("round-trips through bytes", () => {
    const share: SskrShare = {
      identifier: 0xbeef,
      groupIndex: 3,
      groupThreshold: 2,
      groupCount: 4,
      memberIndex: 5,
      memberThreshold: 3,
      value: Secret.from(new Uint8Array(16).fill(7)),
    };
    const bytes = shareBytes(share);
    expect(bytesToHex(bytes.subarray(0, 5))).toBe("beef133205");
    const back = parseShare(bytes);
    const header = (s: SskrShare) => [
      s.identifier,
      s.groupIndex,
      s.groupThreshold,
      s.groupCount,
      s.memberIndex,
      s.memberThreshold,
    ];
    expect(header(back)).toEqual(header(share));
    expect(back.value.equals(share.value)).toBe(true);
    expect(isSskrShare(back)).toBe(true);
    expect(isSskrShare(bytes)).toBe(false);
  });
  it("rejects malformed bytes in order", () => {
    expect(code(() => parseShare(hexToBytes("00110002")))).toBe("ShareLengthInvalid");
    expect(code(() => parseShare(hexToBytes("0011300200112233445566778899aabbccddeeff00")))).toBe(
      "GroupThresholdInvalid",
    );
    expect(code(() => parseShare(hexToBytes("0011000211d43099fe444807c46921a4f33a2a798b")))).toBe(
      "ShareReservedBitsInvalid",
    );
    expect(code(() => parseShare(hexToBytes("0011000200aabb")))).toBe("SecretTooShort");
  });
});

describe("errors", () => {
  it("messages are the reference strings", () => {
    expect(() => combineShares([])).toThrow("SSKR shares were empty");
    expect(() => Secret.from(new Uint8Array(8))).toThrow("SSKR secret is too short");
    expect(() => Secret.from(new Uint8Array(64))).toThrow("SSKR secret is too long");
    expect(() => Secret.from(new Uint8Array(17))).toThrow("SSKR secret is not of even length");
    expect(() => spec(5, g(2, 3))).toThrow("group threshold is invalid");
    expect(() => g(5, 3)).toThrow("member threshold is invalid");
    expect(() => g(0, 0)).toThrow("member count is invalid");
    expect(() => g(2, 100)).toThrow("member count is invalid");
    expect(() => GroupSpec.parse("invalid")).toThrow("Invalid group specification.");
  });
  it("codes", () => {
    expect(code(() => combineShares([]))).toBe("SharesEmpty");
    expect(code(() => spec(0, g(2, 3)))).toBe("GroupThresholdInvalid");
    expect(
      code(() =>
        Spec.from({ groupThreshold: 1, groups: Array.from({ length: 17 }, () => g(1, 1)) }),
      ),
    ).toBe("GroupCountInvalid");
    expect(code(() => g(5, 3))).toBe("MemberThresholdInvalid");
    const secret = Secret.from(new Uint8Array(16).fill(1));
    const [a, b] = generateShares(spec(1, g(2, 3)), secret, { rng: fakeRng() })[0];
    expect(code(() => combineShares([a, a]))).toBe("DuplicateMemberIndex");
    const other = generateShares(spec(1, g(2, 3)), secret, { rng: SeededRng.forTesting() })[0][0];
    expect(code(() => combineShares([a, other]))).toBe("ShareSetInvalid");
    expect(code(() => combineShares([a, { ...b, memberThreshold: 3 }]))).toBe(
      "MemberThresholdInvalid",
    );
  });
  it("SskrError is an Error with name, code, details and is(); Shamir failures carry the cause", () => {
    try {
      combineShares([]);
    } catch (e) {
      expect(e).toBeInstanceOf(Error);
      expect((e as SskrError).name).toBe("SskrError");
      expect((e as SskrError).code).toBe("SharesEmpty");
      expect((e as SskrError).details).toEqual({ code: "SharesEmpty" });
      expect((e as SskrError).is("SharesEmpty")).toBe(true);
      expect((e as SskrError).is("Shamir")).toBe(false);
    }
    const foreign = Object.assign(new Error("x"), { name: "SskrError", code: "SharesEmpty" });
    expect(SskrError.isSskrError(foreign)).toBe(true);
    expect(SskrError.isSskrError(new Error("x"))).toBe(false);
  });
  it("InvalidParameter for spec fields that are not a usize, before the reference chain", () => {
    expect(code(() => g(1.5, 3))).toBe("InvalidParameter");
    expect(code(() => g(1, NaN))).toBe("InvalidParameter");
    expect(code(() => g(-1, 3))).toBe("InvalidParameter");
    expect(() => g(2, 2.5)).toThrow(
      "memberCount must be an integer in [0, 18446744073709551615] (a number or a bigint), got 2.5",
    );
    expect(code(() => spec(NaN, g(1, 1)))).toBe("InvalidParameter");
    expect(code(() => spec(1.5, g(1, 1), g(1, 1)))).toBe("InvalidParameter");
    try {
      spec(NaN, g(1, 1));
    } catch (e) {
      expect(SskrError.isSskrError(e) && e.details).toEqual({
        code: "InvalidParameter",
        parameter: "groupThreshold",
        value: NaN,
      });
    }
    // Rust-representable values keep the reference's codes and order.
    expect(code(() => g(2, 17))).toBe("MemberCountInvalid");
    expect(code(() => g(0, 0))).toBe("MemberCountInvalid");
    expect(code(() => g(5, 3))).toBe("MemberThresholdInvalid");
    expect(code(() => spec(0, g(1, 1)))).toBe("GroupThresholdInvalid");
  });
  it("spec fields take the whole usize domain as numbers or bigints", () => {
    // Unsafe numbers and bigints reach the reference's checks with the reference's codes.
    expect(code(() => g(2 ** 53, 3))).toBe("MemberThresholdInvalid");
    expect(code(() => g(1, 2 ** 53))).toBe("MemberCountInvalid");
    expect(code(() => g(2 ** 64, 2 ** 64))).toBe("MemberCountInvalid");
    expect(code(() => Spec.from({ groupThreshold: 2 ** 53, groups: [g(2, 3)] }))).toBe(
      "GroupThresholdInvalid",
    );
    expect(code(() => GroupSpec.from({ memberThreshold: 2n ** 53n, memberCount: 3n }))).toBe(
      "MemberThresholdInvalid",
    );
    expect(
      code(() => GroupSpec.from({ memberThreshold: 0xffffffffffffffffn, memberCount: 3 })),
    ).toBe("MemberThresholdInvalid");
    const fromBigints = GroupSpec.from({ memberThreshold: 2n, memberCount: 3n });
    expect([fromBigints.memberThreshold, fromBigints.memberCount]).toEqual([2, 3]);
    const specFromBigint = Spec.from({ groupThreshold: 1n, groups: [fromBigints] });
    expect(specFromBigint.groupThreshold).toBe(1);
    // Outside the domain: above 2^64 as a number, or a bigint outside [0, 2^64 - 1].
    expect(code(() => g(2 ** 65, 3))).toBe("InvalidParameter");
    expect(code(() => GroupSpec.from({ memberThreshold: -1n, memberCount: 3n }))).toBe(
      "InvalidParameter",
    );
    expect(code(() => GroupSpec.from({ memberThreshold: 1n, memberCount: 2n ** 64n }))).toBe(
      "InvalidParameter",
    );
    // `details.value` is what was passed; the message renders it exactly.
    try {
      GroupSpec.from({ memberThreshold: 1n, memberCount: 2n ** 64n });
    } catch (e) {
      expect(SskrError.isSskrError(e) && e.details).toEqual({
        code: "InvalidParameter",
        parameter: "memberCount",
        value: 2n ** 64n,
      });
      expect((e as SskrError).message).toBe(
        "memberCount must be an integer in [0, 18446744073709551615] (a number or a bigint), got 18446744073709551616n",
      );
    }
    expect(() => g(2 ** 65, 3)).toThrow("got 36893488147419103232");
  });
  it("a zero member threshold is accepted and fails at generation, as in the reference", () => {
    expect(g(0, 3).toString()).toBe("0-of-3");
    expect(GroupSpec.parse("+0-of-1").toString()).toBe("0-of-1");
    expect(code(() => g(0, 0))).toBe("MemberCountInvalid");
    expect(code(() => g(0, 17))).toBe("MemberCountInvalid");
    expect(GroupSpec.DEFAULT.memberThreshold).toBe(1);
    // Generation draws the identifier and the group split, then fails on the
    // member split; the generator is left where the reference leaves it, so a
    // following generation yields the bytes the Rust harness pins.
    const secret = Secret.from(Uint8Array.from({ length: 16 }, (_, i) => 0x20 + i));
    const rng = new SeededRng(
      [
        "17295166580085024720",
        "422929670265678780",
        "5577237070365765850",
        "7953171132032326923",
      ].map(BigInt) as [bigint, bigint, bigint, bigint],
    );
    let failure: SskrError | undefined;
    try {
      generateShares(spec(1, g(0, 3)), secret, { rng });
    } catch (e) {
      failure = e as SskrError;
    }
    expect(failure?.code).toBe("Shamir");
    expect(failure?.details.code === "Shamir" && failure.details.cause.code).toBe(
      "InvalidThreshold",
    );
    expect(failure?.message).toBe("SSKR Shamir error: invalid threshold");
    const next = generateShares(spec(1, g(2, 3)), secret, { rng })[0];
    expect(next.map((s) => bytesToHex(shareBytes(s)))).toEqual([
      "59bb000100b36f39f68bdc97d81d15da7575c3a752",
      "59bb000101ce86268210957fd907f36f471305d9e9",
      "59bb00010249a6071ea64e5cda29c2ab11b9545b3f",
    ]);
  });
  it("shareBytes rejects header fields outside their width", () => {
    const secret = Secret.from(new Uint8Array(16).fill(1));
    const share = generateShares(spec(1, g(2, 3)), secret, { rng: fakeRng() })[0][0];
    const withPatch = (patch: Partial<SskrShare>) => code(() => shareBytes({ ...share, ...patch }));
    expect(withPatch({ identifier: 0x1ffff })).toBe("InvalidParameter");
    expect(withPatch({ identifier: -1 })).toBe("InvalidParameter");
    expect(withPatch({ groupIndex: 17 })).toBe("InvalidParameter");
    expect(withPatch({ groupThreshold: 0 })).toBe("InvalidParameter");
    expect(withPatch({ groupCount: 17 })).toBe("InvalidParameter");
    expect(withPatch({ memberThreshold: 0 })).toBe("InvalidParameter");
    expect(withPatch({ memberIndex: 1.5 })).toBe("InvalidParameter");
    expect(withPatch({ memberIndex: NaN })).toBe("InvalidParameter");
    expect(withPatch({ groupThreshold: 2, groupCount: 1 })).toBe("GroupThresholdInvalid");
    expect(() => shareBytes({ ...share, groupIndex: 17 })).toThrow(
      "groupIndex must be an integer in [0, 15], got 17",
    );
    expect(withPatch({ identifier: 0xffff, groupIndex: 15, memberIndex: 15 })).toBe("ok");
  });
  it("secrets hand out copies; specs and generated shares are frozen (A1, A2)", () => {
    const a = Secret.from(new Uint8Array(16).fill(7));
    const b = a.clone();
    a.bytes[0] = 0;
    expect(a.equals(b)).toBe(true);
    expect(a.bytes[0]).toBe(7);
    const s = spec(1, g(1, 1), g(1, 1));
    expect(Object.isFrozen(s)).toBe(true);
    expect(Object.isFrozen(s.groups)).toBe(true);
    expect(Object.isFrozen(GroupSpec.DEFAULT)).toBe(true);
    expect(() => (s.groups as GroupSpec[]).push(GroupSpec.DEFAULT)).toThrow(TypeError);
    expect(s.groupCount).toBe(2);
    const share = generateShares(s, b, { rng: fakeRng() })[0][0];
    expect(Object.isFrozen(share)).toBe(true);
  });
});

describe("GroupSpec", () => {
  it("parses and prints", () => {
    const s = GroupSpec.parse("2-of-3");
    expect([s.memberThreshold, s.memberCount, s.toString()]).toEqual([2, 3, "2-of-3"]);
    expect(GroupSpec.parse("+2-of-+3").toString()).toBe("2-of-3");
    expect(GroupSpec.DEFAULT.toString()).toBe("1-of-1");
    expect(spec(1, g(2, 3), g(3, 5)).shareCount).toBe(8);
    expect(spec(1, g(2, 3), g(3, 5)).groupCount).toBe(2);
  });
  it("rejects everything Rust's usize::from_str rejects", () => {
    for (const s of [
      "invalid",
      "2-3",
      "2-from-3",
      "2.5-of-3",
      "2-of-3.0",
      "2x-of-3",
      "2-of-3x",
      "-2-of-3",
      " 2-of-3",
      "2-of- 3",
      "-of-3",
      "2-of-",
    ]) {
      expect(code(() => GroupSpec.parse(s))).toBe("GroupSpecInvalid");
    }
    expect(code(() => GroupSpec.parse("4-of-3"))).toBe("MemberThresholdInvalid");
    expect(code(() => GroupSpec.parse("2-of-17"))).toBe("MemberCountInvalid");
  });
});

/** Fisher–Yates over rand's closed-range sampler, as the Rust tests do. */
function shuffle<T>(items: T[], rng: RandomNumberGenerator): void {
  let i = items.length;
  while (i > 1) {
    i -= 1;
    const j = Number(nextInClosedRangeU64(rng, 0n, BigInt(i)));
    [items[i], items[j]] = [items[j] as T, items[i] as T];
  }
}

describe("shuffle (Rust test vector)", () => {
  it("matches the reference order for the test seed", () => {
    const rng = SeededRng.forTesting();
    const v = Array.from({ length: 100 }, (_, i) => i);
    shuffle(v, rng);
    expect(v).toEqual([
      79, 70, 40, 53, 25, 30, 31, 88, 10, 1, 45, 54, 81, 58, 55, 59, 69, 78, 65, 47, 75, 61, 0, 72,
      20, 9, 80, 13, 73, 11, 60, 56, 19, 42, 33, 12, 36, 38, 6, 35, 68, 77, 50, 18, 97, 49, 98, 85,
      89, 91, 15, 71, 99, 67, 84, 23, 64, 14, 57, 48, 62, 29, 28, 94, 44, 8, 66, 34, 43, 21, 63, 16,
      92, 95, 27, 51, 26, 86, 22, 41, 93, 82, 7, 87, 74, 37, 46, 3, 96, 24, 90, 39, 32, 17, 76, 4,
      83, 2, 52, 5,
    ]);
  });
});

describe("fuzz (Rust test_fuzz)", () => {
  function oneFuzz(rng: RandomNumberGenerator): void {
    const secretLen =
      Number(nextInClosedRangeU64(rng, BigInt(MIN_SECRET_LENGTH), BigInt(MAX_SECRET_LENGTH))) & ~1;
    const secretBytes = new Uint8Array(secretLen);
    rng.fillBytes(secretBytes);
    const secret = Secret.from(secretBytes);
    const groupCount = Number(nextInClosedRangeU64(rng, 1n, BigInt(MAX_GROUP_COUNT)));
    const groups: GroupSpec[] = [];
    for (let i = 0; i < groupCount; i++) {
      const memberCount = Number(nextInClosedRangeU64(rng, 1n, BigInt(MAX_SHARE_COUNT)));
      const memberThreshold = Number(nextInClosedRangeU64(rng, 1n, BigInt(memberCount)));
      groups.push(g(memberThreshold, memberCount));
    }
    const s = spec(Number(nextInClosedRangeU64(rng, 1n, BigInt(groupCount))), ...groups);
    const shares = generateShares(s, secret, { rng });
    const groupIndexes = Array.from({ length: s.groupCount }, (_, i) => i);
    shuffle(groupIndexes, rng);
    const picked: SskrShare[] = [];
    for (const gi of groupIndexes.slice(0, s.groupThreshold)) {
      const grp = s.groups[gi];
      const members = Array.from({ length: grp.memberCount }, (_, i) => i);
      shuffle(members, rng);
      for (const mi of members.slice(0, grp.memberThreshold)) picked.push(shares[gi][mi]);
    }
    shuffle(picked, rng);
    expect(combineShares(picked).equals(secret)).toBe(true);
  }
  it("100 random split/recover iterations", () => {
    const rng = SeededRng.forTesting();
    for (let i = 0; i < 100; i++) oneFuzz(rng);
  });
});

/** A deliberately ill-typed argument, as a JavaScript caller can pass one. */
const ill = (v: unknown): never => v as never;

describe("argument validation", () => {
  /** `ok`, the error code, or `InvalidParameter:<parameter>`. */
  const param = (f: () => unknown): string => {
    try {
      f();
      return "ok";
    } catch (e) {
      expect(SskrError.isSskrError(e)).toBe(true);
      const err = e as SskrError;
      return err.details.code === "InvalidParameter"
        ? `InvalidParameter:${err.details.parameter}`
        : err.code;
    }
  };
  const secret = () => Secret.from(Uint8Array.from({ length: 16 }, (_, i) => i + 1));
  const share = () => generateShares(spec(1, g(2, 3)), secret(), { rng: fakeRng() })[0][0];

  it("rejects an argument of the wrong type with InvalidParameter naming it", () => {
    expect(param(() => Secret.from(ill("0123456789abcdef")))).toBe("InvalidParameter:bytes");
    expect(param(() => Secret.from(ill("é1234567890123a")))).toBe("InvalidParameter:bytes");
    expect(param(() => Secret.from(ill(Array.from({ length: 16 }, () => 1))))).toBe(
      "InvalidParameter:bytes",
    );
    expect(param(() => Secret.from(ill(new Uint16Array(16))))).toBe("InvalidParameter:bytes");
    expect(param(() => Secret.fromText(ill(123)))).toBe("InvalidParameter:text");
    expect(param(() => parseShare(ill(Array.from(shareBytes(share())))))).toBe(
      "InvalidParameter:bytes",
    );
    expect(param(() => combineShares(ill("abc")))).toBe("InvalidParameter:shares");
    expect(param(() => combineShares(ill(undefined)))).toBe("InvalidParameter:shares");
    expect(param(() => combineShares(ill([5])))).toBe("InvalidParameter:share");
    expect(param(() => GroupSpec.parse(ill(123)))).toBe("InvalidParameter:text");
    expect(param(() => GroupSpec.from(ill(undefined)))).toBe("InvalidParameter:options");
    expect(param(() => Spec.from(ill(null)))).toBe("InvalidParameter:options");
    expect(param(() => Spec.from({ groupThreshold: 1, groups: ill("ab") }))).toBe(
      "InvalidParameter:groups",
    );
    expect(
      param(() =>
        Spec.from({ groupThreshold: 1, groups: [ill({ memberThreshold: 1, memberCount: 17 })] }),
      ),
    ).toBe("InvalidParameter:groups");
    expect(param(() => generateShares(spec(1, g(2, 3)), secret(), ill("x")))).toBe(
      "InvalidParameter:options",
    );
    expect(
      param(() =>
        generateShares(ill({ groupThreshold: 1, groups: [GroupSpec.DEFAULT] }), secret()),
      ),
    ).toBe("InvalidParameter:spec");
    expect(param(() => generateShares(spec(1, g(2, 3)), ill({ bytes: new Uint8Array(15) })))).toBe(
      "InvalidParameter:secret",
    );
    expect(() => Secret.from(ill("0123456789abcdef"))).toThrow(
      'bytes must be a Uint8Array, got "0123456789abcdef"',
    );
  });
  it("reads groups once, by index", () => {
    const groups = [GroupSpec.DEFAULT];
    (groups as unknown as Record<symbol, unknown>)[Symbol.iterator] = function* () {
      for (let i = 0; i < 20; i++) yield GroupSpec.DEFAULT;
    };
    expect(Spec.from({ groupThreshold: 1, groups }).groupCount).toBe(1);
  });
  it("copies a Buffer before checking it, and accepts a cross-realm Uint8Array", () => {
    const buffer = Buffer.alloc(16);
    const s = Secret.from(buffer);
    buffer[0] = 1;
    expect(s.bytes[0]).toBe(0);
    const foreignBytes = runInNewContext("new Uint8Array(16).fill(7)") as Uint8Array;
    expect(foreignBytes instanceof Uint8Array).toBe(false);
    expect(Secret.from(foreignBytes).bytes[0]).toBe(7);
    const wire = shareBytes(share());
    const foreignWire = runInNewContext(
      `Uint8Array.from(${JSON.stringify(Array.from(wire))})`,
    ) as Uint8Array;
    expect(parseShare(foreignWire).identifier).toBe(0x0011);
  });
  it("parsed shares are frozen", () => {
    expect(Object.isFrozen(parseShare(shareBytes(share())))).toBe(true);
  });
  it("Secret.equals is false for anything that is not a Secret", () => {
    const s = secret();
    expect(s.equals(undefined)).toBe(false);
    expect(s.equals({})).toBe(false);
    expect(s.equals({ bytes: s.bytes, byteLength: 16 })).toBe(false);
    expect(s.equals(s.clone())).toBe(true);
  });
  it("a share object at any position has exactly the outcome of its bytes, in array order", () => {
    const [a, b] = generateShares(spec(1, g(2, 3)), secret(), { rng: fakeRng() })[0];
    const patched = (s: SskrShare, patch: Partial<SskrShare>): SskrShare => ({ ...s, ...patch });
    expect(
      param(() =>
        combineShares([
          patched(a, { groupThreshold: 2, groupCount: 1 }),
          patched(b, { groupThreshold: 2, groupCount: 1 }),
        ]),
      ),
    ).toBe("GroupThresholdInvalid");
    expect(param(() => combineShares([a, patched(b, { memberIndex: 16 })]))).toBe(
      "InvalidParameter:memberIndex",
    );
    expect(
      param(() =>
        combineShares([patched(a, { identifier: 70000 }), patched(b, { identifier: 70000 })]),
      ),
    ).toBe("InvalidParameter:identifier");
    expect(param(() => combineShares([patched(a, { memberThreshold: 0 })]))).toBe(
      "InvalidParameter:memberThreshold",
    );
    expect(
      param(() => combineShares([shareBytes(a).subarray(0, 4), patched(b, { identifier: 70000 })])),
    ).toBe("ShareLengthInvalid");
    expect(param(() => combineShares([patched(a, { value: ill(a.value.bytes) }), b]))).toBe(
      "InvalidParameter:value",
    );
  });
});

describe("the generator", () => {
  const secret = () => Secret.from(Uint8Array.from({ length: 16 }, (_, i) => i + 1));
  it("draws two identifier bytes first, then the splits, all through rand's contract", () => {
    const fills: number[] = [];
    const inner = fakeRng();
    const recording: RandomNumberGenerator = {
      ...inner,
      fillBytes(data) {
        fills.push(data.length);
        inner.fillBytes(data);
      },
    };
    const groups = generateShares(spec(1, g(2, 3)), secret(), { rng: recording });
    expect(fills[0]).toBe(2);
    expect(fills.length).toBeGreaterThan(1);
    expect(groups[0][0].identifier).toBe(0x0011);
  });
  it("a malformed generator fails at the identifier draw with rand's InvalidGenerator, unwrapped", () => {
    const expected = (() => {
      try {
        fillRandomBytes(new Uint8Array(2), { rng: {} as RandomNumberGenerator });
      } catch (e) {
        return e as RandError;
      }
      throw new Error("unreachable");
    })();
    let got: unknown;
    try {
      generateShares(spec(1, g(2, 3)), secret(), { rng: {} as RandomNumberGenerator });
    } catch (e) {
      got = e;
    }
    expect(RandError.isRandError(got)).toBe(true);
    expect(SskrError.isSskrError(got)).toBe(false);
    const err = got as RandError;
    expect(err.code).toBe("InvalidGenerator");
    expect(err.details).toEqual(expected.details);
    expect(err.message).toBe(expected.message);
  });
  it("a generator's own ShamirError is unwrapped at the identifier draw and wrapped inside a split", () => {
    const throwingAt = (call: number): RandomNumberGenerator => {
      let n = 0;
      const inner = fakeRng();
      return {
        ...inner,
        fillBytes(data) {
          n += 1;
          if (n === call) throw ShamirError.invalidThreshold();
          inner.fillBytes(data);
        },
      };
    };
    let first: unknown;
    try {
      generateShares(spec(1, g(2, 3)), secret(), { rng: throwingAt(1) });
    } catch (e) {
      first = e;
    }
    expect(ShamirError.isShamirError(first)).toBe(true);
    expect(SskrError.isSskrError(first)).toBe(false);
    let later: unknown;
    try {
      generateShares(spec(1, g(2, 3)), secret(), { rng: throwingAt(2) });
    } catch (e) {
      later = e;
    }
    expect(SskrError.isSskrError(later)).toBe(true);
    expect((later as SskrError).code).toBe("Shamir");
    expect((later as SskrError).details).toMatchObject({ cause: { code: "InvalidThreshold" } });
  });
  it("rng null or undefined selects the secure generator", () => {
    const a = generateShares(spec(1, g(1, 1)), secret(), { rng: null as unknown as undefined });
    const b = generateShares(spec(1, g(1, 1)), secret(), { rng: undefined });
    expect(a[0][0].identifier).not.toBe(b[0][0].identifier);
  });
});

describe("GroupSpec and Spec equality", () => {
  it("compares by fields; false for anything else", () => {
    expect(g(2, 3).equals(GroupSpec.parse("2-of-3"))).toBe(true);
    expect(g(2, 3).equals(g(3, 3))).toBe(false);
    expect(g(2, 3).equals({ memberThreshold: 2, memberCount: 3 })).toBe(false);
    expect(g(2, 3).equals(undefined)).toBe(false);
    const a = spec(2, g(2, 3), g(3, 5));
    expect(a.equals(spec(2, GroupSpec.parse("2-of-3"), g(3, 5)))).toBe(true);
    expect(a.equals(spec(1, g(2, 3), g(3, 5)))).toBe(false);
    expect(a.equals(spec(2, g(2, 3), g(3, 6)))).toBe(false);
    expect(a.equals(spec(2, g(2, 3), g(3, 5), g(1, 1)))).toBe(false);
    expect(a.equals({ groupThreshold: 2, groups: a.groups })).toBe(false);
    expect(a.equals(null)).toBe(false);
  });
});

describe("instances from another copy of the package", () => {
  it("are recognised by the guards, rebuilt, and interoperate", async () => {
    vi.resetModules();
    const other = await import("../src/index.js");
    expect(other.Secret).not.toBe(Secret);
    const bytes = Uint8Array.from({ length: 16 }, (_, i) => i + 1);
    const local = Secret.from(bytes);
    const foreignSecret = other.Secret.from(bytes);
    const foreignSpec = other.Spec.from({
      groupThreshold: 2,
      groups: [
        other.GroupSpec.parse("2-of-3"),
        other.GroupSpec.from({ memberThreshold: 3, memberCount: 5 }),
      ],
    });
    expect(foreignSecret instanceof Secret).toBe(false);
    expect(Secret.isSecret(foreignSecret)).toBe(true);
    expect(Spec.isSpec(foreignSpec)).toBe(true);
    expect(GroupSpec.isGroupSpec(foreignSpec.groups[0])).toBe(true);
    expect(other.Secret.isSecret(local)).toBe(true);
    // Foreign spec and secret through this copy's generation: the same bytes.
    const here = generateShares(spec(2, g(2, 3), g(3, 5)), local, { rng: fakeRng() });
    const viaForeign = generateShares(foreignSpec, foreignSecret, { rng: fakeRng() });
    const wire = (groups: SskrShare[][]) => groups.flat().map((s) => bytesToHex(shareBytes(s)));
    expect(wire(viaForeign)).toEqual(wire(here));
    // Foreign share objects through this copy's combine.
    const foreignShares = other.generateShares(foreignSpec, foreignSecret, { rng: fakeRng() });
    const picked = [
      foreignShares[0][0],
      foreignShares[0][2],
      foreignShares[1][0],
      foreignShares[1][1],
      foreignShares[1][4],
    ];
    expect(picked.every((s) => isSskrShare(s))).toBe(true);
    expect(combineShares(picked).equals(local)).toBe(true);
    // A foreign GroupSpec inside this copy's Spec is rebuilt here.
    const rebuilt = Spec.from({ groupThreshold: 1, groups: [other.GroupSpec.DEFAULT] });
    expect(rebuilt.groups[0]).toBeInstanceOf(GroupSpec);
    expect(rebuilt.groups[0].toString()).toBe("1-of-1");
    expect(local.equals(foreignSecret)).toBe(true);
    expect(foreignSecret.equals(local)).toBe(true);
    expect(spec(2, g(2, 3), g(3, 5)).equals(foreignSpec)).toBe(true);
    expect(foreignSpec.equals(spec(2, g(2, 3), g(3, 5)))).toBe(true);
    expect(g(2, 3).equals(foreignSpec.groups[0])).toBe(true);
    expect(spec(2, g(2, 3), g(3, 6)).equals(foreignSpec)).toBe(false);
  });
});
