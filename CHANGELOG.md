# Changelog

## 1.0.0-beta.3 - 2026-09-14

Closes the remaining divergences from the reference.

### Changed (breaking)

- **A zero member threshold is accepted at construction**, as `GroupSpec::new`
  accepts it: `GroupSpec.from({ memberThreshold: 0, memberCount: n })` and
  `GroupSpec.parse("0-of-n")` succeed for `1 ≤ n ≤ 16`, and generating with
  such a spec throws `Shamir` (cause `InvalidThreshold`, message
  `SSKR Shamir error: invalid threshold`) after the identifier, the group split
  and every earlier group's member split have drawn, leaving the generator
  where the reference leaves it. Before, construction threw
  `MemberThresholdInvalid`. An upstream report proposes adding the check to
  the reference; the port will follow it.
- **`SskrError.invalidParameter(parameter, value, expected)`** replaces the
  `bounds` argument with the expectation text; `details.value` is `unknown`
  instead of `number`, `details.parameter` is the new `SskrParameter` union,
  and the message reads `"<parameter> must be <expected>, got <value>"` with
  the value rendered exactly (an unsafe integer by its digits, a `bigint` with
  its `n` suffix, a string quoted, an object by its constructor name). A spec
  field's expectation is `an integer in [0, 18446744073709551615] (a number or
  a bigint)`; a header field's is `an integer in [<min>, <max>]`.
- **Every argument is type-checked before anything else.** `Secret.from` and
  `parseShare` require a `Uint8Array` (a `Buffer` and a `Uint8Array` from
  another realm are accepted; `Secret.from` copies before checking),
  `Secret.fromText` and `GroupSpec.parse` a string, `GroupSpec.from`,
  `Spec.from` and `generateShares`' options an object, `groups` an array of
  `GroupSpec` (snapshotted by index), `generateShares` a `Spec` and a
  `Secret`, `combineShares` an array whose elements are bytes or share
  objects. Each throws `InvalidParameter` naming the argument. Before,
  `Secret.from("…")` returned an empty secret, plain objects passed for a
  `Spec`, `Spec.from` read `groups` more than once, and other wrong types
  leaked engine errors.
- **Share objects in `combineShares` are checked as `shareBytes` checks
  them**, in array order (widths, `GroupThresholdInvalid`, a `Secret` value),
  so at every position an object has exactly the outcome its bytes would have.
  Before, a share object with `memberThreshold: 0` recovered a wrong secret.
- **`Secret.equals` returns `false`** for anything that is not a `Secret` (it
  threw an engine `TypeError`); `GroupSpec.parse` names its parameter `text`.
- **The identifier is drawn through `@blockchaincommons/rand`'s
  `fillRandomBytes`**, so rand's generator contract applies: a generator
  without a callable `fillBytes` throws rand's `RandError` `InvalidGenerator`
  at the first draw instead of an engine `TypeError`. A generator's own error
  still propagates unwrapped.

### Added

- **`number | bigint` spec fields.** `memberThreshold`, `memberCount` and
  `groupThreshold` accept a `bigint` in `[0, 2^64 − 1]` and an integer-valued
  `number` up to `2^64`, the reference's whole `usize` domain, and the
  reference's checks run on the value with the reference's codes
  (`GroupSpec.from({ memberThreshold: 2 ** 53, memberCount: 3 })` is
  `MemberThresholdInvalid`, no longer `InvalidParameter`). Every `usize` that
  rounds to the same double has the same outcome, because each check
  compares with at most 16 or with the group count.
- **`Secret.isSecret`, `GroupSpec.isGroupSpec`, `Spec.isSpec`**: type guards
  that recognise instances from another copy of this package, which
  `generateShares`, `Spec.from` and `combineShares` accept and rebuild through
  this copy's factories; `isSskrShare` uses the guard.
- **`GroupSpec.equals` and `Spec.equals`**, the reference's `PartialEq`.
- `parseShare` returns frozen objects.
- Rust cross-validation: the golden file grows from 1012 to 1054 vectors and
  every thrown outcome carries the code, the wrapped Shamir cause and the
  message; the harness classifies integers exactly, reports a malformed
  recipe instead of panicking, and CI replays the golden file, the full corpus
  (2301 vectors) and a 16,320-row header sweep against `sskr` 0.12.0, with a
  committed mismatch self-check.

## 1.0.0-beta.2 - 2026-09-12

Compatibility, documentation, and maintenance updates.

### Fixed

- **`GroupSpec.parse` reports the reference's code for large numbers.** A
  threshold or count between 2^53 and 2^64 − 1 is a `usize` the reference
  parses and then rejects with `MemberThresholdInvalid` or
  `MemberCountInvalid`; the port's safe-integer gate reported
  `GroupSpecInvalid` for the whole window. The field is now parsed as a
  `BigInt` and the reference's checks run on it in the reference's order;
  only a value beyond `u64::MAX`, or a non-digit run, is `GroupSpecInvalid`.
  Every value that passes is at most 16, so nothing else changes.

### Changed

- Clarify the remaining zero-member-threshold and integer-domain differences.
  Classify public header serialization as a TypeScript-only operation.

## 1.0.0-beta.1 - 2026-09-09

Initial beta implementation.