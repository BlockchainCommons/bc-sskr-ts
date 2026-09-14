# Migrating from `@bcts/sskr` to `@blockchaincommons/sskr`

`@blockchaincommons/sskr` is the successor to `@bcts/sskr`.

## TL;DR checklist

- [ ] Replace the `@bcts/sskr` dependency with `@blockchaincommons/sskr`.
- [ ] Rewrite import specifiers: `@bcts/sskr` becomes `@blockchaincommons/sskr`.
- [ ] `sskrGenerate(spec, secret)` / `sskrGenerateUsing(spec, secret, rng)` →
      `generateShares(spec, secret, { rng })`, returning `SskrShare[][]`;
      `shareBytes(share)` is the wire form.
- [ ] `sskrCombine(bytes[])` → `combineShares(shares)` with bytes or `SskrShare`s.
- [ ] `Secret.new(x)` → `Secret.from(bytes)` / `Secret.fromText(s)`; `getData()` → `bytes`.
- [ ] `GroupSpec.new(mt, mc)` → `GroupSpec.from({ memberThreshold, memberCount })`;
      `Spec.new(gt, groups)` → `Spec.from({ groupThreshold, groups })`; accessors are fields.
- [ ] `SSKRErrorType.X` / `error.type` → `"X"` / `error.code`; `ShamirError` → `"Shamir"`.
- [ ] Raise your Node floor to **22.12** and TypeScript to **>= 5.7**.

## 1. Package name and imports

```diff
- import { sskrGenerate, sskrCombine } from "@bcts/sskr";
+ import { generateShares, combineShares } from "@blockchaincommons/sskr";
```

## 2. Shares are values

```diff
- const groups = sskrGenerateUsing(spec, secret, rng);        // Uint8Array[][]
- const bytes = groups[0][1];
- const recovered = sskrCombine([groups[0][0], groups[0][1]]);
+ const groups = generateShares(spec, secret, { rng });      // SskrShare[][]
+ const bytes = shareBytes(groups[0][1]);                    // the same bytes as before
+ const recovered = combineShares([groups[0][0], groups[0][1]]); // shares or bytes, mixed freely
```

`SskrShare` is a readonly value: `identifier`, `groupIndex`,
`groupThreshold`, `groupCount`, `memberIndex`, `memberThreshold`, `value:
Secret`. `parseShare(bytes)` is the inverse of `shareBytes`; `isSskrShare`
tells the two apart. A share object handed to `combineShares` is checked
exactly as `shareBytes` checks it, so it has the outcome its bytes would
have. `rng` is optional and defaults to the secure generator; a generator
without a callable `fillBytes` fails at the first draw with
`@blockchaincommons/rand`'s `RandError`. `Secret.isSecret`,
`GroupSpec.isGroupSpec` and `Spec.isSpec` recognise instances from another
copy of the package, and `equals` compares two secrets or two specs.

## 3. Renames

| `@bcts/sskr` | `@blockchaincommons/sskr` |
| --- | --- |
| `Secret.new(bytes)` | `Secret.from(bytes)` |
| `Secret.new("text")` | `Secret.fromText("text")` (UTF-8, explicit) |
| `secret.getData()` / `asRef()` | `secret.bytes` |
| `secret.len()` | `secret.byteLength` |
| `secret.isEmpty()` | removed (a secret is never empty) |
| `secret.equals`, `secret.clone` | unchanged |
| `GroupSpec.new(mt, mc)` | `GroupSpec.from({ memberThreshold, memberCount })`; each field a `number` or a `bigint` |
| `groupSpec.memberThreshold()` / `memberCount()` | fields |
| `GroupSpec.default()` | `GroupSpec.DEFAULT` |
| `GroupSpec.parse`, `toString` | unchanged |
| `Spec.new(gt, groups)` | `Spec.from({ groupThreshold, groups })`; `groupThreshold` a `number` or a `bigint` |
| `spec.groupThreshold()` / `groups()` / `groupCount()` / `shareCount()` | fields and getters |
| `sskrGenerate(spec, secret)` | `generateShares(spec, secret)` |
| `sskrGenerateUsing(spec, secret, rng)` | `generateShares(spec, secret, { rng })` |
| `sskrCombine(bytes[])` | `combineShares(shares)` |
| `MIN_SECRET_LEN` / `MAX_SECRET_LEN` | `MIN_SECRET_LENGTH` / `MAX_SECRET_LENGTH` |
| `MAX_GROUPS_COUNT` | `MAX_GROUP_COUNT` |
| `METADATA_SIZE_BYTES` | `SHARE_HEADER_LENGTH` |
| `MIN_SERIALIZE_SIZE_BYTES` | `MIN_SHARE_LENGTH` |
| `MAX_SHARE_COUNT` | unchanged |

## 4. Errors

One class, `SskrError`, with a `code` union of the fifteen codes:

```ts
try {
  combineShares(shares);
} catch (e) {
  if (SskrError.isSskrError(e) && e.code === "NotEnoughGroups") { /* … */ }
}
```

| `@bcts/sskr` | `@blockchaincommons/sskr` |
| --- | --- |
| `error.type === SSKRErrorType.X` | `error.code === "X"` |
| `SSKRErrorType.ShamirError`, `error.shamirError` | `"Shamir"`, `error.cause` (the `ShamirError`) |
| `new SSKRError(SSKRErrorType.X)` | `SskrError.of("X")` |
| `SSKRResult<T>` | removed (`T`) |
| `error.type === X` | `error.code === "X"` or `error.is("X")`; `error.details` is a union discriminated by `code` (`{ parameter, value }` for `InvalidParameter`, `{ cause }` for `Shamir`) |
| spec fields accepted as any `number` (`"1.5-of-3"`, `"1-of-NaN"`) | `"InvalidParameter"` from `GroupSpec.from` / `Spec.from`, before the reference's checks; a `bigint` in `[0, 2^64 − 1]` or an integer-valued `number` up to `2^64` is a `usize` and gets the reference's code |
| `GroupSpec.new(0, n)` accepted, generation failed as `ShamirError` | unchanged: `GroupSpec.from({ memberThreshold: 0, … })` is accepted and generation throws `"Shamir"` (cause `InvalidThreshold`), as the reference does |
| `shareBytes` masked out-of-width header fields | `"InvalidParameter"` (header serialization is a TypeScript-only surface); `"GroupThresholdInvalid"` for a threshold above the count |
| a wrong argument type leaked a `TypeError`, or a string secret became an empty one | `"InvalidParameter"` naming the argument (`bytes`, `text`, `options`, `groups`, `spec`, `secret`, `shares`, `share`, `value`) |

Plain Rust error messages are preserved. An `InvalidParameter` message reads
`"<parameter> must be <expected>, got <value>"`, with the value rendered
exactly. `Secret.bytes` returns a copy; `Spec`, `GroupSpec`, `Spec.groups`,
the shares `generateShares` returns and the objects `parseShare` returns are
frozen.

### Changes from 1.0.0-beta.2

- A zero member threshold is accepted by `GroupSpec.from` and
  `GroupSpec.parse`, as `GroupSpec::new` accepts it; generation throws
  `"Shamir"` (cause `InvalidThreshold`) after the identifier, the group split
  and every earlier group's member split have drawn. Code that expected
  `MemberThresholdInvalid` at construction must check the threshold itself.
- `memberThreshold`, `memberCount` and `groupThreshold` accept `bigint` and
  integer-valued numbers up to `2^64`; values above `2^53 − 1`
  reach the reference's checks (`MemberThresholdInvalid`, `MemberCountInvalid`,
  `GroupThresholdInvalid`) instead of `InvalidParameter`.
- `SskrError.invalidParameter(parameter, value, expected)` replaces the
  `bounds` argument; `details.value` is `unknown`, `details.parameter` an
  `SskrParameter`; the message reads `"<parameter> must be <expected>, got
  <value>"`. Code that matched the old message text must change; code that
  branches on `code` and `details.parameter` need not.
- Wrongly typed arguments are `InvalidParameter` everywhere; share objects in
  `combineShares` are validated like their bytes; `parseShare` returns frozen
  objects; `Secret.equals` returns `false` for a non-`Secret` instead of
  throwing. `GroupSpec.parse` names its parameter `text`.
- The identifier is drawn through `@blockchaincommons/rand`'s
  `fillRandomBytes`: a generator without a callable `fillBytes` throws rand's
  `RandError` `InvalidGenerator` (it threw an engine `TypeError`). The floors
  on `@blockchaincommons/rand` and `@blockchaincommons/shamir` rise to
  `1.0.0-beta.3`.
