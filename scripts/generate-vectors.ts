/**
 * Vector generator. Materialises recipes with the WORKING TREE, messages
 * included, so the Rust harness compares codes, wrapped Shamir causes and
 * messages.
 *
 *   bun scripts/generate-vectors.ts                 golden subset → tests/vectors/vectors.json
 *   bun scripts/generate-vectors.ts --full <path>   every corpus recipe → <path> (not committed; CI replays it)
 *   bun scripts/generate-vectors.ts --sweep <path>  the 16,320-row header sweep → <path> (likewise)
 *
 * Regenerating the committed file is a deliberate, reviewed act.
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as src from "../src/index.ts";
import * as rand from "@blockchaincommons/rand";
import { materialize, currentAdapterFor, recipeName } from "../tests/vectors/recipes.ts";
import { allRecipes, goldenRecipes, sweep } from "../tests/corpus/corpus.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const api = currentAdapterFor(src, rand);
const args = process.argv.slice(2);

const [recipes, out, label] = (() => {
  for (const [flag, make, name] of [
    ["--full", allRecipes, "full corpus"],
    ["--sweep", sweep, "header sweep"],
  ] as const) {
    const at = args.indexOf(flag);
    if (at === -1) continue;
    const path = args[at + 1];
    if (path === undefined) throw new Error(`${flag} needs an output path`);
    return [make(), path, name] as const;
  }
  return [goldenRecipes(), join(root, "tests/vectors/vectors.json"), "golden"] as const;
})();

const vectors = [];
for (const recipe of recipes)
  vectors.push({
    name: recipeName(recipe),
    recipe,
    expect: materialize(api, recipe, { messages: true }),
  });
writeFileSync(out, JSON.stringify({ count: vectors.length, vectors }, null, 1) + "\n");
console.log(`wrote ${vectors.length} ${label} vectors to ${out}`);
