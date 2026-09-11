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
**1 007 vectors — 981 match, 2 expected divergence (D1), 24 js-only, 0
mismatch** (2026-09-11).

### 1.1 A zero member threshold is rejected at construction (D1)

`GroupSpec::new(0, 3)` succeeds in the reference (it checks only
`member_threshold > member_count`) and generation then fails with
`ShamirError(InvalidThreshold)`. BCR-2020-011 requires `1 ≤ threshold ≤
count`, and `Spec::new` already rejects a zero *group* threshold, so the
asymmetry is an oversight. TypeScript's `GroupSpec.from` (and therefore
`GroupSpec.parse`) throws `MemberThresholdInvalid` after the reference's
own checks. Two vectors carry it (`spec 1/[0-of-1]`, `parse "0-of-3"`);
the harness allowlists them as D1.

### 1.2 `shareBytes` rejects header fields the reference masks (D2)

The reference's `serialize_share` masks every nibble field with `& 0xf`
and the identifier with `& 0xff`, so `groupIndex: 17` serialises as 1 and
a share that lies about its position is emitted without an error.
TypeScript's `shareBytes` throws `InvalidParameter` for any header field
outside its width (`identifier` in `[0, 65535]`, `groupIndex` and
`memberIndex` in `[0, 15]`, the thresholds and counts in `[1, 16]`) and
`GroupThresholdInvalid` when `groupThreshold > groupCount` (the check
`parseShare` already makes). `generateShares` never produces such values;
the hole was reachable only through hand-built shares. The reference's
`SSKRShare` is crate-private, so no vector can put the two sides side by
side: D2 is verified by reading `encoding.rs`, and its fourteen
`shareBytes` vectors are `js-only`.

## 2. JS-only input domain

Inputs the reference's `usize` and the wire's `u16`/nibble fields cannot
receive. Every one is `SskrError` `InvalidParameter` with `details: {
parameter, value }` and the message `"<parameter> must be an integer in
[<min>, <max>], got <value>"`; the Rust harness counts their vectors as
`js-only`.

- **`memberThreshold`, `memberCount`, `groupThreshold`** that are not safe
  non-negative integers (`NaN`, `1.5`, `-1`, `Infinity`, …), checked before
  the reference's chain so every integer the reference could receive keeps
  the reference's code in the reference's order. Before this validation
  `GroupSpec.from` yielded `"1.5-of-3"` and `"1-of-NaN"`, and generation
  failed one level down as `Shamir`.
- **Header fields** outside their width in `shareBytes` (D2 above for the
  values the reference masks; `identifier` beyond `u16`, fractions and
  `NaN` have no Rust form at all).
- **`combineShares` accepting `SskrShare` objects and bytes in one array**
  — a convenience; the reference takes bytes.
- **`Secret.fromText`** — the explicit UTF-8 path.

## 3. Mapping equivalences

- **API shape.** `sskr_generate_using(&spec, &secret, &mut rng)` ↔
  `generateShares(spec, secret, { rng })`; the Rust `Vec<Vec<Vec<u8>>>` ↔
  `SskrShare[][]` through `shareBytes`; `sskr_combine(&[bytes])` ↔
  `combineShares`.
- **Errors.** `Error::X` ↔ `SskrError` with `code: "X"` and `details: {
  code }`; `Error::ShamirError(e)` ↔ `"Shamir"` with `details.cause` and
  `cause: e`; `is(code)` for branching.
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
  reproduces the crate tests' counter generator as "fake".
- **`GroupSpec::parse`** ↔ `GroupSpec.parse`: the strict-digits rule mirrors
  `usize::from_str` (optional `+`, digits only).

## Maintenance

When the upstream reference moves:

1. Review the diff via the link in the `upstream.yml` tracking issue.
2. Port the relevant changes.
3. Update `.github/versions.yml` with the new version and commit.
4. Update the tracked version at the top of this file.
5. Add, amend, or remove divergence entries as the port requires.
