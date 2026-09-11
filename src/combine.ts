/**
 * Recovering a secret from shares.
 *
 * @module combine
 */
import { ShamirError, recoverSecret, type ShamirShare } from "@blockchaincommons/shamir";
import { SskrError } from "./error.js";
import { Secret } from "./secret.js";
import { type SskrShare, isSskrShare, parseShare } from "./share.js";

interface Group {
  readonly groupIndex: number;
  readonly memberThreshold: number;
  readonly members: ShamirShare[];
}

/**
 * Recover the secret from `shares` (parsed `SskrShare` objects, serialized
 * bytes, or both in one array — a JS-only convenience; the reference takes
 * bytes), in any order. Every share must carry the same identifier, group
 * threshold, group count and value length; a group that fails its Shamir
 * recovery is skipped.
 *
 * @throws {SskrError} `SharesEmpty`, the parse codes, `ShareSetInvalid`,
 * `MemberThresholdInvalid`, `DuplicateMemberIndex`, `NotEnoughGroups`,
 * `Shamir`.
 */
export function combineShares(shares: readonly (SskrShare | Uint8Array)[]): Secret {
  if (shares.length === 0) throw SskrError.of("SharesEmpty");
  const parsed = shares.map((s) => (isSskrShare(s) ? s : parseShare(s)));
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
