# Frozen baseline build

`sskr-baseline.mjs` is the self-contained ESM bundle of `@blockchaincommons/sskr` built from
commit `4c1c2f7790ba1ca20f8ca07e694258d0125934d6`, the pre-redesign wire-format reference. Sibling
`@blockchaincommons/*` packages are INLINED from their own frozen baseline
bundles (@blockchaincommons/crypto, @blockchaincommons/rand, @blockchaincommons/tags, @blockchaincommons/uniform-resources, @blockchaincommons/shamir), so this bundle keeps the
pre-redesign behaviour of its dependencies after they change.
`sskr-baseline.d.mts` is the public surface at that commit (Phase 0.5).

`tests/differential.test.ts` runs every corpus recipe through this bundle and
the working tree and asserts identical outcomes; it pins the sha256 below so
an accidental rebuild cannot turn the differential into a self-comparison.

Baseline commit: 4c1c2f7790ba1ca20f8ca07e694258d0125934d6
Baseline sha256: 2b7ab05d04f40d998736408e3ecd3cdabddbd2b994003e2d05a44f7dc9b3874c
