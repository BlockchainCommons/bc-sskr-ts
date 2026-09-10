import { ShamirError } from "@blockchaincommons/shamir";
import { RandomNumberGenerator } from "@blockchaincommons/rand";
//#region src/constants.d.ts
/** Shortest secret, in bytes (shamir's). */
declare const MIN_SECRET_LENGTH: number;
/** Longest secret, in bytes (shamir's). */
declare const MAX_SECRET_LENGTH: number;
/** Most members in a group (shamir's share limit). */
declare const MAX_SHARE_COUNT: number;
/** Most groups in a spec. */
declare const MAX_GROUP_COUNT: number;
/** Bytes before a share's value: identifier (2), group threshold/count, group index/member threshold, member index. */
declare const SHARE_HEADER_LENGTH = 5;
/** Shortest serialized share. */
declare const MIN_SHARE_LENGTH: number;
//#endregion
//#region src/error.d.ts
/** Machine-readable discriminant for a {@link SskrError}. */
type SskrErrorCode = "DuplicateMemberIndex" | "GroupSpecInvalid" | "GroupCountInvalid" | "GroupThresholdInvalid" | "MemberCountInvalid" | "MemberThresholdInvalid" | "NotEnoughGroups" | "SecretLengthNotEven" | "SecretTooLong" | "SecretTooShort" | "ShareLengthInvalid" | "ShareReservedBitsInvalid" | "SharesEmpty" | "ShareSetInvalid" | "Shamir";
/**
 * Thrown for invalid specs and secrets, malformed or inconsistent share
 * sets, an unmet quorum, and Shamir failures (`Shamir`, with the
 * `ShamirError` as `cause`). Messages match the Rust reference; branch on `code`.
 */
declare class SskrError extends Error {
  readonly code: SskrErrorCode;
  constructor(code: SskrErrorCode, message: string, cause?: unknown);
  static isSskrError(value: unknown): value is SskrError;
  /** An error with the reference message for `code`. */
  static of(code: Exclude<SskrErrorCode, "Shamir">): SskrError;
  /** A Shamir failure surfaced through SSKR. */
  static shamir(cause: ShamirError): SskrError;
}
//#endregion
//#region src/secret.d.ts
/** A validated secret: 16–32 bytes, even length. Holds its own copy. */
declare class Secret {
  #private;
  private constructor();
  /** @throws {SskrError} `SecretTooShort`, `SecretTooLong`, `SecretLengthNotEven`, in that order. */
  static from(bytes: Uint8Array): Secret;
  /** The UTF-8 bytes of `text`, validated as `from`. */
  static fromText(text: string): Secret;
  get bytes(): Uint8Array<ArrayBuffer>;
  get byteLength(): number;
  equals(other: Secret): boolean;
  clone(): Secret;
}
//#endregion
//#region src/spec.d.ts
/** Options for {@link GroupSpec.from}. */
interface GroupSpecOptions {
  readonly memberThreshold: number;
  readonly memberCount: number;
}
/** `memberThreshold`-of-`memberCount` within one group. */
declare class GroupSpec {
  readonly memberThreshold: number;
  readonly memberCount: number;
  private constructor();
  /** @throws {SskrError} `MemberCountInvalid` (0 or > 16), `MemberThresholdInvalid` (> count). */
  static from(options: GroupSpecOptions): GroupSpec;
  /**
   * Parse `"<threshold>-of-<count>"`; each side is digits with an optional
   * leading `+`, nothing else.
   * @throws {SskrError} `GroupSpecInvalid`, then the {@link from} codes.
   */
  static parse(s: string): GroupSpec;
  /** `1-of-1`. */
  static readonly DEFAULT: GroupSpec;
  /** `"<threshold>-of-<count>"` */
  toString(): string;
}
/** Options for {@link Spec.from}. */
interface SpecOptions {
  readonly groupThreshold: number;
  readonly groups: readonly GroupSpec[];
}
/** `groupThreshold` of `groups` must each meet their member threshold. */
declare class Spec {
  readonly groupThreshold: number;
  readonly groups: readonly GroupSpec[];
  private constructor();
  /** @throws {SskrError} `GroupThresholdInvalid` (0 or > groups), `GroupCountInvalid` (> 16). */
  static from(options: SpecOptions): Spec;
  get groupCount(): number;
  /** Total shares across all groups. */
  get shareCount(): number;
}
//#endregion
//#region src/share.d.ts
/** One SSKR share. All fields are wire. */
interface SskrShare {
  /** 16-bit random identifier shared by every share of one split. */
  readonly identifier: number;
  readonly groupIndex: number;
  readonly groupThreshold: number;
  readonly groupCount: number;
  readonly memberIndex: number;
  readonly memberThreshold: number;
  readonly value: Secret;
}
/**
 * Serialize: identifier (2 bytes, big-endian), `(gt-1)<<4 | (gc-1)`,
 * `gi<<4 | (mt-1)`, `mi` (reserved high nibble zero), then the value.
 */
declare function shareBytes(share: SskrShare): Uint8Array<ArrayBuffer>;
/**
 * Parse the wire form.
 * @throws {SskrError} `ShareLengthInvalid` (under 5 bytes), `GroupThresholdInvalid`
 * (threshold above count), `ShareReservedBitsInvalid`, then the secret codes.
 */
declare function parseShare(bytes: Uint8Array): SskrShare;
/** Whether `share` is a parsed share (vs its bytes). */
declare function isSskrShare(share: unknown): share is SskrShare;
//#endregion
//#region src/generate.d.ts
/** Options for {@link generateShares}. */
interface GenerateOptions {
  /** Generator for the identifier and the Shamir shares. Default: secure. */
  readonly rng?: RandomNumberGenerator | undefined;
}
/**
 * Split `secret` per `spec`: one array of shares per group, in spec order.
 *
 * The draw order is wire: two identifier bytes first, then the group-level
 * Shamir split, then each group's member split in group order.
 * @throws {SskrError} `Shamir` for a Shamir failure.
 */
declare function generateShares(spec: Spec, secret: Secret, options?: GenerateOptions): SskrShare[][];
//#endregion
//#region src/combine.d.ts
/**
 * Recover the secret from `shares` (parsed or serialized), in any order.
 * Every share must carry the same identifier, group threshold, group count
 * and value length; a group that fails its Shamir recovery is skipped.
 *
 * @throws {SskrError} `SharesEmpty`, the parse codes, `ShareSetInvalid`,
 * `MemberThresholdInvalid`, `DuplicateMemberIndex`, `NotEnoughGroups`,
 * `Shamir`.
 */
declare function combineShares(shares: readonly (SskrShare | Uint8Array)[]): Secret;
//#endregion
export { type GenerateOptions, GroupSpec, type GroupSpecOptions, MAX_GROUP_COUNT, MAX_SECRET_LENGTH, MAX_SHARE_COUNT, MIN_SECRET_LENGTH, MIN_SHARE_LENGTH, SHARE_HEADER_LENGTH, Secret, Spec, type SpecOptions, SskrError, type SskrErrorCode, type SskrShare, combineShares, generateShares, isSskrShare, parseShare, shareBytes };
//# sourceMappingURL=index.d.mts.map