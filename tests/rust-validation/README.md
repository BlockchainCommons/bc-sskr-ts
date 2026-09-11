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
Exit 0 iff every vector matches. Not wired into CI (needs a Rust
toolchain); run manually before any release.
