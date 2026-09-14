/**
 * Split specifications: how many groups, and how many members in each,
 * are needed to recover.
 *
 * @module spec
 */
import { MAX_GROUP_COUNT, MAX_SHARE_COUNT } from "./constants.js";
import { USIZE_MAX, brand, expectUsize, hasBrand, isRecord } from "./domain.js";
import { SskrError } from "./error.js";

/** Options for {@link GroupSpec.from}. Each field is a `usize`: a `number` or a `bigint`. */
export interface GroupSpecOptions {
  /**
   * Members needed to recover the group's share;
   * `0 ≤ memberThreshold ≤ memberCount`. A threshold of 0 is accepted, as the
   * reference accepts it, and fails at generation.
   */
  readonly memberThreshold: number | bigint;
  /** Members in the group; `1..=16`. */
  readonly memberCount: number | bigint;
}

/** `usize::from_str`'s grammar: an optional `+`, then ASCII digits. */
const STRICT_UINT = /^\+?\d+$/;
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
    brand(this, "GroupSpec@1");
    Object.freeze(this);
  }

  /** Type guard for a `GroupSpec`, including one from another copy of this package. */
  static isGroupSpec(value: unknown): value is GroupSpec {
    return hasBrand(value, "GroupSpec@1");
  }

  /**
   * `GroupSpec::new`'s checks on exact values, in its order. Whatever passes
   * is at most 16, so the fields are stored as `number`s.
   */
  static #checked(memberThreshold: bigint, memberCount: bigint): GroupSpec {
    if (memberCount === 0n || memberCount > BigInt(MAX_SHARE_COUNT)) {
      throw SskrError.of("MemberCountInvalid");
    }
    if (memberThreshold > memberCount) throw SskrError.of("MemberThresholdInvalid");
    return new GroupSpec(Number(memberThreshold), Number(memberCount));
  }

  /**
   * A validated `memberThreshold`-of-`memberCount`. Each field is read once.
   * @throws {SskrError} `InvalidParameter` unless `options` is an object and
   * both fields are `usize`s (a non-negative integer `number` up to `2^64`,
   * or a `bigint` in `[0, 2^64 - 1]`); then, in the reference's order,
   * `MemberCountInvalid` (0 or > 16), `MemberThresholdInvalid` (> count). A
   * threshold of 0 passes, as it does in `GroupSpec::new`; generating with
   * it fails as `Shamir` (cause `InvalidThreshold`).
   */
  static from(options: GroupSpecOptions): GroupSpec {
    if (!isRecord(options)) throw SskrError.invalidParameter("options", options, "an object");
    const { memberThreshold, memberCount } = options;
    return GroupSpec.#checked(
      expectUsize("memberThreshold", memberThreshold),
      expectUsize("memberCount", memberCount),
    );
  }

  /**
   * Parse `"<threshold>-of-<count>"`; each side is digits with an optional
   * leading `+`, nothing else, up to `u64::MAX`.
   * @throws {SskrError} `InvalidParameter` unless `text` is a string;
   * `GroupSpecInvalid`, then the `from` codes.
   */
  static parse(text: string): GroupSpec {
    if (typeof text !== "string") throw SskrError.invalidParameter("text", text, "a string");
    const parts = text.split("-");
    if (parts.length !== 3) throw SskrError.of("GroupSpecInvalid");
    // The reference parses the threshold before it checks the "of" literal.
    const memberThreshold = parseUsize(parts[0]);
    if (parts[1] !== "of") throw SskrError.of("GroupSpecInvalid");
    const memberCount = parseUsize(parts[2]);
    return GroupSpec.#checked(memberThreshold, memberCount);
  }

  /** `1-of-1`. */
  static readonly DEFAULT: GroupSpec = new GroupSpec(1, 1);

  /** Same threshold and count; `false` for anything that is not a `GroupSpec` (one from another copy of this package compares by its fields). */
  equals(other: unknown): boolean {
    return (
      GroupSpec.isGroupSpec(other) &&
      other.memberThreshold === this.memberThreshold &&
      other.memberCount === this.memberCount
    );
  }

  /** `"<threshold>-of-<count>"` */
  toString(): string {
    return `${this.memberThreshold}-of-${this.memberCount}`;
  }
}

/** Options for {@link Spec.from}. */
export interface SpecOptions {
  /**
   * Groups that must each meet their member threshold;
   * `1 ≤ groupThreshold ≤ groups.length`. A `usize`: a `number` or a `bigint`.
   */
  readonly groupThreshold: number | bigint;
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
    brand(this, "Spec@1");
    Object.freeze(this);
  }

  /** Type guard for a `Spec`, including one from another copy of this package. */
  static isSpec(value: unknown): value is Spec {
    return hasBrand(value, "Spec@1");
  }

  /**
   * A validated spec over a frozen copy of `groups`. The fields are read
   * once and `groups` is snapshotted by index, so what is checked is what
   * is stored; a `GroupSpec` from another copy of this package is rebuilt
   * through this copy's factory.
   * @throws {SskrError} `InvalidParameter` unless `options` is an object,
   * `groupThreshold` a `usize` and `groups` an array of `GroupSpec`; then
   * `GroupThresholdInvalid` (0 or > groups), `GroupCountInvalid` (> 16), in
   * the reference's order.
   */
  static from(options: SpecOptions): Spec {
    if (!isRecord(options)) throw SskrError.invalidParameter("options", options, "an object");
    const { groupThreshold, groups } = options;
    const gt = expectUsize("groupThreshold", groupThreshold);
    const input: unknown = groups;
    if (!Array.isArray(input)) {
      throw SskrError.invalidParameter("groups", input, "an array of GroupSpec");
    }
    const items: readonly unknown[] = input;
    const list = Array.from({ length: items.length }, (_, i) => {
      const group = items[i];
      if (!GroupSpec.isGroupSpec(group)) {
        throw SskrError.invalidParameter("groups", group, "a GroupSpec");
      }
      // One from another copy of this package: rebuild it from its public fields.
      const given: GroupSpec = group;
      return group instanceof GroupSpec
        ? group
        : GroupSpec.from({
            memberThreshold: given.memberThreshold,
            memberCount: given.memberCount,
          });
    });
    if (gt === 0n || gt > BigInt(list.length)) throw SskrError.of("GroupThresholdInvalid");
    if (list.length > MAX_GROUP_COUNT) throw SskrError.of("GroupCountInvalid");
    return new Spec(Number(gt), Object.freeze(list));
  }

  /** Same group threshold and pairwise equal groups; `false` for anything that is not a `Spec` (one from another copy of this package compares by its fields). */
  equals(other: unknown): boolean {
    if (!Spec.isSpec(other) || other.groupThreshold !== this.groupThreshold) return false;
    const groups: readonly unknown[] = other.groups;
    return (
      groups.length === this.groups.length &&
      this.groups.every((group, i) => group.equals(groups[i]))
    );
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
