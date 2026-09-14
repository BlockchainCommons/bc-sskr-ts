/**
 * Recovering a secret from shares.
 *
 * @module combine
 */
import { ShamirError, recoverSecret, type ShamirShare } from "@blockchaincommons/shamir";
import { isBytes } from "./domain.js";
import { SskrError } from "./error.js";
import { Secret } from "./secret.js";
import { type SskrShare, checkedShare, parseShare } from "./share.js";

interface Group {
  readonly groupIndex: number;
  readonly memberThreshold: number;
  readonly members: ShamirShare[];
}

/**
 * Recover the secret from `shares`: serialized bytes (what the reference
 * takes), share objects, or both in one array, in any order. Each element is
 * normalised once, in array order: bytes through {@link parseShare}, an
 * object through the checks {@link shareBytes} makes; so at every position
 * an object has exactly the outcome its bytes would have, and errors surface
 * in array order. Every share must carry the same identifier, group
 * threshold, group count and value length; a group that fails its Shamir
 * recovery is skipped.
 *
 * @throws {SskrError} `InvalidParameter` for a non-array or an element that
 * is neither bytes nor a share object; `SharesEmpty`, the parse codes,
 * `ShareSetInvalid`, `MemberThresholdInvalid`, `DuplicateMemberIndex`,
 * `NotEnoughGroups`, `Shamir`.
 */
export function combineShares(shares: readonly (SskrShare | Uint8Array)[]): Secret {
  const input: unknown = shares;
  if (!Array.isArray(input)) throw SskrError.invalidParameter("shares", input, "an array");
  const items: readonly unknown[] = input;
  const count = items.length;
  if (count === 0) throw SskrError.of("SharesEmpty");
  const parsed: SskrShare[] = Array.from({ length: count }, (_, i) => {
    const item = items[i];
    return isBytes(item) ? parseShare(item) : checkedShare(item);
  });
  const first = parsed[0];
  const groups: Group[] = [];

  for (const share of parsed) {
    if (
      share.identifier !== first.identifier ||
      share.groupThreshold !== first.groupThreshold ||
      share.groupCount !== first.groupCount ||
      share.value.byteLength !== first.value.byteLength
    ) {
      throw SskrError.of("ShareSetInvalid");
    }
    const group = groups.find((g) => g.groupIndex === share.groupIndex);
    if (group === undefined) {
      groups.push({
        groupIndex: share.groupIndex,
        memberThreshold: share.memberThreshold,
        members: [{ index: share.memberIndex, data: share.value.bytes }],
      });
      continue;
    }
    if (share.memberThreshold !== group.memberThreshold)
      throw SskrError.of("MemberThresholdInvalid");
    if (group.members.some((m) => m.index === share.memberIndex))
      throw SskrError.of("DuplicateMemberIndex");
    // Extra members beyond the threshold are ignored, as the reference does.
    if (group.members.length < group.memberThreshold) {
      group.members.push({ index: share.memberIndex, data: share.value.bytes });
    }
  }

  if (groups.length < first.groupThreshold) throw SskrError.of("NotEnoughGroups");

  const groupShares: ShamirShare[] = [];
  for (const group of groups) {
    if (group.members.length < group.memberThreshold) continue;
    try {
      groupShares.push({ index: group.groupIndex, data: recoverSecret(group.members) });
    } catch (e) {
      // `ShamirError` is the class of the same `recoverSecret` import, so
      // every failure it reports is an instance; a group that fails is skipped.
      if (e instanceof ShamirError) continue;
      throw e;
    }
    if (groupShares.length === first.groupThreshold) break;
  }
  if (groupShares.length < first.groupThreshold) throw SskrError.of("NotEnoughGroups");

  try {
    return Secret.from(recoverSecret(groupShares));
  } catch (e) {
    if (e instanceof ShamirError) throw SskrError.shamir(e);
    throw e;
  }
}
