# 04 — Generated-file attributes and `test:file` script

**Objective.** (a) Mark generated files so GitHub collapses them and review
scope can exclude them by one attribute. (b) Make a single compiled test
discoverable from `package.json`: `src/<p>/<n>.test.ts` → `build/<p>/<n>.test.js`
(`tsconfig.json` `rootDir: src`, `outDir: build`; `build/` is gitignored).

**Owner.** `devops-coordinator` (hinokuma), model tier `cheap` (fully specified,
mechanical). MODE IMPLEMENT.

**Exclusive paths.** `.gitattributes`, `package.json` (scripts block only),
`scripts/test-file.mjs` (new).

**Contract.** `plan.md@sri-v1` C3 (developer decision O3): append to `.gitattributes`
`dist/** linguist-generated=true`, `package-lock.json linguist-generated=true`
(unanchored, so it also matches `console/package-lock.json`),
`docs/context/markdown-inventory.json linguist-generated=true`. No `-diff`, no
`evals/**/*.jsonl`. Script: `"test:file": "node scripts/test-file.mjs"`;
the script accepts one `src/**/*.test.ts` path, runs `tsc -p tsconfig.json`,
then `node --test build/<mapped>.js`; any other argument prints one usage line
and exits 1. Node built-ins only, no dependency.

**dependsOn.** none.

**Acceptance.** SRI-16, SRI-17 (SRI-18 line returned in envelope).

**Required checks (approved later).** `test` (one `test:file` run counts as test
consent), `validate`.

**Risk.** low. **Rollback.** `git revert`.

**Return envelope.** diff summary; the `docs/CODEBASE_MAP.md` "Tests" line text
for the supervisor; `git check-attr` output once approved.
