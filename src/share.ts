/**
 * The share value and its wire form (BCR-2020-011).
 *
 * @module share
 */
import { SHARE_HEADER_LENGTH } from "./constants.js";
import { SskrError } from "./error.js";
import { Secret } from "./secret.js";

/** One SSKR share. All fields are wire. */
export interface SskrShare {
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
export function shareBytes(share: SskrShare): Uint8Array<ArrayBuffer> {
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

/** Whether `share` is a parsed share (vs its bytes). */
export function isSskrShare(share: unknown): share is SskrShare {
  return (
    typeof share === "object" &&
    share !== null &&
    "value" in share &&
    (share as SskrShare).value instanceof Secret
  );
}
