import { ShamirError } from "@blockchaincommons/shamir";
import { RngOptions } from "@blockchaincommons/rand";
//#region src/constants.d.ts
/** Shortest secret, in bytes (shamir's). */
export declare const MIN_SECRET_LENGTH: number;
/** Longest secret, in bytes (shamir's). */
export declare const MAX_SECRET_LENGTH: number;
/** Most members in a group (shamir's share limit). */
export declare const MAX_SHARE_COUNT: number;
/** Most groups in a spec. */
export declare const MAX_GROUP_COUNT: number;
/** Bytes before a share's value: identifier (2), group threshold/count, group index/member threshold, member index. */
export declare const SHARE_HEADER_LENGTH = 5;
/** Shortest serialized share. */
export declare const MIN_SHARE_LENGTH: number;
//#endregion
//#region src/error.d.ts
/**
 * Machine-readable discriminant for a {@link SskrError}. Fourteen codes are
 * the reference's variant names, `Shamir` wraps a `ShamirError`, and
 * `InvalidParameter` is JS-only.
 */
type SskrErrorCode = "DuplicateMemberIndex" | "GroupSpecInvalid" | "GroupCountInvalid" | "GroupThresholdInvalid" | "MemberCountInvalid" | "MemberThresholdInvalid" | "NotEnoughGroups" | "SecretLengthNotEven" | "SecretTooLong" | "SecretTooShort" | "ShareLengthInvalid" | "ShareReservedBitsInvalid" | "SharesEmpty" | "ShareSetInvalid" | "Shamir" | "InvalidParameter";
/** The codes that carry no payload: the reference's fourteen. */
type SskrPlainCode = Exclude<SskrErrorCode, "Shamir" | "InvalidParameter">;
/**
 * The structured payload of a {@link SskrError}, discriminated by `code`:
 * `e.details.code === "InvalidParameter"` narrows to `{ parameter, value }`.
 */
type SskrErrorDetails = {
  /** One of the reference's fourteen codes; no payload. */
  readonly code: SskrPlainCode;
} | {
  /** A Shamir failure surfaced through SSKR. */
  readonly code: "Shamir";
  /** The `ShamirError`; also the error's `cause`. */
  readonly cause: ShamirError;
} | {
  /** A `number` argument outside the integer domain its type implies (JS-only). */
  readonly code: "InvalidParameter";
  /** The argument, e.g. `"memberThreshold"`. */
  readonly parameter: string;
  /** The value received. */
  readonly value: number;
};
/**
 * Thrown for invalid specs and secrets, malformed or inconsistent share
 * sets, an unmet quorum, Shamir failures (`Shamir`, with the `ShamirError`
 * as `cause`), and (JS-only) a spec or header field outside its integer
 * domain (`InvalidParameter`). Messages match the Rust reference where a
 * variant exists; branch on `code`.
 *
 * Instances come from the static factories only.
 *
 * @example
 * ```ts
 * try {
 *   combineShares(shares);
 * } catch (e) {
 *   if (SskrError.isSskrError(e) && e.is("NotEnoughGroups")) {
 *     // more groups needed
 *   }
 * }
 * ```
 */
export declare class SskrError extends Error {
  /** Always `"SskrError"`; the cross-copy identity {@link SskrError.isSskrError} checks. */
  override readonly name = "SskrError";
  /** The discriminant; equals `details.code`. */
  readonly code: SskrErrorCode;
  /** The structured payload, discriminated by `code`. */
  readonly details: SskrErrorDetails;
  private constructor();
  /** Type guard for an `SskrError`, including one from another copy of this package. */
  static isSskrError(value: unknown): value is SskrError;
  /** `true` when `code` is this error's code. */
  is(code: SskrErrorCode): boolean;
  /** An error with the reference message for one of the fourteen plain codes. */
  static of(code: SskrPlainCode): SskrError;
  /** A Shamir failure surfaced through SSKR; `cause` is the `ShamirError`. */
  static shamir(cause: ShamirError): SskrError;
  /** `parameter` is not an integer in `[min, max]`; `value` is what was received. */
  static invalidParameter(parameter: string, value: number, bounds: {
    readonly min: number;
    readonly max: number;
  }): SskrError;
}
//#endregion
//#region src/secret.d.ts
/**
 * A validated secret: 16–32 bytes, even length. Holds its own copy and
 * hands out copies; nothing outside can change it.
 */
export declare class Secret {
  #private;
  private constructor();
  /**
   * A validated copy of `bytes`.
   * @throws {SskrError} `SecretTooShort`, `SecretTooLong`, `SecretLengthNotEven`, in that order.
   */
  static from(bytes: Uint8Array): Secret;
  /** The UTF-8 bytes of `text`, validated as `from`. */
  static fromText(text: string): Secret;
  /** A fresh copy of the bytes (16–32); mutating it does not change the secret. */
  get bytes(): Uint8Array<ArrayBuffer>;
  /** The length in bytes. */
  get byteLength(): number;
  /** Same bytes. */
  equals(other: Secret): boolean;
  /** A new `Secret` with the same bytes. */
  clone(): Secret;
}
//#endregion
//#region src/spec.d.ts
/** Options for {@link GroupSpec.from}. */
interface GroupSpecOptions {
  /** Members needed to recover the group's share; `1 ≤ memberThreshold ≤ memberCount`. */
  readonly memberThreshold: number;
  /** Members in the group; `1..=16`. */
  readonly memberCount: number;
}
/** `memberThreshold`-of-`memberCount` within one group. Instances are frozen. */
export declare class GroupSpec {
  /** Members needed to recover the group's share. */
  readonly memberThreshold: number;
  /** Members in the group. */
  readonly memberCount: number;
  private constructor();
  /**
   * A validated `memberThreshold`-of-`memberCount`.
   * @throws {SskrError} `InvalidParameter` unless both fields are safe
   * non-negative integers; then, in the reference's order,
   * `MemberCountInvalid` (0 or > 16), `MemberThresholdInvalid` (> count);
   * then `MemberThresholdInvalid` for a threshold of 0 (which the reference
   * accepts — divergence D1; BCR-2020-011 requires at least 1).
   */
  static from(options: GroupSpecOptions): GroupSpec;
  /**
   * Parse `"<threshold>-of-<count>"`; each side is digits with an optional
   * leading `+`, nothing else.
   * @throws {SskrError} `GroupSpecInvalid`, then the `from` codes.
   */
  static parse(s: string): GroupSpec;
  /** `1-of-1`. */
  static readonly DEFAULT: GroupSpec;
  /** `"<threshold>-of-<count>"` */
  toString(): string;
}
/** Options for {@link Spec.from}. */
interface SpecOptions {
  /** Groups that must each meet their member threshold; `1 ≤ groupThreshold ≤ groups.length`. */
  readonly groupThreshold: number;
  /** The groups, at most 16. */
  readonly groups: readonly GroupSpec[];
}
/**
 * `groupThreshold` of `groups` must each meet their member threshold.
 * Instances and their `groups` array are frozen.
 */
export declare class Spec {
  /** Groups needed to recover. */
  readonly groupThreshold: number;
  /** The groups, in order; a frozen copy of what was passed. */
  readonly groups: readonly GroupSpec[];
  private constructor();
  /**
   * A validated spec over a frozen copy of `groups`.
   * @throws {SskrError} `InvalidParameter` unless `groupThreshold` is a safe
   * non-negative integer; then `GroupThresholdInvalid` (0 or > groups),
   * `GroupCountInvalid` (> 16), in the reference's order.
   */
  static from(options: SpecOptions): Spec;
  /** Number of groups. */
  get groupCount(): number;
  /** Total shares across all groups. */
  get shareCount(): number;
}
//#endregion
//#region src/share.d.ts
/**
 * One SSKR share. All fields are wire; the objects {@link generateShares}
 * returns are frozen.
 */
interface SskrShare {
  /** 16-bit random identifier shared by every share of one split. */
  readonly identifier: number;
  /** Position of the share's group in the spec, `0..=15`. */
  readonly groupIndex: number;
  /** Groups needed to recover, `1..=16`. */
  readonly groupThreshold: number;
  /** Groups in the split, `1..=16`. */
  readonly groupCount: number;
  /** Position of the share within its group, `0..=15`. */
  readonly memberIndex: number;
  /** Members of the group needed to recover its share, `1..=16`. */
  readonly memberThreshold: number;
  /** The share's bytes, a `Secret` of the master secret's length. */
  readonly value: Secret;
}
/**
 * Serialize: identifier (2 bytes, big-endian), `(gt-1)<<4 | (gc-1)`,
 * `gi<<4 | (mt-1)`, `mi` (reserved high nibble zero), then the value.
 * @throws {SskrError} `InvalidParameter` for a header field outside its
 * width (the reference masks them silently — divergence D2), then
 * `GroupThresholdInvalid` when `groupThreshold > groupCount`.
 */
export declare function shareBytes(share: SskrShare): Uint8Array<ArrayBuffer>;
/**
 * Parse the wire form.
 * @throws {SskrError} `ShareLengthInvalid` (under 5 bytes), `GroupThresholdInvalid`
 * (threshold above count), `ShareReservedBitsInvalid`, then the secret codes.
 */
export declare function parseShare(bytes: Uint8Array): SskrShare;
/**
 * Whether `share` is a parsed share (vs its bytes): a duck-type check on
 * `value instanceof Secret`, enough to tell the two forms
 * {@link combineShares} accepts apart. It does not validate the fields;
 * {@link shareBytes} does.
 */
export declare function isSskrShare(share: unknown): share is SskrShare;
//#endregion
//#region src/generate.d.ts
/**
 * Options for {@link generateShares}: rand's `rng` (secure by default), which
 * draws the identifier and every Shamir share.
 */
type GenerateOptions = RngOptions;
/**
 * Split `secret` per `spec`: one array of shares per group, in spec order.
 *
 * The draw order is wire: two identifier bytes first, then the group-level
 * Shamir split, then each group's member split in group order. The share
 * objects are frozen.
 * @throws {SskrError} `Shamir` for a Shamir failure.
 */
export declare function generateShares(spec: Spec, secret: Secret, options?: GenerateOptions): SskrShare[][];
//#endregion
//#region src/combine.d.ts
/**
 * Recover the secret from `shares` (parsed `SskrShare` objects, serialized
 * bytes, or both in one array — a JS-only convenience; the reference takes
 * bytes), in any order. Every share must carry the same identifier, group
 * threshold, group count and value length; a group that fails its Shamir
 * recovery is skipped.
 *
 * @throws {SskrError} `SharesEmpty`, the parse codes, `ShareSetInvalid`,
 * `MemberThresholdInvalid`, `DuplicateMemberIndex`, `NotEnoughGroups`,
 * `Shamir`.
 */
export declare function combineShares(shares: readonly (SskrShare | Uint8Array)[]): Secret;
//#endregion
export type { GenerateOptions, GroupSpecOptions, SpecOptions, SskrErrorCode, SskrErrorDetails, SskrPlainCode, SskrShare };
//# sourceMappingURL=index.d.mts.map