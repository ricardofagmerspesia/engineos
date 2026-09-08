# TypeScript Runtime Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the bash runtime (hooks, kernel, scripts, checks, tests) with one TypeScript codebase compiled to a committed `dist/engineos.cjs`, keeping every public contract byte-compatible and every existing black-box suite green throughout.

**Architecture:** `src/` holds pure modules per subcommand behind a single CLI entry (`src/cli.ts`); esbuild bundles it to `dist/engineos.cjs` (no runtime deps). Every bash entry point becomes a three-line shim that `exec`s the bundle, so contracts and existing tests hold while each unit is ported in its own PR on `main`. Checks move to an explicit registry; everything else ports behaviour byte for byte.

**Tech Stack:** TypeScript 5 (strict), esbuild, Node >= 18, `node:test`, `node:child_process` for `git` and project runners. No runtime dependencies.

**Spec:** `docs/specs/2026-09-04-typescript-runtime-migration-design.md` (read it first; the invariants list there is normative). ADR: `docs/adr/2026-09-04-typescript-runtime-over-bash.md`.

## Global Constraints

- Node `>= 18` at runtime; `src/cli.ts` up to and including the version guard must parse on Node 16 (esbuild `target: 'node16'` for syntax lowering; APIs may require 18).
- Zero runtime dependencies. `package.json` `devDependencies` are exactly `typescript`, `esbuild`, `@types/node`.
- `dist/engineos.cjs` is committed and regenerated in every PR that touches `src/`; CI fails on drift.
- Every PR <= 400 changed lines excluding `dist/engineos.cjs` and `package-lock.json` (called out in the PR description per `rules/git.md`).
- Public surface (`docs/COMPATIBILITY.md`): kernel subcommand names and JSON answer shapes, `hooks/hooks.json` event contract, `registries/*.json` shapes, return envelope. Byte-compatible. `scripts/kernel.sh` stays as a shim until 2.0.
- JSON output is pretty-printed with two-space indent (`JSON.stringify(v, null, 2) + '\n'`), matching `jq`'s default; error answers are `{"error": "..."}` on stdout with exit 1 for kernel and telemetry, plain text on stderr with exit 1 for exec-journal.
- Slug class `^[A-Za-z0-9@_./:-]+$`; path-slug class `^[A-Za-z0-9@_:-]+$`; over-length values reject, never truncate.
- Scaffold: `lstat` every component, `mkdir` one level at a time, never recursive; refusals are silent successes.
- Stop hooks: bypass check, then `stop_hook_active` guard, then work.
- Under an unusable node: `route-before-change`, `mark-unrecorded`, `record-verify`, `prompt-advisor` exit 0 silently; every other hook prints `{"systemMessage": "[engineos] <hook> skipped: node >= 18 required (found vX)"}` and exits 0 (spec deviation 2).
- The project runner (`npm`/`pnpm`/`yarn`/`nx`) is spawned with a `PATH` that has the nvm-default `bin/` prepended when PATH's node is below 20 (`ensure_modern_node`, threshold 20, ported in `runner.ts`). The CLI's own re-exec floor is 18 and does not touch the runner.
- A check that reads source text (C18f, C20d, C22c, C27c, C29, C30) is re-pointed at the TypeScript module in the same PR that shims the file it grepped (spec deviation 3). The `validate-engineos.sh` run is green at the end of every PR, not only at barriers.
- No `console.log` in library modules; the CLI adapter owns stdout/stderr through the `Io` interface defined in Task 3.
- All identifiers, comments and messages in English; no emojis; comments say why.
- Conventional Commits; one logical change per commit; each task ends with a commit.
- Tests are IN SCOPE for this migration: every ported module ships with `node:test` coverage, and the bash suite that covers the ported unit must stay green in the same PR.

## Plan convention

Tasks 1-9 (Wave 0 and Wave 1a) are written step by step with complete code: they define the entry point, the `Io` contract, the registry loader and the first kernel subcommand, which every later task consumes. Tasks 10 onward are **port contracts**: exact source file, target files, exported signatures, acceptance suite, shim text and commit message. The code for those is a faithful translation of the named bash file; the executor reads the bash source and the spec's invariants, writes the TypeScript and the tests, swaps the shim, and runs the named suite. A port contract that leaves a listed invariant unimplemented is incomplete.

## File structure

```
package.json, package-lock.json, tsconfig.json, scripts/build.mjs
src/cli.ts                       entry, node guard, dispatch
src/io.ts                        Io interface + processIo()
src/lib/{fs,git,time,slug,json,glob}.ts
src/registry/{paths,load,routing,intents,models,policy,decision-rules,capabilities,agents}.ts
src/kernel/{index,context,resolve,cli}.ts                          public: resolve + types; cli = projections
src/kernel/{route,risk,model,scale,decisions,hitl,admit,breaker,waves,repair}.ts   internal seams, not exported
src/kernel/{resolve,cli,parity}.test.ts, test/fixtures/legacy-kernel/{kernel.sh,registries/}
src/journal/{schema,exec-journal,telemetry,cli}.ts
src/hooks/{envelope,output,bypass,telemetry,scaffold,runner,cache,cli}.ts
src/hooks/{ensure-project-layout,prompt-advisor,route-before-change,announce-agent-dispatch,mark-unrecorded,announce-agent-return,stop-verify,record-verify,post-edit-check}.ts
src/gen/{agent-commands,agent-registry,frontmatter}.ts
src/init/project.ts
src/install/settings-merge.ts
src/evals/{run,deterministic,live}.ts
src/checks/{index,lib,mirror,mirrors,10-rules,20-registries,30-agents-skills,40-decision-registries,50-kernel,60-contracts,70-runtime}.ts
src/validate/cli.ts
src/bench/run.ts
src/report/usage.ts
src/testing/{harness,harness.test}.ts   test-only; never imported from src/cli.ts, so never bundled
registries/layout-manifest.json, registries/docs-ledger.json
dist/engineos.cjs
```

Each `.ts` module has a sibling `*.test.ts`, except the kernel concept modules:
they are internal seams tested through `resolve` (`resolve.test.ts`) and the
projections (`cli.test.ts`); only pure helpers (glob match, tier max) get their
own test file. `build/` (tsc output) is git-ignored.

---

# Wave 0 — toolchain and entry point

### Task 1: Node toolchain files

**Files:**
- Create: `package.json`, `tsconfig.json`, `scripts/build.mjs`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `npm run build` -> `dist/engineos.cjs`; `npm test` -> `tsc` + `node --test build/`; `npm run typecheck`.

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "engineos",
  "version": "1.6.0",
  "private": true,
  "description": "EngineOS runtime CLI: kernel, hooks, journal, checks",
  "license": "MIT",
  "engines": { "node": ">=18" },
  "scripts": {
    "build": "node scripts/build.mjs",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "lint": "tsc -p tsconfig.json --noEmit",
    "test": "tsc -p tsconfig.json && cd build && node --test"
  },
  "devDependencies": {
    "@types/node": "^18.19.0",
    "esbuild": "^0.24.0",
    "typescript": "^5.6.0"
  }
}
```

- [ ] **Step 2: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "moduleResolution": "Node10",
    "lib": ["ES2022"],
    "types": ["node"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "exactOptionalPropertyTypes": true,
    "esModuleInterop": true,
    "rootDir": "src",
    "outDir": "build",
    "sourceMap": false,
    "declaration": false,
    "skipLibCheck": true
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 3: Write `scripts/build.mjs`**

```js
// Bundles src/cli.ts into the single committed runtime file. Syntax is lowered to
// node16 so the version guard in cli.ts can run on an old node and re-exec a newer
// one; APIs used elsewhere still require node 18 (package.json engines).
import { build } from 'esbuild';

await build({
  entryPoints: ['src/cli.ts'],
  bundle: true,
  platform: 'node',
  target: 'node16',
  format: 'cjs',
  outfile: 'dist/engineos.cjs',
  banner: { js: '#!/usr/bin/env node' },
  legalComments: 'none',
  minify: false,
  sourcemap: false,
  logLevel: 'error',
});
```

- [ ] **Step 4: Add build output to `.gitignore`**

Append one line: `build/`

- [ ] **Step 5: Install and lock**

Run: `npm install`
Expected: `package-lock.json` created, `node_modules/` ignored (already in `.gitignore`).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json tsconfig.json scripts/build.mjs .gitignore
git commit -m "chore(runtime): add TypeScript toolchain for the node runtime"
```

### Task 2: `Io` contract

**Files:**
- Create: `src/io.ts`, `src/io.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface Io { readStdin(): string; out(text: string): void; err(text: string): void; env: NodeJS.ProcessEnv; cwd(): string }
  export function processIo(): Io
  export function memoryIo(opts?: { stdin?: string; env?: NodeJS.ProcessEnv; cwd?: string }): Io & { stdout: string[]; stderr: string[] }
  export function writeJson(io: Io, value: unknown): void   // JSON.stringify(value, null, 2) + '\n'
  ```

- [ ] **Step 1: Write the failing test**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryIo, writeJson } from './io';

test('writeJson pretty-prints with two-space indent and trailing newline', () => {
  const io = memoryIo();
  writeJson(io, { domain: null, excluded: true });
  assert.equal(io.stdout.join(''), '{\n  "domain": null,\n  "excluded": true\n}\n');
});

test('memoryIo returns the stdin it was given exactly once', () => {
  const io = memoryIo({ stdin: '{"cwd":"/x"}' });
  assert.equal(io.readStdin(), '{"cwd":"/x"}');
  assert.equal(io.readStdin(), '');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL, `Cannot find module './io'`.

- [ ] **Step 3: Implement `src/io.ts`**

```ts
import { readFileSync } from 'node:fs';

export interface Io {
  readStdin(): string;
  out(text: string): void;
  err(text: string): void;
  env: NodeJS.ProcessEnv;
  cwd(): string;
}

export function processIo(): Io {
  let consumed = false;
  return {
    readStdin(): string {
      // Hooks read stdin exactly once; a second read must not block on a closed pipe.
      if (consumed) return '';
      consumed = true;
      try {
        return readFileSync(0, 'utf8');
      } catch {
        return '';
      }
    },
    out(text: string): void {
      process.stdout.write(text);
    },
    err(text: string): void {
      process.stderr.write(text);
    },
    env: process.env,
    cwd: () => process.cwd(),
  };
}

export function memoryIo(opts: { stdin?: string; env?: NodeJS.ProcessEnv; cwd?: string } = {}): Io & { stdout: string[]; stderr: string[] } {
  let stdin = opts.stdin ?? '';
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout,
    stderr,
    readStdin(): string {
      const s = stdin;
      stdin = '';
      return s;
    },
    out: (t) => { stdout.push(t); },
    err: (t) => { stderr.push(t); },
    env: opts.env ?? {},
    cwd: () => opts.cwd ?? '/',
  };
}

export function writeJson(io: Io, value: unknown): void {
  io.out(`${JSON.stringify(value, null, 2)}\n`);
}
```

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: 2 passing.

- [ ] **Step 5: Commit**

```bash
git add src/io.ts src/io.test.ts
git commit -m "feat(runtime): add Io contract for CLI adapters"
```

### Task 3: CLI entry with node-version guard and dispatch

**Files:**
- Create: `src/cli.ts`, `src/node-guard.ts`, `src/node-guard.test.ts`, `src/dispatch.ts`, `src/dispatch.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // src/dispatch.ts
  export type Command = (argv: string[], io: Io) => number;   // returns exit code
  export interface CommandTable { [name: string]: Command }
  export function dispatch(table: CommandTable, argv: string[], io: Io): number
  // src/node-guard.ts
  export const MIN_NODE_MAJOR = 18;
  export function currentMajor(versions?: string): number
  export function findNewerNode(env: NodeJS.ProcessEnv, exists: (p: string) => boolean, listDir: (p: string) => string[]): string | null
  ```
- Later tasks register commands in the table in `src/cli.ts`: `kernel`, `hook`, `journal`, `telemetry`, `gen`, `init`, `settings-merge`, `bypass`, `validate`, `evals`, `bench`, `usage-report`.
- The guard's two hook sets and the `systemMessage` text are spec-level contract (deviation 2); `SILENT_HOOKS` is the four hooks whose bash reads stdin through `hook_read_envelope`.

- [ ] **Step 1: Write failing tests for the guard's pure parts**

```ts
// src/node-guard.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { currentMajor, findNewerNode } from './node-guard';

test('currentMajor parses the leading integer', () => {
  assert.equal(currentMajor('16.17.0'), 16);
  assert.equal(currentMajor('22.23.2'), 22);
});

test('findNewerNode prefers the highest nvm version >= 18', () => {
  const fs = new Set(['/h/.nvm/versions/node', '/h/.nvm/versions/node/v16.17.0/bin/node', '/h/.nvm/versions/node/v20.19.3/bin/node', '/h/.nvm/versions/node/v22.23.2/bin/node']);
  const found = findNewerNode({ HOME: '/h' }, (p) => fs.has(p), () => ['v16.17.0', 'v20.19.3', 'v22.23.2']);
  assert.equal(found, '/h/.nvm/versions/node/v22.23.2/bin/node');
});

test('findNewerNode falls back to homebrew and /usr/local', () => {
  const found = findNewerNode({ HOME: '/h' }, (p) => p === '/usr/local/bin/node', () => []);
  assert.equal(found, '/usr/local/bin/node');
});

test('findNewerNode returns null when nothing qualifies', () => {
  assert.equal(findNewerNode({ HOME: '/h' }, () => false, () => []), null);
});
```

```ts
// src/dispatch.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dispatch } from './dispatch';
import { memoryIo } from './io';

test('dispatch routes to the named command and returns its exit code', () => {
  const io = memoryIo();
  const code = dispatch({ ping: (argv, io) => { io.out(`pong ${argv.join(' ')}\n`); return 0; } }, ['ping', 'a'], io);
  assert.equal(code, 0);
  assert.equal(io.stdout.join(''), 'pong a\n');
});

test('dispatch answers --version from package metadata', () => {
  const io = memoryIo();
  assert.equal(dispatch({}, ['--version'], io), 0);
  assert.match(io.stdout.join(''), /^engineos \d+\.\d+\.\d+\n$/);
});

test('dispatch reports an unknown command as a JSON error with exit 1', () => {
  const io = memoryIo();
  assert.equal(dispatch({}, ['nope'], io), 1);
  assert.equal(io.stdout.join(''), '{\n  "error": "unknown command: nope"\n}\n');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement `src/node-guard.ts`**

```ts
import { accessSync, constants } from 'node:fs';
import { join } from 'node:path';

export const MIN_NODE_MAJOR = 18;

// The four hooks that already go silent without jq stay silent; the ones that
// survive a missing jq today (the Stop gate among them) say why they did not run.
export const SILENT_HOOKS = new Set(['route-before-change', 'mark-unrecorded', 'record-verify', 'prompt-advisor']);

export function currentMajor(versions: string = process.versions.node): number {
  const major = Number.parseInt(versions.split('.')[0] ?? '0', 10);
  return Number.isNaN(major) ? 0 : major;
}

function toComponent(part: string | undefined): number {
  const n = Number.parseInt(part ?? '0', 10);
  return Number.isNaN(n) ? 0 : n;
}

function parseVersion(dirName: string): [number, number, number] {
  const parts = dirName.replace(/^v/, '').split('.');
  return [toComponent(parts[0]), toComponent(parts[1]), toComponent(parts[2])];
}

function defaultIsExecutable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

// Mirrors hooks/lib-common.sh ensure_modern_node: a hook PATH often carries an
// old nvm node first, while a newer one is installed a directory away.
export function findNewerNode(
  env: NodeJS.ProcessEnv,
  exists: (path: string) => boolean,
  listDir: (path: string) => string[],
  isExecutable: (path: string) => boolean = defaultIsExecutable,
): string | null {
  const nvmDir = env['NVM_DIR'] ?? join(env['HOME'] ?? '', '.nvm');
  const versionsDir = join(nvmDir, 'versions', 'node');
  if (exists(versionsDir)) {
    // versionsDir can exist as a file, or be unreadable (EACCES) — readdirSync (or a
    // test double standing in for it) throws in both cases; treat that as "no candidates".
    let names: string[];
    try {
      names = listDir(versionsDir);
    } catch {
      names = [];
    }
    const candidates = names
      .filter((v) => parseVersion(v)[0] >= MIN_NODE_MAJOR)
      .sort((a, b) => {
        const av = parseVersion(a);
        const bv = parseVersion(b);
        return bv[0] - av[0] || bv[1] - av[1] || bv[2] - av[2];
      });
    for (const v of candidates) {
      const bin = join(versionsDir, v, 'bin', 'node');
      if (exists(bin) && isExecutable(bin)) return bin;
    }
  }
  for (const bin of ['/opt/homebrew/bin/node', '/usr/local/bin/node']) {
    if (exists(bin) && isExecutable(bin)) return bin;
  }
  return null;
}

export type GuardOutcome =
  | { kind: 'proceed' }
  | { kind: 'reexec'; bin: string }
  | { kind: 'silent' }
  | { kind: 'skip'; message: string }
  | { kind: 'refuse'; message: string };

// Pure decision: given the current node version and a pre-resolved newer-node
// candidate, decide what the guard should do. cli.ts performs the actual effects
// (spawnSync / process.exit / print) so this stays testable without a subprocess.
export function guardOutcome(argv: string[], nodeVersion: string, newer: string | null): GuardOutcome {
  if (currentMajor(nodeVersion) >= MIN_NODE_MAJOR) return { kind: 'proceed' };
  if (newer !== null) return { kind: 'reexec', bin: newer };
  if (argv[0] === 'hook') {
    const hookName = argv[1] ?? '';
    if (SILENT_HOOKS.has(hookName)) return { kind: 'silent' };
    return { kind: 'skip', message: `[engineos] ${argv[1] ?? 'hook'} skipped: node >= ${MIN_NODE_MAJOR} required (found v${nodeVersion})` };
  }
  return { kind: 'refuse', message: `node >= ${MIN_NODE_MAJOR} required, found v${nodeVersion}` };
}
```

- [ ] **Step 4: Implement `src/dispatch.ts`**

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { writeJson, type Io } from './io';

export type Command = (argv: string[], io: Io) => number;
export interface CommandTable { [name: string]: Command }

// Injected by scripts/build.mjs via `define`; falls back for tsc test builds.
declare const ENGINEOS_VERSION: string | undefined;

export function dispatch(table: CommandTable, argv: string[], io: Io): number {
  const [name, ...rest] = argv;
  if (name === '--version' || name === '-v') {
    const v = typeof ENGINEOS_VERSION === 'string' ? ENGINEOS_VERSION : readPackageVersion();
    io.out(`engineos ${v}\n`);
    return 0;
  }
  const command = name === undefined ? undefined : table[name];
  if (command === undefined) {
    writeJson(io, { error: `unknown command: ${name ?? ''}` });
    return 1;
  }
  return command(rest, io);
}

function readPackageVersion(): string {
  // Test builds run from build/, one level below the repo root. The bundle
  // never reaches this path (ENGINEOS_VERSION is inlined at build time), so
  // 'unknown' only ever surfaces in the tsc test build, never a shipped CLI.
  try {
    const raw = readFileSync(join(__dirname, '..', 'package.json'), 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null && 'version' in parsed && typeof parsed.version === 'string') {
      return parsed.version;
    }
    return 'unknown';
  } catch {
    return 'unknown';
  }
}
```

Add to `scripts/build.mjs` (import attributes are not portable to node 18, so read the file):

```js
const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
// inside build({...}):
  define: { ENGINEOS_VERSION: JSON.stringify(version) },
```

- [ ] **Step 5: Implement `src/cli.ts`**

```ts
// Entry point. Everything above the guard must parse on node 16.
// No shebang here: the esbuild banner in scripts/build.mjs supplies the only one.
import { spawnSync } from 'node:child_process';
import { accessSync, constants, existsSync, readdirSync } from 'node:fs';
import { processIo, writeJson } from './io';
import { currentMajor, findNewerNode, guardOutcome, MIN_NODE_MAJOR, type GuardOutcome } from './node-guard';
import { dispatch, type CommandTable } from './dispatch';

const io = processIo();
const argv = process.argv.slice(2);

function isExecutable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function applyOutcome(outcome: GuardOutcome): void {
  switch (outcome.kind) {
    case 'proceed':
      return;
    case 'reexec': {
      const r = spawnSync(outcome.bin, [__filename, ...argv], { stdio: 'inherit', env: { ...process.env, ENGINEOS_REEXEC: '1' } });
      if (r.error === undefined && r.status !== null) {
        process.exit(r.status);
      }
      // Re-exec never started (non-executable candidate, ENOENT) or the child died by
      // signal — fall through to the no-newer-node policy instead of exiting silently.
      applyOutcome(guardOutcome(argv, process.versions.node, null));
      return;
    }
    case 'silent':
      process.exit(0);
      break;
    case 'skip':
      writeJson(io, { systemMessage: outcome.message });
      process.exit(0);
      break;
    case 'refuse':
      writeJson(io, { error: outcome.message });
      process.exit(1);
  }
}

if (currentMajor() < MIN_NODE_MAJOR) {
  const newer = process.env['ENGINEOS_REEXEC'] === '1' ? null : findNewerNode(process.env, existsSync, readdirSync, isExecutable);
  applyOutcome(guardOutcome(argv, process.versions.node, newer));
}

const table: CommandTable = {};
process.exit(dispatch(table, argv, io));
```

As-built notes (wave 0, 2026-09-04): the policy lives in `guardOutcome()` so all five
outcomes are unit-tested without a subprocess; the refuse string carries the `v` prefix
the design spec pins. **Constraint for every later wave:** esbuild inlines imported
module bodies ABOVE this guard, so command modules must be required lazily inside each
`Command` function — never imported at `cli.ts` top level — or a node-20-only API in a
module body defeats the guard before it runs.
```

- [ ] **Step 6: Run tests, build, smoke**

Run: `npm test && npm run build && node dist/engineos.cjs --version`
Expected: all tests pass; prints `engineos 1.6.0`.

- [ ] **Step 7: Commit**

```bash
git add src/cli.ts src/node-guard.ts src/node-guard.test.ts src/dispatch.ts src/dispatch.test.ts scripts/build.mjs dist/engineos.cjs
git commit -m "feat(runtime): add CLI entry with node-version guard"
```

### Task 4: CI — build, unit tests, `dist/` drift guard

**Files:**
- Modify: `.github/workflows/ci.yml` (after the "Tools present" step, before shellcheck)

- [ ] **Step 1: Add the steps**

```yaml
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: npm

      - name: Node runtime — install, typecheck, unit tests
        run: |
          npm ci
          npm run typecheck
          npm test

      - name: Node runtime — dist drift guard
        run: |
          npm run build
          if ! git diff --quiet -- dist/engineos.cjs; then
            echo "FAIL: dist/engineos.cjs is out of sync with src/ — run npm run build and commit the result."
            git diff --stat -- dist/engineos.cjs
            exit 1
          fi
          echo "ok: dist/engineos.cjs matches src/"
```

Also add `node --version` to the "Tools present" step.

- [ ] **Step 2: Commit and open the Wave 0 PR**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: build, test and drift-guard the node runtime"
```

PR title: `feat(runtime): node toolchain, CLI entry and drift guard (wave 0)`. Body notes `dist/engineos.cjs` and `package-lock.json` are excluded from the 400-line count. Record the measured `node dist/engineos.cjs --version` wall time (hyperfine or `time`, 10 runs) in the change record: this is the per-hook startup cost the spec's open risk names.

---

# Wave 1(a) — `Registries`, `resolve` skeleton, route section, parity harness

Amended 2026-09-04 (architecture review): `src/kernel/` is one deep module,
`resolve(facts, ctx)`, and every legacy arm is a projection of its answer. The
frozen contract (`DeclaredFacts`, `Answer`, `KernelContext`, `Registries`) is the
"Kernel shape" section of the design spec; Tasks 7-13 below consume it verbatim.
Code samples that predate the amendment read `routePath(ctx, x)` as
`resolve({ path: x }, ctx).route` and `<arm>(ctx, flags)` as "parse flags into
`DeclaredFacts`, call `resolve`, emit the section".

### Task 5: `lib/json.ts`, `lib/glob.ts`, `KernelError`

**Files:**
- Create: `src/lib/json.ts`, `src/lib/json.test.ts`, `src/lib/glob.ts`, `src/lib/glob.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // src/lib/json.ts
  export class KernelError extends Error { readonly kind = 'kernel' }
  export function readJsonFile(path: string): unknown            // throws KernelError on missing/invalid
  export function isRecord(v: unknown): v is Record<string, unknown>
  export function stringArray(v: unknown): string[]              // [] when not an array; filters non-strings
  // src/lib/glob.ts
  export function globToRegExp(glob: string): RegExp             // bash `case` semantics: * and ? match '/' too
  export function globMatch(glob: string, value: string): boolean
  ```

- [ ] **Step 1: Write failing tests**

```ts
// src/lib/glob.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { globMatch } from './glob';

test('star crosses slashes like a bash case pattern', () => {
  assert.equal(globMatch('*/auth/*', '/src/modules/auth/guard.ts'), true);
  assert.equal(globMatch('*/.engineos/*', '/repo/.engineos/changes/x.md'), true);
  assert.equal(globMatch('*/auth/*', '/src/author/x.ts'), false);
});

test('basename globs', () => {
  assert.equal(globMatch('*.md', 'README.md'), true);
  assert.equal(globMatch('*.lock', 'yarn.lock'), true);
  assert.equal(globMatch('package-lock.json', 'package-lock.json'), true);
  assert.equal(globMatch('*.md', 'x.mdx'), false);
});

test('question mark and character classes', () => {
  assert.equal(globMatch('?.ts', 'a.ts'), true);
  assert.equal(globMatch('[ab].ts', 'b.ts'), true);
  assert.equal(globMatch('[!a].ts', 'a.ts'), false);
});

test('regex metacharacters in globs are literal', () => {
  assert.equal(globMatch('a+b.ts', 'a+b.ts'), true);
  assert.equal(globMatch('a+b.ts', 'aab.ts'), false);
});
```

```ts
// src/lib/json.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { KernelError, readJsonFile, stringArray } from './json';

test('readJsonFile throws KernelError for a missing file', () => {
  assert.throws(() => readJsonFile('/nonexistent/x.json'), KernelError);
});

test('readJsonFile parses a file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'eos-'));
  writeFileSync(join(dir, 'a.json'), '{"a":1}');
  assert.deepEqual(readJsonFile(join(dir, 'a.json')), { a: 1 });
});

test('stringArray keeps only strings', () => {
  assert.deepEqual(stringArray(['a', 1, 'b']), ['a', 'b']);
  assert.deepEqual(stringArray(undefined), []);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test` — Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

```ts
// src/lib/json.ts
import { readFileSync } from 'node:fs';

export class KernelError extends Error {
  readonly kind = 'kernel';
}

export function readJsonFile(path: string): unknown {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    throw new KernelError(`cannot read ${path}`);
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new KernelError(`invalid JSON in ${path}`);
  }
}

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function stringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}
```

```ts
// src/lib/glob.ts
// bash `case` pattern semantics, which scripts/kernel.sh route-path relied on:
// `*` and `?` match any character including `/` (no globstar, no pathname mode).
const REGEX_LITERALS = /[.+^${}()|\\\]/]/g;

export function globToRegExp(glob: string): RegExp {
  let re = '^';
  for (let i = 0; i < glob.length; i += 1) {
    const c = glob[i] as string;
    if (c === '*') {
      re += '.*';
    } else if (c === '?') {
      re += '.';
    } else if (c === '[') {
      const end = glob.indexOf(']', i + 1);
      if (end === -1) {
        re += '\\[';
      } else {
        let cls = glob.slice(i + 1, end);
        if (cls.startsWith('!')) cls = `^${cls.slice(1)}`;
        re += `[${cls.replace(/\\/g, '\\\\')}]`;
        i = end;
      }
    } else {
      re += c.replace(REGEX_LITERALS, '\\$&');
    }
  }
  return new RegExp(`${re}$`);
}

export function globMatch(glob: string, value: string): boolean {
  return globToRegExp(glob).test(value);
}
```

- [ ] **Step 4: Run tests** — `npm test`, expected all pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib
git commit -m "feat(kernel): add JSON and bash-glob helpers"
```

### Task 6: Registry root resolution and typed loaders

**Files:**
- Create: `src/registry/paths.ts`, `src/registry/paths.test.ts`, `src/registry/load.ts`, `src/registry/routing.ts`, `src/registry/routing.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // src/registry/paths.ts
  export function resolveRoot(env: NodeJS.ProcessEnv, startDir?: string): string
  //   ENGINEOS_ROOT if set; else walk up from startDir (default __dirname) to the first dir containing registries/routing.json; else KernelError
  // src/registry/load.ts
  export type RegistryName = 'routing.json' | 'intents.json' | 'models.json' | 'policy.json' | 'decision-rules.json' | 'capabilities.json' | 'agents.json';
  export function registryPath(root: string, name: RegistryName): string   // KernelError `registry missing: registries/<name>` when absent
  export function loadRegistry(root: string, name: RegistryName): unknown  // readJsonFile(registryPath(...))
  // src/registry/routing.ts
  export interface RoutingDomain { id: string; match: { paths: string[]; basenames: string[] }; rules: string[]; skills: string[]; agent: string | null; hint: string | null; sample_path: string | null }   // hook_guidance and risk_floor are not loaded: derived in src/kernel/route.ts (design "Route guidance")
  export interface RoutingRegistry { precedence: string[]; excluded: { paths: string[]; basenames: string[]; self_dirs: string[] }; domains: RoutingDomain[] }
  export function loadRouting(root: string): RoutingRegistry
  ```
- The shim sets `ENGINEOS_ROOT` so a relocated copy (test-kernel.sh `relocated_kernel`) reads its own mutated registries.

- [ ] **Step 1: Failing tests**

```ts
// src/registry/paths.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveRoot } from './paths';
import { KernelError } from '../lib/json';

test('ENGINEOS_ROOT wins', () => {
  assert.equal(resolveRoot({ ENGINEOS_ROOT: '/r' }, '/anywhere'), '/r');
});

test('walks up to the directory holding registries/routing.json', () => {
  const root = mkdtempSync(join(tmpdir(), 'eos-'));
  mkdirSync(join(root, 'registries'));
  writeFileSync(join(root, 'registries', 'routing.json'), '{}');
  mkdirSync(join(root, 'build', 'registry'), { recursive: true });
  assert.equal(resolveRoot({}, join(root, 'build', 'registry')), root);
});

test('throws when no root is found', () => {
  assert.throws(() => resolveRoot({}, tmpdir()), KernelError);
});
```

```ts
// src/registry/routing.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadRouting } from './routing';
import { resolveRoot } from './paths';

const root = resolveRoot(process.env, __dirname);

test('loads the shipped routing registry with precedence and domains', () => {
  const r = loadRouting(root);
  assert.equal(r.precedence[0], 'security');
  assert.ok(r.domains.some((d) => d.id === 'backend'));
  assert.ok(r.excluded.basenames.includes('*.md'));
});
```

- [ ] **Step 2: Run to verify failure** — `npm test`.

- [ ] **Step 3: Implement**

```ts
// src/registry/paths.ts
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { KernelError } from '../lib/json';

export function resolveRoot(env: NodeJS.ProcessEnv, startDir: string = __dirname): string {
  const forced = env['ENGINEOS_ROOT'];
  if (forced !== undefined && forced !== '') return forced;
  let dir = startDir;
  for (;;) {
    if (existsSync(join(dir, 'registries', 'routing.json'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) throw new KernelError('cannot locate the EngineOS root (no registries/routing.json above the runtime)');
    dir = parent;
  }
}
```

```ts
// src/registry/load.ts
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { KernelError, readJsonFile } from '../lib/json';

export type RegistryName =
  | 'routing.json' | 'intents.json' | 'models.json' | 'policy.json'
  | 'decision-rules.json' | 'capabilities.json' | 'agents.json';

// Binds a path, not contents: each subcommand reads only the registries it needs,
// the same lazy discipline scripts/kernel.sh reg() kept for speed.
export function registryPath(root: string, name: RegistryName): string {
  const p = join(root, 'registries', name);
  if (!existsSync(p)) throw new KernelError(`registry missing: registries/${name}`);
  return p;
}

export function loadRegistry(root: string, name: RegistryName): unknown {
  return readJsonFile(registryPath(root, name));
}
```

```ts
// src/registry/routing.ts
import { isRecord, stringArray } from '../lib/json';
import { loadRegistry } from './load';

export interface RoutingDomain {
  id: string;
  match: { paths: string[]; basenames: string[] };
  rules: unknown;
  skills: unknown;
  agent: unknown;
  hint: string | null;
  sample_path: string | null;
}

export interface RoutingRegistry {
  precedence: string[];
  excluded: { paths: string[]; basenames: string[]; self_dirs: string[] };
  domains: RoutingDomain[];
}

export function loadRouting(root: string): RoutingRegistry {
  const raw = loadRegistry(root, 'routing.json');
  const r = isRecord(raw) ? raw : {};
  const ex = isRecord(r['excluded']) ? r['excluded'] : {};
  const domains = Array.isArray(r['domains']) ? r['domains'] : [];
  return {
    precedence: stringArray(r['precedence']),
    excluded: {
      paths: stringArray(ex['paths']),
      basenames: stringArray(ex['basenames']),
      self_dirs: stringArray(ex['self_dirs']),
    },
    domains: domains.filter(isRecord).map((d) => {
      const m = isRecord(d['match']) ? d['match'] : {};
      return {
        id: typeof d['id'] === 'string' ? d['id'] : '',
        match: { paths: stringArray(m['paths']), basenames: stringArray(m['basenames']) },
        rules: d['rules'] ?? null,
        skills: d['skills'] ?? null,
        agent: d['agent'] ?? null,
        hint: typeof d['hint'] === 'string' ? d['hint'] : null,
        sample_path: typeof d['sample_path'] === 'string' ? d['sample_path'] : null,
      };
    }),
  };
}
```

- [ ] **Step 4: Run tests** — `npm test`, all pass.

- [ ] **Step 5: Commit**

```bash
git add src/registry
git commit -m "feat(kernel): resolve the runtime root and load routing.json"
```

### Task 6b: Shared test harness (`src/testing/harness.ts`)

Amended 2026-09-04 (architecture review, candidate 7). Every bash suite today
rebuilds the same five fixtures by hand: a temp root with an EXIT trap
(`scripts/test-kernel.sh` 14-24), a relocated kernel copy whose `policy.json` is
mutated in place (`scripts/test-kernel.sh` 73-90, `relocated_kernel`), a hook
envelope, a transcript in the legacy `tool_input` shape, and a per-case
`mktemp` + `git init` repo (`hooks/test-verify.sh` 25-60: `invoke`,
`make_transcript`, `make_mixed_transcript`). The port would copy that idiom into
16 `*.e2e.test.ts` files. This task lands the idiom once, before Task 7, so
every kernel and hook test from here on speaks one fixture vocabulary;
`src/kernel/resolve.test.ts` and `src/kernel/parity.test.ts` (Wave 1(a)) are its
first consumers.

**Files:**
- Create: `src/testing/harness.ts`, `src/testing/harness.test.ts`
- Nothing under `src/testing/` is imported from `src/cli.ts`, so esbuild never
  bundles it. `harness.test.ts` asserts that by reading `dist/engineos.cjs` and
  failing on the string `src/testing/`.

**Interface (frozen — seven exports, nothing else):**
```ts
// src/testing/harness.ts
import type { TestContext } from 'node:test';
import type { Command } from '../dispatch';

export type HookEvent = 'SessionStart' | 'UserPromptSubmit' | 'PreToolUse' | 'PostToolUse' | 'Stop' | 'SubagentStart' | 'SubagentStop';
export interface ToolUse { name: string; input: Record<string, unknown> }
export interface RunResult { status: number; stdout: string; stderr: string }
export interface RunOptions { stdin?: string; env?: Record<string, string>; cwd?: string }

// One fresh directory per test, removed by t.after. Throws when the resolved path
// lies under the EngineOS checkout, so a test can never dirty the repo.
export function tempRoot(t: TestContext): string
// A git-initialised project under root with an optional package.json, nx.json and
// extra files. Returns the repo path. Enough for the runner probes in stop-verify.
export function fixtureRepo(root: string, opts?: { pkg?: Record<string, unknown>; nx?: Record<string, unknown>; files?: Record<string, string> }): string
// Copies registries/ (and the bash shim while it exists) under root, applies
// mutate to the COPY of policy.json, returns the new ENGINEOS_ROOT. The checkout's
// registries are never written.
export function relocatedRoot(root: string, opts?: { mutate?: (policy: Record<string, unknown>) => void }): string
// The stdin JSON a hook receives for one event (design "Hook envelope").
export function envelope(opts: { event: HookEvent; cwd: string; sid: string; tool?: ToolUse; transcript?: string; stopHookActive?: boolean }): string
// A Claude transcript JSONL with one tool_use per entry. Default is the real
// harness shape (`input`); { legacy: true } emits the older `tool_input` key the
// bash suites still exercise. stop-verify e2e runs one case per form.
export function transcript(toolUses: ToolUse[], opts?: { legacy?: boolean }): string
// Black-box drive: spawnSync(process.execPath, ['dist/engineos.cjs', ...args]).
export function runCli(args: string[], opts?: RunOptions): RunResult
// White-box drive: calls a Command with memoryIo(opts); stdout/stderr joined.
export function runInProcess(command: Command, argv: string[], opts?: RunOptions): RunResult
```

**Discipline the harness enforces (not just offers):**
- One temp root per test, bound to `t.after`. No suite-level `TMPROOT`, no
  process `exit` handler — `node:test` runs files in parallel and a shared root
  is a shared bug.
- `tempRoot` and `relocatedRoot` throw if the target resolves under
  `resolveRoot(process.env, __dirname)` (Task 6). Registry mutation happens on
  the copy or not at all.
- Both drives return the same `RunResult`, so a suite can start white-box on
  `runInProcess` and switch to `runCli` for its e2e cases without rewriting
  assertions. Which drive a suite uses is chosen per suite: kernel and pure
  hooks in-process, anything that probes git or the runner through `runCli`.

- [ ] **Step 1: Failing tests** — `harness.test.ts`: `tempRoot` returns a fresh
  absolute path each call and the path is gone after the test; `tempRoot` throws
  for a `TMPDIR` pointing inside the checkout; `fixtureRepo` yields a directory
  where `git rev-parse --show-toplevel` equals the repo path and `package.json`
  round-trips; `relocatedRoot` leaves the checkout's `registries/policy.json`
  byte-identical while the copy carries the mutation; `envelope` parses back to
  the fields `HookEnvelope` decodes (Task 15 shape); `transcript` default emits
  `input` and `{ legacy: true }` emits `tool_input`, one line per tool use;
  `runCli(['--version'])` and `runInProcess(version, [])` return the same
  stdout; `dist/engineos.cjs` does not contain `src/testing/`.
- [ ] **Step 2: Run** — `npm test`, new file fails.
- [ ] **Step 3: Implement** — `mkdtempSync` under `os.tmpdir()` with
  `t.after(() => rmSync(dir, { recursive: true, force: true }))`; `git init -q`
  via `spawnSync`; `cpSync(registries, ..., { recursive: true })` then
  `readJsonFile` → `mutate` → `writeFileSync` on the copy; `JSON.stringify` for
  `envelope`; `transcript` maps each tool use to
  `{ type: 'assistant', message: { content: [{ type: 'tool_use', name, input }] } }`
  and renames `input` to `tool_input` under `legacy`.
- [ ] **Step 4: Run tests** — `npm test`, all pass.
- [ ] **Step 5: Commit**

```bash
git add src/testing
git commit -m "test: shared fixture harness for kernel and hook tests"
```

Tasks 5 and 6 predate this task and keep their inline `mkdtempSync`; their
fixtures are one file each and porting them buys nothing. From Task 7 on, a
test that builds a temp root, relocated registries, an envelope or a transcript
by hand instead of through the harness is a review defect.

### Task 7: `kernel route-path`

**Files:**
- Create: `src/kernel/context.ts`, `src/kernel/index.ts`, `src/kernel/resolve.ts`, `src/kernel/route.ts`, `src/kernel/resolve.test.ts`
- Source of truth: `scripts/kernel.sh` lines 95-152 (`cmd_route_path`); design spec "Kernel shape" for the types.

**Interfaces:**
- Produces:
  ```ts
  // src/kernel/context.ts
  export interface KernelContext { root: string; registries: Registries }
  export interface Registries { readonly routing: Routing; readonly intents: Intents; readonly models: Models; readonly policy: Policy; readonly decisionRules: DecisionRules; readonly capabilities: Capabilities; readonly agents: Agents }
  export function lazyRegistries(root: string): Registries      // getters parse on first access via Task 6 loaders, then cache
  // src/kernel/index.ts -- the only exports of the module
  export { resolve } from './resolve';
  export type { DeclaredFacts, Answer, KernelContext, Registries };
  // src/kernel/resolve.ts
  export function resolve(facts: DeclaredFacts, ctx: KernelContext): Answer   // this task: facts.path -> answer.route only; every other section lands in Tasks 9-12
  // src/kernel/route.ts (internal)
  export type RouteSection =
    | { domain: null; excluded: boolean }
    | { domain: string; rules: string[]; skills: string[]; agent: string | null; risk_floor: RiskTier | null; hook_guidance: string; excluded: false };   // risk_floor and hook_guidance derived
  export function routeByPath(file: string, regs: Registries): RouteSection
  export function renderGuidance(domain: RoutingDomain): string          // 'rules/<a>.md+<b>.md | skill:<s> | agent:<agent> (<hint>)' — the one renderer for hook and CLI
  export function floorOf(domain: RoutingDomain, regs: Registries): RiskTier | null   // the one intent whose `domain` is this row
  ```
- `resolve` throws `KernelError` when a declared fact's section cannot be built; it never fabricates a section. An empty `facts` object answers `{}`.
- Tests below call `resolve({ path }, ctx).route`; `ctx = { root, registries: lazyRegistries(root) }`.
- Route guidance parity (design "Route guidance", step one of two): while `routing.json` still carries `hook_guidance`, `route.test.ts` asserts `renderGuidance(row)` equals the stored string for every row, and `floorOf(row)` equals the stored `risk_floor`. This PR moves the mid-string parentheticals of `ios-release`, `android-release` and `mobile` to the end of their stored strings and updates the three literals in `hooks/test-route.sh`; the four parentheticals are also written as `hint` now so the renderer has its input. Step two is Task 13.

- [ ] **Step 1: Failing tests against the shipped registry**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { routePath } from './route-path';
import { loadRouting } from '../registry/routing';
import { resolveRoot } from '../registry/paths';

const root = resolveRoot(process.env, __dirname);
const ctx = { root };

test('every domain sample_path routes to its own domain (mirror of check C17b)', () => {
  for (const d of loadRouting(root).domains) {
    if (d.sample_path === null) continue;
    const a = routePath(ctx, d.sample_path);
    assert.equal(a.domain, d.id, `sample_path ${d.sample_path}`);
  }
});

test('excluded basenames and paths answer {domain:null, excluded:true}', () => {
  assert.deepEqual(routePath(ctx, 'README.md'), { domain: null, excluded: true });
  assert.deepEqual(routePath(ctx, '/x/.engineos/changes/a.ts'), { domain: null, excluded: true });
});

test('self_dirs exclude only this checkout, not a consumer project', () => {
  assert.deepEqual(routePath(ctx, join(root, 'hooks', 'x.ts')), { domain: null, excluded: true });
  assert.notDeepEqual(routePath(ctx, '/consumer/hooks/x.ts'), { domain: null, excluded: true });
});

test('no match answers {domain:null, excluded:false}', () => {
  assert.deepEqual(routePath(ctx, '/x/y/unrelated.txt'), { domain: null, excluded: false });
});

test('a match carries the domain fields in jq key order', () => {
  const a = routePath(ctx, '/src/modules/auth/guard.ts');
  assert.deepEqual(Object.keys(a), ['domain', 'rules', 'skills', 'agent', 'risk_floor', 'hook_guidance', 'excluded']);
  assert.equal(a.domain, 'security');
});
```

- [ ] **Step 2: Run to verify failure** — `npm test`.

- [ ] **Step 3: Implement**

```ts
// src/kernel/context.ts
export interface KernelContext { root: string }
```

```ts
// src/kernel/route-path.ts
import { globMatch } from '../lib/glob';
import { loadRouting } from '../registry/routing';
import type { KernelContext } from './context';

export type RoutePathAnswer =
  | { domain: null; excluded: boolean }
  | { domain: string; rules: string[]; skills: string[]; agent: string | null; risk_floor: RiskTier | null; hook_guidance: string; excluded: false };

export function routePath(ctx: KernelContext, file: string): RoutePathAnswer {
  const reg = loadRouting(ctx.root);
  const base = file.slice(file.lastIndexOf('/') + 1);
  const norm = `/${file}`;

  // Exclusions first, in registry order: self dirs of THIS checkout, then path globs,
  // then basename globs. self_dirs is data; only its resolution against root is code,
  // which keeps a consumer project's own hooks/ or docs/ routable.
  for (const d of reg.excluded.self_dirs) {
    if (file.startsWith(`${ctx.root}/${d}/`)) return { domain: null, excluded: true };
  }
  for (const p of reg.excluded.paths) {
    if (globMatch(p, norm)) return { domain: null, excluded: true };
  }
  for (const p of reg.excluded.basenames) {
    if (globMatch(p, base)) return { domain: null, excluded: true };
  }

  for (const id of reg.precedence) {
    const dom = reg.domains.find((d) => d.id === id);
    if (dom === undefined) continue;
    const hit = dom.match.paths.some((p) => globMatch(p, norm)) || dom.match.basenames.some((p) => globMatch(p, base));
    if (hit) {
      return {
        domain: dom.id,
        rules: dom.rules,
        skills: dom.skills,
        agent: dom.agent,
        risk_floor: floorOf(dom, regs),
        hook_guidance: renderGuidance(dom),
        excluded: false,
      };
    }
  }
  return { domain: null, excluded: false };
}
```

Note on fidelity: the bash loop checks every domain's `paths` globs before its `basenames` globs, per domain in precedence order; the `some(...) || some(...)` above keeps that order.

- [ ] **Step 4: Run tests** — `npm test`, all pass.

- [ ] **Step 5: Commit**

```bash
git add src/kernel/context.ts src/kernel/route-path.ts src/kernel/route-path.test.ts
git commit -m "feat(kernel): port route-path"
```

### Task 8: Kernel CLI adapter with `require_positional`

**Files:**
- Create: `src/kernel/cli.ts`, `src/kernel/cli.test.ts`
- Modify: `src/cli.ts` (register `kernel`)
- Source of truth: `scripts/kernel.sh` lines 81-92 (`require_positional`), 900-919 (dispatch), `err()`.

**Interfaces:**
- Produces:
  ```ts
  export function runKernel(argv: string[], io: Io): number
  export function requirePositional(cmd: string, what: string, args: string[]): string   // throws KernelError with the three exact messages
  export function parseFlags(cmd: string, args: string[], allowed: readonly string[]): Map<string, string>  // `--k v` pairs; missing value -> KernelError `${cmd}: ${flag} requires a value`
  ```
- Projection table inside `runKernel`: each arm parses its flags into `DeclaredFacts`, calls `resolve` once, and emits its section (or the legacy composite) with the legacy key order — `route-path` (Task 7) now; Tasks 9-12 add the rest and Task 12 adds the `resolve` arm. Unknown subcommand -> `{"error": "unknown subcommand: <x>"}` exit 1. `runKernel` builds `ctx` once per process (`resolveRoot` + `lazyRegistries`); no projection touches the filesystem itself.

- [ ] **Step 1: Failing tests**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runKernel } from './cli';
import { memoryIo } from '../io';
import { resolveRoot } from '../registry/paths';

const env = { ENGINEOS_ROOT: resolveRoot(process.env, __dirname) };

test('route-path rejects a flag where a positional is expected', () => {
  const io = memoryIo({ env });
  assert.equal(runKernel(['route-path', '--prompt', 'x'], io), 1);
  assert.deepEqual(JSON.parse(io.stdout.join('')), { error: 'route-path takes a file path as a positional argument, not a flag (got --prompt)' });
});

test('route-path requires exactly one argument', () => {
  const io = memoryIo({ env });
  assert.equal(runKernel(['route-path'], io), 1);
  assert.deepEqual(JSON.parse(io.stdout.join('')), { error: 'route-path requires a file path' });
  const io2 = memoryIo({ env });
  assert.equal(runKernel(['route-path', 'a', 'b'], io2), 1);
  assert.deepEqual(JSON.parse(io2.stdout.join('')), { error: 'route-path takes exactly one argument, got 2' });
});

test('route-path answers JSON with exit 0', () => {
  const io = memoryIo({ env });
  assert.equal(runKernel(['route-path', 'README.md'], io), 0);
  assert.deepEqual(JSON.parse(io.stdout.join('')), { domain: null, excluded: true });
});

test('unknown subcommand is a JSON error', () => {
  const io = memoryIo({ env });
  assert.equal(runKernel(['nope'], io), 1);
  assert.deepEqual(JSON.parse(io.stdout.join('')), { error: 'unknown subcommand: nope' });
});
```

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement `src/kernel/cli.ts`**

```ts
import { writeJson, type Io } from '../io';
import { KernelError } from '../lib/json';
import { resolveRoot } from '../registry/paths';
import type { KernelContext } from './context';
import { routePath } from './route-path';

type Sub = (ctx: KernelContext, args: string[]) => unknown;

export function requirePositional(cmd: string, what: string, args: string[]): string {
  const first = args[0];
  if (first === undefined || first === '') throw new KernelError(`${cmd} requires ${what}`);
  if (first.startsWith('-')) throw new KernelError(`${cmd} takes ${what} as a positional argument, not a flag (got ${first})`);
  if (args.length !== 1) throw new KernelError(`${cmd} takes exactly one argument, got ${args.length}`);
  return first;
}

export function parseFlags(cmd: string, args: string[], allowed: readonly string[]): Map<string, string> {
  const out = new Map<string, string>();
  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i] as string;
    const value = args[i + 1];
    if (!allowed.includes(flag)) throw new KernelError(`${cmd}: unknown flag ${flag}`);
    if (value === undefined) throw new KernelError(`${cmd}: ${flag} requires a value`);
    out.set(flag, value);
  }
  return out;
}

const SUBCOMMANDS: Record<string, Sub> = {
  'route-path': (ctx, args) => routePath(ctx, requirePositional('route-path', 'a file path', args)),
};

export function runKernel(argv: string[], io: Io): number {
  const [name, ...args] = argv;
  try {
    const sub = name === undefined ? undefined : SUBCOMMANDS[name];
    if (sub === undefined) throw new KernelError(`unknown subcommand: ${name ?? ''}`);
    const ctx: KernelContext = { root: resolveRoot(io.env) };
    writeJson(io, sub(ctx, args));
    return 0;
  } catch (e) {
    if (e instanceof KernelError) {
      writeJson(io, { error: e.message });
      return 1;
    }
    throw e;
  }
}
```

Register in `src/cli.ts`: `import { runKernel } from './kernel/cli';` and `const table: CommandTable = { kernel: runKernel };`.

- [ ] **Step 4: Run tests, build** — `npm test && npm run build`.

- [ ] **Step 5: Commit and open the Wave 1(a) PR**

```bash
git add src/kernel/cli.ts src/kernel/cli.test.ts src/cli.ts dist/engineos.cjs
git commit -m "feat(kernel): CLI adapter with positional and flag parsing"
```

The shim is NOT swapped yet: `scripts/kernel.sh` still answers every subcommand in bash until Task 13 swaps it in one step (a half-ported kernel behind one shim would need a bash-side dispatcher and buys nothing).

### Task 8b: differential parity harness

**Files:** Create `src/kernel/parity.test.ts`, `test/fixtures/legacy-kernel/kernel.sh` (a byte copy of `scripts/kernel.sh` at the commit before Task 13 swaps it), `test/fixtures/legacy-kernel/registries/` (snapshot of `registries/*.json` at the same commit), `test/fixtures/legacy-kernel/README.md` (which commit, how to refresh, deleted at 2.0).
**Interfaces:** `parityCase(arm: string, args: string[])` runs `bash test/fixtures/legacy-kernel/kernel.sh <arm> <args>` with `ENGINEOS_ROOT=test/fixtures/legacy-kernel` and `runKernel([arm, ...args], memoryIo())` against `lazyRegistries('test/fixtures/legacy-kernel')`; asserts `JSON.parse` deep-equal on stdout and equal exit codes.
**Cases:** for every arm, the args of every `run <arm> ...` block in `scripts/test-kernel.sh`, plus `policy.json .router.fixtures[]` for `route-escalate` and `resolve-task`. Skipped, never failed, when `bash` or `jq` is absent (prints one line naming the missing tool).
**Invariant:** a projection that is not yet ported is skipped by name, not asserted; Task 13 removes the last skip. The harness needs `bash` + `jq` in CI until 2.0 and is deleted with the shim.
**Commit:** `test(kernel): differential parity harness against the pinned bash kernel`.

### Task 9: route section, intent form (`kernel route-intent`)

**Files:** Create `src/registry/intents.ts`; extend `src/kernel/route.ts` and `src/kernel/resolve.ts`; add the `route-intent` projection to `src/kernel/cli.ts`; extend `resolve.test.ts` and `cli.test.ts`.
**Source:** `scripts/kernel.sh` `cmd_route_intent` (line 154 onward) and the `bounded_contains` jq helper.
**Interfaces:** internal `routeByIntent(text: string, regs: Registries): RouteSection` (intent form: the keys and order the jq program in `cmd_route_intent` emits); `resolve({ prompt }, ctx).route` returns it; the `route-intent` projection emits exactly that section. The intent form of `RouteSection` widens the Task 7 type — one section, two declared-fact forms.
**Invariants:** word-boundary matching identical to `bounded_contains` (signal must be bounded by start/end or a non-word character on both sides, case-insensitive if the jq uses `ascii_downcase`); one pass over all 136 signals; no regex built from registry text without escaping.
**Tests:** at least one prompt per intent in `registries/intents.json` (use each intent's own `signals[0]`), one prompt that matches nothing, one prompt where a signal appears as a substring of a longer word and must NOT match.
**Commit:** `feat(kernel): port route-intent`.

---

# Wave 1(b) — `model`, `risk`, `gates`, `repair` (parallel with 1(c))

### Task 10: port contract

**Files:** Create `src/registry/models.ts`, `src/registry/policy.ts`, `src/kernel/{model,risk,repair}.ts` (internal); extend `resolve.ts`; add the `model`, `risk`, `gates`, `repair` projections to `cli.ts`; extend `resolve.test.ts`, `cli.test.ts`, `parity.test.ts`.
**Source:** `scripts/kernel.sh` `cmd_model`, `cmd_risk`, `cmd_gates`, `cmd_repair`.
**Interfaces (internal sections; `resolve` calls them when their facts are declared):**
```ts
export function modelSection(facts: { workType: string }, regs: Registries): ModelSection
export function riskSection(facts: { signals?: Record<string, RiskTier>; riskTier?: RiskTier }, regs: Registries): RiskSection
//   signals -> classify (aggregation from policy.risk.aggregation, never a literal 'max'); empty payload -> KernelError
//   riskTier alone -> gates + spec_threshold for an already-classified tier
export function repairSection(facts: { check: string; attempt: number; situation?: string }, regs: Registries): RepairSection
```
Projections: `model --work` -> `.model`; `risk --signals` -> `.risk` (legacy keys); `gates --risk` -> `{gates, spec_threshold}` picked from `.risk` — no `gates` module exists, the arm is a projection of the risk section (`kernel.sh:238` vs `:254` emit the same value today); `repair --check --attempt [--situation]` -> `.repair`. `policy.autonomy.levels[].id` is read from the typed loader, never restated (`kernel.sh:545`).
**Invariants:** `risk` never averages; `{}`/`[]` payload is an error, not `low`. `repair` reads `policy.json .repair` live: `max_fix_attempts_per_check`, `escalations`, `by_situation`, `never_repair`; a check id in `never_repair` or a `--situation` in `retry.never_retry` answers the stop action the bash answers. Every flag+value pair is required; missing value is an error.
**Acceptance:** the `run model|risk|gates|repair` blocks of `scripts/test-kernel.sh` (run them via `--only`-style filtering by temporarily commenting nothing: run the whole suite after Task 13; until then the unit tests carry the assertions copied from the bash suite).
**Commit:** `feat(kernel): port model, risk, gates and repair`. Split into two PRs if over 400 lines: (`model`+`gates`) and (`risk`+`repair`).

# Wave 1(c) — `admit`, `breaker`, `hitl`, `waves`

### Task 11: port contract

**Files:** Create `src/kernel/{admit,breaker,hitl,waves}.ts` (internal); extend `resolve.ts`; add the four projections to `cli.ts`; extend `resolve.test.ts`, `cli.test.ts`, `parity.test.ts`.
**Source:** `scripts/kernel.sh` `cmd_admit`, `cmd_breaker`, `cmd_hitl`, `cmd_waves`.
**Interfaces:** internal `admitSection({inflight, queued}, regs)`, `breakerSection(facts.breaker, regs)`, `hitlSection({riskTier, autonomy, evidence?, externalEffect?, conflict?, situation?}, regs)`, `wavesSection({units}, regs)`; `resolve` calls each when its facts are declared; the projections parse the legacy flags (`waves` takes `--units <json array>`) and emit the section. `hitl.reasons` order and `breaker.states` come from the typed policy loader, never from a literal list (`kernel.sh:523-531`, `:399`).
**Invariants:** each verifies its `policy.json` block exists before reading a field (a missing block is `KernelError`, never a fabricated answer). `hitl`: thin evidence drops autonomy exactly one level, never below A1, never raising, A0 stays A0; at risk high the drop is capped by `policy.json .autonomy.high_with_thin_evidence`; reasons are emitted in the order of `policy.json .hitl.reasons`; `--situation` accepts `hitl.situations` plus `retry.never_retry` ids, all collapsing to `never-retry-situation` except the `hitl.situations` ids' own reasons. `admit` reject message embeds the literal `hitl: budget-exhausted` (check C26d greps it). `breaker` implements all six transitions. `waves`: Kahn layering; a cycle is an error whose message strips the jq prefix and reads as the bash message does; same-file ownership inside a layer is a `violations` entry; layers wider than `wave_concurrency_cap` split.
**Acceptance:** the corresponding `run` blocks of `scripts/test-kernel.sh` (copied into unit tests until Task 13).
**Commit:** `feat(kernel): port admit, breaker, hitl and waves`. Two PRs if needed: (`admit`+`breaker`) and (`hitl`+`waves`).

# Wave 1(d) — `decision-rules`, `scale`, `route-escalate`, `resolve-task`, shim swap

### Task 12: port contract

**Files:** Create `src/registry/decision-rules.ts`, `src/kernel/{scale,decisions}.ts` (internal); extend `route.ts` (the escalate composite), `resolve.ts` (the `task_contract` section, and the sparse-answer assembly is now complete); add the `decision-rules`, `scale`, `route-escalate`, `resolve-task` projections and the new `resolve --facts '<json>'` arm to `cli.ts`; add `resolve` to the kernel row of `docs/COMPATIBILITY.md` (MINOR); extend `resolve.test.ts`, `cli.test.ts`, `parity.test.ts` (the `resolve` arm has no bash counterpart; its parity case asserts each section deep-equals the matching legacy projection).
**Source:** `scripts/kernel.sh` `cmd_decision_rules`, `cmd_scale`, `cmd_route_escalate`, `cmd_resolve_task`.
**Projections:** `decision-rules --prompt` -> `.decision_rules`; `scale --prompt` -> `.scale`; `route-escalate --prompt` -> the legacy composite (route section, intent form, plus `escalate`, `reasons`, `suppressed`, `scale`); `resolve-task --prompt` -> `{task_contract, route, decision_rules, hitl}` in that key order.
**Invariants:** `route-escalate` suppression is one non-transitive pass: an intent drops if it is suppressible and a non-suppressible intent matched, or if any raw-matched id is in its `suppressed_by`. `resolve-task` composes `route-escalate`, `decision-rules`, `scale`, the policy bundle (`gates models parallelism risk-autonomy verification`) and `hitl`, and folds `hitl` ONLY from `decisions.any_high`; on a floor-only prompt `.hitl` is `null` and `task_contract.risk_floor` carries the floor. Signal regexes in `decision-rules.json` are EREs; compile with `new RegExp(sig, 'i')` only after check C14 has validated them (it does), and treat a compile failure as `KernelError`.
**Acceptance:** `scripts/test-kernel.sh` resolve-task and route-escalate blocks; `policy.json .router.fixtures[]` all match (check C18e); `bench` `resolve-task` < 500 ms.
**Commit:** `feat(kernel): port decision-rules, scale, route-escalate and resolve-task`.

### Task 13: swap the `scripts/kernel.sh` shim

**Files:** Modify `scripts/kernel.sh` (whole file), `scripts/test-kernel.sh` (`relocated_kernel` fixture), `scripts/checks/70-runtime.sh` (C26d greps `scripts/kernel.sh` for the `hitl: budget-exhausted` literal: change its target path to `src/kernel/admit.ts`, same literal, same message); `registries/routing.json` and `scripts/checks/{20-registries,40-decision-registries}.sh` for the route-guidance step two (design "Route guidance", deviation 9): delete `hook_guidance` and `risk_floor` from the ten domain rows (the `hint` fields landed in Task 7); C6/C7/C8 read `agent`, `skills[]`, `rules[]` directly; C14's rules-versus-guidance half, C16's intent-versus-domain floor row and C8's domain `risk_floor` tier row are deleted; `docs/CONTRIBUTING.md` names `hint` instead of `hook_guidance`; release note: MINOR.

- [ ] **Step 1: Replace `scripts/kernel.sh` with the shim**

```bash
#!/usr/bin/env bash
# Compatibility shim. The subcommand names and JSON answers below are public
# surface (docs/COMPATIBILITY.md); the implementation is src/kernel/ compiled into
# dist/engineos.cjs. ENGINEOS_ROOT lets a relocated copy of this file answer from
# its own registries/ (scripts/test-kernel.sh relocated_kernel).
# Subcommands: resolve route-path route-intent model risk gates repair admit breaker
#              hitl waves decision-rules scale route-escalate resolve-task
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENGINEOS_ROOT="$ROOT" exec node "$ROOT/dist/engineos.cjs" kernel "$@"
```

- [ ] **Step 2: Teach the relocated fixture to carry the bundle**

In `scripts/test-kernel.sh` `relocated_kernel()`, next to the line that copies `kernel.sh` into `$TMPROOT/scripts/`, add: `mkdir -p "$TMPROOT/dist" && cp "$ROOT/dist/engineos.cjs" "$TMPROOT/dist/"`.

- [ ] **Step 3: Run the acceptance set**

```bash
bash scripts/test-kernel.sh && bash scripts/validate-engineos.sh && bash scripts/bench-runtime.sh && bash hooks/test-route.sh && bash hooks/test-prompt-advisor.sh
```
Expected: all green; `bench` `route-intent` and `resolve-task` medians recorded in the change record.

- [ ] **Step 4: Commit**

```bash
git add scripts/kernel.sh scripts/test-kernel.sh scripts/checks/70-runtime.sh
git commit -m "refactor(kernel): route kernel.sh through the node runtime"
```

### Task 13b: the router agent calls `resolve` once

**Files:** Modify `agents/router.md` (steps 2, 3, 4, 6b, 7), `commands/route.md` (the kernel call it names), `commands/agents/router.md` if generated (run `scripts/gen-agent-commands.sh`); `scripts/checks/50-kernel.sh` C18b greps `agents/router.md` for five CLI literals — re-point it at the one `resolve` literal and the facts it must declare.
**Change:** steps 2-4 become one call, `"$ENGINEOS_ROOT"/scripts/kernel.sh resolve --facts '{"prompt": "<request>", "signals": {...}}'`, copied verbatim into `kernel.resolve`; step 6b declares `workType` per unit and step 7 declares `units`, both through the same arm. Steps 5, 6a and 8 (the model-owned residue) are unchanged. Agent bodies are not versioned surface, so no deprecation window.
**Acceptance:** `scripts/validate-engineos.sh` green (C18b re-pointed); one dry run of `/engineos:route` on `policy.json .router.fixtures[0]` shows a single kernel spawn in `.git/engineos-telemetry/<sid>.exec.jsonl`.
**Commit:** `docs(router): resolve the plan with one kernel call`.

Barrier 1: write a handoff (`templates/handoff.md`) listing measured budgets and any check adjusted.

---

# Wave 2 — journal and telemetry CLIs (parallel with Wave 1)

### Task 14: exec-journal

**Files:** Create `src/journal/schema.ts`, `src/journal/exec-journal.ts`, `src/journal/cli.ts` + tests; register `journal` in `src/cli.ts`; replace `scripts/exec-journal.sh` with a shim (`... exec node "$ROOT/dist/engineos.cjs" journal "$@"`); modify `scripts/checks/70-runtime.sh`: delete `check_C27e` and the ten `ej_*` parsers (`ej_constant`, `ej_registry_list`, `ej_slug_flags`, `ej_validated_fields`, `ej_enum_flags`, `ej_validated_enums`, `ej_int_flags`, `ej_validated_ints`, `ej_declared_fields`, `ej_emitted_fields`); shrink `check_C27` to `policy.json` well-formedness (home suffix, `max_value_length` integer, `span_kinds`/`statuses` non-empty) plus writer existence, dropping the equality against the CLI's constants (design deviation 4). C27b, C27c, C27d, C27f unchanged.
**Source:** `scripts/exec-journal.sh` (443 lines).
**Interfaces:**
```ts
// schema.ts — the ONE declaration append, validate, usage and the hook writer consume (design "Journal schema")
export type Guard = 'slug' | 'enum' | 'int' | 'bool' | 'free';
export type JsonType = 'string' | 'number' | 'boolean';
export type Presence = 'required' | 'optional' | 'always';   // always: emitted as null when unset (agent, note)
export interface FieldSpec { name: FieldName; flag: string; guard: Guard; json: JsonType; presence: Presence; values?: (regs: Registries) => readonly string[] }
export const EXEC_JOURNAL_FIELDS: readonly FieldSpec[]       // 22 rows, emit order
export type FieldName = 'timestamp' | 'run_id' | 'capability_id' | 'agent' | 'model_tier' | 'status' | 'tokens_in' | 'tokens_out' | 'duration_ms' | 'note' | 'trace_id' | 'span_id' | 'parent_span_id' | 'span_kind' | 'tool' | 'provider' | 'model' | 'cost_micros' | 'retry_attempt' | 'cache_hit' | 'route' | 'risk'
export type SpanFields = Partial<Record<FieldName, string | number | boolean>>
export const SLUG_RE = /^[A-Za-z0-9@_./:-]+$/
// exec-journal.ts — every function below walks EXEC_JOURNAL_FIELDS; none names a field
export function parseAppendArgs(argv: string[]): { file: string; fields: SpanFields }   // unknown flag -> usage
export function appendLine(root: string, file: string, argv: string[], now: () => string, regs: Registries): void   // throws JournalError(text)
export function validateFile(root: string, file: string, regs: Registries): { lines: number; bad: number[] }
export function usage(argv0: string): string                  // rendered from the rows: --<flag> <TYPE>, [] around optional
```
**Invariants:** length check on every value first, against `policy.json .telemetry.exec_journal.max_value_length` (fallback 256), reject not truncate; v2 keys absent unless set, `agent` and `note` always present (`null` when unset), so a v1 append is byte-identical to today; numbers validated as digit strings then converted (leading zeros accepted); default timestamp formatted then slug-guarded like a supplied one; `validate` anchors string regexes at true end of string (JS `$` without `m` flag is end-of-string; do not add `m`); `status` and `model_tier` are enum membership, `model_tier` read live from `models.json`, `span_kind` and `status` from `policy.json` `telemetry.exec_journal`, `risk` from the kernel's policy vocabulary — `schema.ts` holds no enum literal. `schema.test.ts` asserts the table itself (22 rows, order, `note` the only `free` row, `always` only on `agent` and `note`); `exec-journal.test.ts` drives append and validate once per guard class through the table. Error convention: plain text on stderr, exit 1. `validate` success text: `<file>: N line(s), all valid`.
**Acceptance:** `bash scripts/test-exec-journal.sh` green; `bash scripts/validate-engineos.sh` green with C27e gone and C27 shrunk in this PR (its `passed N` total drops by one; the README check count follows).
**Commit:** `feat(journal): port exec-journal`.

### Task 15: telemetry

**Files:** Create `src/journal/telemetry.ts` + tests; extend `src/journal/cli.ts` or add `telemetry` command; replace `scripts/telemetry.sh` with a shim.
**Source:** `scripts/telemetry.sh` (125 lines).
**Interfaces:** `appendEvent(root, file, { session, event, data, ts? })`, `validateTelemetry(root, file)`.
**Invariants:** event id must be in `policy.json .telemetry.events[]`; `data` keys a subset of that event's `keys`; every value boolean, number, or string / string[] matching `.telemetry.value_pattern`; error convention `{"error": ...}` on stdout exit 1 (different from exec-journal on purpose).
**Acceptance:** `bash scripts/test-telemetry.sh`; `validate-engineos.sh --only C22`.
**Commit:** `feat(journal): port telemetry`.

Barrier 2 (with Barrier 1): handoff.

---

# Wave 3 — hooks

### Task 16: hook library, part 1 — envelope, output, bypass, telemetry writer

**Files:** Create `src/hooks/envelope.ts`, `src/hooks/output.ts`, `src/hooks/bypass.ts`, `src/hooks/telemetry.ts`, `src/lib/git.ts`, `src/lib/slug.ts`, `src/lib/time.ts` + tests. Delete nothing yet.
**Source:** `hooks/lib-common.sh` (`hook_read_envelope`, `hook_context`, `hook_telemetry_dir`, `hook_telemetry`, `hook_slug`, `hook_path_slug`, `hook_now_ms`, `hook_span_open/close`, `hook_span`, `git_dir`, `repo_root`, `find_up`, `find_up_file`), `hooks/bypass.sh`.
**Interfaces:**
```ts
export interface HookEnvelope { cwd: string; sessionId: string; prompt: string; file: string; tool: string; transcriptPath: string; stopHookActive: boolean; raw: unknown }
export function readEnvelope(io: Io): HookEnvelope | null            // null when stdin is not a JSON object (caller decides: most hooks exit 0)
// src/hooks/output.ts — the output half of the hook contract (design "Hook decision"). Imports nothing.
export type HookEventName = 'SessionStart' | 'UserPromptSubmit' | 'PreToolUse' | 'PostToolUse' | 'Stop' | 'SubagentStart' | 'SubagentStop'
export type HookDecision =
  | { kind: 'silent' }
  | { kind: 'context'; event: HookEventName; text: string }
  | { kind: 'block'; reason: string }
  | { kind: 'message'; text: string }
  | { kind: 'fail'; stderr: string }
export const silent: HookDecision
export function context(event: HookEventName, text: string): HookDecision
export function block(reason: string): HookDecision
export function message(text: string): HookDecision
export function fail(stderr: string): HookDecision
export function render(decision: HookDecision, io: Io): number   // context/block/message -> stdout JSON + 0; fail -> stderr + 2; silent -> 0
export interface HookContext { io: Io; root: string; now: () => number; spawn: typeof spawnSync }
export function bypassMarker(cwd: string): string | null             // <gitdir>/ENGINEOS_BYPASS
export function bypassActive(cwd: string, env: NodeJS.ProcessEnv): boolean   // env ENGINEOS_BYPASS=1 > flag file (ENGINEOS_BYPASS_FLAG or ~/.claude/engineos.bypass) > marker
// src/hooks/telemetry.ts — the span lifecycle (design "Span lifecycle"). Callers pass facts, never flags.
export interface Sink { /* opaque */ }
export function telemetrySink(env: HookEnvelope, ctx: HookContext): Sink | null   // gate decided once: .engineos/ present, ENGINEOS_TELEMETRY != 0, not bypassed; creates <gitdir>/engineos-telemetry
export interface SpanFacts { kind: SpanKind; capability: CapabilityId; modelTier: ModelTier; status?: SpanStatus; fields?: SpanFields }
export function withSpan<T>(sink: Sink | null, facts: SpanFacts, fn: () => { result: T; status: SpanStatus; fields?: SpanFields }): T
export function spanIdFrom(env: HookEnvelope): string                              // tool_use_id, else sha1(type:description) 12 hex; slugged
export function openSpan(sink: Sink | null, id: string): void
export function closeSpan(sink: Sink | null, id: string, facts: SpanFacts): void  // no marker -> no span
export function event(sink: Sink | null, id: TelemetryEventId, data: EventData): void
// internal: interface SpanWriter { appendSpan; appendEvent; openMarker; closeMarker } — file adapter (journal/appendLine over the schema table, per-row sanitizer) and memory adapter for tests
// src/registry/capabilities.ts, policy.ts, models.json loader — literal unions pinned to the JSON by unit test
export type CapabilityId = 'author-spec' | 'implement' | 'validate' | 'document' | 'security-review' | 'route'
export type TelemetryEventId = 'route' | 'decision-rules' | 'verify' | 'hitl'
export type SpanKind = 'router' | 'coordinator' | 'agent' | 'tool' | 'model' | 'verification'
export type SpanStatus = 'OK' | 'BLOCKED' | 'FAILED' | 'DEGRADED'
export const hookSlug = (v: string) => string; export const hookPathSlug = (v: string) => string | null
```
**Invariants:** the sink is the only place the opt-in gate, the slug classes, the clock, the clamp, `run_id = trace_id = session` and `tokens 0` live; every write swallows its own errors and a null sink makes every call a no-op; `closeSpan` without a marker writes nothing; `spanIdFrom` is the one id derivation for the announce pair. Each literal-union type has a test asserting its members equal the registry's ids; `check_C27f` is deleted in this PR (deviation 6). `render` is the only function in `src/` that writes a hook's stdout or chooses its exit code; `output.ts` has no imports so `src/cli.ts`'s node guard can call `render(message(...), io)` for the deviation-2 `systemMessage` — this task re-points the guard's `skip` branch (Task 3) to it and deletes the inline `writeJson`. `output.test.ts` asserts the exact JSON text and exit code of each of the five kinds; no other test in `src/hooks/` asserts stdout. Replace `hooks/test-lib-common.sh` with `src/hooks/envelope.test.ts`, `output.test.ts`, `bypass.test.ts`, `telemetry.test.ts` (lifecycle against the memory writer) covering each of its 13 assertions; remove the suite's CI step in the same PR.
**Commit:** `feat(hooks): port the hook envelope, decision output, bypass and telemetry library`.

### Task 17: hook library, part 2 — scaffold, runner, cache, manifests as data

**Files:** Create `src/hooks/scaffold.ts`, `src/hooks/runner.ts`, `src/hooks/classify-failure.ts`, `src/hooks/cache.ts`, `registries/layout-manifest.json`, `registries/docs-ledger.json` + tests. Modify `hooks/layout-manifest.sh` and `hooks/docs-ledger.sh` to read the JSON (they stay until Wave 6 because `hooks/test-layout.sh` and `hooks/test-docs.sh` source them). Modify `hooks/scaffold-layout.sh` to stay as is (sourced by `init-project.sh` until Task 26).
**Source:** `hooks/scaffold-layout.sh`, `hooks/lib-runner.sh`, `hooks/stop-verify.sh:93-98` (node floor) and `:141-148` (timeout, infra skip), `scripts/kernel.sh` `cmd_repair` situation arm, `hooks/route-before-change.sh` cache section, `hooks/layout-manifest.sh`, `hooks/docs-ledger.sh`.
**Interfaces:**
```ts
export interface ManifestEntry { dir: string; seeds: { src: string; dest: string }[] }   // src starting with '@' is repo-relative; else templates/project-layout/<src>
export function scaffoldLayout(projectRoot: string, engineosRoot: string, manifest: ManifestEntry[]): string[]   // created dirs, relative
export type RunnerKind = 'nx' | 'npm-family'
export function runnerSelect(root: string): { kind: RunnerKind; run: string; exec: string }
export function runnerHandle(sel, pkgDir: string): string | null
export function runnerHasTarget(sel, handle: string, target: string): boolean
export function runnerRun(sel, handle: string, target: string, timeoutSeconds: number, env: NodeJS.ProcessEnv): { code: number; output: string; timedOut: boolean }   // facts only; no judgment
// src/hooks/classify-failure.ts — the Situation judgment as one table (design "Situation classifier")
export type Situation = 'red' | 'infra' | 'flaky'          // pinned to policy.repair.by_situation by unit test
export type InfraReason = 'node-too-old' | 'runner-missing' | 'target-absent' | 'timeout'
export type Evidence =
  | { kind: 'environment'; nodeMajor: number }
  | { kind: 'runner'; found: boolean }
  | { kind: 'run'; runner: RunnerKind; target: string; code: number; output: string; timedOut: boolean }
export type Verdict = { situation: 'red' } | { situation: 'infra'; reason: InfraReason }
export function classify(evidence: Evidence): Verdict | null   // null: nothing to judge
export function runnerEnv(env: NodeJS.ProcessEnv, nodeMajorOnPath: number, exists: (p: string) => boolean): NodeJS.ProcessEnv
//   port of hooks/lib-common.sh ensure_modern_node (lines 84-100): when nodeMajorOnPath < 20 and
//   $NVM_DIR/alias/default resolves to a versions/node/<v>/bin with node >= 20, return env with that bin prepended to PATH; else env unchanged
export function routeCachePaths(gitDir: string, sid: string, routingSig: string, buster: string, rel: string): { route: string; output: string } | null   // null on ../ or ./ segments
```
**Invariants:** scaffold `lstat`s each component, refuses symlinks and `..`, `mkdir` one level at a time, checks both existence and link-ness before copying a seed, returns silently on refusal; the target-absent rows of the classifier table carry the regexes verbatim (`cannot find (project|target) |does not have (a|an) .* target|cannot find configuration for task` for nx; `missing script:|command "<t>" not found|find a script named "<t>"` for npm-family) and `runner.ts` exports no judgment; `classify` rows in order: environment `nodeMajor < 18` -> infra `node-too-old`; runner `found: false` -> infra `runner-missing`; run `timedOut` -> infra `timeout` (deviation 7); run `code != 0` matching the runner's pattern -> infra `target-absent`; run `code != 0` otherwise -> red; anything else -> null. `Situation` members equal `policy.repair.by_situation[].situation` by test; `classify` never returns `flaky`. `runnerSelect` kind is `nx` only when `nx.json` exists (the `have_jq` condition disappears: JSON is native). `runnerEnv` is the only place the node-20 PATH fix lives; `stop-verify` and `post-edit-check` pass its result as `env` to `runnerRun`, so ESLint 9 / vitest see the newer node the way they do today. Unit test: PATH node 16 + nvm default v22 -> PATH starts with the v22 bin; PATH node 20 -> env unchanged; no nvm dir -> env unchanged.
**Acceptance:** `hooks/test-layout.sh` still green (through the unchanged bash hook), unit tests for the symlink cases mirror its sections 4-8.
**Commit:** `feat(hooks): port scaffold, runner, the situation classifier and route cache`. Split scaffold + manifests into a Task 17b PR if the whole passes 400 lines.

### Task 18-25: the eight registered hooks, one PR each

Common shape for every hook task:
- **Files:** Create `src/hooks/<name>.ts` + `<name>.test.ts`; add `hook <name>` to the `hook` command table in `src/hooks/cli.ts` (created in Task 18); replace `hooks/<name>.sh` with the shim:
  ```bash
  #!/usr/bin/env bash
  # Compatibility shim — implementation: src/hooks/<name>.ts (dist/engineos.cjs).
  ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
  exec node "$ROOT/dist/engineos.cjs" hook <name>
  ```
- **Interface:** `export function run(env: HookEnvelope, ctx: HookContext): HookDecision` (Task 16 types). The hook never writes stdout and never picks an exit code. `src/hooks/cli.ts` is the one adapter: `readEnvelope(io)` → `null` means `silent` → `run` → `render` → exit code. Side effects (telemetry, markers, cache, runner) go through `ctx`, so `<name>.test.ts` calls `run` with a harness `envelope()` and a `memoryIo`-backed `ctx` and `deepEqual`s the decision.
- **Tests:** assert on the returned `HookDecision`, never on stdout text (`output.test.ts` owns that, Task 16). The Wave 6 e2e port of the hook's bash suite keeps its stdout assertions through `runCli`.
- **Check re-point (spec deviation 3):** every `scripts/checks/*.sh` assertion that greps `hooks/<name>.sh` changes its target path to `src/hooks/<name>.ts` in the same PR, keeping the literal it looks for (the TS module carries the same `--event <id>` strings as constants, the same `hook_span`/`hook_span_open` function names as imports, the same registry key text). The last column of the table names the checks; C22c and C27c list every writer, so most hook PRs touch both.
- **Acceptance:** the named bash suite green in the same PR; `bash scripts/validate-engineos.sh` green in the same PR.
- **Commit:** `refactor(hooks): port <name> to the node runtime`.

| Task | Hook | Source lines | Suite | Invariants to carry (from the spec) | Check that greps this file |
|---|---|---|---|---|---|
| 18 | `ensure-project-layout` | 96 | `hooks/test-layout.sh` | bypass marker removed and stale `ENGINEOS_UNRECORDED.*` (+7 days) reaped BEFORE the self-repo skip; route cache wiped every start; telemetry reaped by `policy.json .telemetry.retention_days`; `ENGINEOS_SCAFFOLD` tri-state; exact hint text; always exit 0; grep/sed `cwd` fallback becomes lenient JSON decode | C29 (`scaffold-layout.sh` sourced -> `./scaffold` imported), C22c (`--event` ids), C27c (`exec.jsonl`, `engineos-telemetry/spans`) |
| 19 | `mark-unrecorded` | 51 | `hooks/test-governance.sh` | extension allowlist `ts tsx js jsx py go rs sql` shared constant; skips `*/.engineos/*`; self_dirs from `routing.json` resolved against the plugin root; marker `ENGINEOS_UNRECORDED.<sid>`; silent | C22c if listed as a writer |
| 20 | `record-verify` | 34 | `hooks/test-governance.sh` | bypass, then `stop_hook_active` guard; `.deferred` marker silences; block reason text verbatim with the `touch "<path>"` suggestion, returned as `block(reason)` (the adapter renders `{"decision":"block"}` and exits 0) | C22c if listed as a writer |
| 21 | `route-before-change` | 129 | `hooks/test-route.sh`, `hooks/test-bypass.sh` | cache key `sid + routing.json mtime-size + ENGINEOS_ROUTE_CACHE_BUSTER`; atomic tmp+rename; `__ENGINEOS_EXCLUDED__` sentinel; cached fast path only when project and change notes are empty — the cache stores the `HookDecision` JSON, not the rendered payload, and the hit path returns it to the adapter to render (cache format is internal, wiped every SessionStart); bypass checks before any kernel call; default guide `base.md+git.md only`; reads `route.hook_guidance` from the kernel section, renders nothing itself; never sets `permissionDecision`. Wave 6 route e2e keeps the ten literal guidance strings | C22c (`--event` ids) |
| 22 | `prompt-advisor` | 118 | `hooks/test-prompt-advisor.sh` | calls `resolveTask` in-process; guidance strings verbatim (copy from the jq program lines 64-115); telemetry ids only, never prompt text; `route` id slugged, default `none`; risk allowlisted to low/medium/high; the resolve call runs inside `withSpan(sink, { kind: 'router', capability: 'route', modelTier: 'cheap' }, ...)` | C18f (`resolve-task` literal: the TS imports `resolveTask` from `../kernel/resolve-task`, which contains it), C22c, C27c |
| 23 | `announce-agent-dispatch` | 39 | `hooks/test-agent-announce.sh` | `openSpan(sink, spanIdFrom(env))` after the banner; banner text verbatim; under an unusable node prints the `systemMessage` (not in the silent set) | C27c (`hook_span_open`, `--capability-id` literals) |
| 24 | `announce-agent-return` | 77 | `hooks/test-agent-announce.sh` | status floor derived only from structure (error flag, top-level `.status`, first token of a string response); `model_tier` from `agents.json`; `closeSpan(sink, spanIdFrom(env), { kind: 'agent', capability: 'implement', ... })` — same derivation as Task 23 by construction | C27c (`hook_span`, `exec-journal` literals) |
| 25 | `stop-verify` | 203 | `hooks/test-verify.sh`, `hooks/test-bypass.sh` | reads stdin and transcript leniently (never exits on decode failure); bypass then loop guard; runner spawned with `runnerEnv` (node-20 PATH fix); every judgment goes through `classify` (Task 17): environment evidence after the PATH fix, runner evidence, then one run evidence per target; `Edit|Write|NotebookEdit` tool_use only; `ts tsx js jsx` only; targets `lint typecheck` (+`test` when `ENGINEOS_VERIFY_TESTS=1`); timeouts 90 s / 180 s; verdict rendering: `red` -> one `block(reason)` whose text is the kernel's in-process `repairSection({ check: target, attempt: 1 }).reason` plus the failure summary (the hook reads no `policy.repair` field itself, and the bash file's second, jq-less literal disappears with jq); infra `node-too-old` / `runner-missing` / `timeout` -> `message` naming target and reason (deviation 7); infra `target-absent` -> continue silently; the gate runs inside `withSpan(sink, { kind: 'verification', capability: 'validate', modelTier: 'cheap' }, ...)` and `event(sink, 'verify', { failed, targets, situation, reason? })` once per stop cycle; `policy.telemetry.events` `verify` row gains the two keys in this PR | C20d re-pointed: `src/hooks/stop-verify.ts` imports the kernel `repair` section and carries no `[0-9]+ fix attempts` literal; C22b (new keys round-trip), C22c, C27c |

Also port `post-edit-check` (81 lines, unregistered) as Task 25b in the same PR as Task 25 if the size allows; suite `hooks/test-post-edit.sh`; judges through the same `classify` (a `red` verdict is the only failure); returns `fail(stderr)`, which `render` maps to stderr + `exit 2`.

### Task 26: `init` (moved here from wave 4: it needs `scaffold.ts`)

**Files:** Create `src/init/project.ts`, `src/init/project.test.ts`, `src/hooks/scaffold-equivalence.test.ts`; replace `scripts/init-project.sh` with a shim over `engineos init`; modify `scripts/checks/70-runtime.sh` (C29: `init-project.sh` executable stays; the `scaffold-layout.sh` sourcing assertion for `init-project.sh` re-points to `src/init/project.ts` importing `../hooks/scaffold`).
**Source:** `scripts/init-project.sh` (115).
**Invariants:** refusal order (worktree -> self-repo -> HOME -> machine install -> siblings); exit codes 0/1/2/3/64; `-e || -L` existence; never overwrite `CLAUDE.md`; `IMPORT_RE` shared with the installer as one constant string both carry; `hooks/scaffold-layout.sh` is NOT deleted (versioned, sourced surface: frozen until 2.0). `scaffold-equivalence.test.ts` runs `bash -c 'source hooks/scaffold-layout.sh; scaffold_layout <dir> <root>'` and `scaffoldLayout(...)` against the same temp dirs (plain, symlinked component, `..` seed, existing file where a dir should be) and asserts identical resulting `find` listings.
**Acceptance:** `hooks/test-layout.sh` init section; `validate-engineos.sh` green.
**Commit:** `refactor(init): port init-project to the node runtime`.

### Task 27: `settings-merge`, `hooks.json`, installers, bypass CLI

**Files:** Create `src/install/settings-merge.ts` + tests; register `settings-merge` in `src/cli.ts`. Modify `hooks/hooks.json` (each command becomes `node "${CLAUDE_PLUGIN_ROOT}/dist/engineos.cjs" hook <name>`), `install.sh` (the `jq` check becomes a `node >= 18` check with the install URL; lines 287-333 collapse to one `node "$repo/dist/engineos.cjs" settings-merge --settings "$settings" --plugin-root "$repo"` call; Windows branch registers `node` directly and drops `bash.exe` resolution for hooks), `install.ps1` (same three changes), `hooks/test-install-hooks.sh` (assert the new form; add a reinstall case asserting no duplicate entries). Create `src/bypass/cli.ts` (`on|off|status [cwd]`), replace `hooks/bypass.sh` with a shim, keep `bypassActive` in `src/hooks/bypass.ts`.
**Interfaces:**
```ts
export interface MergeResult { added: number; removed: number; changed: boolean }
export function isEngineosCommand(command: string, pluginRoot: string): boolean   // contains `${pluginRoot}/hooks/` OR `dist/engineos.cjs`
export function mergeSettings(settings: unknown, hooksJson: unknown, pluginRoot: string): { settings: unknown; result: MergeResult }   // pure
export function runSettingsMerge(argv: string[], io: Io): number   // reads, merges, writes atomically (tmp + rename); --dry-run prints the result JSON only
```
**Invariants:** old `.sh` entries in a consumer's `settings.json` keep working (shims exist) AND get scrubbed on reinstall (`isEngineosCommand` matches both forms); the hook-derivation parser in the installers accepts both forms and still aborts when a derived name is empty or contains `/`, `\` or a space; write-once `settings.json.engineos.bak` stays in the installer; the secrets gate stays first and unchanged; `permissions.allow` merge is set-union preserving order.
**Acceptance:** `hooks/test-install-hooks.sh` (with the new reinstall case), `hooks/test-bypass.sh`, CI's two secrets-gate steps; `validate-engineos.sh` green (C30: shims executable, libraries non-executable, `ENGINEOS_HOOK_LIBRARIES` unchanged until wave 6); one manual run of `install.ps1` on Windows with a Stop event observed firing (spec: wave 3 exit criterion; record the evidence in the handoff).
**Commit:** `feat(install): register node hooks directly and merge settings without jq`.

Barrier 3: handoff; `bench` prompt-advisor and route-before-change budgets recorded.

---

# Wave 4 — generators, evals, bench, usage report (parallel after Wave 0)

| Task | Unit | Source | Target | Acceptance | Notes |
|---|---|---|---|---|---|
| 28 | `gen agent-commands` | `scripts/gen-agent-commands.sh` (114) | `src/gen/frontmatter.ts`, `src/gen/agent-commands.ts` | CI drift guard (`git diff --quiet -- commands/agents` after running) | marker `<!-- @generated by scripts/gen-agent-commands.sh ... -->` text unchanged; files without the marker are never touched; alias read only inside frontmatter; stderr/stdout lines verbatim |
| 29 | `gen agent-registry` | `scripts/gen-agent-registry.sh` (86) | `src/gen/agent-registry.ts`, `src/registry/{capabilities,agents}.ts` | `scripts/test-gen-agent-registry.sh`; CI drift guard | missing `tier:` is a hard error; tier/model mismatch is a hard error; `capability_ids` computed from `capabilities.json`; output sorted by name; `Wrote N agents to <file>` |
| 30 | `evals` | `scripts/run-evals.sh` (183) | `src/evals/{run,deterministic,live}.ts` | CI "Evals (deterministic tier)"; `live-evals.yml` | `deferrals_of` becomes the shared `src/checks/lib.ts` function; `[router]` grep not anchored; empty `expect_intents` inverts the assertion; risk rank check; coverage floor 25 |
| 31 | `bench` | `scripts/bench-runtime.sh` (125, embedded python3) | `src/bench/run.ts` | CI "Runtime performance budgets" | same five budgets; warm medians (5 samples, 7 for cache hit); `ENGINEOS_PERF_MULTIPLIER` numeric > 0; sets `ENGINEOS_BYPASS_FLAG=/nonexistent/...` and `ENGINEOS_TELEMETRY=0` for the hooks it times; python3 disappears |
| 32 | `usage-report` | `scripts/usage-report.sh` (58) | `src/report/usage.ts` | manual run; C22c (names `engineos-telemetry`) | hardcoded skill/agent lists preserved as constants; section-by-section degradation |

Each replaces its `.sh` with a shim, commits as `refactor(<area>): port <unit> to the node runtime`.

---

# Wave 5 — checks and `validate`

### Task 33: `validate` harness with explicit check registry

(Tasks 31-32 are the last two wave 4 rows above.)

**Files:** Create `src/checks/index.ts`, `src/checks/lib.ts`, `src/validate/cli.ts` + tests; replace `scripts/validate-engineos.sh` with a shim.
**Source:** `scripts/validate-engineos.sh` (82), `scripts/checks/lib.sh` (91).
**Interfaces:**
```ts
import { CheckResult, Finding, render } from './findings'   // Task 33c lands first; the harness never prints a sentence of its own
export interface Check<C extends CheckId = CheckId> { id: C; codes: readonly string[]; run(ctx: CheckContext): CheckResult[] }
export const CHECKS: readonly Check[]        // index.ts; duplicate ids rejected by a unit test that asserts Set size === length (and by a `satisfies` type on a literal id union)
export function orderIds(ids: string[]): string[]   // numeric part numerically, then letter suffix
export function runValidate(argv: string[], io: Io): number   // --only, --list; exit 0/1/2
export function skipOnce(ctx, token, message), skipPending(ctx, token, message), deferralsOf(ctx, rule)
```
**Invariants:** `--only C17` selects `C17`, `C17b`, `C17c`, `C17e`; unknown id -> exit 2; every output line is `render(result)` — `ok   <title>` / `FAIL <title>: [code] [code:subject] ...` / `skip <title>: [code:subject]` — then `passed N, failed N` counted by `status`; `skipOnce` yields one `fail` result with `precondition-missing:<token>` per family; `skipPending` yields a `skip` result with `artifact-pending:<path>`, touches neither counter and is gated on the artifact's primary path only (deviation 8).
**Acceptance:** `bash scripts/test-validate-engineos.sh` — the harness cases (`hok`/`hno`); each family PR ports its own mutation cases to code assertions (Task 33c), so the bash cases shrink family by family instead of passing as substrings.
**Commit:** `feat(checks): explicit check registry and validate harness`.

### Task 33b: mirror runner and table (`src/checks/mirror.ts`, `mirrors.ts`)

Amended 2026-09-04 (architecture review, candidate 2). Fifteen checks across
five families hand-write the same relation: a document names or quotes what a
registry declares. Land the relation once, before the families, so their
mirror halves port as rows.

**Files:** Create `src/checks/mirror.ts`, `src/checks/mirrors.ts`, `src/checks/mirror.test.ts`, `src/checks/mirrors.test.ts`.
**Source:** `40-decision-registries.sh` 55-234 (C16's nine pairs), `60-contracts.sh` C19b/c, C21b/e, `70-runtime.sh` C20c, C23, C24c, C25c, C26c, C27d, C28; the four copies of the vacuous-grep comment at `70-runtime.sh` 503-505, 711-714, 1096-1098, 1450-1452.
**Interfaces:** the `MirrorPair`, `MIRRORS` and `runMirrors` contract in the design ("Mirror table"), verbatim.
**Invariants:** no row without `anchor` unless `scope: 'file'`; runner refuses an empty section, an empty registry list, and a `{n}` pattern matching zero or several numbers; `element`/`pattern` strings are the bash grep strings with `{x}`/`{n}` substituted for the interpolated value; the gate-ladder row reads `rules/gates.md` `## The ladder` (deviation 5); registry paths are typed against the loaders, so a renamed key fails `tsc`.

- [ ] **Step 1: Failing tests** — `mirror.test.ts`: one case per runner rule using `tempRoot(t)` + fixture docs and a fixture registry object (missing section, empty section, empty list, element present, element absent, reverse direction finds an undeclared element, `{n}` equal, `{n}` unequal, `{n}` ambiguous, `scope: 'file'` searches the whole file); `mirrors.test.ts`: every `MIRRORS[].doc` exists in the checkout and every `registry` path resolves against `registries/`.
- [ ] **Step 2: Run** — `npm test`, new files fail.
- [ ] **Step 3: Implement** — slice by anchor to the next `^## ` line; substitute placeholders and compile to a `RegExp` with metacharacters escaped outside the placeholder; collect failures as `finding(row.check, row.id, subject)` (Task 33c), the subject being the missing element or the unequal number.
- [ ] **Step 4: Run tests** — `npm test`, all pass.
- [ ] **Step 5: Commit**

```bash
git add src/checks/mirror.ts src/checks/mirrors.ts src/checks/mirror.test.ts src/checks/mirrors.test.ts
git commit -m "feat(checks): mirror runner and the registry-to-doc pair table"
```

The families that follow port each mirror half as `runMirrors(rowsOf('<id>'))`
inside the existing check; the non-mirror assertions port as code beside it.

### Task 33c: findings module (`src/checks/findings.ts`)

Amended 2026-09-04 (architecture review, candidate 8). Lands FIRST in Wave 5,
before Task 33: the harness imports `render` and the families import
`finding`, so nothing is written twice. The letter keeps the 33-series
together; the order is 33c, 33, 33b, then 34-41.

**Files:** Create `src/checks/findings.ts`, `src/checks/findings.test.ts`.
**Source:** the 259 `*_bad="$*_bad <slug>"` accumulations and their aggregated `bad` lines across `scripts/checks/*.sh`; `skip_once` / `skip_pending` in `scripts/checks/lib.sh`; the `case_` contract in `scripts/test-validate-engineos.sh:59`.
**Interfaces:** the `Finding`, `CheckResult`, `HARNESS_FINDINGS`, `finding`, `result` and `render` contract in the design ("Findings"), verbatim. `CodeOf<C>` is derived from each family's `as const` code list registered on the `Check`.
**Invariants:** `render` is the only function in `src/checks/` and `src/validate/` that builds an `ok`/`FAIL`/`skip` line; a code matches `^[a-z][a-z0-9-]*$`; codes are unique within a check (asserted in `index.test.ts` over `CHECKS[].codes`), free across checks; `status` is derived, never passed; a `subject` is rendered after a colon and never contains whitespace-only text.
**Tests:** `findings.test.ts` — `result` derives each status; `render` yields the three line shapes byte-exact; a code outside the check's list is a `tsc` error (a `// @ts-expect-error` case); `HARNESS_FINDINGS` accepted for every check id.
**Commit:** `feat(checks): findings module — checks report values, the harness renders`.

**Family PR contract (Tasks 34-41), added by this task:** each family declares `const C<n>_FINDINGS = [...] as const` beside its checks and registers them as `codes`; every `bad` accumulation becomes `finding(...)`; the family's `case_` rows in `test-validate-engineos.sh` are ported to `<family>.test.ts` as `{ check, code, subject? }` assertions on `run(ctx)` over a mutated `relocatedRoot`, and deleted from the bash suite in the same PR; the family test asserts every declared code is produced by at least one case.

### Tasks 34-41: check families, one PR each

| Task | Family | Source LOC | Checks | Notes |
|---|---|---|---|---|
| 34 | `10-rules` | 89 | C1 (becomes "node >= 18 present"), C2, C3, C5, C5b | C1's message changes: say so in release notes |
| 35 | `20-registries` | 172 | C6, C7, C8, C14, C15, C15b | pure JSON; C6/C7/C8 already read the structured fields since Task 13, C14 is JSON validity only |
| 36 | `30-agents-skills` | 107 | C9, C10, C11, C12, C13, C31 | frontmatter via `src/gen/frontmatter.ts` |
| 37 | `40-decision-registries` | 238 | C16, C19*, C21*, C23* | C16's nine pairs become `MIRRORS` rows (Task 33b) with today's grep strings as `element`/`pattern`; the gate-ladder row reads `rules/gates.md` for real (deviation 5); intent/routing FKs and JSON shape checks stay code; the floor-equality row is already gone (Task 13, deviation 9) |
| 38 | `50-kernel` | 229 | C17*, C18* | call kernel functions in-process, not the shim |
| 39 | `60-contracts` | 205 | C21b/c/e, handoff and change-record mirrors | C19b/c and C21b/e template and prose mirrors are rows; C21 and C21c walk `.engineos/archived/**` as code |
| 40 | `70-runtime` part 1 | ~800 | C20*, C22*, C24*, C25*, C26* | C20c, C23, C24c, C25c, C26c prose mirrors are rows; canaries call `admit`/`breaker`/`hitl`/`repair`/telemetry in-process; C26d keeps the `hitl: budget-exhausted` literal coupling, now against `src/kernel/admit.ts` |
| 41 | `70-runtime` part 2 | ~775 | C27*, C28, C29, C30 | C27d and C28 prose mirrors are rows; C27e (Task 14, deviation 4) and C27f (Task 16, deviation 6) are already gone; C27 ports as policy well-formedness + writer existence; C29/C30 re-pointed to the TS modules and to shim file modes |

Each PR: `feat(checks): port family <name>`; acceptance: the family's ported code assertions green in `<family>.test.ts`, and `bash scripts/test-validate-engineos.sh` green on what remains (Task 33c family contract). When Task 41 lands, `scripts/checks/*.sh` are deleted and the shellcheck CI step drops `scripts/checks/*.sh`.

Barrier 5: handoff.

---

# Wave 6 — suites, CI, installers, docs, release

### Tasks 42-57: port the 16 suites to `node:test`

One PR per suite (largest first: `test-validate-engineos.sh`, by then only its harness cases since the families ported theirs in Wave 5 -> `src/validate/validate.e2e.test.ts`, one PR; `test-kernel.sh` 1067 -> `src/kernel/kernel.e2e.test.ts`). Style: black-box through the shared harness (Task 6b) — `runCli` for the drive, `tempRoot(t)` + `fixtureRepo` for the repo, `relocatedRoot` where a suite mutates a registry (`test-kernel.sh` `relocated_kernel`, `test-route.sh` fixtures), `envelope` and `transcript` for hook stdin — with assertions on stdout JSON and marker files. Suites that exercise a transcript (`test-verify.sh`) run each case in both transcript forms, default `input` and `{ legacy: true }`. No suite reintroduces `mkdtempSync` + `git init` inline; the harness is where that idiom lives. Each PR deletes the `.sh` suite and its CI step and adds nothing to CI (the `npm test` step already runs `build/**/*.test.js`). E2E tests live beside the module they exercise, named `*.e2e.test.ts`, and run in the same `node --test build/` pass.

Mapping: `test-route.sh`, `test-governance.sh`, `test-prompt-advisor.sh`, `test-install-hooks.sh` (keeps spawning `bash install.sh`), `test-layout.sh`, `test-verify.sh`, `test-bypass.sh`, `test-docs.sh` (reads `registries/docs-ledger.json`), `test-agent-announce.sh`, `test-post-edit.sh`, `test-exec-journal.sh`, `test-gen-agent-registry.sh`, `test-telemetry.sh`, `test-kernel.sh`, `test-validate-engineos.sh`. `test-lib-common.sh` was already replaced in Task 16.

### Task 58: CI and installers final form

- `.github/workflows/ci.yml`: remove `jq`/`shellcheck` from "Tools present" except `shellcheck` for `install.sh` and the remaining shims; drop every `bash hooks/test-*.sh` and `bash scripts/test-*.sh` step; keep the two drift guards, the dist guard, `npm test`, `node dist/engineos.cjs validate`, `node dist/engineos.cjs evals`, `node dist/engineos.cjs bench`, the two secrets-gate steps.
- `install.sh` / `install.ps1`: `ENGINEOS_HOOK_LIBRARIES` shrinks to `scaffold-layout.sh` (the one sourced library that stays); `hooks/lib-common.sh`, `hooks/lib-runner.sh`, `hooks/layout-manifest.sh`, `hooks/docs-ledger.sh` are deleted in the same PR as the last suite that sources them (`test-layout.sh`, `test-docs.sh`), and check C30's library list follows.
- Commit: `ci: run the node runtime only`.

### Task 59: docs and release

- `docs/COMPATIBILITY.md`: add a row "Runtime entry point `dist/engineos.cjs` subcommand names" to public surface; record every `.sh` shim (`scripts/kernel.sh`, `scripts/init-project.sh`, the eight hooks, `hooks/bypass.sh`, the scripts) as deprecated in 1.7.0, removed in 2.0; record `hooks/scaffold-layout.sh` as frozen bash until 2.0 because a sourced function cannot be shimmed; note `node >= 18`, the removed `jq` and `python3`, and Git Bash removed on the hook path only (`scripts/kernel.sh` still needs a bash on Windows until 2.0); C1's new meaning.
- `docs/release-notes/1.7.0.md` via the `release-notes` skill.
- `README.md` and `docs/ADOPTION.md`: install prerequisites; `CLAUDE.md` router section paragraph "The hooks need `jq`" rewritten to name node (checks C23/C22c mirror that text: update them in the same PR).
- `.claude-plugin/plugin.json` and `marketplace.json`: version `1.7.0`.
- Human release gate (`rules/gates.md`): owner approves with validation evidence attached (CI run URL, `bench` output, `validate` output).
- Commit: `docs: 1.7.0 — node runtime, shims deprecated`.

---

## Dependency graph

```
W0 (T1-T4)
 ├── W1a (T5-T9) ── W1b (T10) ┐
 │                 W1c (T11) ─┴─ W1d (T12, T13)
 ├── W2 (T14, T15)
 └── W4 (T27-T32)
W1d + W2 ── W3 (T16, T17 serial; T18-T25 in two parallel batches; T26 after T17; T27 last)
W1d + W2 ── W5 (T33; T34-T41 parallel)
W3 + W4 + W5 ── W6 (T42-T57 parallel; T58; T59)
```

Dispatch per `rules/parallelism.md`: each wave's parallel tasks go to separate agents in ONE message with disjoint file scopes (a task owns its `src/<area>/` files, its shim and its suite). Model: build tier (`opus`). Tests are IN SCOPE for every task. The final gate (lint + typecheck + `npm test` + the bash suites still alive) runs once per barrier.

## Self-review

- **Spec coverage:** layout (T1, file structure), CLI surface (T3, T8, T14-T15, T18-T27, T28-T33), node guard both floors (T3 own floor + silent/systemMessage sets; T17 `runnerEnv` + T25), process model (T16, T17), shims and compatibility incl. `init-project.sh` and frozen `scaffold-layout.sh` (T13, T18-T26, T59), `settings-merge` and scrub predicate (T27), invariants (listed per task), deviations 1-3 (T33; T3; per-hook check column + T13/T14/T26), testing (T16, T42-T57, T4), waves (sections), rollback/release (T59), Windows run (T27 acceptance). Open risk "startup cost" measured in T4 and T13.
- **Critic findings folded:** 1 -> check column + Global Constraints line; 2 -> T3 guard sets; 3 -> T17 `runnerEnv` + T25; 4 -> T27 `isEngineosCommand`; 5 -> T27 `settings-merge`; 6 -> T26 moved into wave 3; 7 -> T26 frozen `scaffold-layout.sh` + T59; 8 -> T59 wording; 9-10 -> spec and ADR text.
- **Placeholders:** none of the forbidden phrases; port contracts name source file, interfaces, invariants, acceptance and commit for every unit.
- **Type consistency:** `Io` (T2) used by every adapter; `KernelError` (T5) used by T6-T13; `KernelContext { root }` (T7) used by T8-T12; `resolveRoot(env, startDir)` (T6) used by T8; `EXEC_JOURNAL_FIELDS`/`SLUG_RE` (T14) used by T16 `span` and T41 C27e; `deferralsOf` (T33) used by T30.
