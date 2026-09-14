# Frozen baseline build

`sskr-baseline.mjs` is the self-contained ESM bundle of `@blockchaincommons/sskr` built from
commit `4c1c2f7790ba1ca20f8ca07e694258d0125934d6`, the `@bcts/sskr` wire-format reference. Siblings
`@blockchaincommons/shamir` and `@blockchaincommons/rand` are INLINED from their own frozen
baseline bundles, so this bundle keeps the behaviour those dependencies had at that commit after
they change. `sskr-baseline.d.mts` is the public surface at that commit.

`rand-baseline.mjs` / `rand-baseline.d.mts` are a separate vendored copy of
`@blockchaincommons/rand`'s own frozen baseline: the sskr baseline inlines rand's code for its
own internal use but exports none of it, so the tests need this copy to construct the OLD
`SeededRandomNumberGenerator` and pass it into the baseline's generation functions.

`tests/differential.test.ts` runs every corpus recipe through this bundle and
the working tree. Outcomes, error codes and wrapped Shamir causes included,
must match except for the allowed differences it lists with their hit counts:
the 11 `domain` recipes whose spec field is not a usize (`NaN`, a fraction, a
negative, an infinity, a number above 2^64), where the working tree throws
`InvalidParameter` and the baseline built the spec, reported a reference code
or leaked a `TypeError`; and the 3 `parse` recipes with a field between 2^53
and 2^64 − 1, where the tree reports the reference's code and the baseline's
safe-integer gate reported `GroupSpecInvalid`. The `wide` recipes carry
`bigint` inputs the baseline cannot receive at all; they are counted and left
to the Rust harness. The 14 hand-built share headers (`shareBytes`) are
skipped: the baseline exports no share constructor. A zero member threshold
and consecutive generations match the baseline and have no exception.

The test pins the SHA-256 below so an accidental rebuild cannot turn the
differential comparison into a comparison of the same implementation. These
historical bundles and their recorded commit/hash remain fixed. Use
`bun run test:differential` from the package root to run this check.

`bun run baseline:build` is a historical reconstruction tool: it requires the
corresponding source revision and compatible dependency baselines. Do not rebuild
the frozen artifacts from current source to make a differential failure pass.
For the separate comparison against Rust, see
[the Rust validation guide](../rust-validation/README.md).

Baseline commit: 4c1c2f7790ba1ca20f8ca07e694258d0125934d6
Baseline sha256: 103ef8d089b8a8aa898abf44a1e50a2429dd8d9f24587e327756d1c953dbca95
