/**
 * Splitting a secret into groups of shares.
 *
 * @module generate
 */
import {
  type RandomNumberGenerator,
  type RngOptions,
  fillRandomBytes,
  secureRng,
} from "@blockchaincommons/rand";
import { ShamirError, splitSecret } from "@blockchaincommons/shamir";
import { isRecord } from "./domain.js";
import { SskrError } from "./error.js";
import { Secret } from "./secret.js";
import { Spec } from "./spec.js";
import type { SskrShare } from "./share.js";

/**
 * Options for {@link generateShares}: rand's `rng` (secure by default), which
 * draws the identifier and every Shamir share. `null` or `undefined` selects
 * the secure generator; a generator without a callable `fillBytes` fails at
 * the identifier draw with rand's `RandError` `InvalidGenerator`.
 */
export type GenerateOptions = RngOptions;

function split(
  secret: Uint8Array,
  threshold: number,
  shareCount: number,
  rng: RandomNumberGenerator,
): Uint8Array[] {
  try {
    return splitSecret(secret, { threshold, shareCount, rng }).map((s) => s.data);
  } catch (e) {
    // `ShamirError` is the class of the same `splitSecret` import, so every
    // failure it reports is an instance and is wrapped. A generator's own
    // error passes through, unless it is itself a `ShamirError` thrown
    // inside the split, which cannot be told apart from shamir's.
    if (e instanceof ShamirError) throw SskrError.shamir(e);
    throw e;
  }
}

/**
 * Split `secret` per `spec`: one array of shares per group, in spec order.
 *
 * The arguments are checked before the first draw: `spec` must be a `Spec`
 * and `secret` a `Secret` (instances from another copy of this package are
 * rebuilt through this copy's factories), `options` an object or absent.
 * The draw order is wire: two identifier bytes first (through rand's
 * `fillRandomBytes`, so a malformed generator fails there with rand's
 * `RandError`, unwrapped), then the group-level Shamir split, then each
 * group's member split in group order. A generator's own error propagates
 * unwrapped. The share objects are frozen.
 * @throws {SskrError} `InvalidParameter` for an argument of the wrong type;
 * `Shamir` for a Shamir failure, including a group whose member threshold
 * is 0 (cause `InvalidThreshold`), after every earlier draw.
 */
export function generateShares(
  spec: Spec,
  secret: Secret,
  options?: GenerateOptions,
): SskrShare[][] {
  if (!Spec.isSpec(spec)) throw SskrError.invalidParameter("spec", spec, "a Spec");
  // A spec from another copy of this package is rebuilt from its public fields.
  const given: Spec = spec;
  const local =
    spec instanceof Spec
      ? spec
      : Spec.from({ groupThreshold: given.groupThreshold, groups: given.groups });
  if (!Secret.isSecret(secret)) throw SskrError.invalidParameter("secret", secret, "a Secret");
  const master = secret.bytes;
  const opts: unknown = options;
  if (opts !== undefined && !isRecord(opts)) {
    throw SskrError.invalidParameter("options", opts, "an object");
  }
  const rng = options?.rng ?? secureRng();
  const id = new Uint8Array(2);
  fillRandomBytes(id, { rng });
  const identifier = (id[0] << 8) | id[1];

  const groupSecrets = split(master, local.groupThreshold, local.groupCount, rng);
  return local.groups.map((group, groupIndex) =>
    split(groupSecrets[groupIndex], group.memberThreshold, group.memberCount, rng).map(
      (value, memberIndex) =>
        Object.freeze({
          identifier,
          groupIndex,
          groupThreshold: local.groupThreshold,
          groupCount: local.groupCount,
          memberIndex,
          memberThreshold: group.memberThreshold,
          value: Secret.from(value),
        }),
    ),
  );
}
