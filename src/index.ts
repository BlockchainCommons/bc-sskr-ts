/**
 * @blockchaincommons/sskr - Sharded Secret Key Reconstruction
 * (BCR-2020-011): a secret split into groups of Shamir shares, any
 * `groupThreshold` groups of which, each at its member threshold, recover it.
 *
 * {@link generateShares} produces {@link SskrShare}s per group;
 * {@link shareBytes} / {@link parseShare} are the wire form;
 * {@link combineShares} recovers. Every failure is a {@link SskrError} with a `code`.
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
export { SskrError, type SskrErrorCode } from "./error.js";
export { Secret } from "./secret.js";
export { GroupSpec, Spec, type GroupSpecOptions, type SpecOptions } from "./spec.js";
export { type SskrShare, shareBytes, parseShare, isSskrShare } from "./share.js";
export { generateShares, type GenerateOptions } from "./generate.js";
export { combineShares } from "./combine.js";
