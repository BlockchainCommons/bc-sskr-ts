# Divergences from the Rust reference implementation

This library is a TypeScript port of
[`BlockchainCommons/bc-sskr-rust`](https://github.com/BlockchainCommons/bc-sskr-rust),
tracked at version **0.12.0**
([`177cd93`](https://github.com/BlockchainCommons/bc-sskr-rust/commit/177cd9305c152b6cc1b9768651e65e7d563b4e8e)).

The tracked version and commit are recorded in
[`.github/versions.yml`](./.github/versions.yml), and the `upstream.yml`
workflow opens a tracking issue whenever the reference implementation moves
ahead of it.

This document is the deliberate record of every place the TypeScript behaviour
differs from the Rust reference. It has three kinds of entry:

1. **True behavioral divergences** - the same input produces a different outcome.
2. **JS-only input domain** - inputs that have no Rust analog, so there is nothing to diverge from.
3. **Mapping equivalences** - JS-specific inputs that are validated through the bytes they produce.

## 1. True behavioral divergences

Every share byte, the draw order, the header layout, the combine rules and
the precedence of the reference's fifteen codes are unchanged. Harness on
the current tree:
**1 012 vectors — 986 match, 2 expected divergence (D1), 24 js-only, 0
mismatch** (2026-09-12).

### 1.1 A zero member threshold is rejected at construction (D1)

`GroupSpec::new(0, 3)` succeeds in the reference (it checks only
`member_count == 0`, `member_count > 16` and `member_threshold >
member_count`) and so does `GroupSpec::parse("0-of-3")`; generating with
such a spec then fails one level down with `ShamirError(InvalidThreshold)`
(executed). A share can never carry a zero member threshold — the wire
nibble is `threshold − 1`, so `deserialize_share` always yields ≥ 1 — so
the invalid spec is a dead end on both sides; the difference is *where* it
is refused and *with which code*. BCR-2020-011 requires `1 ≤ threshold ≤
count`, and `Spec::new` already rejects a zero *group* threshold, so the
asymmetry in the reference is an oversight. TypeScript's `GroupSpec.from`
(and therefore `GroupSpec.parse`) throws `MemberThresholdInvalid` after
the reference's own checks. Two vectors carry it (`spec 1/[0-of-1]`,
`parse "0-of-3"`); the harness allowlists them as D1. Matching the
reference — accepting the spec and failing at generation with the vaguer
`Shamir` code — was considered and rejected. **Upstream fix:**
`GroupSpec::new` checks `member_threshold == 0` as `Spec::new` does.

## 2. JS-only input domain

Inputs the reference's `usize` and the wire's `u16`/nibble fields cannot
receive, and surfaces the reference does not have. Argument faults are
`SskrError` `InvalidParameter` with `details: { parameter, value }` and the
message `"<parameter> must be an integer in [<min>, <max>], got <value>"`;
the Rust harness counts their vectors as `js-only`.

- **`memberThreshold`, `memberCount`, `groupThreshold`** that are not safe
  non-negative integers (`NaN`, `1.5`, `-1`, `Infinity`, …), checked before
  the reference's chain so every integer the reference could receive keeps
  the reference's code in the reference's order. Before this validation
  `GroupSpec.from` yielded `"1.5-of-3"` and `"1-of-NaN"`, and generation
  failed one level down as `Shamir`.
- **`shareBytes` on a hand-built share.** The reference's `serialize_share`
  masks every nibble field with `& 0xf` and the identifier to `u16`, but it
  is private and its only caller is `generate_shares`, whose fields come
  from a validated `Spec` and from `enumerate()`; `SSKRShare` lives in a
  private module. No caller of the reference can reach the masking, so
  there is no reference behaviour for a header that lies about itself.
  TypeScript's `SskrShare` is a public object and `shareBytes` is exported
  (components' `SskrShare` wrapper uses it), so the port validates:
  `InvalidParameter` for a field outside its width (`identifier` in
  `[0, 65535]`, `groupIndex` and `memberIndex` in `[0, 15]`, the thresholds
  and counts in `[1, 16]`) and `GroupThresholdInvalid` when `groupThreshold
  > groupCount` — the check `deserialize_share` makes on the wire.
  `generateShares` never produces such values; `shareBytes(parseShare(b))`
  round-trips. Fourteen vectors, all `js-only`.
- **`combineShares` accepting `SskrShare` objects and bytes in one array**
  — a convenience; the reference takes bytes.
- **`Secret.fromText`** — the explicit UTF-8 path.

## 3. Mapping equivalences

- **API shape.** `sskr_generate_using(&spec, &secret, &mut rng)` ↔
  `generateShares(spec, secret, { rng })`; the Rust `Vec<Vec<Vec<u8>>>` ↔
  `SskrShare[][]` through `shareBytes`; `sskr_combine(&[bytes])` ↔
  `combineShares`.
- **Constants.** `MAX_GROUP_COUNT` (16) ↔ `MAX_GROUPS_COUNT`;
  `SHARE_HEADER_LENGTH` (5) ↔ `METADATA_SIZE_BYTES`; `MIN_SHARE_LENGTH`
  (21) ↔ `MIN_SERIALIZE_SIZE_BYTES`; the secret bounds and
  `MAX_SHARE_COUNT` re-export shamir's.
- **Errors.** `Error::X` ↔ `SskrError` with `code: "X"` and `details: {
  code }`; `Error::ShamirError(e)` ↔ `"Shamir"` with `details.cause` and
  `cause: e`; `is(code)` for branching. The reference's `Display` strings
  are the messages.
- **Immutability.** Rust's owned values ↔ `Secret.bytes` returning a copy,
  frozen `Spec`/`GroupSpec` instances and `Spec.groups`, frozen share
  objects from `generateShares`.
- **Foreign shares.** A group whose members all come from a *different*
  split with the same identifier recovers at the group level and fails at
  the master with `Shamir: checksum failure`; a group with one foreign
  member fails its own recovery and is skipped (`NotEnoughGroups`). Both
  match the reference.
- **RNG.** `&mut impl RandomNumberGenerator` ↔ `{ rng }`; the harness drives
  `bc-rand`'s `SeededRandomNumberGenerator` from the same xoshiro state and
  reproduces the crate tests' counter generator as "fake". The identifier
  is two bytes drawn before the group split, then one Shamir split per
  level, on both sides.
- **`GroupSpec::parse`** ↔ `GroupSpec.parse`: the grammar mirrors
  `usize::from_str` (optional `+`, ASCII digits only; whitespace,
  fullwidth digits, `2.0`, `-2` rejected); any decimal up to `u64::MAX`
  parses and then meets `GroupSpec::new`'s checks with their own codes
  (`"9007199254740993-of-3"` → `MemberThresholdInvalid`,
  `"2-of-9007199254740993"` → `MemberCountInvalid`, on both sides); only a
  value beyond `u64::MAX` is `GroupSpecInvalid`. `Display` ↔ `toString`;
  `Default` (1-of-1) ↔ `DEFAULT`.
- **Executed equivalences beyond the vectors** (fixture seed, 16-byte
  secret): `GroupSpec::new(0, 0)` and `parse("0-of-0")` →
  `MemberCountInvalid` (the count is checked first); `parse("17-of-17")` →
  `MemberCountInvalid`; `Spec::new(0, [])` and `Spec::new(1, [])` →
  `GroupThresholdInvalid`; combining a header-only 5-byte share →
  `SecretTooShort`, a 4-byte share → `ShareLengthInvalid`, `[]` →
  `SharesEmpty`; a header with both `gt > gc` and reserved bits set →
  `GroupThresholdInvalid` (checked first); a share beyond the threshold is
  ignored (2 of 3 and 3 of 3 of a `1/[2-of-3]` split both recover, 1 of 3
  → `NotEnoughGroups`); an identifier off by one bit → `ShareSetInvalid`,
  the member-threshold nibble off → `MemberThresholdInvalid`, a duplicate
  member index → `DuplicateMemberIndex`.

## Maintenance

When the upstream reference moves:

1. Review the diff via the link in the `upstream.yml` tracking issue.
2. Port the relevant changes.
3. Update `.github/versions.yml` with the new version and commit.
4. Update the tracked version at the top of this file.
5. Add, amend, or remove divergence entries as the port requires.
