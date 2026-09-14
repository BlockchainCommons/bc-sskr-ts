/**
 * The argument domains the reference's types and the wire imply.
 *
 * TypeScript has no integer widths. A spec field is a `usize` and arrives as
 * a `number` or a `bigint`: a `bigint` is exact over `[0, 2^64 - 1]`; an
 * integer-valued `number` is accepted up to `2^64`, even though above
 * `2^53 - 1` a double stands for several integers, because every check the
 * reference makes compares a spec field with at most 16 or with the group
 * count, so every `usize` that rounds to the same double has the same
 * outcome (`2^64` itself stands for `2^64 - 1`, the largest `usize`). A
 * share identifier is a `u16`, an index a nibble, a threshold or count a
 * nibble plus one, all `number`s. A value outside its domain is `SskrError`
 * `InvalidParameter`.
 *
 * @module domain
 */
import { SskrError, type SskrParameter } from "./error.js";

/** The reference's 64-bit `usize` maximum. */
export const USIZE_MAX: bigint = 0xffff_ffff_ffff_ffffn;
const TWO_POW_64 = 2 ** 64;
/** What a spec field must be. */
export const USIZE_DOMAIN = "an integer in [0, 18446744073709551615] (a number or a bigint)";

/**
 * `value` as a `usize`: a `bigint` in `[0, USIZE_MAX]` as itself, an
 * integer-valued `number` in `[0, 2^64]` as a `bigint` (`2^64` as
 * `USIZE_MAX`); `undefined` for anything else.
 */
export function usizeOf(value: unknown): bigint | undefined {
  if (typeof value === "bigint") return value >= 0n && value <= USIZE_MAX ? value : undefined;
  if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= TWO_POW_64) {
    return value === TWO_POW_64 ? USIZE_MAX : BigInt(value);
  }
  return undefined;
}

/** Throws `InvalidParameter` unless `value` is a `usize`; returns it as a `bigint`. */
export function expectUsize(parameter: SskrParameter, value: unknown): bigint {
  const usize = usizeOf(value);
  if (usize === undefined) throw SskrError.invalidParameter(parameter, value, USIZE_DOMAIN);
  return usize;
}

/** The inclusive bounds of a header field. */
export interface Bounds {
  readonly min: number;
  readonly max: number;
}

/** `u16`: the share identifier. */
export const U16: Bounds = { min: 0, max: 0xffff };
/** A header nibble: group and member indexes. */
export const NIBBLE: Bounds = { min: 0, max: 0xf };
/** A header nibble stored minus one: thresholds and counts. */
export const COUNT: Bounds = { min: 1, max: 0x10 };

/** Throws `InvalidParameter` unless `value` is an integer `number` within `bounds`. */
export function expectWidth(parameter: SskrParameter, value: unknown, bounds: Bounds): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < bounds.min ||
    value > bounds.max
  ) {
    throw SskrError.invalidParameter(
      parameter,
      value,
      `an integer in [${bounds.min}, ${bounds.max}]`,
    );
  }
  return value;
}

/** A `Uint8Array` from any realm (`Buffer` included), never another typed array. */
export function isBytes(value: unknown): value is Uint8Array {
  return (
    value instanceof Uint8Array ||
    (ArrayBuffer.isView(value) &&
      (value as { constructor?: { name?: unknown } }).constructor?.name === "Uint8Array")
  );
}

/** A non-null object that is not an array. */
export function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The identity of this package's value types across copies of the package
 * (two builds, two versions, two realms): a symbol every copy shares, set on
 * each instance by its private constructor.
 */
const TYPE_KEY: symbol = Symbol.for("@blockchaincommons/sskr/type");
/** The value-type names a brand can carry. */
export type Brand = "Secret@1" | "GroupSpec@1" | "Spec@1";

/** Marks `target` as an instance of `name`: an own, non-enumerable, immutable property. */
export function brand(target: object, name: Brand): void {
  Object.defineProperty(target, TYPE_KEY, {
    value: name,
    enumerable: false,
    writable: false,
    configurable: false,
  });
}

/** `true` when `value` carries the brand `name` as its own property. */
export function hasBrand(value: unknown, name: Brand): boolean {
  return (
    isRecord(value) &&
    Object.prototype.hasOwnProperty.call(value, TYPE_KEY) &&
    value[TYPE_KEY] === name
  );
}
