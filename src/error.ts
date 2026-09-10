/**
 * The single error type thrown by this package.
 *
 * @module error
 */
import type { ShamirError } from "@blockchaincommons/shamir";

/** Machine-readable discriminant for a {@link SskrError}. */
export type SskrErrorCode =
  | "DuplicateMemberIndex"
  | "GroupSpecInvalid"
  | "GroupCountInvalid"
  | "GroupThresholdInvalid"
  | "MemberCountInvalid"
  | "MemberThresholdInvalid"
  | "NotEnoughGroups"
  | "SecretLengthNotEven"
  | "SecretTooLong"
  | "SecretTooShort"
  | "ShareLengthInvalid"
  | "ShareReservedBitsInvalid"
  | "SharesEmpty"
  | "ShareSetInvalid"
  | "Shamir";

const MESSAGES: Record<Exclude<SskrErrorCode, "Shamir">, string> = {
  DuplicateMemberIndex:
    "When combining shares, the provided shares contained a duplicate member index",
  GroupSpecInvalid: "Invalid group specification.",
  GroupCountInvalid: "When creating a split spec, the group count is invalid",
  GroupThresholdInvalid: "SSKR group threshold is invalid",
  MemberCountInvalid: "SSKR member count is invalid",
  MemberThresholdInvalid: "SSKR member threshold is invalid",
  NotEnoughGroups: "SSKR shares did not contain enough groups",
  SecretLengthNotEven: "SSKR secret is not of even length",
  SecretTooLong: "SSKR secret is too long",
  SecretTooShort: "SSKR secret is too short",
  ShareLengthInvalid: "SSKR shares did not contain enough serialized bytes",
  ShareReservedBitsInvalid: "SSKR shares contained invalid reserved bits",
  SharesEmpty: "SSKR shares were empty",
  ShareSetInvalid: "SSKR shares were invalid",
};

const captureStackTrace = (
  Error as unknown as { captureStackTrace?: (target: object, ctor: unknown) => void }
).captureStackTrace;

/**
 * Thrown for invalid specs and secrets, malformed or inconsistent share
 * sets, an unmet quorum, and Shamir failures (`Shamir`, with the
 * `ShamirError` as `cause`). Messages match the Rust reference; branch on `code`.
 */
export class SskrError extends Error {
  readonly code: SskrErrorCode;

  constructor(code: SskrErrorCode, message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "SskrError";
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
    if (typeof captureStackTrace === "function") captureStackTrace(this, SskrError);
  }

  static isSskrError(value: unknown): value is SskrError {
    return value instanceof SskrError;
  }

  /** An error with the reference message for `code`. */
  static of(code: Exclude<SskrErrorCode, "Shamir">): SskrError {
    return new SskrError(code, MESSAGES[code]);
  }

  /** A Shamir failure surfaced through SSKR. */
  static shamir(cause: ShamirError): SskrError {
    return new SskrError("Shamir", `SSKR Shamir error: ${cause.message}`, cause);
  }
}
