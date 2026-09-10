/**
 * Split specifications: how many groups, and how many members in each,
 * are needed to recover.
 *
 * @module spec
 */
import { MAX_GROUP_COUNT, MAX_SHARE_COUNT } from "./constants.js";
import { SskrError } from "./error.js";

/** Options for {@link GroupSpec.from}. */
export interface GroupSpecOptions {
  readonly memberThreshold: number;
  readonly memberCount: number;
}

// Rust's `usize::from_str`: optional leading `+`, digits only.
const STRICT_UINT = /^\+?\d+$/;
function parseUint(s: string): number | undefined {
  if (!STRICT_UINT.test(s)) return undefined;
  const n = Number(s);
  return Number.isSafeInteger(n) ? n : undefined;
}

/** `memberThreshold`-of-`memberCount` within one group. */
export class GroupSpec {
  readonly memberThreshold: number;
  readonly memberCount: number;

  private constructor(memberThreshold: number, memberCount: number) {
    this.memberThreshold = memberThreshold;
    this.memberCount = memberCount;
  }

  /** @throws {SskrError} `MemberCountInvalid` (0 or > 16), `MemberThresholdInvalid` (> count). */
  static from(options: GroupSpecOptions): GroupSpec {
    const { memberThreshold, memberCount } = options;
    if (memberCount === 0 || memberCount > MAX_SHARE_COUNT)
      throw SskrError.of("MemberCountInvalid");
    if (memberThreshold > memberCount) throw SskrError.of("MemberThresholdInvalid");
    return new GroupSpec(memberThreshold, memberCount);
  }

  /**
   * Parse `"<threshold>-of-<count>"`; each side is digits with an optional
   * leading `+`, nothing else.
   * @throws {SskrError} `GroupSpecInvalid`, then the `from` codes.
   */
  static parse(s: string): GroupSpec {
    const parts = s.split("-");
    if (parts.length !== 3 || parts[1] !== "of") throw SskrError.of("GroupSpecInvalid");
    const memberThreshold = parseUint(parts[0]);
    const memberCount = parseUint(parts[2]);
    if (memberThreshold === undefined || memberCount === undefined)
      throw SskrError.of("GroupSpecInvalid");
    return GroupSpec.from({ memberThreshold, memberCount });
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
  readonly groupThreshold: number;
  readonly groups: readonly GroupSpec[];
}

/** `groupThreshold` of `groups` must each meet their member threshold. */
export class Spec {
  readonly groupThreshold: number;
  readonly groups: readonly GroupSpec[];

  private constructor(groupThreshold: number, groups: readonly GroupSpec[]) {
    this.groupThreshold = groupThreshold;
    this.groups = groups;
  }

  /** @throws {SskrError} `GroupThresholdInvalid` (0 or > groups), `GroupCountInvalid` (> 16). */
  static from(options: SpecOptions): Spec {
    const { groupThreshold, groups } = options;
    if (groupThreshold === 0 || groupThreshold > groups.length)
      throw SskrError.of("GroupThresholdInvalid");
    if (groups.length > MAX_GROUP_COUNT) throw SskrError.of("GroupCountInvalid");
    return new Spec(groupThreshold, [...groups]);
  }

  get groupCount(): number {
    return this.groups.length;
  }

  /** Total shares across all groups. */
  get shareCount(): number {
    return this.groups.reduce((sum, g) => sum + g.memberCount, 0);
  }
}
