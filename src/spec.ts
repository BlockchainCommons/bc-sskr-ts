/**
 * Split specifications: how many groups, and how many members in each,
 * are needed to recover.
 *
 * @module spec
 */
import { MAX_GROUP_COUNT, MAX_SHARE_COUNT } from "./constants.js";
import { USIZE, expectInt } from "./domain.js";
import { SskrError } from "./error.js";

/** Options for {@link GroupSpec.from}. */
export interface GroupSpecOptions {
  /** Members needed to recover the group's share; `1 ≤ memberThreshold ≤ memberCount`. */
  readonly memberThreshold: number;
  /** Members in the group; `1..=16`. */
  readonly memberCount: number;
}

// Rust's `usize::from_str`: optional leading `+`, digits only.
/** `usize::from_str`'s grammar: an optional `+`, then ASCII digits. */
const STRICT_UINT = /^\+?\d+$/;
/** The largest value the reference's `usize` holds; above it `from_str` fails. */
const USIZE_MAX = 0xffff_ffff_ffff_ffffn;
/**
 * Parses one `usize` field as the reference does: any decimal up to
 * `u64::MAX` is a number (the range checks come after, with their own
 * codes); beyond that, or not a digit run, is `GroupSpecInvalid`.
 */
function parseUsize(s: string): bigint {
  if (!STRICT_UINT.test(s)) throw SskrError.of("GroupSpecInvalid");
  const n = BigInt(s);
  if (n > USIZE_MAX) throw SskrError.of("GroupSpecInvalid");
  return n;
}

/** `memberThreshold`-of-`memberCount` within one group. Instances are frozen. */
export class GroupSpec {
  /** Members needed to recover the group's share. */
  readonly memberThreshold: number;
  /** Members in the group. */
  readonly memberCount: number;

  private constructor(memberThreshold: number, memberCount: number) {
    this.memberThreshold = memberThreshold;
    this.memberCount = memberCount;
    Object.freeze(this);
  }

  /**
   * A validated `memberThreshold`-of-`memberCount`.
   * @throws {SskrError} `InvalidParameter` unless both fields are safe
   * non-negative integers; then, in the reference's order,
   * `MemberCountInvalid` (0 or > 16), `MemberThresholdInvalid` (> count);
   * then `MemberThresholdInvalid` for a threshold of 0 (which the reference
   * accepts — divergence D1; BCR-2020-011 requires at least 1).
   */
  static from(options: GroupSpecOptions): GroupSpec {
    const { memberThreshold, memberCount } = options;
    expectInt("memberThreshold", memberThreshold, USIZE);
    expectInt("memberCount", memberCount, USIZE);
    if (memberCount === 0 || memberCount > MAX_SHARE_COUNT)
      throw SskrError.of("MemberCountInvalid");
    if (memberThreshold > memberCount) throw SskrError.of("MemberThresholdInvalid");
    if (memberThreshold < 1) throw SskrError.of("MemberThresholdInvalid");
    return new GroupSpec(memberThreshold, memberCount);
  }

  /**
   * Parse `"<threshold>-of-<count>"`; each side is digits with an optional
   * leading `+`, nothing else.
   * @throws {SskrError} `GroupSpecInvalid`, then the `from` codes.
   */
  static parse(s: string): GroupSpec {
    const parts = s.split("-");
    if (parts.length !== 3) throw SskrError.of("GroupSpecInvalid");
    // The reference parses the threshold before it checks the "of" literal.
    const memberThreshold = parseUsize(parts[0]);
    if (parts[1] !== "of") throw SskrError.of("GroupSpecInvalid");
    const memberCount = parseUsize(parts[2]);
    // `GroupSpec::new`'s checks, on the full `usize` range and in its order,
    // so a value between 2^53 and 2^64 gets the reference's code rather than
    // a generic parse failure; whatever passes is at most 16 and exact.
    if (memberCount === 0n || memberCount > BigInt(MAX_SHARE_COUNT))
      throw SskrError.of("MemberCountInvalid");
    if (memberThreshold > memberCount) throw SskrError.of("MemberThresholdInvalid");
    return GroupSpec.from({
      memberThreshold: Number(memberThreshold),
      memberCount: Number(memberCount),
    });
  }

  /** `1-of-1`. */
  static readonly DEFAULT: GroupSpec = new GroupSpec(1, 1);

  /** `"<threshold>-of-<count>"` */
  toString(): string {
    return `${this.memberThreshold}-of-${this.memberCount}`;
  }
}

/** Options for {@link Spec.from}. */
export interface SpecOptions {
  /** Groups that must each meet their member threshold; `1 ≤ groupThreshold ≤ groups.length`. */
  readonly groupThreshold: number;
  /** The groups, at most 16. */
  readonly groups: readonly GroupSpec[];
}

/**
 * `groupThreshold` of `groups` must each meet their member threshold.
 * Instances and their `groups` array are frozen.
 */
export class Spec {
  /** Groups needed to recover. */
  readonly groupThreshold: number;
  /** The groups, in order; a frozen copy of what was passed. */
  readonly groups: readonly GroupSpec[];

  private constructor(groupThreshold: number, groups: readonly GroupSpec[]) {
    this.groupThreshold = groupThreshold;
    this.groups = groups;
    Object.freeze(this);
  }

  /**
   * A validated spec over a frozen copy of `groups`.
   * @throws {SskrError} `InvalidParameter` unless `groupThreshold` is a safe
   * non-negative integer; then `GroupThresholdInvalid` (0 or > groups),
   * `GroupCountInvalid` (> 16), in the reference's order.
   */
  static from(options: SpecOptions): Spec {
    const { groupThreshold, groups } = options;
    expectInt("groupThreshold", groupThreshold, USIZE);
    if (groupThreshold === 0 || groupThreshold > groups.length)
      throw SskrError.of("GroupThresholdInvalid");
    if (groups.length > MAX_GROUP_COUNT) throw SskrError.of("GroupCountInvalid");
    return new Spec(groupThreshold, Object.freeze([...groups]));
  }

  /** Number of groups. */
  get groupCount(): number {
    return this.groups.length;
  }

  /** Total shares across all groups. */
  get shareCount(): number {
    return this.groups.reduce((sum, g) => sum + g.memberCount, 0);
  }
}
