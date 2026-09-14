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
 * The argument an `InvalidParameter` error names: a spec field that is not
 * a `usize`, a share header field outside its width, or an argument of the
 * wrong type (`bytes` and `text` to the `Secret` factories and `parseShare`,
 * `options` records, `groups` and its elements, the `spec` and `secret` of
 * `generateShares`, `shares` and its elements, a share's `value`).
 */
type SskrParameter = "memberThreshold" | "memberCount" | "groupThreshold" | "identifier" | "groupIndex" | "groupCount" | "memberIndex" | "bytes" | "text" | "options" | "groups" | "spec" | "secret" | "shares" | "share" | "value";
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
  /** An argument outside its domain or of the wrong type (JS-only). */
  readonly code: "InvalidParameter";
  /** The argument, e.g. `"memberThreshold"`. */
  readonly parameter: SskrParameter;
  /** The value received, as passed. */
  readonly value: unknown;
};
/**
 * Thrown for invalid specs and secrets, malformed or inconsistent share
 * sets, an unmet quorum, Shamir failures (`Shamir`, with the `ShamirError`
 * as `cause`), and (JS-only) an argument outside its domain or of the wrong
 * type (`InvalidParameter`). Messages match the Rust reference where a
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
  /**
   * `parameter` is outside its domain: `expected` says what it must be
   * (`"an integer in [0, 15]"`), and `value` is what was received; the
   * message renders it exactly (`2n`, `18446744073709551616`, `"2"`).
   */
  static invalidParameter(parameter: SskrParameter, value: unknown, expected: string): SskrError;
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
  /** Type guard for a `Secret`, including one from another copy of this package. */
  static isSecret(value: unknown): value is Secret;
  /**
   * A validated copy of `bytes`. The copy is taken first, so the checks and
   * the secret see the same bytes (a `Buffer` is accepted; its `slice`
   * would alias).
   * @throws {SskrError} `InvalidParameter` unless `bytes` is a `Uint8Array`
   * (text goes through {@link Secret.fromText}); then `SecretTooShort`,
   * `SecretTooLong`, `SecretLengthNotEven`, in that order.
   */
  static from(bytes: Uint8Array): Secret;
  /**
   * The UTF-8 bytes of `text`, validated as `from` (the reference's
   * `Secret::new(&str)`). A lone surrogate, which `&str` cannot hold, is
   * encoded as U+FFFD.
   * @throws {SskrError} `InvalidParameter` unless `text` is a string; then the `from` codes.
   */
  static fromText(text: string): Secret;
  /** A fresh copy of the bytes (16–32); mutating it does not change the secret. */
  get bytes(): Uint8Array<ArrayBuffer>;
  /** The length in bytes. */
  get byteLength(): number;
  /** Same bytes; `false` for anything that is not a `Secret` (one from another copy of this package compares by its bytes). */
  equals(other: unknown): boolean;
  /** A new `Secret` with the same bytes. */
  clone(): Secret;
}
//#endregion
//#region src/spec.d.ts
/** Options for {@link GroupSpec.from}. Each field is a `usize`: a `number` or a `bigint`. */
interface GroupSpecOptions {
  /**
   * Members needed to recover the group's share;
   * `0 ≤ memberThreshold ≤ memberCount`. A threshold of 0 is accepted, as the
   * reference accepts it, and fails at generation.
   */
  readonly memberThreshold: number | bigint;
  /** Members in the group; `1..=16`. */
  readonly memberCount: number | bigint;
}
/** `memberThreshold`-of-`memberCount` within one group. Instances are frozen. */
export declare class GroupSpec {
  #private;
  /** Members needed to recover the group's share. */
  readonly memberThreshold: number;
  /** Members in the group. */
  readonly memberCount: number;
  private constructor();
  /** Type guard for a `GroupSpec`, including one from another copy of this package. */
  static isGroupSpec(value: unknown): value is GroupSpec;
  /**
   * A validated `memberThreshold`-of-`memberCount`. Each field is read once.
   * @throws {SskrError} `InvalidParameter` unless `options` is an object and
   * both fields are `usize`s (a non-negative integer `number` up to `2^64`,
   * or a `bigint` in `[0, 2^64 - 1]`); then, in the reference's order,
   * `MemberCountInvalid` (0 or > 16), `MemberThresholdInvalid` (> count). A
   * threshold of 0 passes, as it does in `GroupSpec::new`; generating with
   * it fails as `Shamir` (cause `InvalidThreshold`).
   */
  static from(options: GroupSpecOptions): GroupSpec;
  /**
   * Parse `"<threshold>-of-<count>"`; each side is digits with an optional
   * leading `+`, nothing else, up to `u64::MAX`.
   * @throws {SskrError} `InvalidParameter` unless `text` is a string;
   * `GroupSpecInvalid`, then the `from` codes.
   */
  static parse(text: string): GroupSpec;
  /** `1-of-1`. */
  static readonly DEFAULT: GroupSpec;
  /** Same threshold and count; `false` for anything that is not a `GroupSpec` (one from another copy of this package compares by its fields). */
  equals(other: unknown): boolean;
  /** `"<threshold>-of-<count>"` */
  toString(): string;
}
/** Options for {@link Spec.from}. */
interface SpecOptions {
  /**
   * Groups that must each meet their member threshold;
   * `1 ≤ groupThreshold ≤ groups.length`. A `usize`: a `number` or a `bigint`.
   */
  readonly groupThreshold: number | bigint;
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
  /** Type guard for a `Spec`, including one from another copy of this package. */
  static isSpec(value: unknown): value is Spec;
  /**
   * A validated spec over a frozen copy of `groups`. The fields are read
   * once and `groups` is snapshotted by index, so what is checked is what
   * is stored; a `GroupSpec` from another copy of this package is rebuilt
   * through this copy's factory.
   * @throws {SskrError} `InvalidParameter` unless `options` is an object,
   * `groupThreshold` a `usize` and `groups` an array of `GroupSpec`; then
   * `GroupThresholdInvalid` (0 or > groups), `GroupCountInvalid` (> 16), in
   * the reference's order.
   */
  static from(options: SpecOptions): Spec;
  /** Same group threshold and pairwise equal groups; `false` for anything that is not a `Spec` (one from another copy of this package compares by its fields). */
  equals(other: unknown): boolean;
  /** Number of groups. */
  get groupCount(): number;
  /** Total shares across all groups. */
  get shareCount(): number;
}
//#endregion
//#region src/share.d.ts
/**
 * One SSKR share. All fields are wire; the objects {@link generateShares}
 * and {@link parseShare} return are frozen.
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
 * The reference's serializer is private and only ever sees fields from a
 * validated spec; this public one validates the object instead.
 * @throws {SskrError} `InvalidParameter` for a non-object, a header field
 * outside its width or a `value` that is not a `Secret`;
 * `GroupThresholdInvalid` when `groupThreshold > groupCount`.
 */
export declare function shareBytes(share: SskrShare): Uint8Array<ArrayBuffer>;
/**
 * Parse the wire form: the checks the reference makes on each share inside
 * `sskr_combine`, in its order. The result is frozen.
 * @throws {SskrError} `InvalidParameter` unless `bytes` is a `Uint8Array`;
 * then `ShareLengthInvalid` (under 5 bytes), `GroupThresholdInvalid`
 * (threshold above count), `ShareReservedBitsInvalid`, then the secret codes.
 */
export declare function parseShare(bytes: Uint8Array): SskrShare;
/**
 * Whether `share` is a share object (vs its bytes): an object whose `value`
 * is a `Secret`, from this or another copy of this package. That is enough
 * to tell the two forms {@link combineShares} accepts apart; it does not
 * validate the header fields, which {@link shareBytes} and `combineShares` do.
 */
export declare function isSskrShare(share: unknown): share is SskrShare;
//#endregion
//#region src/generate.d.ts
/**
 * Options for {@link generateShares}: rand's `rng` (secure by default), which
 * draws the identifier and every Shamir share. `null` or `undefined` selects
 * the secure generator; a generator without a callable `fillBytes` fails at
 * the identifier draw with rand's `RandError` `InvalidGenerator`.
 */
type GenerateOptions = RngOptions;
/**
 * Split `secret` per `spec`: one array of shares per group, in spec order.
 *
 * The arguments are checked before the first draw: `spec` must be a `Spec`
 * and `secret` a `Secret` (instances from another copy of this package are
 * rebuilt through this copy's factories), `options` an object or absent.
 * The draw order is wire: two identifier bytes first (through rand's
 * `fillRandomBytes`, so a malformed generator fails there with rand's
 * `RandError`, unwrapped), then the group-level Shamir split, then each
 * group's member split in group order. A generator's own error propagates
 * unwrapped. The share objects are frozen.
 * @throws {SskrError} `InvalidParameter` for an argument of the wrong type;
 * `Shamir` for a Shamir failure, including a group whose member threshold
 * is 0 (cause `InvalidThreshold`), after every earlier draw.
 */
export declare function generateShares(spec: Spec, secret: Secret, options?: GenerateOptions): SskrShare[][];
//#endregion
//#region src/combine.d.ts
/**
 * Recover the secret from `shares`: serialized bytes (what the reference
 * takes), share objects, or both in one array, in any order. Each element is
 * normalised once, in array order: bytes through {@link parseShare}, an
 * object through the checks {@link shareBytes} makes; so at every position
 * an object has exactly the outcome its bytes would have, and errors surface
 * in array order. Every share must carry the same identifier, group
 * threshold, group count and value length; a group that fails its Shamir
 * recovery is skipped.
 *
 * @throws {SskrError} `InvalidParameter` for a non-array or an element that
 * is neither bytes nor a share object; `SharesEmpty`, the parse codes,
 * `ShareSetInvalid`, `MemberThresholdInvalid`, `DuplicateMemberIndex`,
 * `NotEnoughGroups`, `Shamir`.
 */
export declare function combineShares(shares: readonly (SskrShare | Uint8Array)[]): Secret;
//#endregion
export type { GenerateOptions, GroupSpecOptions, SpecOptions, SskrErrorCode, SskrErrorDetails, SskrParameter, SskrPlainCode, SskrShare };
//# sourceMappingURL=index.d.mts.map