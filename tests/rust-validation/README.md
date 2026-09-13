# Rust reference cross-validation

Replays `tests/vectors/vectors.json` against `sskr = 0.12.0`.

```sh
cd tests/rust-validation
cargo run --release -- ../vectors/vectors.json
```

Seeded recipes drive `bc-rand`'s `SeededRandomNumberGenerator` from the same
xoshiro state; "fake" recipes use the counter generator (0, 17, 34, …) the
crate's own tests use. Share bytes, combine results, `GroupSpec::parse`,
spec and secret validation compare exactly, including the error variant.
Exit 0 means no unexpected mismatches. Two D1 cases are allowed and
24 TypeScript-only cases are skipped; see [the compatibility notes](../../RUST_DIVERGENCES.md). Not wired into CI (needs a Rust
toolchain); run manually before any release.
