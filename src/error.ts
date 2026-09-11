/**
 * The single error type thrown by this package.
 *
 * @module error
 */
import type { ShamirError } from "@blockchaincommons/shamir";

/**
 * Machine-readable discriminant for a {@link SskrError}. Fourteen codes are
 * the reference's variant names, `Shamir` wraps a `ShamirError`, and
 * `InvalidParameter` is JS-only.
 */
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
  | "Shamir"
  | "InvalidParameter";

/** The codes that carry no payload: the reference's fourteen. */
export type SskrPlainCode = Exclude<SskrErrorCode, "Shamir" | "InvalidParameter">;

/**
 * The structured payload of a {@link SskrError}, discriminated by `code`:
 * `e.details.code === "InvalidParameter"` narrows to `{ parameter, value }`.
 */
export type SskrErrorDetails =
  | {
      /** One of the reference's fourteen codes; no payload. */
      readonly code: SskrPlainCode;
    }
  | {
      /** A Shamir failure surfaced through SSKR. */
      readonly code: "Shamir";
      /** The `ShamirError`; also the error's `cause`. */
      readonly cause: ShamirError;
    }
  | {
      /** A `number` argument outside the integer domain its type implies (JS-only). */
      readonly code: "InvalidParameter";
      /** The argument, e.g. `"memberThreshold"`. */
      readonly parameter: string;
      /** The value received. */
      readonly value: number;
    };

const MESSAGES: Record<SskrPlainCode, string> = {
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
export class SskrError extends Error {
  /** Always `"SskrError"`; the cross-copy identity {@link SskrError.isSskrError} checks. */
  override readonly name = "SskrError";
  /** The discriminant; equals `details.code`. */
  readonly code: SskrErrorCode;
  /** The structured payload, discriminated by `code`. */
  readonly details: SskrErrorDetails;

  private constructor(message: string, details: SskrErrorDetails, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.code = details.code;
    this.details = details;
  }

  /** Type guard for an `SskrError`, including one from another copy of this package. */
  static isSskrError(value: unknown): value is SskrError {
    return value instanceof Error && value.name === "SskrError" && "code" in value;
  }

  /** `true` when `code` is this error's code. */
  is(code: SskrErrorCode): boolean {
    return this.code === code;
  }

  /** An error with the reference message for one of the fourteen plain codes. */
  static of(code: SskrPlainCode): SskrError {
    return new SskrError(MESSAGES[code], { code });
  }

  /** A Shamir failure surfaced through SSKR; `cause` is the `ShamirError`. */
  static shamir(cause: ShamirError): SskrError {
    return new SskrError(`SSKR Shamir error: ${cause.message}`, { code: "Shamir", cause }, cause);
  }

  /** `parameter` is not an integer in `[min, max]`; `value` is what was received. */
  static invalidParameter(
    parameter: string,
    value: number,
    bounds: { readonly min: number; readonly max: number },
  ): SskrError {
    return new SskrError(
      `${parameter} must be an integer in [${bounds.min}, ${bounds.max}], got ${String(value)}`,
      { code: "InvalidParameter", parameter, value },
    );
  }
}
