/**
 * A two-group SSKR split with a seeded generator (reproducible shares),
 * the wire bytes, recovery from a quorum, and what the two common failures
 * look like.
 *
 *   bun examples/split-and-combine.ts
 */
import { SeededRng } from "@blockchaincommons/rand";
import {
  GroupSpec,
  Secret,
  Spec,
  SskrError,
  combineShares,
  generateShares,
  shareBytes,
} from "../src/index";

const hex = (b: Uint8Array): string => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
const secret = Secret.fromText("my secret belongs to me."); // 24 bytes, even

// Two groups: any 2 of 3 in the first, any 3 of 5 in the second; both groups needed.
const spec = Spec.from({
  groupThreshold: 2,
  groups: [GroupSpec.parse("2-of-3"), GroupSpec.from({ memberThreshold: 3, memberCount: 5 })],
});
const groups = generateShares(spec, secret, { rng: SeededRng.forTesting() });
console.log("groups    ", groups.map((g) => g.length).join(" + "), "shares");
for (const [gi, group] of groups.entries())
  for (const share of group) console.log(`  ${gi}.${share.memberIndex}  ${hex(shareBytes(share))}`);

// A quorum: two of group 0, three of group 1, in any order.
const quorum = [groups[1]![4]!, groups[0]![2]!, groups[1]![0]!, groups[0]![0]!, groups[1]![2]!];
console.log("recovered ", combineShares(quorum).equals(secret));

// Group 1 short of its threshold: the group is skipped, and the master needs two.
try {
  combineShares([groups[0]![0]!, groups[0]![1]!, groups[1]![0]!]);
} catch (e) {
  if (SskrError.isSskrError(e)) console.log("short     ", e.code);
}

// Shares from two different splits do not belong together.
const other = generateShares(spec, secret)[0]![0]!; // secure RNG: a new identifier
try {
  combineShares([groups[0]![0]!, other]);
} catch (e) {
  if (SskrError.isSskrError(e)) console.log("mixed     ", e.code, "-", e.message);
}
