/**
 * The share value and its wire form (BCR-2020-011).
 *
 * @module share
 */
import { SHARE_HEADER_LENGTH } from "./constants.js";
import { COUNT, NIBBLE, U16, expectWidth, isBytes, isRecord } from "./domain.js";
import { SskrError } from "./error.js";
import { Secret } from "./secret.js";

/**
 * One SSKR share. All fields are wire; the objects {@link generateShares}
 * and {@link parseShare} return are frozen.
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
 * `share` as {@link shareBytes} serializes it: every field read once, the
 * header fields checked against their widths, then `GroupThresholdInvalid`
 * when `groupThreshold > groupCount` (the check the wire parser makes), then
 * the value checked to be a `Secret` (one from another copy of this package
 * is rebuilt). Returns a frozen copy, so what {@link combineShares} goes on
 * to read is exactly what was checked.
 * @throws {SskrError} `InvalidParameter` (`share` for a non-object, the
 * field's name for one outside its width, `value`), `GroupThresholdInvalid`.
 */
export function checkedShare(share: unknown): SskrShare {
  if (!isRecord(share)) {
    throw SskrError.invalidParameter("share", share, "a share object or share bytes");
  }
  const {
    identifier,
    groupIndex,
    groupThreshold,
    groupCount,
    memberIndex,
    memberThreshold,
    value,
  } = share;
  const header = {
    identifier: expectWidth("identifier", identifier, U16),
    groupIndex: expectWidth("groupIndex", groupIndex, NIBBLE),
    groupThreshold: expectWidth("groupThreshold", groupThreshold, COUNT),
    groupCount: expectWidth("groupCount", groupCount, COUNT),
    memberIndex: expectWidth("memberIndex", memberIndex, NIBBLE),
    memberThreshold: expectWidth("memberThreshold", memberThreshold, COUNT),
  };
  if (header.groupThreshold > header.groupCount) throw SskrError.of("GroupThresholdInvalid");
  if (!Secret.isSecret(value)) throw SskrError.invalidParameter("value", value, "a Secret");
  // One from another copy of this package: rebuild it from its public bytes.
  const given: Secret = value;
  return Object.freeze({
    ...header,
    value: value instanceof Secret ? value : Secret.from(given.bytes),
  });
}

/**
 * Serialize: identifier (2 bytes, big-endian), `(gt-1)<<4 | (gc-1)`,
 * `gi<<4 | (mt-1)`, `mi` (reserved high nibble zero), then the value.
 * The reference's serializer is private and only ever sees fields from a
 * validated spec; this public one validates the object instead.
 * @throws {SskrError} `InvalidParameter` for a non-object, a header field
 * outside its width or a `value` that is not a `Secret`;
 * `GroupThresholdInvalid` when `groupThreshold > groupCount`.
 */
export function shareBytes(share: SskrShare): Uint8Array<ArrayBuffer> {
  const s = checkedShare(share);
  const value = s.value.bytes;
  const out = new Uint8Array(SHARE_HEADER_LENGTH + value.length);
  out[0] = s.identifier >> 8;
  out[1] = s.identifier & 0xff;
  out[2] = (((s.groupThreshold - 1) & 0xf) << 4) | ((s.groupCount - 1) & 0xf);
  out[3] = ((s.groupIndex & 0xf) << 4) | ((s.memberThreshold - 1) & 0xf);
  out[4] = s.memberIndex & 0xf;
  out.set(value, SHARE_HEADER_LENGTH);
  return out;
}

/**
 * Parse the wire form: the checks the reference makes on each share inside
 * `sskr_combine`, in its order. The result is frozen.
 * @throws {SskrError} `InvalidParameter` unless `bytes` is a `Uint8Array`;
 * then `ShareLengthInvalid` (under 5 bytes), `GroupThresholdInvalid`
 * (threshold above count), `ShareReservedBitsInvalid`, then the secret codes.
 */
export function parseShare(bytes: Uint8Array): SskrShare {
  if (!isBytes(bytes)) throw SskrError.invalidParameter("bytes", bytes, "a Uint8Array");
  const b = new Uint8Array(bytes);
  if (b.length < SHARE_HEADER_LENGTH) throw SskrError.of("ShareLengthInvalid");
  const groupThreshold = (b[2] >> 4) + 1;
  const groupCount = (b[2] & 0xf) + 1;
  if (groupThreshold > groupCount) throw SskrError.of("GroupThresholdInvalid");
  if (b[4] >> 4 !== 0) throw SskrError.of("ShareReservedBitsInvalid");
  return Object.freeze({
    identifier: (b[0] << 8) | b[1],
    groupIndex: b[3] >> 4,
    groupThreshold,
    groupCount,
    memberIndex: b[4] & 0xf,
    memberThreshold: (b[3] & 0xf) + 1,
    value: Secret.from(b.subarray(SHARE_HEADER_LENGTH)),
  });
}

/**
 * Whether `share` is a share object (vs its bytes): an object whose `value`
 * is a `Secret`, from this or another copy of this package. That is enough
 * to tell the two forms {@link combineShares} accepts apart; it does not
 * validate the header fields, which {@link shareBytes} and `combineShares` do.
 */
export function isSskrShare(share: unknown): share is SskrShare {
  return isRecord(share) && Secret.isSecret(share["value"]);
}
