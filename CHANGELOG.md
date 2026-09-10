# Changelog

## 1.0.0-beta.1

Extracted from the [`paritytech/bcts`](https://github.com/paritytech/bcts)
monorepo (`@bcts/sskr`) and redesigned as an idiomatic TypeScript library;
see [MIGRATION.md](./MIGRATION.md). Every share byte is unchanged.

- Shares are readonly `SskrShare` values; `shareBytes` / `parseShare` are
  the wire form. `generateShares(spec, secret, { rng? })` returns
  `SskrShare[][]`; `combineShares` takes shares or bytes.
- `Secret.from` / `Secret.fromText` with `bytes` and `byteLength`;
  `GroupSpec.from({ memberThreshold, memberCount })`, `GroupSpec.DEFAULT`,
  `Spec.from({ groupThreshold, groups })`, readonly fields.
- One `SskrError` with a `code` union and `SskrError.of(code)`; the
  `ShamirError` rides along as `cause` under `"Shamir"`. `SSKRErrorType`
  and `SSKRResult` removed.
- Constants renamed to spell the word out (`MIN_SECRET_LENGTH`,
  `SHARE_HEADER_LENGTH`, `MIN_SHARE_LENGTH`, `MAX_GROUP_COUNT`).
- Built on the redesigned shamir (`ShamirShare`) and rand (`{ rng }`).
- 983 golden vectors, a differential corpus against the frozen pre-redesign
  bundle, and a Rust cross-validation harness (`tests/rust-validation`,
  `sskr 0.12.0`: 983/983 match, error variants included).

---

## History as `@bcts/sskr`

## [1.0.0-beta.6] - 2026-07-29

### Changed

- Workspace version bump

## [1.0.0-beta.5] - 2026-07-01

### Changed

- Workspace version bump

## [1.0.0-beta.4] - 2026-06-28

### Changed

- Dependency sync

## [1.0.0-beta.3] - 2026-06-22

### Changed

- Dependencies bump

## [1.0.0-beta.2] - 2026-06-16

### Changed

- Dependencies bump

## [1.0.0-beta.1] - 2026-05-27

### Changed

- Workspace version bump

## [1.0.0-beta.0] - 2026-04-27

### Changed

- Workspace version bump

## [1.0.0-alpha.23] - 2026-04-24

### Changed

- Workspace version bump

## [1.0.0-alpha.22] - 2026-03-01

### Changed

- Workspace version bump

## [1.0.0-alpha.21] - 2026-02-27

### Changed

- Workspace version bump

## [1.0.0-alpha.20] - 2026-02-12

### Changed

- Workspace version bump

## [1.0.0-alpha.19] - 2026-02-05

### Changed

- Workspace version bump
