import { ShamirError } from "@blockchaincommons/shamir";
import { RandomNumberGenerator } from "@blockchaincommons/rand";
//#region src/error.d.ts
/**
 * Error types for SSKR operations.
 */
declare enum SSKRErrorType {
  DuplicateMemberIndex = "DuplicateMemberIndex",
  GroupSpecInvalid = "GroupSpecInvalid",
  GroupCountInvalid = "GroupCountInvalid",
  GroupThresholdInvalid = "GroupThresholdInvalid",
  MemberCountInvalid = "MemberCountInvalid",
  MemberThresholdInvalid = "MemberThresholdInvalid",
  NotEnoughGroups = "NotEnoughGroups",
  SecretLengthNotEven = "SecretLengthNotEven",
  SecretTooLong = "SecretTooLong",
  SecretTooShort = "SecretTooShort",
  ShareLengthInvalid = "ShareLengthInvalid",
  ShareReservedBitsInvalid = "ShareReservedBitsInvalid",
  SharesEmpty = "SharesEmpty",
  ShareSetInvalid = "ShareSetInvalid",
  ShamirError = "ShamirError"
}
/**
 * Error class for SSKR operations.
 */
declare class SSKRError extends Error {
  readonly type: SSKRErrorType;
  readonly shamirError?: ShamirError | undefined;
  constructor(type: SSKRErrorType, message?: string, shamirError?: ShamirError);
  private static defaultMessage;
  static fromShamirError(error: ShamirError): SSKRError;
}
/**
 * Mirrors Rust's `Result<T, Error>` (`bc-sskr-rust/src/error.rs:54`).
 *
 * The TypeScript port surfaces failures by throwing {@link SSKRError}
 * rather than returning a sum type, so this alias is a no-op
 * (`SSKRResult<T>` ≡ `T`). It is kept so signatures published in
 * `@blockchaincommons/sskr` remain visually parallel to their Rust counterparts.
 */
type SSKRResult<T> = T;
//#endregion
//#region src/secret.d.ts
/**
 * A secret to be split into shares.
 */
declare class Secret {
  private readonly data;
  private constructor();
  /**
   * Creates a new Secret instance with the given data.
   *
   * @param data - The secret data to be split into shares.
   * @returns A new Secret instance.
   * @throws SSKRError if the length of the secret is less than
   *   MIN_SECRET_LEN, greater than MAX_SECRET_LEN, or not even.
   */
  static new(data: Uint8Array | string): Secret;
  /**
   * Returns the length of the secret.
   */
  len(): number;
  /**
   * Returns true if the secret is empty.
   */
  isEmpty(): boolean;
  /**
   * Returns a reference to the secret data.
   *
   * Mirrors Rust's `Secret::data(&self) -> &[u8]`
   * (`bc-sskr-rust/src/secret.rs:43`).
   */
  getData(): Uint8Array;
  /**
   * Returns the secret data as a Uint8Array.
   *
   * Mirrors Rust's `impl AsRef<[u8]> for Secret`
   * (`bc-sskr-rust/src/secret.rs:46-49`). In Rust, `as_ref()` is
   * provided via the `AsRef<[u8]>` trait, which lets the `Secret` flow
   * naturally through any API expecting `impl AsRef<[u8]>`. TypeScript
   * has no equivalent of that trait, so we expose the same backing
   * buffer through both {@link getData} (the field accessor) and
   * `asRef` (the trait-style accessor) for ergonomic parity. Callers
   * may pick whichever name reads better at the call site.
   */
  asRef(): Uint8Array;
  /**
   * Check equality with another Secret.
   */
  equals(other: Secret): boolean;
  /**
   * Clone the secret.
   */
  clone(): Secret;
}
//#endregion
//#region src/spec.d.ts
/**
 * A specification for a group of shares within an SSKR split.
 */
declare class GroupSpec {
  private readonly _memberThreshold;
  private readonly _memberCount;
  private constructor();
  /**
   * Creates a new GroupSpec instance with the given member threshold and count.
   *
   * @param memberThreshold - The minimum number of member shares required to
   *   reconstruct the secret within the group.
   * @param memberCount - The total number of member shares in the group.
   * @returns A new GroupSpec instance.
   * @throws SSKRError if the member count is zero, if the member count is
   *   greater than the maximum share count, or if the member threshold is
   *   greater than the member count.
   */
  static new(memberThreshold: number, memberCount: number): GroupSpec;
  /**
   * Returns the member share threshold for this group.
   */
  memberThreshold(): number;
  /**
   * Returns the number of member shares in this group.
   */
  memberCount(): number;
  /**
   * Parses a group specification from a string.
   * Format: `"M-of-N"` where `M` is the threshold and `N` is the count.
   *
   * Mirrors Rust's `GroupSpec::parse` (`bc-sskr-rust/src/spec.rs:97-112`),
   * which calls `parts[0].parse::<usize>()`. Rust's `usize::FromStr` is
   * strict: it rejects whitespace, decimals, trailing characters, and the
   * `-` sign, accepting only an optional `+` prefix followed by digits.
   * We mirror that with the regex `^\+?\d+$` so strings like `"2.5"`,
   * `"2x"`, `" 2"`, `"-2"`, and `""` all surface
   * {@link SSKRErrorType.GroupSpecInvalid} on both sides.
   */
  static parse(s: string): GroupSpec;
  /**
   * Creates a default GroupSpec (1-of-1).
   */
  static default(): GroupSpec;
  /**
   * Returns a string representation of the group spec.
   */
  toString(): string;
}
/**
 * A specification for an SSKR split.
 */
declare class Spec {
  private readonly _groupThreshold;
  private readonly _groups;
  private constructor();
  /**
   * Creates a new Spec instance with the given group threshold and groups.
   *
   * @param groupThreshold - The minimum number of groups required to
   *   reconstruct the secret.
   * @param groups - The list of GroupSpec instances that define the groups
   *   and their members.
   * @returns A new Spec instance.
   * @throws SSKRError if the group threshold is zero, if the group threshold
   *   is greater than the number of groups, or if the number of groups is
   *   greater than the maximum share count.
   */
  static new(groupThreshold: number, groups: GroupSpec[]): Spec;
  /**
   * Returns the group threshold.
   */
  groupThreshold(): number;
  /**
   * Returns a slice of the group specifications.
   */
  groups(): GroupSpec[];
  /**
   * Returns the number of groups.
   */
  groupCount(): number;
  /**
   * Returns the total number of shares across all groups.
   */
  shareCount(): number;
}
//#endregion
//#region src/encoding.d.ts
/**
 * Generates SSKR shares for the given Spec and Secret.
 *
 * @param spec - The Spec instance that defines the group and member thresholds.
 * @param masterSecret - The Secret instance to be split into shares.
 * @returns A vector of groups, each containing a vector of shares,
 *   each of which is a Uint8Array.
 */
declare function sskrGenerate(spec: Spec, masterSecret: Secret): Uint8Array[][];
/**
 * Generates SSKR shares for the given Spec and Secret using the provided
 * random number generator.
 *
 * @param spec - The Spec instance that defines the group and member thresholds.
 * @param masterSecret - The Secret instance to be split into shares.
 * @param randomGenerator - The random number generator to use for generating
 *   shares.
 * @returns A vector of groups, each containing a vector of shares,
 *   each of which is a Uint8Array.
 */
declare function sskrGenerateUsing(spec: Spec, masterSecret: Secret, randomGenerator: RandomNumberGenerator): Uint8Array[][];
/**
 * Combines the given SSKR shares into a Secret.
 *
 * @param shares - A array of SSKR shares to be combined.
 * @returns The reconstructed Secret.
 * @throws SSKRError if the shares do not meet the necessary quorum of groups
 *   and member shares within each group.
 */
declare function sskrCombine(shares: Uint8Array[]): Secret;
//#endregion
//#region src/index.d.ts
/**
 * The minimum length of a secret.
 */
declare const MIN_SECRET_LEN: number;
/**
 * The maximum length of a secret.
 */
declare const MAX_SECRET_LEN: number;
/**
 * The maximum number of shares that can be generated from a secret.
 */
declare const MAX_SHARE_COUNT: number;
/**
 * The maximum number of groups in a split.
 */
declare const MAX_GROUPS_COUNT: number;
/**
 * The number of bytes used to encode the metadata for a share.
 */
declare const METADATA_SIZE_BYTES = 5;
/**
 * The minimum number of bytes required to encode a share.
 */
declare const MIN_SERIALIZE_SIZE_BYTES: number;
//#endregion
export { GroupSpec, MAX_GROUPS_COUNT, MAX_SECRET_LEN, MAX_SHARE_COUNT, METADATA_SIZE_BYTES, MIN_SECRET_LEN, MIN_SERIALIZE_SIZE_BYTES, SSKRError, SSKRErrorType, type SSKRResult, Secret, Spec, sskrCombine, sskrGenerate, sskrGenerateUsing };
//# sourceMappingURL=index.d.mts.map