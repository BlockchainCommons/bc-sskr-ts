# Rust reference cross-validation

Replays the golden vectors (`tests/vectors/vectors.json`) and, in CI, the
whole recipe corpus and the header sweep against `sskr = "=0.12.0"` over
`bc-rand = "=0.5.0"` and `bc-shamir = "=0.13.0"`, on a 64-bit Rust target
(the harness asserts it).

```sh
cd tests/rust-validation
cargo run --release --offline -- ../vectors/vectors.json
# the full corpus (2,301 vectors; the golden file is a subset of it) and the
# 16,320-row header sweep:
bun run vectors:full "$TMPDIR/sskr-full-corpus.json"
bun run vectors:sweep "$TMPDIR/sskr-header-sweep.json"
cargo run --release --offline -- "$TMPDIR/sskr-full-corpus.json"
cargo run --release --offline -- "$TMPDIR/sskr-header-sweep.json"
```

Result lines:

```
1054 vectors - 1024 match, 30 js-only, 0 MISMATCH
2301 vectors - 2271 match, 30 js-only, 0 MISMATCH
16320 vectors - 16320 match, 0 js-only, 0 MISMATCH
```

Exit 0 iff every vector matches the Rust reference or is JS-only. There is no
expected-divergence allowlist: a difference is a MISMATCH and a bug on one side
or the other. Outcomes are share bytes (`hex,hex;hex,…`, groups separated by
`;`, the steps of a consecutive-generation recipe by ` | `), the recovered
secret, `GroupSpec::parse`'s `Display`, `gc=<n>,sc=<n>,groups=<g,…>` for a
spec, `len=<n>` for a secret, or `throw:<code>:<message>`, where the code is
the `Error` variant (a wrapped Shamir failure as `Shamir(<variant>)`) and the
message its `Display`.

## JS-only vectors

A recipe integer (a spec field) is compared only when it has an exact Rust
form:

- a JSON number serde reads as a `u64`, whatever its size. Every check the
  reference makes compares a spec field with at most 16 or with the group
  count, so a `u64` read from the decimal digits and the double JavaScript
  received have the same outcome. Any other JSON number (`NaN`, a fraction, a
  negative, a value above `u64::MAX`) is js-only;
- a `"<digits>n"` string, the recipe form of a `bigint`, when the digits fit a
  `u64`. A negative one, or one above `u64::MAX`, is js-only.

A hand-built share header (`shareBytes`) is js-only: `SSKRShare` is
crate-private, so no reference caller can build one.

Anything else in a recipe is `unparsable`: counted, printed, and a failure
(exit 1), never a panic. Every vector runs inside its own `catch_unwind`.

The 30 js-only vectors are the `domain` rows (spec fields that are `NaN`,
fractions, negatives, infinities or above `2^64`, and the 14 hand-built
headers) and the five out-of-range rows in `wide` (a bigint outside
`[0, 2^64 - 1]`, and the number `2^64`, which is not a JSON `u64`). Wrong
argument types (a string secret, a plain object for a spec) are unit tests
only: a recipe cannot express them.

## Generators

Seeded recipes drive `bc-rand`'s `SeededRandomNumberGenerator` from the same
xoshiro state as TypeScript's `SeededRng`; `fill_random_data` and `fillBytes`
both take one 64-bit step per byte. Counter recipes use 0, 17, 34, …,
restarting at zero for each fill, as the Rust crate's tests do. A recipe's
generator is created once, so a `then` step draws from where the previous
generation stopped, whether it succeeded or failed, on both sides. Neither
fixture is a production generator.

## Self-check and fixtures

`mismatch.json` is one golden generation with a flipped share digit; the
harness must exit 1 with `1 MISMATCH`, which CI checks. The fixtures under
`fixtures/` pin the harness itself, also in CI:

- `classes.json`: `4 vectors - 1 match, 3 js-only, 0 MISMATCH`, exit 0 (a JSON
  number above `u64::MAX`, a negative bigint, and a js-only field in a later
  `then` step are js-only; a bigint that fits a `u64` is compared);
- `malformed.json`: a spec without `groups` is `1 unparsable`, exit 1, no panic;
- `cause.json`: a wrong wrapped Shamir cause is `1 MISMATCH`, exit 1.
