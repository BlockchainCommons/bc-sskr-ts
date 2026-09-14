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
 * The argument an `InvalidParameter` error names: a spec field that is not
 * a `usize`, a share header field outside its width, or an argument of the
 * wrong type (`bytes` and `text` to the `Secret` factories and `parseShare`,
 * `options` records, `groups` and its elements, the `spec` and `secret` of
 * `generateShares`, `shares` and its elements, a share's `value`).
 */
export type SskrParameter =
  | "memberThreshold"
  | "memberCount"
  | "groupThreshold"
  | "identifier"
  | "groupIndex"
  | "groupCount"
  | "memberIndex"
  | "bytes"
  | "text"
  | "options"
  | "groups"
  | "spec"
  | "secret"
  | "shares"
  | "share"
  | "value";

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
      /** An argument outside its domain or of the wrong type (JS-only). */
      readonly code: "InvalidParameter";
      /** The argument, e.g. `"memberThreshold"`. */
      readonly parameter: SskrParameter;
      /** The value received, as passed. */
      readonly value: unknown;
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
 * The received value, rendered exactly: a `bigint` with its `n` suffix, an
 * unsafe integer `number` by its exact digits (`String` would round them),
 * a string quoted, and objects by their constructor name.
 */
function render(value: unknown): string {
  if (typeof value === "bigint") return `${value}n`;
  if (typeof value === "number") {
    return Number.isInteger(value) && !Number.isSafeInteger(value)
      ? BigInt(value).toString()
      : String(value);
  }
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "function") return "function";
  if (Array.isArray(value)) return "Array";
  if (typeof value === "object" && value !== null) {
    const ctor = (value as { constructor?: { name?: unknown } }).constructor;
    return typeof ctor?.name === "string" && ctor.name !== "" ? ctor.name : "object";
  }
  return String(value);
}

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

  /**
   * `parameter` is outside its domain: `expected` says what it must be
   * (`"an integer in [0, 15]"`), and `value` is what was received; the
   * message renders it exactly (`2n`, `18446744073709551616`, `"2"`).
   */
  static invalidParameter(parameter: SskrParameter, value: unknown, expected: string): SskrError {
    return new SskrError(`${parameter} must be ${expected}, got ${render(value)}`, {
      code: "InvalidParameter",
      parameter,
      value,
    });
  }
}
