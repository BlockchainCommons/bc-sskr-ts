# Frozen baseline build

`sskr-baseline.mjs` is the self-contained ESM bundle of `@blockchaincommons/sskr` built from
commit `4c1c2f7790ba1ca20f8ca07e694258d0125934d6`, the pre-redesign wire-format reference. Siblings
`@blockchaincommons/shamir` and `@blockchaincommons/rand` are INLINED from their own frozen
baseline bundles, so this bundle keeps the pre-redesign behaviour of its dependencies after
they change. `sskr-baseline.d.mts` is the public surface at that commit.

`rand-baseline.mjs` / `rand-baseline.d.mts` are a separate vendored copy of
`@blockchaincommons/rand`'s own frozen baseline: the sskr baseline inlines rand's code for its
own internal use but exports none of it, so the tests need this copy to construct the OLD
`SeededRandomNumberGenerator` and pass it into the baseline's generation functions.

`tests/differential.test.ts` runs every corpus recipe through this bundle and
the working tree and asserts identical outcomes; it pins the sha256 below so
an accidental rebuild cannot turn the differential into a self-comparison.

Baseline commit: 4c1c2f7790ba1ca20f8ca07e694258d0125934d6
Baseline sha256: 103ef8d089b8a8aa898abf44a1e50a2429dd8d9f24587e327756d1c953dbca95
