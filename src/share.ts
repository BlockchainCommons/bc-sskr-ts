/**
 * The share value and its wire form (BCR-2020-011).
 *
 * @module share
 */
import { SHARE_HEADER_LENGTH } from "./constants.js";
import { COUNT, NIBBLE, U16, expectInt } from "./domain.js";
import { SskrError } from "./error.js";
import { Secret } from "./secret.js";

/**
 * One SSKR share. All fields are wire; the objects {@link generateShares}
 * returns are frozen.
 */
export interface SskrShare {
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
 * @throws {SskrError} `InvalidParameter` for a header field outside its
 * width on this TypeScript-only public serialization API, then
 * `GroupThresholdInvalid` when `groupThreshold > groupCount`.
 */
export function shareBytes(share: SskrShare): Uint8Array<ArrayBuffer> {
  expectInt("identifier", share.identifier, U16);
  expectInt("groupIndex", share.groupIndex, NIBBLE);
  expectInt("groupThreshold", share.groupThreshold, COUNT);
  expectInt("groupCount", share.groupCount, COUNT);
  expectInt("memberIndex", share.memberIndex, NIBBLE);
  expectInt("memberThreshold", share.memberThreshold, COUNT);
  if (share.groupThreshold > share.groupCount) throw SskrError.of("GroupThresholdInvalid");
  const value = share.value.bytes;
  const out = new Uint8Array(SHARE_HEADER_LENGTH + value.length);
  out[0] = share.identifier >> 8;
  out[1] = share.identifier & 0xff;
  out[2] = (((share.groupThreshold - 1) & 0xf) << 4) | ((share.groupCount - 1) & 0xf);
  out[3] = ((share.groupIndex & 0xf) << 4) | ((share.memberThreshold - 1) & 0xf);
  out[4] = share.memberIndex & 0xf;
  out.set(value, SHARE_HEADER_LENGTH);
  return out;
}

/**
 * Parse the wire form.
 * @throws {SskrError} `ShareLengthInvalid` (under 5 bytes), `GroupThresholdInvalid`
 * (threshold above count), `ShareReservedBitsInvalid`, then the secret codes.
 */
export function parseShare(bytes: Uint8Array): SskrShare {
  if (bytes.length < SHARE_HEADER_LENGTH) throw SskrError.of("ShareLengthInvalid");
  const b2 = bytes[2];
  const b3 = bytes[3];
  const b4 = bytes[4];
  const groupThreshold = (b2 >> 4) + 1;
  const groupCount = (b2 & 0xf) + 1;
  if (groupThreshold > groupCount) throw SskrError.of("GroupThresholdInvalid");
  if (b4 >> 4 !== 0) throw SskrError.of("ShareReservedBitsInvalid");
  return {
    identifier: (bytes[0] << 8) | bytes[1],
    groupIndex: b3 >> 4,
    groupThreshold,
    groupCount,
    memberIndex: b4 & 0xf,
    memberThreshold: (b3 & 0xf) + 1,
    value: Secret.from(bytes.subarray(SHARE_HEADER_LENGTH)),
  };
}

/**
 * Whether `share` is a parsed share (vs its bytes): a duck-type check on
 * `value instanceof Secret`, enough to tell the two forms
 * {@link combineShares} accepts apart. It does not validate the fields;
 * {@link shareBytes} does.
 */
export function isSskrShare(share: unknown): share is SskrShare {
  return (
    typeof share === "object" &&
    share !== null &&
    "value" in share &&
    (share as SskrShare).value instanceof Secret
  );
}
