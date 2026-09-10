# Migrating from `@bcts/sskr` to `@blockchaincommons/sskr`

`@blockchaincommons/sskr` is the canonical home of this library. It was
extracted from the [`paritytech/bcts`](https://github.com/paritytech/bcts)
monorepo, where it was published as `@bcts/sskr`, into its own Blockchain
Commons repository at
[`BlockchainCommons/bc-sskr-ts`](https://github.com/BlockchainCommons/bc-sskr-ts),
and redesigned as an idiomatic TypeScript library in the same release.

**Every share byte is unchanged.** The share format, the identifier-first
RNG draw order, and every combine rule are identical to `@bcts/sskr` and to
the Rust reference `sskr 0.12.0`; 983 golden vectors, a differential corpus
against the frozen pre-redesign bundle, and a Rust cross-validation harness
enforce that. What changed is the shape of the API.

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
tells the two apart. `rng` is optional and defaults to the secure generator.

## 3. Renames

| `@bcts/sskr` | `@blockchaincommons/sskr` |
| --- | --- |
| `Secret.new(bytes)` | `Secret.from(bytes)` |
| `Secret.new("text")` | `Secret.fromText("text")` (UTF-8, explicit) |
| `secret.getData()` / `asRef()` | `secret.bytes` |
| `secret.len()` | `secret.byteLength` |
| `secret.isEmpty()` | removed (a secret is never empty) |
| `secret.equals`, `secret.clone` | unchanged |
| `GroupSpec.new(mt, mc)` | `GroupSpec.from({ memberThreshold, memberCount })` |
| `groupSpec.memberThreshold()` / `memberCount()` | fields |
| `GroupSpec.default()` | `GroupSpec.DEFAULT` |
| `GroupSpec.parse`, `toString` | unchanged |
| `Spec.new(gt, groups)` | `Spec.from({ groupThreshold, groups })` |
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

Messages and check order are unchanged.

## 5. Node and TypeScript floors

Node **22.12** and TypeScript **5.7**. The IIFE / global-script build is
gone; use the ESM or CJS entry.

## 6. What did not change

- The share format (BCR-2020-011) and every byte `shareBytes` produces.
- The RNG draw order: two identifier bytes, the group split, then each
  group's member split.
- The combine rules and their error codes.
- `GroupSpec.parse` strictness (`"+2-of-+3"` accepted, `"2.0-of-3"` not).
