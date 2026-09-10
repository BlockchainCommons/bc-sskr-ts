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

_None._ All 983 golden vectors (`tests/vectors/vectors.json`), including
the error variant of every failing recipe, replay exactly against
`sskr 0.12.0` through `tests/rust-validation`
(`cargo run --release -- ../vectors/vectors.json`).

## 2. JS-only input domain

- **Header fields out of range.** `shareBytes` masks each field to its
  nibble as the reference does with `as u8`; a `groupIndex` of 17 serialises
  as 1 in both. Neither validates the range on the way in.

## 3. Mapping equivalences

- **API shape.** `sskr_generate_using(&spec, &secret, &mut rng)` ↔
  `generateShares(spec, secret, { rng })`; the Rust `Vec<Vec<Vec<u8>>>` ↔
  `SskrShare[][]` through `shareBytes`; `sskr_combine(&[bytes])` ↔
  `combineShares`.
- **Errors.** `Error::X` ↔ `SskrError` with `code: "X"`;
  `Error::ShamirError(e)` ↔ `"Shamir"` with `cause: e`.
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
