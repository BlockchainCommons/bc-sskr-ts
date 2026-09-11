/**
 * Integer domains the reference's types and the wire imply.
 *
 * TypeScript has no integer widths: a spec field is a `usize`, a share
 * identifier a `u16`, an index a nibble, a threshold or count a nibble plus
 * one. A value outside its domain is `SskrError` `InvalidParameter`.
 *
 * @module domain
 */
import { SskrError } from "./error.js";

/** The inclusive bounds of an integer domain. */
export interface Bounds {
  readonly min: number;
  readonly max: number;
}

/** `usize`: a safe non-negative integer (spec fields). */
export const USIZE: Bounds = { min: 0, max: Number.MAX_SAFE_INTEGER };
/** `u16`: the share identifier. */
export const U16: Bounds = { min: 0, max: 0xffff };
/** A header nibble: group and member indexes. */
export const NIBBLE: Bounds = { min: 0, max: 0xf };
/** A header nibble stored minus one: thresholds and counts. */
export const COUNT: Bounds = { min: 1, max: 0x10 };

/** `true` when `value` is an integer `number` within `bounds`. */
export function isIntIn(value: number, bounds: Bounds): boolean {
  return Number.isInteger(value) && value >= bounds.min && value <= bounds.max;
}

/** Throws `InvalidParameter` unless `value` is an integer within `bounds`. */
export function expectInt(parameter: string, value: number, bounds: Bounds): void {
  if (!isIntIn(value, bounds)) throw SskrError.invalidParameter(parameter, value, bounds);
}
