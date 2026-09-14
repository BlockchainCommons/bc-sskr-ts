/**
 * @blockchaincommons/sskr - Sharded Secret Key Reconstruction
 * (BCR-2020-011): a secret split into groups of Shamir shares, any
 * `groupThreshold` groups of which, each at its member threshold, recover it.
 *
 * {@link generateShares} produces {@link SskrShare}s per group;
 * {@link shareBytes} / {@link parseShare} are the wire form;
 * {@link combineShares} recovers. Every failure is a {@link SskrError} with a
 * `code`: the reference's fourteen, `Shamir` for a wrapped Shamir failure,
 * and `InvalidParameter` for a spec field that is not a `usize` (a
 * non-negative integer `number` up to `2^64`, or a `bigint` in
 * `[0, 2^64 - 1]`) or a header field outside its width.
 *
 * @module @blockchaincommons/sskr
 */
export {
  MIN_SECRET_LENGTH,
  MAX_SECRET_LENGTH,
  MAX_SHARE_COUNT,
  MAX_GROUP_COUNT,
  SHARE_HEADER_LENGTH,
  MIN_SHARE_LENGTH,
} from "./constants.js";
export {
  SskrError,
  type SskrErrorCode,
  type SskrErrorDetails,
  type SskrParameter,
  type SskrPlainCode,
} from "./error.js";
export { Secret } from "./secret.js";
export { GroupSpec, Spec, type GroupSpecOptions, type SpecOptions } from "./spec.js";
export { type SskrShare, shareBytes, parseShare, isSskrShare } from "./share.js";
export { generateShares, type GenerateOptions } from "./generate.js";
export { combineShares } from "./combine.js";
