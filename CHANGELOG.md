# Changelog

## 1.0.0-beta.2

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

## 1.0.0-beta.1

Initial beta implementation.