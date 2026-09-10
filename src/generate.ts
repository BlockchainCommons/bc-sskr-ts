/**
 * Splitting a secret into groups of shares.
 *
 * @module generate
 */
import { type RandomNumberGenerator, secureRng } from "@blockchaincommons/rand";
import { ShamirError, splitSecret } from "@blockchaincommons/shamir";
import { SskrError } from "./error.js";
import { Secret } from "./secret.js";
import type { Spec } from "./spec.js";
import type { SskrShare } from "./share.js";

/** Options for {@link generateShares}. */
export interface GenerateOptions {
  /** Generator for the identifier and the Shamir shares. Default: secure. */
  readonly rng?: RandomNumberGenerator | undefined;
}

function split(
  secret: Uint8Array,
  threshold: number,
  shareCount: number,
  rng: RandomNumberGenerator,
): Uint8Array[] {
  try {
    return splitSecret(secret, { threshold, shareCount, rng }).map((s) => s.data);
  } catch (e) {
    if (e instanceof ShamirError) throw SskrError.shamir(e);
    throw e;
  }
}

/**
 * Split `secret` per `spec`: one array of shares per group, in spec order.
 *
 * The draw order is wire: two identifier bytes first, then the group-level
 * Shamir split, then each group's member split in group order.
 * @throws {SskrError} `Shamir` for a Shamir failure.
 */
export function generateShares(
  spec: Spec,
  secret: Secret,
  options?: GenerateOptions,
): SskrShare[][] {
  const rng = options?.rng ?? secureRng();
  const id = new Uint8Array(2);
  rng.fillBytes(id);
  const identifier = (id[0] << 8) | id[1];

  const groupSecrets = split(secret.bytes, spec.groupThreshold, spec.groupCount, rng);
  return spec.groups.map((group, groupIndex) =>
    split(groupSecrets[groupIndex], group.memberThreshold, group.memberCount, rng).map(
      (value, memberIndex) => ({
        identifier,
        groupIndex,
        groupThreshold: spec.groupThreshold,
        groupCount: spec.groupCount,
        memberIndex,
        memberThreshold: group.memberThreshold,
        value: Secret.from(value),
      }),
    ),
  );
}
