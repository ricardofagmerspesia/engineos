# EngineOS 2.0 Fast Core — Wave 5: Runtime Split and Session Metadata

For agentic workers: execute tasks in order. Each task is a single commit. Do not
skip the failing-test step — a test that has never been seen red has not been seen
at all.

**Goal.** Cut the cost of a hook fire. Today every `route-before-change` fire loads
a 384.5 KB bundle that carries the validator, the generator, the eval runner and the
bench harness, then spawns `git rev-parse` twice. Wave 5 splits the bundle into four,
resolves the per-session facts once into a cached `SessionMetadata` record, rewires
the four hot hooks onto that record, and then measures whether the result reaches the
spec's cached-routing target on the reference host.

**Architecture.** `src/cli.ts` stops being the only entry point. Four entry modules
under `src/entries/` each build a `CommandTable` from a shared partition of the
command set; `scripts/build.mjs` emits one bundle per entry plus a facade that keeps
`dist/engineos.cjs` byte-compatible in behaviour. A new `src/hooks/session-metadata.ts`
owns the F5 record: discovery is spawn-free (`src/lib/git-discovery.ts`) with
`git rev-parse` retained as a fallback and as a differential-test oracle; persistence
lives under `<gitDir>/engineos-session/`, wiped at SessionStart and invalidated by a
per-file mtime/size signature over `.engineos/changes/` and the project instruction
files.

**Tech Stack.** TypeScript strict (`noUncheckedIndexedAccess`, `noImplicitOverride`,
`exactOptionalPropertyTypes`), esbuild to committed CJS bundles (`target: node16`),
the node built-in test runner driven from `build/`.

**Spec.** `docs/specs/2026-09-22-engineos-2-fast-core-design.md` §5.
**Program plan.** `docs/superpowers/plans/2026-09-22-engineos-2-fast-core-00-program.md`
(interfaces F5 and F6).

## Global Constraints

- **Node floor is 18; syntax floor is node 16.** Everything in an entry module above
  the guard call must parse on node 16, because the guard's job is to re-exec a newer
  node and it cannot do that if the file fails to parse first. No `??=`, no `.at()`,
  no `structuredClone` above the guard.
- **No `any`, no `as` to silence a type.** Unknown input is `unknown`, narrowed.
- **One import statement per module.** `Number.parseInt` / `Number.parseFloat`, never
  the globals. Explicit return types on every exported function.
- **F5 is frozen.** `SessionMetadata` has exactly the six fields the program plan
  names, in that shape. Wave 4 is coding against it. Extra facts Wave 5 needs ride on
  a separate Wave-5-private type, never on `SessionMetadata`.
- **No daemon.** The spec rejects a persistent orchestration process until the
  split-bundle measurement justifies one. Nothing in this wave may start, keep alive,
  or depend on a long-lived process. Task 12 produces the measurement; it does not
  pre-judge the verdict.
- **`ENGINEOS_TELEMETRY=0` leaves no trace.** The session record lives under
  `<gitDir>/engineos-session/`, not under `<gitDir>/engineos-telemetry/`, and nothing
  in `src/hooks/telemetry.ts` may resolve a directory before its switch is read.
- **Commit size.** Keep each task's diff well under the repo's 400-line PR limit.
  `dist/*.cjs` are generated artifacts: every commit that rebuilds them says so in the
  body and those files are excluded from the line count.
- **Tests are in scope for this wave.** Cache invalidation and the node-version guard
  each need `*.e2e.test.ts` coverage; everything else is colocated unit tests.
- **Single-test command** (used in every step below):
  `npx tsc -p tsconfig.json && cd build && node --test hooks/session-metadata.test.js`
  — substituting the test file the step just wrote.
- **The validator must stay green:** `node dist/engineos.cjs validate`.

## File Structure

```text
src/
  lib/
    atomic-write.ts            NEW  writeFileAtomic, extracted from route-before-change
    atomic-write.test.ts       NEW
    git-discovery.ts           NEW  spawn-free repo/gitDir/prefix discovery
    git-discovery.test.ts      NEW
  entries/
    tables.ts                  NEW  ALL_COMMANDS + the four partitions
    tables.test.ts             NEW  partition proof
    hook.ts                    NEW  dist/engineos-hook.cjs entry
    kernel.ts                  NEW  dist/engineos-kernel.cjs entry
    admin.ts                   NEW  dist/engineos-admin.cjs entry
    bundle-size.e2e.test.ts    NEW
    node-guard.e2e.test.ts     NEW
  node-guard-apply.ts          NEW  effectful half of the guard, shared by all entries
  hooks/
    session-metadata.ts        NEW  F5 record: resolve, read, persist, invalidate
    session-metadata.test.ts   NEW
    session-metadata.e2e.test.ts NEW  staleness across real processes
  bench/
    baseline.ts                NEW  reads docs/perf/baselines/<host-id>.json
    baseline.test.ts           NEW
src/cli.ts                     EDIT becomes the facade entry over ALL_COMMANDS
src/hooks/bypass.ts            EDIT adds bypassActiveIn(gitDirPath, env)
src/hooks/route-before-change.ts      EDIT consumes the session record
src/hooks/mark-unrecorded.ts          EDIT consumes the session record
src/hooks/telemetry.ts                EDIT consumes the session record, after the switch
src/hooks/announce-agent-dispatch.ts  EDIT consumes the session record
src/hooks/announce-agent-return.ts    EDIT consumes the session record
src/hooks/ensure-project-layout.ts    EDIT wipes engineos-session at SessionStart
src/install/settings-merge.ts         EDIT learns dist/engineos-hook.cjs
src/bench/run.ts                      EDIT budget 150 -> 75, bench drives the bundle
src/bench/run.test.ts                 EDIT the pinned budget line
scripts/build.mjs                     EDIT emits four bundles
hooks/*.sh                            EDIT point at dist/engineos-hook.cjs
hooks/hooks.json                      EDIT the registered command form
.github/workflows/ci.yml              EDIT drift guard covers all four bundles
docs/COMPATIBILITY.md                 EDIT records the new public bundle names
docs/CODEBASE_MAP.md                  EDIT the bundle sentence
docs/perf/startup-split.md            NEW  Task 12's measurement and verdict
```

---

### Task 1: Extract the atomic writer into a shared library module

Three modules in this wave need tmp+rename writes (the route cache, the session
record, the startup measurement file). `route-before-change.ts` owns a private copy
today. Lift it before anything else so the later tasks import rather than duplicate.

**Files:** `src/lib/atomic-write.ts` (new), `src/lib/atomic-write.test.ts` (new),
`src/hooks/route-before-change.ts` (edit).

**Interfaces:**

- Produces: `export function writeFileAtomic(path: string, contents: string): boolean`
  — returns `true` when the file landed, `false` when the write was swallowed. The
  boolean is new: `route-before-change` ignores it (preserving today's behaviour), and
  Task 6 needs to know whether the session record actually persisted.
- Consumes: nothing.

- [ ] **Step 1: Write the failing test.**

```bash
cat > src/lib/atomic-write.test.ts <<'EOF'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFileAtomic } from './atomic-write';

function temp(t: { after: (fn: () => void) => void }): string {
  const dir = mkdtempSync(join(tmpdir(), 'engineos-atomic-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('writeFileAtomic creates missing parent directories and reports success', (t) => {
  const dir = temp(t);
  const target = join(dir, 'a', 'b', 'entry.json');
  assert.equal(writeFileAtomic(target, '{"ok":true}'), true);
  assert.equal(readFileSync(target, 'utf8'), '{"ok":true}');
});

test('writeFileAtomic leaves no temporary file behind', (t) => {
  const dir = temp(t);
  writeFileAtomic(join(dir, 'entry.json'), 'x');
  assert.deepEqual(readdirSync(dir), ['entry.json']);
});

test('writeFileAtomic replaces existing contents', (t) => {
  const dir = temp(t);
  const target = join(dir, 'entry.json');
  writeFileAtomic(target, 'first');
  writeFileAtomic(target, 'second');
  assert.equal(readFileSync(target, 'utf8'), 'second');
});

test('writeFileAtomic reports false when the parent path is a file', (t) => {
  const dir = temp(t);
  writeFileSync(join(dir, 'blocker'), '');
  assert.equal(writeFileAtomic(join(dir, 'blocker', 'entry.json'), 'x'), false);
});
EOF
```

- [ ] **Step 2: Run it and see it fail.**

```bash
npx tsc -p tsconfig.json && cd build && node --test lib/atomic-write.test.js
```

Expected failure: `tsc` stops with
`error TS2307: Cannot find module './atomic-write' or its corresponding type declarations.`
The test file never reaches the runner.

- [ ] **Step 3: Write the implementation.**

```bash
cat > src/lib/atomic-write.ts <<'EOF'
// tmp + rename, so a concurrent reader never sees half a file. Lifted out of
// route-before-change.ts, which had the only copy; the session record and the
// startup measurement need the same guarantee.
import { mkdirSync, renameSync, writeFileSync } from 'node:fs';

export function writeFileAtomic(path: string, contents: string): boolean {
  const cut = path.lastIndexOf('/');
  try {
    if (cut > 0) mkdirSync(path.slice(0, cut), { recursive: true });
    // The pid suffix is what keeps two concurrent hook fires from renaming each
    // other's half-written temp file over the real one.
    const tmp = `${path}.${process.pid}`;
    writeFileSync(tmp, contents);
    renameSync(tmp, path);
    return true;
  } catch {
    // Callers decide what an unwritable directory means. For a cache it means a
    // recompute next time; reporting it would turn a read-only git dir into hook
    // noise on every edit.
    return false;
  }
}
EOF
```

- [ ] **Step 4: Run it and see it pass.**

```bash
npx tsc -p tsconfig.json && cd build && node --test lib/atomic-write.test.js
```

Expected: 4 passing tests, `# fail 0`.

- [ ] **Step 5: Point `route-before-change.ts` at the shared writer.**

Delete the private `writeAtomic` function (the last function in the file) and its
`mkdirSync` / `renameSync` / `writeFileSync` imports, then:

```bash
cd /Users/ricardofagmer/projects/engineos
python3 - <<'EOF'
from pathlib import Path
p = Path('src/hooks/route-before-change.ts')
s = p.read_text()
s = s.replace(
  "import { mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs';",
  "import { readFileSync, readdirSync, statSync } from 'node:fs';")
s = s.replace(
  "import { findUpFile } from '../lib/git';",
  "import { writeFileAtomic } from '../lib/atomic-write';\nimport { findUpFile } from '../lib/git';")
s = s.replace('writeAtomic(', 'writeFileAtomic(')
cut = s.index('// tmp + rename, so a concurrent hook fire never reads half an entry.')
s = s[:cut].rstrip() + '\n'
p.write_text(s)
EOF
```

- [ ] **Step 6: Run the route hook's own suite and see it still pass.**

```bash
npx tsc -p tsconfig.json && cd build && node --test hooks/route-before-change.test.js lib/atomic-write.test.js
```

Expected: every existing `route-before-change` test still passes, `# fail 0`. The
cache-hit tests are the ones that prove the extraction was behaviour-preserving.

- [ ] **Step 7: Commit.**

```bash
git add src/lib/atomic-write.ts src/lib/atomic-write.test.ts src/hooks/route-before-change.ts
git commit -m "$(cat <<'EOF'
refactor(lib): extract writeFileAtomic from the route hook

Three Wave 5 modules need tmp+rename writes. Lift the route cache's private
copy into src/lib so the session record and the startup measurement import it
instead of duplicating it. The new boolean return is ignored by the route hook,
which keeps its swallow-and-recompute behaviour.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Partition the command set and share the node guard

`src/cli.ts` today holds three things at once: the node guard's effects, the command
table, and the process exit. A split bundle needs all three in every entry, so lift
the guard and the table out first and leave `cli.ts` as one of four thin entries.

The partition follows spec §5 exactly:

| Bundle | Commands |
|---|---|
| `engineos-hook.cjs` | `hook` |
| `engineos-kernel.cjs` | `kernel`, `journal`, `telemetry`, `bypass` |
| `engineos-admin.cjs` | `init`, `settings-merge`, `gen`, `evals`, `bench`, `usage-report`, `validate` |
| `engineos.cjs` | all twelve (the compatibility facade) |

`--version` needs no entry in any table: `dispatch` answers it before the table
lookup, so every bundle answers it for free. That is load-bearing for the CI drift
guard in Task 3.

**Files:** `src/entries/tables.ts` (new), `src/entries/tables.test.ts` (new),
`src/entries/hook.ts` (new), `src/entries/kernel.ts` (new), `src/entries/admin.ts`
(new), `src/node-guard-apply.ts` (new), `src/node-guard-apply.test.ts` (new),
`src/cli.ts` (edit).

**Interfaces:**

- Produces: `export const ALL_COMMANDS: CommandTable`,
  `export const HOOK_COMMANDS: CommandTable`, `export const KERNEL_COMMANDS: CommandTable`,
  `export const ADMIN_COMMANDS: CommandTable` in `src/entries/tables.ts`.
- Produces: `export function applyGuard(entryFile: string, argv: string[], io: Io, nodeVersion?: string): number | null`
  in `src/node-guard-apply.ts` — returns an exit code when the process must stop, and
  `null` when it should proceed. Taking `nodeVersion` as a parameter is what makes the
  guard's effects testable in-process; `entryFile` is the `__filename` to re-exec,
  which differs per bundle.
- Consumes: `guardOutcome`, `findNewerNode`, `currentMajor`, `MIN_NODE_MAJOR` from
  `src/node-guard.ts` (unchanged), `dispatch`/`CommandTable` from `src/dispatch.ts`
  (unchanged).

- [ ] **Step 1: Write the failing partition test.**

```bash
mkdir -p src/entries
cat > src/entries/tables.test.ts <<'EOF'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ADMIN_COMMANDS, ALL_COMMANDS, HOOK_COMMANDS, KERNEL_COMMANDS } from './tables';

// The twelve names are public surface (docs/COMPATIBILITY.md). A command added
// without a home in one of the three split bundles would silently ship only in
// the facade, so the partition is asserted, not assumed.
const DOCUMENTED = ['bench', 'bypass', 'evals', 'gen', 'hook', 'init', 'journal', 'kernel', 'settings-merge', 'telemetry', 'usage-report', 'validate'];

test('ALL_COMMANDS is exactly the twelve documented names', () => {
  assert.deepEqual(Object.keys(ALL_COMMANDS).sort(), DOCUMENTED);
});

test('the three split tables union to ALL_COMMANDS', () => {
  const union = [...Object.keys(HOOK_COMMANDS), ...Object.keys(KERNEL_COMMANDS), ...Object.keys(ADMIN_COMMANDS)];
  assert.deepEqual(union.sort(), DOCUMENTED);
});

test('the three split tables are pairwise disjoint', () => {
  const seen = new Set<string>();
  for (const table of [HOOK_COMMANDS, KERNEL_COMMANDS, ADMIN_COMMANDS]) {
    for (const name of Object.keys(table)) {
      assert.equal(seen.has(name), false, `${name} appears in more than one bundle`);
      seen.add(name);
    }
  }
});

test('every split entry is the same function object as the facade entry', () => {
  for (const table of [HOOK_COMMANDS, KERNEL_COMMANDS, ADMIN_COMMANDS]) {
    for (const [name, command] of Object.entries(table)) {
      assert.equal(command, ALL_COMMANDS[name], `${name} diverges between the facade and its bundle`);
    }
  }
});

test('the hook bundle carries the hook command and nothing else', () => {
  assert.deepEqual(Object.keys(HOOK_COMMANDS), ['hook']);
});
EOF
```

- [ ] **Step 2: Run it and see it fail.**

```bash
npx tsc -p tsconfig.json && cd build && node --test entries/tables.test.js
```

Expected failure: `tsc` stops with
`error TS2307: Cannot find module './tables' or its corresponding type declarations.`

- [ ] **Step 3: Write the tables.**

```bash
cat > src/entries/tables.ts <<'EOF'
// The command set, partitioned once. Each split bundle imports exactly one of the
// three tables, so esbuild's tree shaking drops the command families that bundle
// does not name — that omission IS the startup saving this wave is after.
//
// ALL_COMMANDS is the facade's table and the partition's oracle: entries/tables.test.ts
// asserts the three splits union to it and never overlap.
import type { CommandTable } from '../dispatch';
import { runBench } from '../bench/run';
import { runBypass } from '../bypass/cli';
import { runEvals } from '../evals/run';
import { runGen } from '../gen/cli';
import { runHook } from '../hooks/cli';
import { runInit } from '../init/cli';
import { runSettingsMerge } from '../install/cli';
import { runJournal } from '../journal/cli';
import { runTelemetry } from '../journal/telemetry-cli';
import { runKernel } from '../kernel/cli';
import { runUsageReport } from '../report/usage';
import { runValidate } from '../validate/cli';

// dist/engineos-hook.cjs — the only bundle a Claude Code hook fire loads.
export const HOOK_COMMANDS: CommandTable = {
  hook: runHook,
};

// dist/engineos-kernel.cjs — kernel decisions and the journals that record them.
export const KERNEL_COMMANDS: CommandTable = {
  kernel: runKernel,
  journal: runJournal,
  telemetry: runTelemetry,
  bypass: runBypass,
};

// dist/engineos-admin.cjs — everything a developer or CI runs, never a hook.
export const ADMIN_COMMANDS: CommandTable = {
  init: runInit,
  'settings-merge': runSettingsMerge,
  gen: runGen,
  evals: runEvals,
  bench: runBench,
  'usage-report': runUsageReport,
  validate: runValidate,
};

// dist/engineos.cjs — the compatibility facade. Every documented subcommand keeps
// working through the name consumers already have in their settings.json.
export const ALL_COMMANDS: CommandTable = {
  ...HOOK_COMMANDS,
  ...KERNEL_COMMANDS,
  ...ADMIN_COMMANDS,
};
EOF
```

- [ ] **Step 4: Run it and see it pass.**

```bash
npx tsc -p tsconfig.json && cd build && node --test entries/tables.test.js
```

Expected: 5 passing tests, `# fail 0`.

- [ ] **Step 5: Write the failing guard-effects test.**

```bash
cat > src/node-guard-apply.test.ts <<'EOF'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryIo } from './io';
import { applyGuard } from './node-guard-apply';

test('applyGuard proceeds on a node that meets the floor', () => {
  const io = memoryIo({ env: {} });
  assert.equal(applyGuard('/x/dist/engineos-hook.cjs', ['hook', 'route-before-change'], io, '22.0.0'), null);
  assert.equal(io.stdout(), '');
});

test('applyGuard exits 0 silently for a silent hook on an old node', () => {
  const io = memoryIo({ env: { ENGINEOS_REEXEC: '1' } });
  assert.equal(applyGuard('/x/dist/engineos-hook.cjs', ['hook', 'route-before-change'], io, '16.20.2'), 0);
  assert.equal(io.stdout(), '');
});

test('applyGuard renders the skip message for a non-silent hook on an old node', () => {
  const io = memoryIo({ env: { ENGINEOS_REEXEC: '1' } });
  const code = applyGuard('/x/dist/engineos-hook.cjs', ['hook', 'stop-verify'], io, '16.20.2');
  assert.equal(code, 0);
  assert.match(io.stdout(), /stop-verify skipped: node >= 18 required \(found v16\.20\.2\)/);
});

test('applyGuard refuses a non-hook invocation on an old node', () => {
  const io = memoryIo({ env: { ENGINEOS_REEXEC: '1' } });
  const code = applyGuard('/x/dist/engineos-admin.cjs', ['validate'], io, '16.20.2');
  assert.equal(code, 1);
  assert.match(io.stdout(), /node >= 18 required, found v16\.20\.2/);
});
EOF
```

- [ ] **Step 6: Run it and see it fail.**

```bash
npx tsc -p tsconfig.json && cd build && node --test node-guard-apply.test.js
```

Expected failure: `error TS2307: Cannot find module './node-guard-apply'`.

- [ ] **Step 7: Write the guard's effectful half.**

```bash
cat > src/node-guard-apply.ts <<'EOF'
// The effects the node guard performs, shared by all four bundle entries.
// Everything here must parse on node 16: this file runs BEFORE the re-exec that
// gets us onto a supported node, which is the whole point of the guard.
//
// Split from node-guard.ts (the pure decision) so the effects are testable without
// a subprocess: nodeVersion is a parameter, and the process exit is a return value.
import { spawnSync } from 'node:child_process';
import { accessSync, constants, existsSync, readdirSync } from 'node:fs';
import { writeJson, type Io } from './io';
import { message, render } from './hooks/output';
import { currentMajor, findNewerNode, guardOutcome, MIN_NODE_MAJOR } from './node-guard';

function isExecutable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

// Returns an exit code when the caller must stop, or null to proceed. entryFile is
// the bundle to hand the newer node — each split bundle re-execs ITSELF, never the
// facade, or the saving this wave bought would be spent on the way back.
export function applyGuard(entryFile: string, argv: string[], io: Io, nodeVersion: string = process.versions.node): number | null {
  if (currentMajor(nodeVersion) >= MIN_NODE_MAJOR) return null;
  const reexeced = io.env['ENGINEOS_REEXEC'] === '1';
  const newer = reexeced ? null : findNewerNode(io.env, existsSync, readdirSync, isExecutable);
  const outcome = guardOutcome(argv, nodeVersion, newer);
  switch (outcome.kind) {
    case 'proceed':
      return null;
    case 'reexec': {
      const r = spawnSync(outcome.bin, [entryFile, ...argv], { stdio: 'inherit', env: { ...process.env, ENGINEOS_REEXEC: '1' } });
      if (r.error === undefined && r.status !== null) return r.status;
      // Re-exec never started (ENOENT, non-executable) or the child died by signal:
      // fall through to the no-newer-node policy rather than exiting silently.
      return applyGuard(entryFile, argv, { ...io, env: { ...io.env, ENGINEOS_REEXEC: '1' } }, nodeVersion);
    }
    case 'silent':
      return 0;
    case 'skip':
      // hooks/output.ts imports nothing, so the guard renders through the same
      // writer every hook uses, even on the node it is about to refuse.
      return render(message(outcome.message), io);
    case 'refuse':
      writeJson(io, { error: outcome.message });
      return 1;
  }
}
EOF
```

- [ ] **Step 8: Run it and see it pass.**

```bash
npx tsc -p tsconfig.json && cd build && node --test node-guard-apply.test.js
```

Expected: 4 passing tests, `# fail 0`. If `memoryIo` does not carry `env`, read
`src/io.ts` and pass the env through the same field the existing hook tests use —
do not change `memoryIo`'s signature, other waves depend on it.

- [ ] **Step 9: Write the three split entries and shrink `cli.ts` to a facade.**

```bash
for pair in "hook:HOOK_COMMANDS:hook envelope and the routing kernel subset" \
            "kernel:KERNEL_COMMANDS:kernel decisions and their journals" \
            "admin:ADMIN_COMMANDS:validate, gen, evals, bench, report and install helpers"; do
  name="${pair%%:*}"; rest="${pair#*:}"; table="${rest%%:*}"; blurb="${rest#*:}"
  cat > "src/entries/${name}.ts" <<EOF
// dist/engineos-${name}.cjs — ${blurb}.
// Everything above applyGuard must parse on node 16.
import { processIo } from '../io';
import { applyGuard } from '../node-guard-apply';
import { dispatch } from '../dispatch';
import { ${table} } from './tables';

const io = processIo();
const argv = process.argv.slice(2);

const guarded = applyGuard(__filename, argv, io);
process.exit(guarded === null ? dispatch(${table}, argv, io) : guarded);
EOF
done

cat > src/cli.ts <<'EOF'
// dist/engineos.cjs — the compatibility facade. Every documented subcommand keeps
// resolving here under the name consumers already have in their settings.json, even
// after the hot path moved to dist/engineos-hook.cjs (docs/COMPATIBILITY.md).
// Everything above applyGuard must parse on node 16.
import { processIo } from './io';
import { applyGuard } from './node-guard-apply';
import { dispatch } from './dispatch';
import { ALL_COMMANDS } from './entries/tables';

const io = processIo();
const argv = process.argv.slice(2);

const guarded = applyGuard(__filename, argv, io);
process.exit(guarded === null ? dispatch(ALL_COMMANDS, argv, io) : guarded);
EOF
```

- [ ] **Step 10: Run the whole suite and the validator.**

```bash
npx tsc -p tsconfig.json && cd build && node --test --test-reporter=dot "**/*.test.js"
cd /Users/ricardofagmer/projects/engineos && npm run build && node dist/engineos.cjs validate
```

Expected: `# fail 0`, and the validator's own summary line with no failures. The
facade still emits `dist/engineos.cjs` because `scripts/build.mjs` is untouched until
Task 3 — that is deliberate, so this commit is provably behaviour-preserving.

- [ ] **Step 11: Commit.**

```bash
git add src/entries src/node-guard-apply.ts src/node-guard-apply.test.ts src/cli.ts dist/engineos.cjs
git commit -m "$(cat <<'EOF'
refactor(cli): partition the command set and share the node guard

Three split entry modules plus the facade now build their table from
src/entries/tables.ts, and the guard's effects move to node-guard-apply.ts so
each bundle re-execs itself rather than the facade. Behaviour is unchanged:
scripts/build.mjs still emits only dist/engineos.cjs.

dist/engineos.cjs is a generated artifact; it is excluded from the diff count.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Emit four bundles and guard all four against drift

**Files:** `scripts/build.mjs` (edit), `src/entries/bundle-size.e2e.test.ts` (new),
`.github/workflows/ci.yml` (edit), `package.json` (edit — `files` if it lists the
bundle explicitly; check before editing), `dist/engineos-hook.cjs`,
`dist/engineos-kernel.cjs`, `dist/engineos-admin.cjs` (new generated artifacts).

**Interfaces:**

- Consumes: `src/entries/{hook,kernel,admin}.ts` and `src/cli.ts` from Task 2.
- Produces: the four `dist/*.cjs` files. Their names are public surface from this
  commit forward (Task 10 records that in `docs/COMPATIBILITY.md`).

- [ ] **Step 1: Write the failing bundle-size e2e test.**

The guard that keeps the split honest. A future import that drags the validator back
into the hook bundle would restore the cost this wave removed, and only a size
assertion catches it. The threshold is a ratio, not a byte count, so a legitimate
feature that grows every bundle does not fail it. Measured on the authoring host
before this task: a hooks-only probe bundle was 127.9 KB against the facade's
384.5 KB, a ratio of 0.33 — the 0.55 ceiling leaves real headroom without leaving
room for the validator (which alone is larger than the gap).

```bash
cat > src/entries/bundle-size.e2e.test.ts <<'EOF'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { checkoutRoot } from '../testing/harness';

// The split only pays off while the hook bundle stays small. Ratio, not bytes: a
// feature that grows every bundle is fine, an import that drags the validator or
// the eval runner back into the hook path is not.
const HOOK_SHARE_CEILING = 0.55;

function bundle(name: string): string {
  return join(checkoutRoot(), 'dist', name);
}

test('all four bundles are built', () => {
  for (const name of ['engineos.cjs', 'engineos-hook.cjs', 'engineos-kernel.cjs', 'engineos-admin.cjs']) {
    assert.equal(existsSync(bundle(name)), true, `dist/${name} is missing — run npm run build`);
  }
});

test('the hook bundle is a small fraction of the facade', () => {
  const facade = statSync(bundle('engineos.cjs')).size;
  const hook = statSync(bundle('engineos-hook.cjs')).size;
  const share = hook / facade;
  assert.ok(
    share < HOOK_SHARE_CEILING,
    `hook bundle is ${(share * 100).toFixed(1)}% of the facade (${hook} / ${facade} bytes), ceiling is ${HOOK_SHARE_CEILING * 100}% — something pulled an admin command family into the hook entry`,
  );
});

test('the kernel bundle is smaller than the facade', () => {
  assert.ok(statSync(bundle('engineos-kernel.cjs')).size < statSync(bundle('engineos.cjs')).size);
});
EOF
```

- [ ] **Step 2: Run it and see it fail.**

```bash
npx tsc -p tsconfig.json && cd build && node --test entries/bundle-size.e2e.test.js
```

Expected failure:
`dist/engineos-hook.cjs is missing — run npm run build` — the first test fails
because `scripts/build.mjs` still emits one file. If `checkoutRoot` is not exported
from `src/testing/harness.ts`, read that file and use the export it does provide for
the repo root; do not add an export, other waves own that file.

- [ ] **Step 3: Write the four-bundle build.**

```bash
cat > scripts/build.mjs <<'EOF'
// Bundles the four entry points into the committed runtime files. Syntax is lowered
// to node16 so the version guard in src/node-guard-apply.ts can run on an old node
// and re-exec a newer one; APIs used elsewhere still require node 18 (package.json
// engines).
//
// Four outputs, not one: a Claude Code hook fire loads only dist/engineos-hook.cjs,
// so the validator, the generator and the eval runner never reach the hot path.
// dist/engineos.cjs stays as the compatibility facade (docs/COMPATIBILITY.md).
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';

// import attributes (`with { type: 'json' }`) need Node >= 20.10; the spec floor is 18.
const version = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

const BUNDLES = [
  { entry: 'src/entries/hook.ts', outfile: 'dist/engineos-hook.cjs' },
  { entry: 'src/entries/kernel.ts', outfile: 'dist/engineos-kernel.cjs' },
  { entry: 'src/entries/admin.ts', outfile: 'dist/engineos-admin.cjs' },
  { entry: 'src/cli.ts', outfile: 'dist/engineos.cjs' },
];

for (const { entry, outfile } of BUNDLES) {
  await build({
    entryPoints: [entry],
    bundle: true,
    platform: 'node',
    target: 'node16',
    format: 'cjs',
    outfile,
    banner: { js: '#!/usr/bin/env node' },
    define: { ENGINEOS_VERSION: JSON.stringify(version) },
    legalComments: 'none',
    minify: false,
    sourcemap: false,
    logLevel: 'error',
  });
}
EOF
npm run build
```

- [ ] **Step 4: Run the test and see it pass, then check the ratio by hand.**

```bash
npx tsc -p tsconfig.json && cd build && node --test entries/bundle-size.e2e.test.js
cd /Users/ricardofagmer/projects/engineos && ls -l dist/*.cjs
```

Expected: 3 passing tests, `# fail 0`, and four files listed. Record the hook/facade
ratio — Task 12 reports it alongside the startup numbers.

- [ ] **Step 5: Prove every bundle answers `--version` and its own commands.**

```bash
for b in engineos engineos-hook engineos-kernel engineos-admin; do
  printf '%s: %s\n' "$b" "$(node dist/$b.cjs --version)"
done
node dist/engineos-admin.cjs validate
echo '{}' | node dist/engineos-hook.cjs hook prompt-advisor
node dist/engineos-kernel.cjs kernel route-path src/orders/orders.service.ts
```

Expected: four identical `engineos <version>` lines (`dispatch` answers `--version`
before the table lookup, so no bundle needs an entry for it); a clean validator
summary; a hook envelope on stdout; a JSON kernel answer carrying a `domain`.

- [ ] **Step 6: Widen the CI drift guard to the whole `dist/` directory.**

```bash
python3 - <<'EOF'
from pathlib import Path
p = Path('.github/workflows/ci.yml')
s = p.read_text()
old = """          npm run build
          if ! git diff --quiet -- dist/engineos.cjs; then
            echo "FAIL: dist/engineos.cjs is out of sync with src/ — run npm run build and commit the result."
            git diff --stat -- dist/engineos.cjs
            exit 1
          fi
          echo "ok: dist/engineos.cjs matches src/"
          test "$(node dist/engineos.cjs --version)" = "engineos $(node -p "require('./package.json').version")"
"""
new = """          npm run build
          if ! git diff --quiet -- dist/; then
            echo "FAIL: dist/ is out of sync with src/ — run npm run build and commit the result."
            git diff --stat -- dist/
            exit 1
          fi
          echo "ok: dist/ matches src/"
          # Every bundle answers --version through dispatch(), before any table
          # lookup, so this also proves each one loads and runs end to end.
          EXPECTED="engineos $(node -p "require('./package.json').version")"
          for bundle in dist/engineos.cjs dist/engineos-hook.cjs dist/engineos-kernel.cjs dist/engineos-admin.cjs; do
            ACTUAL="$(node "$bundle" --version)"
            if [ "$ACTUAL" != "$EXPECTED" ]; then
              echo "FAIL: $bundle reports '$ACTUAL', package.json says '$EXPECTED'"
              exit 1
            fi
            echo "ok: $bundle reports $ACTUAL"
          done
"""
assert old in s, 'ci.yml drift guard step did not match — read it and adapt by hand'
p.write_text(s.replace(old, new))
EOF
```

- [ ] **Step 7: Check whether `package.json` names the bundle explicitly.**

```bash
grep -n 'engineos.cjs' package.json || echo 'no explicit bundle reference in package.json'
```

If `files`, `bin`, or a script names `dist/engineos.cjs`, widen it to `dist/` (for
`files`) or leave it (for `bin` — the facade remains the published binary). Make the
edit in this commit so the packed artifact carries all four bundles.

- [ ] **Step 8: Run the full suite and the validator.**

```bash
npx tsc -p tsconfig.json && cd build && node --test --test-reporter=dot "**/*.test.js"
cd /Users/ricardofagmer/projects/engineos && node dist/engineos.cjs validate
```

Expected: `# fail 0` and a clean validator summary.

- [ ] **Step 9: Commit.**

```bash
git add scripts/build.mjs src/entries/bundle-size.e2e.test.ts .github/workflows/ci.yml package.json dist/
git commit -m "$(cat <<'EOF'
build(dist): emit hook, kernel and admin bundles beside the facade

A hook fire now loads dist/engineos-hook.cjs, which carries the hook envelope
and the routing kernel subset and none of the validator, generator, eval runner
or bench harness. dist/engineos.cjs stays as the compatibility facade over all
twelve subcommands. The CI drift guard covers dist/ as a whole and asserts every
bundle answers --version.

An e2e test pins the hook bundle below 55% of the facade, so a future import
that drags an admin command family back into the hot path fails CI.

The dist/*.cjs files are generated artifacts; they are excluded from the diff
count.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Spawn-free repository discovery, with `git rev-parse` as the oracle

**Why this exists.** A `route-before-change` fire spawns `git rev-parse` twice today
— once inside `bypassActive`, once for `gitInfo` — at a measured median of 32.0 ms
per spawn on the authoring host. Caching cannot remove the last one, because the
cache lives under the git directory and therefore cannot be read until the git
directory is known. The only way out is to answer the question without a subprocess.

**Why it is safe.** The walk is a deliberately narrow reimplementation and it
declines the cases it cannot get right: any of `GIT_DIR`, `GIT_COMMON_DIR`,
`GIT_WORK_TREE` or `GIT_CEILING_DIRECTORIES` in the environment, or a `.git` entry it
cannot parse, defers to `git rev-parse`. The test is differential: for every fixture,
the walk's answer must equal git's own, byte for byte.

**Files:** `src/lib/git-discovery.ts` (new), `src/lib/git-discovery.test.ts` (new).

**Interfaces:**

- Produces:

```ts
export interface RepoLocation {
  repo: string;    // absolute worktree root, realpath'd, no trailing slash
  gitDir: string;  // absolute git directory (the linked one for a worktree)
  prefix: string;  // cwd relative to repo, trailing slash, '' at the root
}
export function discoverRepo(cwd: string, env: NodeJS.ProcessEnv): RepoLocation | null;
export function gitInfoVia(cwd: string, env: NodeJS.ProcessEnv, spawn: SpawnFn): RepoLocation;
```

  `discoverRepo` returns `null` when it declines; `gitInfoVia` is the public entry
  that tries the walk and falls back to one `git rev-parse`, returning
  `{ repo: '', gitDir: '', prefix: '' }` when there is no repository at all — the same
  `NO_GIT` shape `route-before-change` already treats as "not in a repo".
- Consumes: `SpawnFn` — the `ctx.spawn` type already used by the hooks
  (`typeof spawnSync`); import it from wherever `HookContext` declares it rather than
  redeclaring it.

- [ ] **Step 1: Write the failing differential test.**

```bash
cat > src/lib/git-discovery.test.ts <<'EOF'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fixtureRepo, tempRoot } from '../testing/harness';
import { discoverRepo, gitInfoVia } from './git-discovery';

function hasGit(): boolean {
  return spawnSync('git', ['--version'], { encoding: 'utf8' }).status === 0;
}

// The oracle: what git itself answers, in the same three-field shape.
function viaGit(cwd: string): { repo: string; gitDir: string; prefix: string } {
  const r = spawnSync('git', ['-C', cwd, 'rev-parse', '--show-toplevel', '--absolute-git-dir', '--show-prefix'], { encoding: 'utf8' });
  const lines = (typeof r.stdout === 'string' ? r.stdout : '').split('\n');
  return { repo: lines[0] ?? '', gitDir: lines[1] ?? '', prefix: lines[2] ?? '' };
}

test('the walk agrees with git at the repository root', (t) => {
  if (!hasGit()) { t.skip('git is not installed'); return; }
  const repo = fixtureRepo(tempRoot(t));
  assert.deepEqual(discoverRepo(repo, {}), viaGit(repo));
});

test('the walk agrees with git in a nested directory, prefix included', (t) => {
  if (!hasGit()) { t.skip('git is not installed'); return; }
  const repo = fixtureRepo(tempRoot(t));
  const nested = join(repo, 'src', 'orders');
  mkdirSync(nested, { recursive: true });
  const found = discoverRepo(nested, {});
  assert.deepEqual(found, viaGit(nested));
  assert.equal(found?.prefix, 'src/orders/');
});

test('the walk agrees with git inside a linked worktree', (t) => {
  if (!hasGit()) { t.skip('git is not installed'); return; }
  const repo = fixtureRepo(tempRoot(t));
  writeFileSync(join(repo, 'seed.txt'), 'seed\n');
  spawnSync('git', ['-C', repo, 'add', '.'], { encoding: 'utf8' });
  spawnSync('git', ['-C', repo, 'commit', '-m', 'seed'], { encoding: 'utf8' });
  const linked = join(repo, '..', 'linked-wt');
  const added = spawnSync('git', ['-C', repo, 'worktree', 'add', linked, '-b', 'wt'], { encoding: 'utf8' });
  if (added.status !== 0) { t.skip('git worktree add is unavailable in this environment'); return; }
  assert.deepEqual(discoverRepo(linked, {}), viaGit(linked));
});

test('the walk declines when git environment overrides are set', (t) => {
  if (!hasGit()) { t.skip('git is not installed'); return; }
  const repo = fixtureRepo(tempRoot(t));
  for (const key of ['GIT_DIR', 'GIT_COMMON_DIR', 'GIT_WORK_TREE', 'GIT_CEILING_DIRECTORIES']) {
    assert.equal(discoverRepo(repo, { [key]: '/somewhere' }), null, `${key} must force the git fallback`);
  }
});

test('the walk returns null outside any repository', (t) => {
  const dir = tempRoot(t);
  assert.equal(discoverRepo(dir, {}), null);
});

test('gitInfoVia falls back to git when the walk declines, and agrees with it', (t) => {
  if (!hasGit()) { t.skip('git is not installed'); return; }
  const repo = fixtureRepo(tempRoot(t));
  assert.deepEqual(gitInfoVia(repo, { GIT_DIR: join(repo, '.git') }, spawnSync), viaGit(repo));
});

test('gitInfoVia answers the empty shape outside any repository', (t) => {
  const dir = tempRoot(t);
  assert.deepEqual(gitInfoVia(dir, {}, spawnSync), { repo: '', gitDir: '', prefix: '' });
});

test('gitInfoVia does not spawn when the walk succeeds', (t) => {
  if (!hasGit()) { t.skip('git is not installed'); return; }
  const repo = fixtureRepo(tempRoot(t));
  let spawns = 0;
  const counting: typeof spawnSync = ((...args: Parameters<typeof spawnSync>) => {
    spawns += 1;
    return spawnSync(...args);
  }) as typeof spawnSync;
  const found = gitInfoVia(repo, {}, counting);
  assert.equal(found.repo, repo);
  assert.equal(spawns, 0, 'the walk answered, so no subprocess should have run');
});
EOF
```

- [ ] **Step 2: Run it and see it fail.**

```bash
npx tsc -p tsconfig.json && cd build && node --test lib/git-discovery.test.js
```

Expected failure: `error TS2307: Cannot find module './git-discovery'`.

- [ ] **Step 3: Write the implementation.**

```bash
cat > src/lib/git-discovery.ts <<'EOF'
// Answering "where is the repo" without spawning git. One `git rev-parse` costs a
// measured ~32ms on a development laptop, and a hook fire that must resolve the git
// directory BEFORE it can read any cache cannot cache that cost away.
//
// This is a narrow reimplementation, and it declines every case it cannot get
// exactly right: the four GIT_* environment overrides, and any .git entry it cannot
// parse. Declining costs one spawn; guessing costs a wrong answer, which in this
// code path means routing an edit against the wrong repository. The test is
// differential against `git rev-parse` itself.
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';

export interface RepoLocation {
  repo: string;
  gitDir: string;
  prefix: string;
}

export type SpawnFn = (
  command: string,
  args: string[],
  options: { encoding: 'utf8' },
) => { status: number | null; error?: Error | undefined; stdout?: string | undefined };

export const NO_REPO: RepoLocation = { repo: '', gitDir: '', prefix: '' };

// git honours these ahead of any directory walk. Rather than reimplement that
// precedence, defer the whole question to git whenever one is present.
const OVERRIDES: readonly string[] = ['GIT_DIR', 'GIT_COMMON_DIR', 'GIT_WORK_TREE', 'GIT_CEILING_DIRECTORIES'];

export function discoverRepo(cwd: string, env: NodeJS.ProcessEnv): RepoLocation | null {
  for (const key of OVERRIDES) {
    const value = env[key];
    if (typeof value === 'string' && value !== '') return null;
  }
  // git resolves symlinks before reporting --show-toplevel, so realpath first or the
  // prefix arithmetic below disagrees with git on any symlinked checkout.
  let start: string;
  try {
    start = realpathSync(resolve(cwd));
  } catch {
    return null;
  }

  let dir = start;
  for (;;) {
    const candidate = join(dir, '.git');
    if (existsSync(candidate)) {
      const gitDir = resolveGitDir(candidate);
      if (gitDir === null) return null;
      return { repo: dir, gitDir, prefix: prefixOf(dir, start) };
    }
    const parent = resolve(dir, '..');
    if (parent === dir) return null;
    dir = parent;
  }
}

// A directory is the plain case. A file is a linked worktree or a submodule: it
// carries `gitdir: <path>`, absolute or relative to the file's own directory.
function resolveGitDir(candidate: string): string | null {
  let stats: ReturnType<typeof statSync>;
  try {
    stats = statSync(candidate);
  } catch {
    return null;
  }
  if (stats.isDirectory()) {
    try {
      return realpathSync(candidate);
    } catch {
      return null;
    }
  }
  if (!stats.isFile()) return null;
  let raw: string;
  try {
    raw = readFileSync(candidate, 'utf8');
  } catch {
    return null;
  }
  const line = raw.split('\n').find((l) => l.startsWith('gitdir:'));
  if (line === undefined) return null;
  const target = line.slice('gitdir:'.length).trim();
  if (target === '') return null;
  const base = candidate.slice(0, candidate.lastIndexOf('/'));
  const absolute = isAbsolute(target) ? target : resolve(base, target);
  try {
    return realpathSync(absolute);
  } catch {
    // The pointer names a path that is gone. git would report an error; we decline
    // and let the real git say so.
    return null;
  }
}

// git's --show-prefix: '' at the root, otherwise the relative path with a trailing
// slash and no leading one.
function prefixOf(repo: string, cwd: string): string {
  if (cwd === repo) return '';
  const rest = cwd.slice(repo.length + 1);
  return rest === '' ? '' : `${rest}/`;
}

// The public entry: the walk when it can answer, one `git rev-parse` when it cannot,
// and the empty shape when there is no repository at all.
export function gitInfoVia(cwd: string, env: NodeJS.ProcessEnv, spawn: SpawnFn): RepoLocation {
  const walked = discoverRepo(cwd, env);
  if (walked !== null) return walked;
  const result = spawn('git', ['-C', cwd, 'rev-parse', '--show-toplevel', '--absolute-git-dir', '--show-prefix'], { encoding: 'utf8' });
  if (result.error !== undefined || result.status !== 0) return NO_REPO;
  const lines = (typeof result.stdout === 'string' ? result.stdout : '').split('\n');
  return { repo: lines[0] ?? '', gitDir: lines[1] ?? '', prefix: lines[2] ?? '' };
}
EOF
```

- [ ] **Step 4: Run it and see it pass.**

```bash
npx tsc -p tsconfig.json && cd build && node --test lib/git-discovery.test.js
```

Expected: 8 passing tests (some skipped where git or `git worktree` is unavailable),
`# fail 0`. If the linked-worktree case disagrees with git, the likely cause is the
realpath of the temp directory on macOS (`/var` vs `/private/var`) — do not paper
over it by relaxing the assertion; `realpathSync(resolve(cwd))` at the top of
`discoverRepo` is what makes both sides agree, so check that it ran.

- [ ] **Step 5: Measure what the walk costs, so Task 12 has the number.**

```bash
cd /Users/ricardofagmer/projects/engineos && npx tsc -p tsconfig.json && node -e '
const { discoverRepo } = require("./build/lib/git-discovery.js");
const t0 = process.hrtime.bigint();
for (let i = 0; i < 200; i += 1) discoverRepo(process.cwd(), {});
const t1 = process.hrtime.bigint();
console.log("discoverRepo mean:", Number(t1 - t0) / 200 / 1e6, "ms");
'
```

Record the number. It replaces one 32.0 ms subprocess; if it is not at least an order
of magnitude cheaper, stop and report that rather than continuing — the rest of this
wave assumes it is.

- [ ] **Step 6: Commit.**

```bash
git add src/lib/git-discovery.ts src/lib/git-discovery.test.ts
git commit -m "$(cat <<'EOF'
feat(lib): discover the repository without spawning git

A hook fire cannot cache away its first `git rev-parse`, because the cache lives
under the git directory it is asking for. Walk up for .git instead, parsing the
gitdir: pointer for linked worktrees, and decline to GIT_DIR, GIT_COMMON_DIR,
GIT_WORK_TREE, GIT_CEILING_DIRECTORIES and any unparseable .git entry by falling
back to `git rev-parse`.

The test is differential: every fixture asserts the walk's three fields equal
git's own.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: The F5 `SessionMetadata` record, resolved in memory

This task builds the record and its resolution. Persistence, invalidation and the
SessionStart wipe are Task 6 — split so each commit stays small and so the pure
resolution is tested before any file I/O enters the picture.

**F5 is frozen, field for field:**

```ts
export interface SessionMetadata {
  repoRoot: string;
  gitDir: string | null;
  bypassActive: boolean;
  projectInstructions: string[];
  activeChangeRecords: string[];
  resolvedAtMs: number;
}
```

Wave 4 consumes this shape. Wave 5 needs two facts F5 does not carry (the repo
prefix, and whether `.engineos/changes/` exists at all as distinct from being empty).
Those ride on a private wrapper, never on `SessionMetadata` — see `### Out of scope`
in this wave's report.

**`bypassActive` is recomputed on every read, never served from the cache.**
`/engineos:bypass on` writes its marker mid-session; a cached `false` would keep the
guardrails up after the operator switched them off, which is the one failure
direction the bypass design refuses. The recompute is three `existsSync` calls
against the already-known git directory and zero subprocesses, so it is close to
free.

**Files:** `src/hooks/session-metadata.ts` (new), `src/hooks/session-metadata.test.ts`
(new), `src/hooks/bypass.ts` (edit — add `bypassActiveIn`).

**Interfaces:**

- Produces:

```ts
export interface SessionMetadata {
  repoRoot: string;
  gitDir: string | null;
  bypassActive: boolean;
  projectInstructions: string[];
  activeChangeRecords: string[];
  resolvedAtMs: number;
}

// Wave-5-private. Facts the hot hooks need that F5 does not carry.
export interface SessionRouteKeys {
  prefix: string;
  changesDirPresent: boolean;
}

export interface SessionRecord {
  metadata: SessionMetadata;
  keys: SessionRouteKeys;
  signature: string;
}

export function resolveSessionRecord(cwd: string, env: NodeJS.ProcessEnv, spawn: SpawnFn, nowMs: number): SessionRecord;
```

- Produces in `src/hooks/bypass.ts`:
  `export function bypassActiveIn(gitDirPath: string | null, env: NodeJS.ProcessEnv): boolean`
  — the same three-switch policy as `bypassActive`, against a git directory that is
  already known. `bypassActive` keeps its signature and delegates to it, so there is
  still one copy of the policy.
- Consumes: `gitInfoVia` / `RepoLocation` from Task 4, `writeFileAtomic` from Task 1
  (in Task 6).

- [ ] **Step 1: Write the failing `bypassActiveIn` test.**

```bash
cat >> src/hooks/bypass.test.ts <<'EOF'

test('bypassActiveIn honours the env switch without touching the filesystem', () => {
  assert.equal(bypassActiveIn(null, { ENGINEOS_BYPASS: '1', ENGINEOS_BYPASS_FLAG: '/nonexistent/engineos.bypass' }), true);
});

test('bypassActiveIn reports false for a null git dir with no other switch on', () => {
  assert.equal(bypassActiveIn(null, { ENGINEOS_BYPASS_FLAG: '/nonexistent/engineos.bypass' }), false);
});

test('bypassActiveIn sees a per-repo marker under a known git dir', (t) => {
  const dir = tempRoot(t);
  writeFileSync(join(dir, 'ENGINEOS_BYPASS'), '');
  assert.equal(bypassActiveIn(dir, { ENGINEOS_BYPASS_FLAG: '/nonexistent/engineos.bypass' }), true);
});

test('bypassActive and bypassActiveIn agree on the same repository', (t) => {
  if (spawnSync('git', ['--version'], { encoding: 'utf8' }).status !== 0) { t.skip('git is not installed'); return; }
  const repo = fixtureRepo(tempRoot(t));
  const env = { ENGINEOS_BYPASS_FLAG: '/nonexistent/engineos.bypass' };
  const dir = join(repo, '.git');
  assert.equal(bypassActiveIn(dir, env), bypassActive(repo, env, spawnSync));
  writeFileSync(join(dir, 'ENGINEOS_BYPASS'), '');
  assert.equal(bypassActiveIn(dir, env), bypassActive(repo, env, spawnSync));
});
EOF
```

Read the top of `src/hooks/bypass.test.ts` first and extend its import list with
`bypassActiveIn`, plus `writeFileSync`, `join`, `spawnSync`, `fixtureRepo` and
`tempRoot` if they are not already imported there.

- [ ] **Step 2: Run it and see it fail.**

```bash
npx tsc -p tsconfig.json && cd build && node --test hooks/bypass.test.js
```

Expected failure:
`error TS2305: Module '"./bypass"' has no exported member 'bypassActiveIn'.`

- [ ] **Step 3: Add `bypassActiveIn` and make `bypassActive` delegate to it.**

```bash
python3 - <<'EOF'
from pathlib import Path
p = Path('src/hooks/bypass.ts')
s = p.read_text()
old = """export function bypassActive(cwd: string, env: NodeJS.ProcessEnv, spawn: typeof spawnSync): boolean {
  if (env['ENGINEOS_BYPASS'] === '1') return true;
  if (existsSync(bypassFlagPath(env))) return true;
  const marker = bypassMarker(cwd, spawn);
  return marker !== null && existsSync(marker);
}"""
new = """// The same three switches, against a git directory the caller already resolved.
// A hot hook that holds the session record has the git dir in hand and must not
// spawn a second `git rev-parse` just to re-ask this question — and it must re-ask
// it, because /engineos:bypass writes the marker mid-session and a cached answer
// would keep the gates up after the operator switched them off.
export function bypassActiveIn(gitDirPath: string | null, env: NodeJS.ProcessEnv): boolean {
  if (env['ENGINEOS_BYPASS'] === '1') return true;
  if (existsSync(bypassFlagPath(env))) return true;
  return gitDirPath !== null && gitDirPath !== '' && existsSync(`${gitDirPath}/ENGINEOS_BYPASS`);
}

export function bypassActive(cwd: string, env: NodeJS.ProcessEnv, spawn: typeof spawnSync): boolean {
  if (env['ENGINEOS_BYPASS'] === '1') return true;
  if (existsSync(bypassFlagPath(env))) return true;
  // Resolving the git dir is the expensive half, so it stays behind the two cheap
  // switches exactly as before.
  return bypassActiveIn(gitDir(cwd === '' ? process.cwd() : cwd, spawn), env);
}"""
assert old in s
p.write_text(s.replace(old, new))
EOF
```

- [ ] **Step 4: Run it and see it pass.**

```bash
npx tsc -p tsconfig.json && cd build && node --test hooks/bypass.test.js
```

Expected: every pre-existing bypass test plus the four new ones pass, `# fail 0`.

- [ ] **Step 5: Write the failing session-record test.**

```bash
cat > src/hooks/session-metadata.test.ts <<'EOF'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fixtureRepo, tempRoot } from '../testing/harness';
import { resolveSessionRecord } from './session-metadata';

const ISOLATED: NodeJS.ProcessEnv = { ENGINEOS_BYPASS_FLAG: '/nonexistent/engineos.bypass' };

function hasGit(): boolean {
  return spawnSync('git', ['--version'], { encoding: 'utf8' }).status === 0;
}

test('the record carries exactly the six F5 fields', (t) => {
  if (!hasGit()) { t.skip('git is not installed'); return; }
  const repo = fixtureRepo(tempRoot(t));
  const { metadata } = resolveSessionRecord(repo, ISOLATED, spawnSync, 1000);
  assert.deepEqual(Object.keys(metadata).sort(), ['activeChangeRecords', 'bypassActive', 'gitDir', 'projectInstructions', 'repoRoot', 'resolvedAtMs']);
});

test('repoRoot and gitDir are the real repository, resolvedAtMs is the clock passed in', (t) => {
  if (!hasGit()) { t.skip('git is not installed'); return; }
  const repo = fixtureRepo(tempRoot(t));
  const { metadata } = resolveSessionRecord(repo, ISOLATED, spawnSync, 4242);
  assert.equal(metadata.repoRoot, repo);
  assert.equal(metadata.gitDir, join(repo, '.git'));
  assert.equal(metadata.resolvedAtMs, 4242);
});

test('gitDir is null outside a repository and repoRoot falls back to the cwd', (t) => {
  const dir = tempRoot(t);
  const { metadata } = resolveSessionRecord(dir, ISOLATED, spawnSync, 1000);
  assert.equal(metadata.gitDir, null);
  assert.equal(metadata.repoRoot, dir);
});

test('projectInstructions lists the repo-root CLAUDE.md when present', (t) => {
  if (!hasGit()) { t.skip('git is not installed'); return; }
  const repo = fixtureRepo(tempRoot(t));
  assert.deepEqual(resolveSessionRecord(repo, ISOLATED, spawnSync, 1000).metadata.projectInstructions, []);
  writeFileSync(join(repo, 'CLAUDE.md'), '# project\n');
  assert.deepEqual(resolveSessionRecord(repo, ISOLATED, spawnSync, 1000).metadata.projectInstructions, [join(repo, 'CLAUDE.md')]);
});

test('activeChangeRecords names only the records whose status is active', (t) => {
  if (!hasGit()) { t.skip('git is not installed'); return; }
  const repo = fixtureRepo(tempRoot(t));
  const changes = join(repo, '.engineos', 'changes');
  mkdirSync(changes, { recursive: true });
  writeFileSync(join(changes, '2026-09-22-open.md'), 'status:  active\n');
  writeFileSync(join(changes, '2026-09-21-closed.md'), 'status: done\n');
  const { metadata } = resolveSessionRecord(repo, ISOLATED, spawnSync, 1000);
  assert.deepEqual(metadata.activeChangeRecords, [join(changes, '2026-09-22-open.md')]);
});

test('changesDirPresent distinguishes an absent directory from an empty one', (t) => {
  if (!hasGit()) { t.skip('git is not installed'); return; }
  const repo = fixtureRepo(tempRoot(t));
  assert.equal(resolveSessionRecord(repo, ISOLATED, spawnSync, 1000).keys.changesDirPresent, false);
  mkdirSync(join(repo, '.engineos', 'changes'), { recursive: true });
  assert.equal(resolveSessionRecord(repo, ISOLATED, spawnSync, 1000).keys.changesDirPresent, true);
});

test('the prefix is git-shaped: empty at the root, trailing slash below it', (t) => {
  if (!hasGit()) { t.skip('git is not installed'); return; }
  const repo = fixtureRepo(tempRoot(t));
  const nested = join(repo, 'src', 'orders');
  mkdirSync(nested, { recursive: true });
  assert.equal(resolveSessionRecord(repo, ISOLATED, spawnSync, 1000).keys.prefix, '');
  assert.equal(resolveSessionRecord(nested, ISOLATED, spawnSync, 1000).keys.prefix, 'src/orders/');
});

test('bypassActive reflects the env switch', (t) => {
  if (!hasGit()) { t.skip('git is not installed'); return; }
  const repo = fixtureRepo(tempRoot(t));
  assert.equal(resolveSessionRecord(repo, ISOLATED, spawnSync, 1000).metadata.bypassActive, false);
  assert.equal(resolveSessionRecord(repo, { ...ISOLATED, ENGINEOS_BYPASS: '1' }, spawnSync, 1000).metadata.bypassActive, true);
});

test('the signature changes when a change record is edited in place', (t) => {
  if (!hasGit()) { t.skip('git is not installed'); return; }
  const repo = fixtureRepo(tempRoot(t));
  const changes = join(repo, '.engineos', 'changes');
  mkdirSync(changes, { recursive: true });
  const record = join(changes, '2026-09-22-open.md');
  writeFileSync(record, 'status: active\n');
  const before = resolveSessionRecord(repo, ISOLATED, spawnSync, 1000).signature;
  writeFileSync(record, 'status: done\n');
  assert.notEqual(resolveSessionRecord(repo, ISOLATED, spawnSync, 1000).signature, before);
});

test('the signature changes when a project instruction file appears', (t) => {
  if (!hasGit()) { t.skip('git is not installed'); return; }
  const repo = fixtureRepo(tempRoot(t));
  const before = resolveSessionRecord(repo, ISOLATED, spawnSync, 1000).signature;
  writeFileSync(join(repo, 'CLAUDE.md'), '# project\n');
  assert.notEqual(resolveSessionRecord(repo, ISOLATED, spawnSync, 1000).signature, before);
});

test('the signature is stable across two resolutions with nothing changed', (t) => {
  if (!hasGit()) { t.skip('git is not installed'); return; }
  const repo = fixtureRepo(tempRoot(t));
  mkdirSync(join(repo, '.engineos', 'changes'), { recursive: true });
  writeFileSync(join(repo, '.engineos', 'changes', 'a.md'), 'status: active\n');
  assert.equal(
    resolveSessionRecord(repo, ISOLATED, spawnSync, 1000).signature,
    resolveSessionRecord(repo, ISOLATED, spawnSync, 2000).signature,
  );
});
EOF
```

- [ ] **Step 6: Run it and see it fail.**

```bash
npx tsc -p tsconfig.json && cd build && node --test hooks/session-metadata.test.js
```

Expected failure: `error TS2307: Cannot find module './session-metadata'`.

- [ ] **Step 7: Write the implementation.**

```bash
cat > src/hooks/session-metadata.ts <<'EOF'
// F5: the per-session facts every hot hook needs, resolved once.
//
// Today route-before-change, mark-unrecorded and the two agent-announcement hooks
// each re-derive the same things on every fire — two `git rev-parse` spawns apiece
// at a measured ~32ms each, plus an upward CLAUDE.md walk and a full read of every
// change record. None of that changes within a session except the two things this
// module watches: the change records and the project instruction files.
//
// SessionMetadata is a FROZEN interface (program plan F5) — Wave 4 codes against it.
// Facts Wave 5 needs that F5 does not carry ride on SessionRouteKeys instead.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gitInfoVia, type SpawnFn } from '../lib/git-discovery';
import { bypassActiveIn } from './bypass';

export interface SessionMetadata {
  repoRoot: string;
  gitDir: string | null;
  bypassActive: boolean;
  projectInstructions: string[];
  activeChangeRecords: string[];
  resolvedAtMs: number;
}

// Wave-5-private, deliberately NOT part of F5.
export interface SessionRouteKeys {
  // git's --show-prefix for the cwd the record was resolved from.
  prefix: string;
  // An absent .engineos/changes is a repository that does not use change records;
  // an empty one is a repository that does and has none open. Only the second
  // earns the reminder, and activeChangeRecords: string[] cannot tell them apart.
  changesDirPresent: boolean;
}

export interface SessionRecord {
  metadata: SessionMetadata;
  keys: SessionRouteKeys;
  // Per-file mtime and size over everything the record depends on. A directory
  // mtime is NOT enough: editing `status: active` to `status: done` in place leaves
  // the containing directory's mtime untouched on APFS and ext4, and serving that
  // stale answer is exactly the failure F5 forbids.
  signature: string;
}

// The project instruction files, in the order a reader would apply them.
const INSTRUCTION_FILES: readonly string[] = ['CLAUDE.md', 'AGENTS.md'];

// grep -l '^status:[[:space:]]*active' over one change record. The class is the
// horizontal whitespace of a single line, matching route-before-change's own regex.
const ACTIVE_RECORD = /^status:[ \t\f\v\r]*active/m;

export function resolveSessionRecord(cwd: string, env: NodeJS.ProcessEnv, spawn: SpawnFn, nowMs: number): SessionRecord {
  const location = gitInfoVia(cwd === '' ? process.cwd() : cwd, env, spawn);
  const inRepo = location.repo !== '';
  const repoRoot = inRepo ? location.repo : (cwd === '' ? process.cwd() : cwd);
  const gitDir = location.gitDir === '' ? null : location.gitDir;

  const instructions = instructionFiles(repoRoot);
  const changes = changeRecords(repoRoot);

  return {
    metadata: {
      repoRoot,
      gitDir,
      bypassActive: bypassActiveIn(gitDir, env),
      projectInstructions: instructions.paths,
      activeChangeRecords: changes.active,
      resolvedAtMs: nowMs,
    },
    keys: {
      prefix: inRepo ? location.prefix : '',
      changesDirPresent: changes.present,
    },
    signature: [...instructions.stamps, ...changes.stamps].join('|'),
  };
}

function stamp(path: string): string {
  try {
    const stats = statSync(path);
    return `${path}:${Math.floor(stats.mtimeMs)}:${stats.size}`;
  } catch {
    // Absent is itself a fact worth stamping: a CLAUDE.md that appears mid-session
    // must invalidate the record, and it can only do that if its absence was recorded.
    return `${path}:absent`;
  }
}

function instructionFiles(repoRoot: string): { paths: string[]; stamps: string[] } {
  const paths: string[] = [];
  const stamps: string[] = [];
  for (const name of INSTRUCTION_FILES) {
    const path = join(repoRoot, name);
    const line = stamp(path);
    stamps.push(line);
    if (!line.endsWith(':absent')) paths.push(path);
  }
  return { paths, stamps };
}

function changeRecords(repoRoot: string): { active: string[]; present: boolean; stamps: string[] } {
  const dir = join(repoRoot, '.engineos', 'changes');
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return { active: [], present: false, stamps: [`${dir}:absent`] };
  }
  const active: string[] = [];
  // Sorted so the signature is a function of the directory's contents, not of the
  // order the filesystem happened to hand them back.
  const stamps: string[] = [`${dir}:present`];
  for (const name of names.slice().sort()) {
    if (!name.endsWith('.md') || name.startsWith('_')) continue;
    const path = join(dir, name);
    stamps.push(stamp(path));
    try {
      if (ACTIVE_RECORD.test(readFileSync(path, 'utf8'))) active.push(path);
    } catch {
      // A record that cannot be read is not an active record. It is also stamped
      // above, so a later successful read invalidates and reconsiders it.
    }
  }
  return { active, present: true, stamps };
}
EOF
```

- [ ] **Step 8: Run it and see it pass.**

```bash
npx tsc -p tsconfig.json && cd build && node --test hooks/session-metadata.test.js hooks/bypass.test.js
```

Expected: 11 session-metadata tests plus the bypass suite pass, `# fail 0`.

- [ ] **Step 9: Commit.**

```bash
git add src/hooks/session-metadata.ts src/hooks/session-metadata.test.ts src/hooks/bypass.ts src/hooks/bypass.test.ts
git commit -m "$(cat <<'EOF'
feat(hooks): resolve the F5 session record in memory

SessionMetadata carries the six frozen fields exactly; the prefix and the
changes-directory-present bit ride on a Wave-5-private SessionRouteKeys so F5
stays the shape Wave 4 codes against.

bypassActiveIn applies the same three-switch policy against an already-known git
directory, so a hook holding the record re-asks the bypass question with three
existsSync calls and no subprocess. Recomputing rather than caching it is
deliberate: /engineos:bypass writes its marker mid-session.

The invalidation signature stamps each file's mtime and size, not the containing
directory's: editing status: active to done in place leaves the directory mtime
untouched on APFS and ext4.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Persist, invalidate and wipe the session record

**Where it lives.** `<gitDir>/engineos-session/<session-id-slug>.json` — under the git
directory so it is per-worktree and never committed, and deliberately NOT under
`engineos-telemetry/`, because `ENGINEOS_TELEMETRY=0` promises to leave no trace and
the session record must work regardless of that switch.

**How it goes stale.** Three ways, all of which must be caught:

1. **A new session.** SessionStart wipes the whole `engineos-session` tree, exactly as
   it already wipes `engineos-route-cache`.
2. **A change record appears, disappears, or is edited in place.** Caught by the
   per-file `mtime:size` stamps from Task 5, which is why the directory mtime alone
   was rejected.
3. **A project instruction file appears, disappears, or changes.** Same mechanism.

A stale record is recomputed. It is never served as fresh — that is F5's own wording,
and the e2e test below is what proves it across real process boundaries rather than
within one test's memory.

**Files:** `src/hooks/session-metadata.ts` (edit), `src/hooks/session-metadata.test.ts`
(edit), `src/hooks/session-metadata.e2e.test.ts` (new),
`src/hooks/ensure-project-layout.ts` (edit),
`src/hooks/ensure-project-layout.test.ts` (edit).

**Interfaces:**

- Produces:
  `export function sessionRecordPath(gitDirPath: string, sessionId: string): string`
  and
  `export function sessionRecord(cwd: string, sessionId: string, env: NodeJS.ProcessEnv, spawn: SpawnFn, nowMs: number): SessionRecord`
  — the cached entry point every hot hook calls. A hit validates the signature and
  recomputes `bypassActive`; a miss or a signature mismatch resolves and persists.
- Produces: `export const SESSION_DIR = 'engineos-session'` — imported by
  `ensure-project-layout.ts` so the wipe and the write can never name different
  directories.
- Consumes: `writeFileAtomic` (Task 1), `resolveSessionRecord` (Task 5),
  `hookPathSlug` from `src/lib/slug.ts` (the existing narrowing that drops `.` and `/`
  from the slug class — a session id must never become a path component without it).

- [ ] **Step 1: Write the failing caching tests.**

```bash
cat >> src/hooks/session-metadata.test.ts <<'EOF'

test('a second call with nothing changed serves the persisted record', (t) => {
  if (!hasGit()) { t.skip('git is not installed'); return; }
  const repo = fixtureRepo(tempRoot(t));
  const first = sessionRecord(repo, 'sid-1', ISOLATED, spawnSync, 1000);
  const second = sessionRecord(repo, 'sid-1', ISOLATED, spawnSync, 9999);
  // resolvedAtMs is the tell: a recompute would have stamped 9999.
  assert.equal(second.metadata.resolvedAtMs, 1000);
  assert.deepEqual(second.metadata, first.metadata);
});

test('the record file lands under engineos-session, not engineos-telemetry', (t) => {
  if (!hasGit()) { t.skip('git is not installed'); return; }
  const repo = fixtureRepo(tempRoot(t));
  sessionRecord(repo, 'sid-1', ISOLATED, spawnSync, 1000);
  assert.equal(existsSync(sessionRecordPath(join(repo, '.git'), 'sid-1')), true);
  assert.equal(existsSync(join(repo, '.git', 'engineos-telemetry')), false);
});

test('editing a change record in place invalidates the cached record', (t) => {
  if (!hasGit()) { t.skip('git is not installed'); return; }
  const repo = fixtureRepo(tempRoot(t));
  const changes = join(repo, '.engineos', 'changes');
  mkdirSync(changes, { recursive: true });
  const record = join(changes, '2026-09-22-open.md');
  writeFileSync(record, 'status: active\n');
  const first = sessionRecord(repo, 'sid-2', ISOLATED, spawnSync, 1000);
  assert.deepEqual(first.metadata.activeChangeRecords, [record]);
  writeFileSync(record, 'status: done  \n');
  const second = sessionRecord(repo, 'sid-2', ISOLATED, spawnSync, 2000);
  assert.deepEqual(second.metadata.activeChangeRecords, []);
  assert.equal(second.metadata.resolvedAtMs, 2000, 'a stale record must be recomputed, never served as fresh');
});

test('a CLAUDE.md appearing mid-session invalidates the cached record', (t) => {
  if (!hasGit()) { t.skip('git is not installed'); return; }
  const repo = fixtureRepo(tempRoot(t));
  sessionRecord(repo, 'sid-3', ISOLATED, spawnSync, 1000);
  writeFileSync(join(repo, 'CLAUDE.md'), '# project\n');
  const second = sessionRecord(repo, 'sid-3', ISOLATED, spawnSync, 2000);
  assert.deepEqual(second.metadata.projectInstructions, [join(repo, 'CLAUDE.md')]);
  assert.equal(second.metadata.resolvedAtMs, 2000);
});

test('bypassActive is recomputed on a cache hit, never served from the file', (t) => {
  if (!hasGit()) { t.skip('git is not installed'); return; }
  const repo = fixtureRepo(tempRoot(t));
  assert.equal(sessionRecord(repo, 'sid-4', ISOLATED, spawnSync, 1000).metadata.bypassActive, false);
  writeFileSync(join(repo, '.git', 'ENGINEOS_BYPASS'), '');
  const hit = sessionRecord(repo, 'sid-4', ISOLATED, spawnSync, 2000);
  assert.equal(hit.metadata.bypassActive, true, '/engineos:bypass must take effect mid-session');
  assert.equal(hit.metadata.resolvedAtMs, 1000, 'the bypass switch alone must not force a full recompute');
});

test('two session ids get two records', (t) => {
  if (!hasGit()) { t.skip('git is not installed'); return; }
  const repo = fixtureRepo(tempRoot(t));
  sessionRecord(repo, 'sid-a', ISOLATED, spawnSync, 1000);
  sessionRecord(repo, 'sid-b', ISOLATED, spawnSync, 1000);
  assert.equal(readdirSync(join(repo, '.git', 'engineos-session')).length, 2);
});

test('a corrupt record file is a miss, not a failure', (t) => {
  if (!hasGit()) { t.skip('git is not installed'); return; }
  const repo = fixtureRepo(tempRoot(t));
  sessionRecord(repo, 'sid-5', ISOLATED, spawnSync, 1000);
  writeFileSync(sessionRecordPath(join(repo, '.git'), 'sid-5'), 'not json at all');
  assert.equal(sessionRecord(repo, 'sid-5', ISOLATED, spawnSync, 2000).metadata.resolvedAtMs, 2000);
});

test('a session id with path separators cannot escape the session directory', (t) => {
  if (!hasGit()) { t.skip('git is not installed'); return; }
  const repo = fixtureRepo(tempRoot(t));
  const path = sessionRecordPath(join(repo, '.git'), '../../../etc/passwd');
  assert.equal(path.includes('..'), false, 'the slug must drop path traversal, not carry it');
  assert.equal(path.startsWith(join(repo, '.git', 'engineos-session')), true);
});

test('outside a repository nothing is persisted and the record still resolves', (t) => {
  const dir = tempRoot(t);
  const record = sessionRecord(dir, 'sid-6', ISOLATED, spawnSync, 1000);
  assert.equal(record.metadata.gitDir, null);
  assert.equal(sessionRecord(dir, 'sid-6', ISOLATED, spawnSync, 2000).metadata.resolvedAtMs, 2000);
});
EOF
```

Extend that file's import list with `sessionRecord`, `sessionRecordPath` from
`./session-metadata`, and `existsSync`, `readdirSync` from `node:fs`.

- [ ] **Step 2: Run it and see it fail.**

```bash
npx tsc -p tsconfig.json && cd build && node --test hooks/session-metadata.test.js
```

Expected failure:
`error TS2305: Module '"./session-metadata"' has no exported member 'sessionRecord'.`

- [ ] **Step 3: Add persistence and invalidation.**

```bash
python3 - <<'EOF'
from pathlib import Path
p = Path('src/hooks/session-metadata.ts')
s = p.read_text()
s = s.replace(
  "import { readFileSync, readdirSync, statSync } from 'node:fs';",
  "import { readFileSync, readdirSync, statSync } from 'node:fs';\nimport { writeFileAtomic } from '../lib/atomic-write';\nimport { isRecord } from '../lib/json';\nimport { hookPathSlug } from '../lib/slug';")
s += '''
// Under the git directory: per-worktree for free, never committed. Deliberately NOT
// under engineos-telemetry — ENGINEOS_TELEMETRY=0 promises to leave no trace, and
// the session record has to work either way. SessionStart wipes this tree, which is
// what makes a new session a guaranteed miss.
export const SESSION_DIR = 'engineos-session';

export function sessionRecordPath(gitDirPath: string, sessionId: string): string {
  // hookPathSlug drops '.' and '/' from the slug class: a session id arrives from
  // the harness and must never become a path component on trust.
  const slug = hookPathSlug(sessionId);
  return join(gitDirPath, SESSION_DIR, `${slug === '' ? 'nosession' : slug}.json`);
}

// The entry point every hot hook calls. A hit whose signature still matches is
// returned with bypassActive recomputed; anything else resolves and persists.
export function sessionRecord(cwd: string, sessionId: string, env: NodeJS.ProcessEnv, spawn: SpawnFn, nowMs: number): SessionRecord {
  const fresh = (): SessionRecord => resolveSessionRecord(cwd, env, spawn, nowMs);

  // The git dir is the cache's own address, so it has to be resolved before the
  // cache can be consulted. Task 4's walk is what makes that affordable.
  const located = gitInfoVia(cwd === '' ? process.cwd() : cwd, env, spawn);
  if (located.gitDir === '') return fresh();

  const path = sessionRecordPath(located.gitDir, sessionId);
  const cached = readRecord(path);
  if (cached !== null && cached.signature === currentSignature(located.repo)) {
    return {
      ...cached,
      // Never from the file: /engineos:bypass writes its marker mid-session and a
      // cached false would keep the gates up after the operator switched them off.
      metadata: { ...cached.metadata, bypassActive: bypassActiveIn(located.gitDir, env) },
    };
  }

  const resolved = fresh();
  writeFileAtomic(path, `${JSON.stringify(resolved)}\\n`);
  return resolved;
}

function readRecord(path: string): SessionRecord | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    // Absent, unreadable, or half a file somebody truncated: all the same answer,
    // which is a miss. A miss costs one recompute; a throw costs the edit.
    return null;
  }
  if (!isRecord(parsed)) return null;
  const { metadata, keys, signature } = parsed;
  if (!isRecord(metadata) || !isRecord(keys) || typeof signature !== 'string') return null;
  if (
    typeof metadata['repoRoot'] !== 'string' ||
    typeof metadata['bypassActive'] !== 'boolean' ||
    typeof metadata['resolvedAtMs'] !== 'number' ||
    !Array.isArray(metadata['projectInstructions']) ||
    !Array.isArray(metadata['activeChangeRecords']) ||
    typeof keys['prefix'] !== 'string' ||
    typeof keys['changesDirPresent'] !== 'boolean'
  ) {
    return null;
  }
  const gitDirValue = metadata['gitDir'];
  if (gitDirValue !== null && typeof gitDirValue !== 'string') return null;
  return {
    metadata: {
      repoRoot: metadata['repoRoot'],
      gitDir: gitDirValue,
      bypassActive: metadata['bypassActive'],
      projectInstructions: metadata['projectInstructions'].filter((v): v is string => typeof v === 'string'),
      activeChangeRecords: metadata['activeChangeRecords'].filter((v): v is string => typeof v === 'string'),
      resolvedAtMs: metadata['resolvedAtMs'],
    },
    keys: { prefix: keys['prefix'], changesDirPresent: keys['changesDirPresent'] },
    signature,
  };
}

function currentSignature(repoRoot: string): string {
  return [...instructionFiles(repoRoot).stamps, ...changeRecords(repoRoot).stamps].join('|');
}
'''
p.write_text(s)
EOF
```

Note the trade this makes explicit: a cache hit re-stats the instruction files and
the change records to compute `currentSignature`. That is a handful of `statSync`
calls — measured well under a millisecond — against the alternative of trusting a
stale answer, which F5 forbids. It still avoids the two `git rev-parse` spawns, the
full read of every change record, and the upward instruction walk.

- [ ] **Step 4: Run it and see it pass.**

```bash
npx tsc -p tsconfig.json && cd build && node --test hooks/session-metadata.test.js
```

Expected: 20 passing tests, `# fail 0`. If `hookPathSlug` is not exported from
`src/lib/slug.ts`, read that file and use the export that drops `.` and `/`; do not
add a new one.

- [ ] **Step 5: Wipe the tree at SessionStart.**

```bash
python3 - <<'EOF'
from pathlib import Path
p = Path('src/hooks/ensure-project-layout.ts')
s = p.read_text()
s = s.replace(
  "const ROUTE_CACHE = 'engineos-route-cache';",
  "const ROUTE_CACHE = 'engineos-route-cache';")
s = s.replace(
  """    wipeTree(join(git, ROUTE_CACHE));""",
  """    wipeTree(join(git, ROUTE_CACHE));
    // F5's first invalidation rule: a new session never inherits the previous
    // session's resolved metadata. Imported from session-metadata so the wipe and
    // the write can never name different directories.
    wipeTree(join(git, SESSION_DIR));""")
s = s.replace(
  "import { bypassMarker } from './bypass';",
  "import { bypassMarker } from './bypass';\nimport { SESSION_DIR } from './session-metadata';")
p.write_text(s)
EOF
grep -n "SESSION_DIR" src/hooks/ensure-project-layout.ts
```

If the `bypassMarker` import line differs, insert the `SESSION_DIR` import next to the
other `./` hook imports by hand — the assertion to keep is that the constant is
imported, never re-spelled.

- [ ] **Step 6: Assert the wipe with a test.**

```bash
cat >> src/hooks/ensure-project-layout.test.ts <<'EOF'

test('SessionStart wipes the session metadata tree', (t) => {
  if (spawnSync('git', ['--version'], { encoding: 'utf8' }).status !== 0) { t.skip('git is not installed'); return; }
  const repo = fixtureRepo(tempRoot(t));
  const stale = join(repo, '.git', 'engineos-session', 'sid-old.json');
  mkdirSync(join(repo, '.git', 'engineos-session'), { recursive: true });
  writeFileSync(stale, '{"signature":"stale"}');
  run(sessionStartPayload(repo), sessionStartContext());
  assert.equal(existsSync(stale), false, 'a new session must not inherit the previous session record');
});
EOF
```

Read the existing tests in that file first and reuse their payload/context helpers
under whatever names they actually have — `sessionStartPayload` and
`sessionStartContext` above are placeholders for the file's own idiom, and the test
must be rewritten to match it before it is run.

- [ ] **Step 7: Write the cross-process staleness e2e test.**

The unit tests above prove invalidation within one process. Only separate processes
prove that the record on disk, written by one hook fire and read by the next, is
invalidated — which is the case that actually occurs in a session.

```bash
cat > src/hooks/session-metadata.e2e.test.ts <<'EOF'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkoutRoot, fixtureRepo, tempRoot } from '../testing/harness';

const BUNDLE = join(checkoutRoot(), 'dist', 'engineos-hook.cjs');

function hasGit(): boolean {
  return spawnSync('git', ['--version'], { encoding: 'utf8' }).status === 0;
}

// One real hook fire, in its own process, through the shipped bundle.
function fire(repo: string, file: string, sid: string): string {
  const payload = JSON.stringify({ cwd: repo, session_id: sid, tool_name: 'Edit', tool_input: { file_path: file } });
  const r = spawnSync('node', [BUNDLE, 'hook', 'route-before-change'], {
    input: payload,
    encoding: 'utf8',
    env: {
      PATH: process.env['PATH'] ?? '',
      HOME: process.env['HOME'] ?? '',
      ENGINEOS_BYPASS_FLAG: '/nonexistent/engineos.bypass',
      ENGINEOS_TELEMETRY: '0',
    },
  });
  return typeof r.stdout === 'string' ? r.stdout : '';
}

test('a change record closed between two hook fires is seen by the second', (t) => {
  if (!hasGit()) { t.skip('git is not installed'); return; }
  if (!existsSync(BUNDLE)) { t.skip('dist/engineos-hook.cjs is not built'); return; }
  const repo = fixtureRepo(tempRoot(t));
  const changes = join(repo, '.engineos', 'changes');
  mkdirSync(changes, { recursive: true });
  const record = join(changes, '2026-09-22-open.md');
  writeFileSync(record, 'status: active\n');
  const edit = join(repo, 'src', 'orders.ts');

  const first = fire(repo, edit, 'e2e-stale');
  assert.equal(first.includes('no active .engineos/changes record'), false, 'an active record means no reminder');

  writeFileSync(record, 'status: done\n');
  const second = fire(repo, edit, 'e2e-stale');
  assert.match(second, /no active \.engineos\/changes record/, 'the closed record must invalidate the session record across processes');
});

test('a CLAUDE.md written between two hook fires reaches the second', (t) => {
  if (!hasGit()) { t.skip('git is not installed'); return; }
  if (!existsSync(BUNDLE)) { t.skip('dist/engineos-hook.cjs is not built'); return; }
  const repo = fixtureRepo(tempRoot(t));
  const edit = join(repo, 'lib', 'paragraph', 'split.ts');
  fire(repo, edit, 'e2e-claude');
  writeFileSync(join(repo, 'CLAUDE.md'), '# project\n');
  assert.match(fire(repo, edit, 'e2e-claude'), /follow project CLAUDE\.md/);
});

test('ENGINEOS_TELEMETRY=0 leaves no telemetry directory behind', (t) => {
  if (!hasGit()) { t.skip('git is not installed'); return; }
  if (!existsSync(BUNDLE)) { t.skip('dist/engineos-hook.cjs is not built'); return; }
  const repo = fixtureRepo(tempRoot(t));
  fire(repo, join(repo, 'src', 'orders.ts'), 'e2e-telemetry');
  assert.equal(existsSync(join(repo, '.git', 'engineos-telemetry')), false);
  assert.equal(existsSync(join(repo, '.git', 'engineos-session')), true, 'the session record is not telemetry and must survive the switch');
});
EOF
```

- [ ] **Step 8: Run the e2e and see it fail.**

```bash
npm run build && npx tsc -p tsconfig.json && cd build && node --test hooks/session-metadata.e2e.test.js
```

Expected failure: the first two tests fail, because `route-before-change` does not
consume the session record yet — it still walks for `CLAUDE.md` and reads the change
records itself, so nothing is being invalidated and the assertions about the *second*
fire are the ones that go red. The third test should already pass. **Leave the two
red tests red and commit them in Task 7**, which is the task that makes them green;
do not weaken them here.

- [ ] **Step 9: Run everything that should be green now, then commit.**

```bash
npx tsc -p tsconfig.json && cd build && node --test hooks/session-metadata.test.js hooks/ensure-project-layout.test.js
```

Expected: `# fail 0`.

```bash
git add src/hooks/session-metadata.ts src/hooks/session-metadata.test.ts src/hooks/session-metadata.e2e.test.ts src/hooks/ensure-project-layout.ts src/hooks/ensure-project-layout.test.ts
git commit -m "$(cat <<'EOF'
feat(hooks): persist and invalidate the session record

The record lands under <gitDir>/engineos-session, wiped at SessionStart beside
the route cache, and validated on every read against the per-file mtime/size
signature over the change records and the project instruction files. A stale
record is recomputed; it is never served as fresh.

bypassActive is recomputed on a hit rather than read from the file, so
/engineos:bypass still takes effect mid-session.

The e2e suite lands with two tests red on purpose: route-before-change does not
consume the record until the next commit, and a staleness test that has never
been seen red has not been seen.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Rewire `route-before-change` onto the session record

This is the hook the wave is measured on. Today one fire costs two `git rev-parse`
spawns (one inside `bypassActive`, one for `gitInfo`), an upward `CLAUDE.md` walk from
the edited file, and a `readdirSync` plus a full `readFileSync` of every change
record. After this task it costs one session-record read: a spawn-free discovery, a
handful of `statSync` calls for the signature, and three `existsSync` calls for the
bypass switch.

**Two behaviours must not change**, and the existing suite is what proves it:

1. **The `CLAUDE.md` answer.** Today's `findUpFile(start, 'CLAUDE.md')` walks up from
   the *edited file's* directory, which can find a nested `CLAUDE.md` that the
   repo-root-anchored `projectInstructions` does not. Keep a bounded walk from the
   edited file's directory that stops at `repoRoot`, and fall through to
   `projectInstructions[0]` at the root. Identical answers, with the repeated part
   resolved once.
2. **The change-record reminder fires only when the directory exists and holds no
   active record** — which is why `changesDirPresent` exists, since
   `activeChangeRecords: []` alone cannot tell "no directory" from "directory, none
   open".

**Files:** `src/hooks/route-before-change.ts` (edit).

**Interfaces:**

- Consumes: `sessionRecord`, `SessionRecord` from `./session-metadata`.
- Produces: no new exports. The hook's `run(env, ctx)` signature is unchanged.
- The two `git rev-parse` calls and the private `gitInfo` / `NO_GIT` / `hasActiveRecord`
  helpers are removed; `cachePaths` and `cacheRel` now take the record's
  `{ repo, gitDir, prefix }` instead of a `GitInfo`.

- [ ] **Step 1: Confirm the two e2e tests from Task 6 are still red.**

```bash
npm run build && npx tsc -p tsconfig.json && cd build && node --test hooks/session-metadata.e2e.test.js
```

Expected: 2 failing, 1 passing. These are the tests this task turns green. If they
are already green, stop — something in Task 6 made them pass for the wrong reason.

- [ ] **Step 2: Add the record-consuming test to the hook's own suite.**

```bash
cat >> src/hooks/route-before-change.test.ts <<'EOF'

test('a nested CLAUDE.md still outranks the repo-root one', (t) => {
  if (!hasGit()) { t.skip('git is not installed'); return; }
  const repo = fixtureRepo(tempRoot(t));
  writeFileSync(join(repo, 'CLAUDE.md'), '# root\n');
  const nested = join(repo, 'packages', 'app');
  mkdirSync(nested, { recursive: true });
  const nestedClaude = join(nested, 'CLAUDE.md');
  writeFileSync(nestedClaude, '# nested\n');
  const decision = run(payload(join(nested, 'lib', 'paragraph', 'split.ts'), { cwd: repo }), ctxWith());
  assert.deepEqual(decision, context('PreToolUse', `[router] base.md+git.md only | follow project CLAUDE.md (project > EngineOS): ${nestedClaude}`));
});

test('the hook resolves the repository without spawning git', (t) => {
  if (!hasGit()) { t.skip('git is not installed'); return; }
  const repo = fixtureRepo(tempRoot(t));
  let spawns = 0;
  const counting = ((...args: Parameters<typeof spawnSync>) => {
    spawns += 1;
    return spawnSync(...args);
  }) as typeof spawnSync;
  run(payload(join(repo, 'api', 'user.controller.ts'), { cwd: repo, sid: 'no-spawn' }), { ...ctxWith(), spawn: counting });
  assert.equal(spawns, 0, 'both git rev-parse calls must be gone from the hot path');
});

test('a change record closed mid-session is seen on the next fire', (t) => {
  if (!hasGit()) { t.skip('git is not installed'); return; }
  const repo = fixtureRepo(tempRoot(t));
  const changes = join(repo, '.engineos', 'changes');
  mkdirSync(changes, { recursive: true });
  const record = join(changes, 'open.md');
  writeFileSync(record, 'status: active\n');
  const edit = payload(join(repo, 'lib', 'paragraph', 'split.ts'), { cwd: repo, sid: 'reopen' });
  assert.deepEqual(run(edit, ctxWith()), silent);
  writeFileSync(record, 'status: done\n');
  assert.deepEqual(
    run(edit, ctxWith()),
    context('PreToolUse', '[router] base.md+git.md only | no active .engineos/changes record — open one (.engineos/changes/_template.md)'),
  );
});
EOF
```

Extend that file's imports with `mkdirSync` from `node:fs` if it is not already
there.

- [ ] **Step 3: Run it and see the new tests fail.**

```bash
npx tsc -p tsconfig.json && cd build && node --test hooks/route-before-change.test.js
```

Expected: the nested-`CLAUDE.md` and closed-record tests pass already (today's code
handles both), and `the hook resolves the repository without spawning git` fails with
`Expected values to be strictly equal: 2 !== 0` — two spawns is exactly the cost this
task removes.

- [ ] **Step 4: Rewire the hook.**

Replace the imports, the `GitInfo` block and the body of `run` as follows, leaving
`kernelGuide`, `readGuide`, `readDecision`, `cacheRel`, `routingSignature`,
`dirOf`, `EXCLUDED_SENTINEL`, `DEFAULT_GUIDE`, `CHANGE_RECORD_NOTE` and
`CODE_EXTENSIONS` untouched:

```ts
// --- imports: drop bypassActive and findUpFile, add the session record ---
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { lazyRegistries, type KernelContext } from '../kernel/context';
import { resolve } from '../kernel/resolve';
import { writeFileAtomic } from '../lib/atomic-write';
import { isRecord } from '../lib/json';
import { sessionRecord, type SessionRecord } from './session-metadata';
import { routeCachePaths, type RouteCachePaths } from './cache';
import { context, silent, type HookContext, type HookDecision } from './output';
import type { HookEnvelope } from './envelope';

export function run(env: HookEnvelope, ctx: HookContext): HookDecision {
  if (env.file === '') return silent;
  const start = dirOf(env.file);
  // bash `${HOOK_CWD:-$START}`: a payload without cwd is answered from the
  // edited file's own directory, which is the repo the edit lands in.
  const from = env.cwd === '' ? start : env.cwd;

  // One resolution for every per-session fact this hook needs. It replaces two
  // `git rev-parse` spawns, the upward CLAUDE.md walk and a full read of every
  // change record — see ./session-metadata for what it caches and how it expires.
  const session = sessionRecord(from, env.sessionId, ctx.io.env, ctx.spawn, ctx.now());

  // Before any kernel work, any cache work and any filesystem walk: a bypassed
  // session must cost nothing and say nothing. bypassActive is recomputed on
  // every read of the record, never served from it.
  if (session.metadata.bypassActive) return silent;

  const cache = cachePaths(env, session, ctx);

  // A path's route is immutable until routing.json changes, so the compact
  // answer is cached per session in the worktree git dir (see ./cache for the
  // key). A hit skips the kernel entirely — that is the budget this hook is
  // measured against in src/bench/run.ts.
  let guide = cache === null ? null : readGuide(cache.route);
  if (guide === null) {
    guide = kernelGuide(env.file, ctx);
    if (cache !== null) writeFileAtomic(cache.route, `${guide}\n`);
  }
  if (guide === EXCLUDED_SENTINEL) return silent;

  const projectClaude = nearestInstruction(start, session);
  const projectNote = projectClaude === null ? '' : ` | follow project CLAUDE.md (project > EngineOS): ${projectClaude}`;
  const changeNote = changeRecordNote(env.file, session);

  if (guide === '' && projectNote === '' && changeNote === '') return silent;

  // The two notes are the only dynamic part of the message, so the decision may
  // be reused verbatim exactly when neither of them applies.
  const reusable = projectNote === '' && changeNote === '' ? cache : null;
  if (reusable !== null) {
    const cached = readDecision(reusable.output);
    if (cached !== null) return cached;
  }

  const decision = context('PreToolUse', `[router] ${guide === '' ? DEFAULT_GUIDE : guide}${projectNote}${changeNote}`);
  if (reusable !== null) writeFileAtomic(reusable.output, `${JSON.stringify(decision)}\n`);
  return decision;
}

// The nearest CLAUDE.md at or above the edited file, bounded by the repo root. A
// monorepo package's own CLAUDE.md outranks the repo's, so the walk stays — but it
// stops at repoRoot and hands off to the session record there, so the repeated part
// of yesterday's unbounded findUpFile is resolved once per session, not per edit.
function nearestInstruction(start: string, session: SessionRecord): string | null {
  const root = session.metadata.repoRoot;
  let dir = start;
  for (;;) {
    if (root !== '' && dir === root) break;
    const candidate = join(dir, 'CLAUDE.md');
    if (existsSync(candidate)) return candidate;
    const parent = dirOf(dir);
    if (parent === dir || parent === '.' || parent === '/') break;
    dir = parent;
  }
  for (const path of session.metadata.projectInstructions) {
    if (path.endsWith('/CLAUDE.md')) return path;
  }
  return null;
}

// Soft reminder: a code edit with no active change record. changesDirPresent is
// what separates "this repo does not use change records" (silence) from "it does
// and none is open" (the reminder) — activeChangeRecords being empty cannot.
function changeRecordNote(file: string, session: SessionRecord): string {
  if (session.metadata.repoRoot === '' || !session.keys.changesDirPresent) return '';
  if (!CODE_EXTENSIONS.some((extension) => file.endsWith(extension))) return '';
  return session.metadata.activeChangeRecords.length === 0 ? CHANGE_RECORD_NOTE : '';
}

// The edited file as a repo-relative path. Unchanged logic; it now reads the three
// fields off the session record instead of a per-fire `git rev-parse`.
function cachePaths(env: HookEnvelope, session: SessionRecord, ctx: HookContext): RouteCachePaths | null {
  const gitDir = session.metadata.gitDir;
  if (gitDir === null) return null;
  const rel = cacheRel(env.file, { repo: session.metadata.repoRoot, prefix: session.keys.prefix }, env.cwd);
  if (rel === '') return null;
  return routeCachePaths(gitDir, env.sessionId, routingSignature(ctx.root), ctx.io.env['ENGINEOS_ROUTE_CACHE_BUSTER'] ?? '', rel);
}
```

Then narrow `cacheRel`'s second parameter to `{ repo: string; prefix: string }` and
delete `gitInfo`, `NO_GIT`, `interface GitInfo`, `isDirectory`, `hasActiveRecord`,
`ACTIVE_RECORD` and the now-unused `readdirSync` import. `ACTIVE_RECORD` moved to
`session-metadata.ts` in Task 5 — leaving a second copy here is exactly the drift the
record exists to remove.

- [ ] **Step 5: Run the hook's suite and see it pass.**

```bash
npx tsc -p tsconfig.json && cd build && node --test hooks/route-before-change.test.js
```

Expected: every pre-existing test plus the three new ones pass, `# fail 0`,
including `the hook resolves the repository without spawning git`.

- [ ] **Step 6: Run the e2e suite and see the two red tests go green.**

```bash
cd /Users/ricardofagmer/projects/engineos && npm run build && npx tsc -p tsconfig.json && cd build && node --test hooks/session-metadata.e2e.test.js
```

Expected: 3 passing, `# fail 0`.

- [ ] **Step 7: Run everything and the validator.**

```bash
npx tsc -p tsconfig.json && cd build && node --test --test-reporter=dot "**/*.test.js"
cd /Users/ricardofagmer/projects/engineos && node dist/engineos.cjs validate
```

- [ ] **Step 8: Commit.**

```bash
git add src/hooks/route-before-change.ts src/hooks/route-before-change.test.ts dist/
git commit -m "$(cat <<'EOF'
perf(hooks): route edits from the session record, not two git spawns

route-before-change now reads one session record instead of spawning
`git rev-parse` twice, walking up for CLAUDE.md from the edited file, and
reading every change record on every fire. A test asserts the spawn count is
zero.

The nested-CLAUDE.md answer is preserved by a bounded walk that stops at the
repo root and falls through to the record's projectInstructions, and the
change-record reminder still distinguishes an absent .engineos/changes from an
empty one via changesDirPresent.

dist/*.cjs are generated artifacts; they are excluded from the diff count.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Rewire `mark-unrecorded` and the telemetry sink

`mark-unrecorded` fires on every PostToolUse edit and spawns `git rev-parse` twice
(once inside `bypassActive`, once for `gitDir`). `telemetrySink` spawns it twice more
(`repoRoot`, then `gitDir`), and it is called by both announcement hooks. Both read
the same facts the session record already holds.

**The telemetry ordering is load-bearing and does not change.** `ENGINEOS_TELEMETRY=0`
returns before anything resolves a directory, because resolving one creates it. The
session record must therefore be resolved *after* that early return, not before —
and the record's own directory is not the telemetry directory, so resolving it later
leaves the promise intact.

**Files:** `src/hooks/mark-unrecorded.ts` (edit), `src/hooks/mark-unrecorded.test.ts`
(edit), `src/hooks/telemetry.ts` (edit), `src/hooks/telemetry.test.ts` (edit).

**Interfaces:**

- Consumes: `sessionRecord` from `./session-metadata`.
- `telemetrySink`'s signature is unchanged — `(env, ctx, { bypassed })` — so the two
  announcement hooks in Task 9 need no signature change. Only its interior changes.
- Produces: no new exports.

- [ ] **Step 1: Write the failing spawn-count tests.**

```bash
cat >> src/hooks/mark-unrecorded.test.ts <<'EOF'

test('the marker is written without spawning git', (t) => {
  if (spawnSync('git', ['--version'], { encoding: 'utf8' }).status !== 0) { t.skip('git is not installed'); return; }
  const repo = fixtureRepo(tempRoot(t));
  let spawns = 0;
  const counting = ((...args: Parameters<typeof spawnSync>) => {
    spawns += 1;
    return spawnSync(...args);
  }) as typeof spawnSync;
  const decision = run(payload(join(repo, 'src', 'orders.ts'), { cwd: repo, sid: 'no-spawn' }), { ...ctxWith(), spawn: counting });
  assert.deepEqual(decision, silent);
  assert.equal(existsSync(join(repo, '.git', 'ENGINEOS_UNRECORDED.no-spawn')), true);
  assert.equal(spawns, 0, 'both git rev-parse calls must be gone from the hot path');
});
EOF
```

Adapt the helper names (`payload`, `ctxWith`) to the ones that file actually defines
— read its head first. The test needs `existsSync` from `node:fs`, `join` from
`node:path`, `spawnSync` from `node:child_process`, and `fixtureRepo` and `tempRoot`
from `../testing/harness`; add each one that is not already imported there.

- [ ] **Step 2: Run it and see it fail.**

```bash
npx tsc -p tsconfig.json && cd build && node --test hooks/mark-unrecorded.test.js
```

Expected failure: `Expected values to be strictly equal: 2 !== 0`.

- [ ] **Step 3: Rewire `mark-unrecorded`.**

```bash
python3 - <<'EOF'
from pathlib import Path
p = Path('src/hooks/mark-unrecorded.ts')
s = p.read_text()
s = s.replace("import { bypassActive } from './bypass';\nimport { gitDir } from '../lib/git';",
              "import { sessionRecord } from './session-metadata';")
old = """export function run(env: HookEnvelope, ctx: HookContext): HookDecision {
  if (bypassActive(env.cwd, ctx.io.env, ctx.spawn)) return silent;
  if (env.file === '') return silent;"""
new = """export function run(env: HookEnvelope, ctx: HookContext): HookDecision {
  // One session record instead of two `git rev-parse` spawns: it answers the
  // bypass switch and the git dir, which is everything this hook resolves.
  const session = sessionRecord(env.cwd, env.sessionId, ctx.io.env, ctx.spawn, ctx.now());
  if (session.metadata.bypassActive) return silent;
  if (env.file === '') return silent;"""
assert old in s
s = s.replace(old, new)
old2 = """  if (env.cwd === '') return silent;
  const dir = gitDir(env.cwd, ctx.spawn);
  if (dir === null) return silent;"""
new2 = """  if (env.cwd === '') return silent;
  const dir = session.metadata.gitDir;
  if (dir === null) return silent;"""
assert old2 in s
s = s.replace(old2, new2)
p.write_text(s)
EOF
```

- [ ] **Step 4: Run it and see it pass.**

```bash
npx tsc -p tsconfig.json && cd build && node --test hooks/mark-unrecorded.test.js
```

Expected: every pre-existing test plus the new one passes, `# fail 0`. The
`hookPathSlug` containment on the session id stays exactly where it was — this task
changes where the directory comes from, never how the filename is narrowed.

- [ ] **Step 5: Write the failing telemetry test.**

```bash
cat >> src/hooks/telemetry.test.ts <<'EOF'

test('the sink resolves its directories without spawning git', (t) => {
  if (spawnSync('git', ['--version'], { encoding: 'utf8' }).status !== 0) { t.skip('git is not installed'); return; }
  const repo = fixtureRepo(tempRoot(t));
  mkdirSync(join(repo, '.engineos'), { recursive: true });
  let spawns = 0;
  const counting = ((...args: Parameters<typeof spawnSync>) => {
    spawns += 1;
    return spawnSync(...args);
  }) as typeof spawnSync;
  const sink = telemetrySink(envelopeFor(repo), { ...ctxWith(), spawn: counting }, { bypassed: false });
  assert.notEqual(sink, null);
  assert.equal(spawns, 0, 'repoRoot and gitDir both come from the session record now');
});

test('ENGINEOS_TELEMETRY=0 still returns before any directory is resolved', (t) => {
  if (spawnSync('git', ['--version'], { encoding: 'utf8' }).status !== 0) { t.skip('git is not installed'); return; }
  const repo = fixtureRepo(tempRoot(t));
  mkdirSync(join(repo, '.engineos'), { recursive: true });
  const sink = telemetrySink(envelopeFor(repo), { ...ctxWith({ ENGINEOS_TELEMETRY: '0' }) }, { bypassed: false });
  assert.equal(sink, null);
  assert.equal(existsSync(join(repo, '.git', 'engineos-telemetry')), false);
  assert.equal(existsSync(join(repo, '.git', 'engineos-session')), false, 'the switch must precede even the session record');
});
EOF
```

Adapt `envelopeFor` / `ctxWith` to that file's own helpers. The second test is the
one that matters: it pins the ordering promise, and it must be written before the
edit that could break it.

- [ ] **Step 6: Run it and see it fail.**

```bash
npx tsc -p tsconfig.json && cd build && node --test hooks/telemetry.test.js
```

Expected failure: the spawn-count test fails with `2 !== 0`. The ordering test should
already pass — keep it, it is the regression guard for Step 7.

- [ ] **Step 7: Rewire the sink, keeping the guard order.**

```bash
python3 - <<'EOF'
from pathlib import Path
p = Path('src/hooks/telemetry.ts')
s = p.read_text()
s = s.replace("import { gitDir, repoRoot } from '../lib/git';",
              "import { sessionRecord } from './session-metadata';")
old = """  const project = repoRoot(env.cwd, ctx.spawn);
  if (project === null || !existsSync(join(project, '.engineos'))) return null;
  const git = gitDir(env.cwd, ctx.spawn);
  if (git === null || git === '') return null;"""
new = """  // The session record answers both, with no subprocess. It is resolved HERE and
  // not earlier: every return above this line must happen before anything creates
  // a directory, and that is what ENGINEOS_TELEMETRY=0 promises. The record's own
  // directory is engineos-session, never engineos-telemetry, so resolving it at
  // this point does not weaken the promise for the switch's own path.
  const session = sessionRecord(env.cwd, env.sessionId, ctx.io.env, ctx.spawn, ctx.now());
  const project = session.metadata.repoRoot;
  if (project === '' || !existsSync(join(project, '.engineos'))) return null;
  const git = session.metadata.gitDir;
  if (git === null || git === '') return null;"""
assert old in s
p.write_text(s.replace(old, new))
EOF
```

- [ ] **Step 8: Run it and see it pass.**

```bash
npx tsc -p tsconfig.json && cd build && node --test hooks/telemetry.test.js hooks/mark-unrecorded.test.js
```

Expected: `# fail 0`, both new tests green, and the `ENGINEOS_TELEMETRY=0` ordering
test still green.

- [ ] **Step 9: Run everything, then commit.**

```bash
npx tsc -p tsconfig.json && cd build && node --test --test-reporter=dot "**/*.test.js"
cd /Users/ricardofagmer/projects/engineos && npm run build && node dist/engineos.cjs validate
git add src/hooks/mark-unrecorded.ts src/hooks/mark-unrecorded.test.ts src/hooks/telemetry.ts src/hooks/telemetry.test.ts dist/
git commit -m "$(cat <<'EOF'
perf(hooks): resolve mark-unrecorded and the telemetry sink from the record

mark-unrecorded loses two git rev-parse spawns; telemetrySink loses the two it
made for repoRoot and gitDir, which the two announcement hooks paid on every
dispatch and return.

The ENGINEOS_TELEMETRY=0 early return still precedes every directory
resolution, including the session record's, and a test pins that ordering: the
switch must leave no trace under either engineos-telemetry or engineos-session.

dist/*.cjs are generated artifacts; they are excluded from the diff count.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Rewire the two agent-announcement hooks

Each of these fires once per subagent dispatch and once per return, and each still
spawns `git rev-parse` for its own `bypassActive` call — the last remaining spawn in
either hook after Task 8 removed the sink's two.

**Files:** `src/hooks/announce-agent-dispatch.ts` (edit),
`src/hooks/announce-agent-return.ts` (edit),
`src/hooks/announce-agent-dispatch.test.ts` (edit),
`src/hooks/announce-agent-return.test.ts` (edit).

**Interfaces:**

- Consumes: `sessionRecord` from `./session-metadata`.
- Produces: no new exports. Both hooks keep `run(env, ctx)` and keep passing
  `{ bypassed }` to `telemetrySink`, so the sink's contract is untouched.

- [ ] **Step 1: Write the failing spawn-count tests, one per hook.**

```bash
for hook in dispatch return; do
cat >> "src/hooks/announce-agent-${hook}.test.ts" <<EOF

test('the hook announces without spawning git', (t) => {
  if (spawnSync('git', ['--version'], { encoding: 'utf8' }).status !== 0) { t.skip('git is not installed'); return; }
  const repo = fixtureRepo(tempRoot(t));
  let spawns = 0;
  const counting = ((...args: Parameters<typeof spawnSync>) => {
    spawns += 1;
    return spawnSync(...args);
  }) as typeof spawnSync;
  run(announcePayload(repo), { ...ctxWith(), spawn: counting });
  assert.equal(spawns, 0, 'the bypass check must come from the session record');
});
EOF
done
```

Read each file's head first and replace `announcePayload` / `ctxWith` with its own
helpers; both suites already build an envelope carrying an agent name, so reuse that
rather than inventing one.

- [ ] **Step 2: Run them and see them fail.**

```bash
npx tsc -p tsconfig.json && cd build && node --test hooks/announce-agent-dispatch.test.js hooks/announce-agent-return.test.js
```

Expected failure, twice: `Expected values to be strictly equal: 1 !== 0`.

- [ ] **Step 3: Rewire both hooks.**

```bash
python3 - <<'EOF'
from pathlib import Path
for name in ['announce-agent-dispatch.ts', 'announce-agent-return.ts']:
    p = Path('src/hooks') / name
    s = p.read_text()
    s = s.replace("import { bypassActive } from './bypass';",
                  "import { sessionRecord } from './session-metadata';")
    old = "const bypassed = bypassActive(env.cwd, ctx.io.env, ctx.spawn);"
    new = ("// The record answers the bypass switch with three existsSync calls and no\n"
           "  // subprocess; telemetrySink reads the same record, so the pair costs one\n"
           "  // resolution per fire rather than three git spawns.\n"
           "  const bypassed = sessionRecord(env.cwd, env.sessionId, ctx.io.env, ctx.spawn, ctx.now()).metadata.bypassActive;")
    assert old in s, name
    p.write_text(s.replace(old, new))
EOF
```

- [ ] **Step 4: Run them and see them pass.**

```bash
npx tsc -p tsconfig.json && cd build && node --test hooks/announce-agent-dispatch.test.js hooks/announce-agent-return.test.js
```

Expected: every pre-existing announcement test plus the two new ones pass,
`# fail 0`. The announcement text is public surface (`rules/subagents.md` pins the
`+ [agent] …` line); if any existing assertion on that text broke, the rewire touched
something it should not have — revert and redo Step 3 rather than adjusting the
expected string.

- [ ] **Step 5: Run everything, then commit.**

```bash
npx tsc -p tsconfig.json && cd build && node --test --test-reporter=dot "**/*.test.js"
cd /Users/ricardofagmer/projects/engineos && npm run build && node dist/engineos.cjs validate
git add src/hooks/announce-agent-dispatch.ts src/hooks/announce-agent-return.ts src/hooks/announce-agent-dispatch.test.ts src/hooks/announce-agent-return.test.ts dist/
git commit -m "$(cat <<'EOF'
perf(hooks): take the announcement bypass check from the session record

The last git rev-parse in either announcement hook. Both keep passing
{ bypassed } to telemetrySink, so the sink's contract and the pinned
"+ [agent] ..." announcement text are untouched.

dist/*.cjs are generated artifacts; they are excluded from the diff count.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Point every hook at the hook bundle, and record the surface change

The split bundles exist but nothing uses them yet: `hooks/hooks.json` and the eight
`hooks/*.sh` shims still name `dist/engineos.cjs`. This is the commit that actually
moves the hot path — and it cannot land before `src/install/settings-merge.ts` learns
the new command form.

**The blocker.** `settings-merge.ts` derives the hook list from `hooks/hooks.json`,
and `resolveCommand` throws `ABORT: unrecognized hook command in ${source}` for any
command whose prefix is not one of the two it knows. Change `hooks.json` first and
every install aborts. So the installer learns the new form in the same commit,
before the registry changes, and `isEngineosCommand`'s scrub predicate learns it too
— otherwise a consumer who installed the old form and then upgrades ends up with
both entries wired and every hook firing twice.

**Files:** `hooks/hooks.json` (edit), `hooks/*.sh` (edit — the eight hook shims only,
not `hooks/bypass.sh` and not `scripts/*.sh`), `src/install/settings-merge.ts` (edit),
`src/install/settings-merge.test.ts` (edit), `docs/COMPATIBILITY.md` (edit),
`docs/CODEBASE_MAP.md` (edit).

**Interfaces:**

- Produces in `settings-merge.ts`:
  `const RUNTIME_BUNDLES: readonly string[] = ['dist/engineos.cjs', 'dist/engineos-hook.cjs']`
  replacing the single `RUNTIME_BUNDLE`, and a `HOOK_PREFIXES` list that
  `hookNameOf` walks. Both are module-private; the exported surface
  (`mergeSettings`, `isEngineosCommand`, `pluginFile`, `SettingsMergeError`,
  `SETTINGS_NOT_OBJECT`) is unchanged.
- `hooks/bypass.sh` keeps pointing at the facade: `bypass` is a kernel-bundle
  command, not a hook, and it is not on any hot path.

- [ ] **Step 1: Write the failing installer tests.**

```bash
cat >> src/install/settings-merge.test.ts <<'EOF'

test('a hook command naming the hook bundle is placed, not rejected', () => {
  const hooksJson = {
    hooks: {
      PreToolUse: [
        { matcher: 'Edit', hooks: [{ type: 'command', command: 'node "${CLAUDE_PLUGIN_ROOT}/dist/engineos-hook.cjs" hook route-before-change' }] },
      ],
    },
  };
  const { settings } = mergeSettings({}, hooksJson, '/plugins/engineos', null);
  const rendered = JSON.stringify(settings);
  assert.match(rendered, /\/plugins\/engineos\/dist\/engineos-hook\.cjs" hook route-before-change/);
});

test('the scrub predicate recognizes a hook-bundle entry from another checkout', () => {
  assert.equal(isEngineosCommand('node "/elsewhere/dist/engineos-hook.cjs" hook route-before-change', '/plugins/engineos'), true);
});

test('installing over a facade-era entry replaces it rather than duplicating the hook', () => {
  const existing = {
    hooks: {
      PreToolUse: [
        { matcher: 'Edit', hooks: [{ type: 'command', command: 'node "/plugins/engineos/dist/engineos.cjs" hook route-before-change' }] },
      ],
    },
  };
  const hooksJson = {
    hooks: {
      PreToolUse: [
        { matcher: 'Edit', hooks: [{ type: 'command', command: 'node "${CLAUDE_PLUGIN_ROOT}/dist/engineos-hook.cjs" hook route-before-change' }] },
      ],
    },
  };
  const { settings, result } = mergeSettings(existing, hooksJson, '/plugins/engineos', null);
  assert.equal(result.removed, 1);
  const rendered = JSON.stringify(settings);
  assert.equal(rendered.includes('engineos.cjs" hook route-before-change'), false, 'the old entry must be scrubbed, or every hook fires twice');
  assert.match(rendered, /engineos-hook\.cjs" hook route-before-change/);
});

test('an unrecognized bundle name is still an abort', () => {
  const hooksJson = {
    hooks: { PreToolUse: [{ matcher: 'Edit', hooks: [{ type: 'command', command: 'node "${CLAUDE_PLUGIN_ROOT}/dist/engineos-made-up.cjs" hook route-before-change' }] }] },
  };
  assert.throws(() => mergeSettings({}, hooksJson, '/plugins/engineos', null), /ABORT: unrecognized hook command/);
});
EOF
```

- [ ] **Step 2: Run them and see them fail.**

```bash
npx tsc -p tsconfig.json && cd build && node --test install/settings-merge.test.js
```

Expected failure: the first test throws
`ABORT: unrecognized hook command in /plugins/engineos/hooks/hooks.json: node "${CLAUDE_PLUGIN_ROOT}/dist/engineos-hook.cjs" hook route-before-change`,
and the scrub test fails `false !== true`. That abort is exactly the blocker this
step exists to prove.

- [ ] **Step 3: Teach the installer both bundles.**

```bash
python3 - <<'EOF'
from pathlib import Path
p = Path('src/install/settings-merge.ts')
s = p.read_text()
old_prefix = """const NEW_PREFIX = 'node "${CLAUDE_PLUGIN_ROOT}/dist/engineos.cjs" hook ';
const EXPECTED_FORMS = 'Expected "${CLAUDE_PLUGIN_ROOT}"/hooks/<script>.sh or node "${CLAUDE_PLUGIN_ROOT}/dist/engineos.cjs" hook <name>';"""
new_prefix = """const FACADE_PREFIX = 'node "${CLAUDE_PLUGIN_ROOT}/dist/engineos.cjs" hook ';
const HOOK_BUNDLE_PREFIX = 'node "${CLAUDE_PLUGIN_ROOT}/dist/engineos-hook.cjs" hook ';
// Newest first: the form this installer PLACES leads, the older forms follow for as
// long as their deprecation window runs (docs/COMPATIBILITY.md).
const HOOK_PREFIXES: readonly string[] = [HOOK_BUNDLE_PREFIX, FACADE_PREFIX, OLD_PREFIX];
const EXPECTED_FORMS = 'Expected "${CLAUDE_PLUGIN_ROOT}"/hooks/<script>.sh, node "${CLAUDE_PLUGIN_ROOT}/dist/engineos-hook.cjs" hook <name> or node "${CLAUDE_PLUGIN_ROOT}/dist/engineos.cjs" hook <name>';"""
assert old_prefix in s
s = s.replace(old_prefix, new_prefix)

old_bundle = """// Root-independent half of the scrub predicate: a node entry pointing at another
// checkout is still an EngineOS entry, and leaving it fires two runtimes at once.
const RUNTIME_BUNDLE = 'dist/engineos.cjs';"""
new_bundle = """// Root-independent half of the scrub predicate: a node entry pointing at another
// checkout is still an EngineOS entry, and leaving it fires two runtimes at once.
// Both bundles are listed, and both must stay listed: an upgrade from the facade
// form to the hook-bundle form scrubs the old entry only because the predicate
// still recognizes it.
const RUNTIME_BUNDLES: readonly string[] = ['dist/engineos.cjs', 'dist/engineos-hook.cjs'];"""
assert old_bundle in s
s = s.replace(old_bundle, new_bundle)

old_is = """  const normalized = toSlashes(command);
  if (normalized.includes(RUNTIME_BUNDLE)) return true;"""
new_is = """  const normalized = toSlashes(command);
  if (RUNTIME_BUNDLES.some((bundle) => normalized.includes(bundle))) return true;"""
assert old_is in s
s = s.replace(old_is, new_is)

old_name = """function hookNameOf(raw: string): string | null {
  if (raw.startsWith(OLD_PREFIX)) return raw.slice(OLD_PREFIX.length);
  if (raw.startsWith(NEW_PREFIX)) return raw.slice(NEW_PREFIX.length);
  return null;
}"""
new_name = """function hookNameOf(raw: string): string | null {
  for (const prefix of HOOK_PREFIXES) {
    if (raw.startsWith(prefix)) return raw.slice(prefix.length);
  }
  return null;
}"""
assert old_name in s
s = s.replace(old_name, new_name)
p.write_text(s)
EOF
```

Note `dist/engineos.cjs` is a substring of neither `dist/engineos-hook.cjs` nor the
reverse, so `RUNTIME_BUNDLES.some(...)` has no accidental-match hazard; the third
test above is what proves it.

- [ ] **Step 4: Run them and see them pass.**

```bash
npx tsc -p tsconfig.json && cd build && node --test install/settings-merge.test.js
```

Expected: every pre-existing installer test plus the four new ones pass, `# fail 0`.
The pre-existing ones matter most here: they cover the two older command forms, whose
deprecation window is still open.

- [ ] **Step 5: Repoint `hooks/hooks.json` and the eight hook shims.**

```bash
cd /Users/ricardofagmer/projects/engineos
python3 - <<'EOF'
from pathlib import Path
h = Path('hooks/hooks.json')
s = h.read_text()
assert 'dist/engineos-hook.cjs' not in s
s = s.replace('dist/engineos.cjs\\" hook ', 'dist/engineos-hook.cjs\\" hook ')
h.write_text(s)

for shim in sorted(Path('hooks').glob('*.sh')):
    text = shim.read_text()
    if '.cjs" hook ' not in text:
        continue  # bypass.sh invokes a kernel command, not a hook
    text = text.replace('dist/engineos.cjs (', 'dist/engineos-hook.cjs (')
    text = text.replace('(dist/engineos.cjs)', '(dist/engineos-hook.cjs)')
    text = text.replace('"$ROOT/dist/engineos.cjs" hook ', '"$ROOT/dist/engineos-hook.cjs" hook ')
    shim.write_text(text)
EOF
grep -rn 'engineos.cjs' hooks/ || echo 'no facade references left under hooks/'
```

Expected: `hooks/bypass.sh` is the only remaining `dist/engineos.cjs` reference under
`hooks/`, because `bypass` lives in the kernel bundle and is not a hook.

- [ ] **Step 6: Prove a real hook fire still works through the shim and the registry form.**

```bash
npm run build
echo '{"cwd":"'"$PWD"'","session_id":"smoke","tool_name":"Edit","tool_input":{"file_path":"'"$PWD"'/src/orders/orders.service.ts"}}' \
  | bash hooks/route-before-change.sh
echo '{}' | node dist/engineos-hook.cjs hook prompt-advisor
bash hooks/test-route.sh
```

Expected: a `[router] …` context envelope from the shim, an advisor envelope from the
bundle, and the bash route suite green. `hooks/test-route.sh` is the ten-string
guidance suite; it asserts the exact rules lists, so a wrong bundle shows up there
immediately.

- [ ] **Step 7: Record the surface change in `docs/COMPATIBILITY.md`.**

Replace the single runtime-entry-point row with these two, keeping the table's
existing column shape:

```text
| Runtime entry points `dist/engineos.cjs` (all subcommands), `dist/engineos-hook.cjs` (`hook`), `dist/engineos-kernel.cjs` (`kernel`, `journal`, `telemetry`, `bypass`) and `dist/engineos-admin.cjs` (`init`, `settings-merge`, `gen`, `evals`, `bench`, `usage-report`, `validate`), and their stdout/exit contracts | Registered in `hooks/hooks.json`, called by the installers, CI and every `.sh` shim; the shims' deprecation window assumes these names hold |
| The hook command form `node "${CLAUDE_PLUGIN_ROOT}/dist/engineos-hook.cjs" hook <name>` | Written into consumers' settings.json by the installers |
```

Then add, under the deprecation-window section:

```text
### Runtime bundle split (1.8.0)

`dist/engineos.cjs` is unchanged and remains the compatibility facade: every one of
the twelve subcommands still resolves through it, and it is still what `--version`
and the published `bin` point at. Nothing about it is deprecated.

What changed is which bundle `hooks/hooks.json` registers. From 1.8.0 the eight hook
entries name `dist/engineos-hook.cjs`, so a hook fire loads only the hook envelope and
the routing kernel subset. `src/install/settings-merge.ts` accepts three command
forms — the hook bundle, the facade, and the pre-1.7.0 `.sh` shim path — and scrubs
all three before placing the current one, so upgrading in place never leaves two
entries wired for one hook.

A consumer whose settings.json still carries the facade form keeps working
indefinitely; it is slower, not broken. The facade form stays accepted by the
installer for as long as the `.sh` shims' own window runs.
```

- [ ] **Step 8: Update `docs/CODEBASE_MAP.md`.**

```bash
grep -n 'dist/engineos.cjs' docs/CODEBASE_MAP.md
```

Rewrite the sentence that describes the build as producing "one committed CJS bundle"
to name the four, and say which one a hook fire loads. Keep it to the two or three
sentences that are already there — this is a map, not a second copy of the spec.

- [ ] **Step 9: Full suite, validator, and the installer end to end.**

```bash
npx tsc -p tsconfig.json && cd build && node --test --test-reporter=dot "**/*.test.js"
cd /Users/ricardofagmer/projects/engineos && node dist/engineos.cjs validate
tmp=$(mktemp -d); printf '{}' > "$tmp/settings.json"
node dist/engineos-admin.cjs settings-merge --settings "$tmp/settings.json" --plugin-root "$PWD" 2>&1 | tail -5
grep -c 'engineos-hook.cjs' "$tmp/settings.json"; rm -rf "$tmp"
```

Expected: `# fail 0`, a clean validator summary, and a settings.json carrying the hook
bundle for each registered hook. If `settings-merge`'s flags differ, read
`src/install/cli.ts` for its real argument names rather than guessing.

- [ ] **Step 10: Commit.**

```bash
git add hooks/ src/install/settings-merge.ts src/install/settings-merge.test.ts docs/COMPATIBILITY.md docs/CODEBASE_MAP.md dist/
git commit -m "$(cat <<'EOF'
feat(hooks): register hooks against dist/engineos-hook.cjs

hooks/hooks.json and the eight hook shims now name the hook bundle, so a hook
fire no longer loads the validator, the generator, the eval runner or the bench
harness. hooks/bypass.sh keeps the facade: bypass is a kernel command, not a
hook.

settings-merge learns the new command form in the same commit, because deriving
the hook list from a registry it does not recognize aborts every install. Its
scrub predicate recognizes both bundles, so upgrading in place replaces the
facade entry instead of wiring the hook twice.

docs/COMPATIBILITY.md records the four bundle names and the new hook command
form as public surface; the facade is not deprecated.

dist/*.cjs are generated artifacts; they are excluded from the diff count.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: Node-guard e2e across all four bundles

`src/node-guard.ts` has excellent unit coverage of the *decision* and, after Task 2,
`src/node-guard-apply.ts` has coverage of the *effects* in-process. Neither proves the
thing that actually matters: that each shipped bundle **parses** on node 16 and
reaches its guard. A `??=` introduced above the guard would pass every existing test
and fail on the machine the guard exists for — silently, because
`route-before-change` is in `SILENT_HOOKS`.

**Fail rather than skip, on demand.** `ENGINEOS_REQUIRE_OLD_NODE=1` turns a missing
old node from a skip into a failure, mirroring the existing `ENGINEOS_REQUIRE_PARITY`
precedent in CI.

**Files:** `src/entries/node-guard.e2e.test.ts` (new), `.github/workflows/ci.yml`
(edit).

**Interfaces:**

- Consumes: the four built bundles, and `checkoutRoot` from `src/testing/harness.ts`.
- Produces: no exports. `src/testing/harness.ts` is NOT modified — other waves own it,
  and its `runCli` hardcodes the facade path, which is why this suite spawns the
  bundles directly.

- [ ] **Step 1: Write the failing e2e test.**

```bash
cat > src/entries/node-guard.e2e.test.ts <<'EOF'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { checkoutRoot } from '../testing/harness';

const BUNDLES = ['engineos.cjs', 'engineos-hook.cjs', 'engineos-kernel.cjs', 'engineos-admin.cjs'];

function bundlePath(name: string): string {
  return join(checkoutRoot(), 'dist', name);
}

// The highest node 16 nvm has installed, or null. A CI job that wants this proven
// rather than skipped sets ENGINEOS_REQUIRE_OLD_NODE=1.
function oldNode(): string | null {
  const nvm = process.env['NVM_DIR'] ?? join(process.env['HOME'] ?? '', '.nvm');
  const versions = join(nvm, 'versions', 'node');
  let names: string[];
  try {
    names = readdirSync(versions);
  } catch {
    return null;
  }
  const sixteens = names.filter((n) => n.startsWith('v16.')).sort();
  const newest = sixteens[sixteens.length - 1];
  if (newest === undefined) return null;
  const bin = join(versions, newest, 'bin', 'node');
  return existsSync(bin) ? bin : null;
}

function requireOldNode(): boolean {
  return process.env['ENGINEOS_REQUIRE_OLD_NODE'] === '1';
}

test('every bundle carries the node floor constant', (t) => {
  for (const name of BUNDLES) {
    if (!existsSync(bundlePath(name))) { t.skip(`dist/${name} is not built`); return; }
    const source = readFileSync(bundlePath(name), 'utf8');
    assert.match(source, /node >= 18 required/, `${name} does not carry the guard's refusal text`);
  }
});

test('every bundle parses on node 16', (t) => {
  const old = oldNode();
  if (old === null) {
    if (requireOldNode()) assert.fail('ENGINEOS_REQUIRE_OLD_NODE=1 but no node 16 is installed under NVM_DIR');
    t.skip('no node 16 available to test against');
    return;
  }
  for (const name of BUNDLES) {
    if (!existsSync(bundlePath(name))) { t.skip(`dist/${name} is not built`); return; }
    const r = spawnSync(old, ['--check', bundlePath(name)], { encoding: 'utf8' });
    assert.equal(r.status, 0, `${name} does not parse on node 16: ${String(r.stderr)}`);
  }
});

test('a silent hook on node 16 with no newer node exits 0 and says nothing', (t) => {
  const old = oldNode();
  if (old === null) {
    if (requireOldNode()) assert.fail('ENGINEOS_REQUIRE_OLD_NODE=1 but no node 16 is installed under NVM_DIR');
    t.skip('no node 16 available to test against');
    return;
  }
  if (!existsSync(bundlePath('engineos-hook.cjs'))) { t.skip('dist/engineos-hook.cjs is not built'); return; }
  // ENGINEOS_REEXEC=1 stops the guard hunting for a newer node, which is what makes
  // this assertion about the refusal policy rather than about the host's nvm layout.
  const r = spawnSync(old, [bundlePath('engineos-hook.cjs'), 'hook', 'route-before-change'], {
    input: '{}',
    encoding: 'utf8',
    env: { PATH: process.env['PATH'] ?? '', HOME: process.env['HOME'] ?? '', ENGINEOS_REEXEC: '1' },
  });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '');
});

test('a non-silent hook on node 16 explains why it did not run', (t) => {
  const old = oldNode();
  if (old === null) {
    if (requireOldNode()) assert.fail('ENGINEOS_REQUIRE_OLD_NODE=1 but no node 16 is installed under NVM_DIR');
    t.skip('no node 16 available to test against');
    return;
  }
  if (!existsSync(bundlePath('engineos-hook.cjs'))) { t.skip('dist/engineos-hook.cjs is not built'); return; }
  const r = spawnSync(old, [bundlePath('engineos-hook.cjs'), 'hook', 'stop-verify'], {
    input: '{}',
    encoding: 'utf8',
    env: { PATH: process.env['PATH'] ?? '', HOME: process.env['HOME'] ?? '', ENGINEOS_REEXEC: '1' },
  });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /stop-verify skipped: node >= 18 required/);
});

test('a non-hook command on node 16 refuses with a non-zero exit', (t) => {
  const old = oldNode();
  if (old === null) {
    if (requireOldNode()) assert.fail('ENGINEOS_REQUIRE_OLD_NODE=1 but no node 16 is installed under NVM_DIR');
    t.skip('no node 16 available to test against');
    return;
  }
  if (!existsSync(bundlePath('engineos-admin.cjs'))) { t.skip('dist/engineos-admin.cjs is not built'); return; }
  const r = spawnSync(old, [bundlePath('engineos-admin.cjs'), 'validate'], {
    encoding: 'utf8',
    env: { PATH: process.env['PATH'] ?? '', HOME: process.env['HOME'] ?? '', ENGINEOS_REEXEC: '1' },
  });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /node >= 18 required/);
});
EOF
```

- [ ] **Step 2: Run it.**

```bash
cd /Users/ricardofagmer/projects/engineos && npm run build && npx tsc -p tsconfig.json && cd build && node --test entries/node-guard.e2e.test.js
```

Expected on a host with node 16 under `$NVM_DIR`: 5 passing. On a host without it:
1 passing, 4 skipped. Either way the first test — the one that does not need an old
node — must pass. If it fails, a bundle lost its guard and that is a real defect, not
a test problem.

- [ ] **Step 3: Confirm the failure mode is real, then undo it.**

A guard test that has never been red proves nothing. Introduce a node-17 syntax
construct above the guard, rebuild, and watch the parse test fail:

```bash
cd /Users/ricardofagmer/projects/engineos
cp src/entries/hook.ts /tmp/hook-entry-backup.ts
python3 - <<'EOF'
from pathlib import Path
p = Path('src/entries/hook.ts')
s = p.read_text()
s = s.replace("const io = processIo();", "const io = processIo();\nconst probe: string[] = [];\nprobe.at(0);")
p.write_text(s)
EOF
npm run build && npx tsc -p tsconfig.json && cd build && node --test entries/node-guard.e2e.test.js
```

Expected (with node 16 present): `engineos-hook.cjs does not parse on node 16` —
or, if esbuild lowered `.at()` rather than refusing it, the test passes and you have
learned something worth writing down: the parse check catches syntax, not API use.
Record which it was; it belongs in Task 12's report.

```bash
cd /Users/ricardofagmer/projects/engineos && cp /tmp/hook-entry-backup.ts src/entries/hook.ts && rm /tmp/hook-entry-backup.ts && npm run build
```

- [ ] **Step 4: Add a CI step that requires the old-node run.**

Insert after the existing "Node runtime — unit and e2e tests" step in
`.github/workflows/ci.yml`:

```yaml
      # The guard exists for a host whose PATH resolves an old node. Skipping the
      # proof on every runner is how that guard rots; ENGINEOS_REQUIRE_OLD_NODE
      # turns the skip into a failure, mirroring ENGINEOS_REQUIRE_PARITY below.
      - name: Node runtime — version guard on node 16
        run: |
          if [ -d "$NVM_DIR/versions/node" ] && ls "$NVM_DIR/versions/node" | grep -q '^v16\.'; then
            ENGINEOS_REQUIRE_OLD_NODE=1 node --test build/entries/node-guard.e2e.test.js
          else
            echo "note: no node 16 on this runner — the guard's parse check ran unconditionally in the suite above"
            node --test build/entries/node-guard.e2e.test.js
          fi
```

If the workflow builds TypeScript into `build/` under a different step name or path,
read the file and match it rather than assuming — the assertion to keep is that the
suite runs with the env var set whenever a node 16 exists.

- [ ] **Step 5: Commit.**

```bash
git add src/entries/node-guard.e2e.test.ts .github/workflows/ci.yml
git commit -m "$(cat <<'EOF'
test(entries): prove the node guard on every bundle, on a real node 16

The decision and its effects were covered; that each shipped bundle PARSES on
node 16 and reaches its guard was not. A construct introduced above the guard
would otherwise pass every test and fail silently on the machine the guard
exists for, because route-before-change is in SILENT_HOOKS.

ENGINEOS_REQUIRE_OLD_NODE=1 turns a missing node 16 from a skip into a failure,
mirroring the ENGINEOS_REQUIRE_PARITY precedent, and CI sets it whenever one is
installed.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: Measure the split, and answer the daemon question honestly

The spec rejects a persistent orchestration daemon "before split-bundle measurements
justify it". This task produces those measurements. It does not decide the answer in
advance, and it does not build a daemon under any circumstances — a "justified"
verdict here is a recommendation for a later wave to consider, nothing more.

**What gets measured, all on one host, in one sitting:**

| Figure | How |
|---|---|
| Bare node startup | `node -e 0` — the floor nothing can go below |
| Facade load | `node dist/engineos.cjs --version` |
| Hook bundle load | `node dist/engineos-hook.cjs --version` |
| Kernel bundle load | `node dist/engineos-kernel.cjs --version` |
| Admin bundle load | `node dist/engineos-admin.cjs --version` |
| One `git rev-parse` | the subprocess Task 4 removed |
| `discoverRepo` | the walk that replaced it |
| Bundle sizes | `ls -l dist/*.cjs` |

**Files:** `docs/perf/startup-split.md` (new), `scripts/measure-startup.mjs` (new).

**Interfaces:**

- Produces: `scripts/measure-startup.mjs`, a standalone node script printing a
  markdown table plus a JSON block. It takes no arguments and writes no files; the
  operator redirects it into the doc. It is not wired into `npm test` — it spawns
  hundreds of processes and belongs in a measurement session, not a suite.
- Consumes: the four built bundles, and `build/lib/git-discovery.js`.

- [ ] **Step 1: Write the measurement script.**

There is no failing-test rung here because the deliverable is a measurement, not a
behaviour. The honesty rung is Step 3: the verdict must be written from the numbers
that came out, including when they are disappointing.

```bash
cat > scripts/measure-startup.mjs <<'EOF'
// Startup cost of each bundle, measured the only way that counts: real processes,
// median of many, on one host in one sitting. Not part of npm test — it spawns
// hundreds of processes.
//
// Produces the evidence the spec demands before any persistent-daemon decision is
// reconsidered. It answers what the split cost; it does not answer whether a daemon
// is warranted, which is a judgement a human makes from these numbers.
import { spawnSync } from 'node:child_process';
import { statSync } from 'node:fs';
import { cpus, platform } from 'node:os';

const RUNS = 25;

function median(values) {
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function timeCommand(command, args, input) {
  const samples = [];
  // One warm run, discarded: the first spawn pays the OS file cache.
  spawnSync(command, args, { encoding: 'utf8', input });
  for (let i = 0; i < RUNS; i += 1) {
    const t0 = process.hrtime.bigint();
    spawnSync(command, args, { encoding: 'utf8', input });
    samples.push(Number(process.hrtime.bigint() - t0) / 1e6);
  }
  return median(samples);
}

const rows = [
  ['bare node', timeCommand('node', ['-e', '0'])],
  ['dist/engineos.cjs --version', timeCommand('node', ['dist/engineos.cjs', '--version'])],
  ['dist/engineos-hook.cjs --version', timeCommand('node', ['dist/engineos-hook.cjs', '--version'])],
  ['dist/engineos-kernel.cjs --version', timeCommand('node', ['dist/engineos-kernel.cjs', '--version'])],
  ['dist/engineos-admin.cjs --version', timeCommand('node', ['dist/engineos-admin.cjs', '--version'])],
  ['git rev-parse (3 fields)', timeCommand('git', ['-C', process.cwd(), 'rev-parse', '--show-toplevel', '--absolute-git-dir', '--show-prefix'])],
];

const { discoverRepo } = await import('../build/lib/git-discovery.js');
const t0 = process.hrtime.bigint();
for (let i = 0; i < 500; i += 1) discoverRepo(process.cwd(), {});
rows.push(['discoverRepo (in-process, mean of 500)', Number(process.hrtime.bigint() - t0) / 500 / 1e6]);

const sizes = ['engineos.cjs', 'engineos-hook.cjs', 'engineos-kernel.cjs', 'engineos-admin.cjs']
  .map((name) => [name, statSync(`dist/${name}`).size]);

console.log(`platform: ${platform()}  cpu: ${cpus()[0]?.model ?? 'unknown'} x${cpus().length}  node: ${process.versions.node}`);
console.log('');
console.log('| Measurement | median ms |');
console.log('|---|---|');
for (const [name, ms] of rows) console.log(`| ${name} | ${ms.toFixed(1)} |`);
console.log('');
console.log('| Bundle | bytes | share of facade |');
console.log('|---|---|---|');
const facade = sizes[0][1];
for (const [name, bytes] of sizes) console.log(`| ${name} | ${bytes} | ${(bytes / facade * 100).toFixed(1)}% |`);
EOF
```

- [ ] **Step 2: Run it against the built bundles and capture the output.**

```bash
cd /Users/ricardofagmer/projects/engineos && npm run build && npx tsc -p tsconfig.json
node scripts/measure-startup.mjs | tee /tmp/startup-split.txt
```

Run it twice and keep the second. If the two runs disagree by more than ~15% on any
row, the host is too noisy to conclude from — close what is competing for CPU and run
again rather than reporting a number you do not believe.

- [ ] **Step 3: Write `docs/perf/startup-split.md` from the output.**

```bash
mkdir -p docs/perf
cat > docs/perf/startup-split.md <<'EOF'
# Startup cost after the bundle split

Measured with `node scripts/measure-startup.mjs`, median of 25 real process spawns
per row after one discarded warm run. Rerun it on your own host before relying on
these figures: process startup is dominated by the machine, not by this repository.

<!-- paste the script's host line, timing table and size table here, unedited -->

## What the split bought

<!-- Facade load minus hook bundle load, in ms and as a percentage. State it as a
     difference between two measured rows, not as a claim. -->

## What it did not buy

<!-- Bare node startup is the floor. State what fraction of the remaining hook cost
     is that floor, i.e. what no amount of further bundling can remove. -->

## Daemon verdict

<!-- One of exactly two statements, chosen from the numbers above:

     "The daemon stays rejected." — the remaining per-fire cost above the bare-node
     floor is small enough that a persistent process would be trading a large
     operational surface (lifecycle, staleness, crash recovery, a second source of
     truth for session state) for a small saving. Name the two numbers that make
     that true.

     "A daemon is now justified for evaluation." — the bare-node floor alone exceeds
     the budget, so no amount of bundling can reach it and the only remaining lever
     is not paying node startup per fire. Name the floor and the budget. This is a
     recommendation for a later wave to SPECIFY, not a licence to build one here.

     Write whichever the numbers support. Do not write both, do not hedge, and do
     not soften a red result: the spec asked for a measurement precisely so the
     decision would not be made on intuition. -->
EOF
```

Fill in every `<!-- -->` block with the real numbers before committing. A committed
placeholder here is worse than no document, because the next wave will read it as a
finding.

- [ ] **Step 4: Sanity-check the verdict against the spec's own target.**

```bash
grep -n '75 ms\|75ms' docs/specs/2026-09-22-engineos-2-fast-core-design.md
```

The spec's success criterion is a p50 below 75 ms for cached pre-edit routing **on
the reference development host**. If your measured bare-node floor plus one unavoidable
`statSync` pass already exceeds 75 ms, say so plainly in the verdict section — that is
a fact about the host, and Task 13 is where it becomes a pass or a fail against the
reference baseline rather than against your laptop.

- [ ] **Step 5: Commit.**

```bash
git add scripts/measure-startup.mjs docs/perf/startup-split.md
git commit -m "$(cat <<'EOF'
docs(perf): measure bundle startup and record the daemon verdict

scripts/measure-startup.mjs times each bundle, bare node, one git rev-parse and
the spawn-free walk that replaced it, as real processes on one host. The spec
rejects a persistent orchestration daemon until split-bundle measurements exist;
docs/perf/startup-split.md is that measurement and states the verdict the
numbers support.

The script is deliberately not part of npm test: it spawns hundreds of
processes.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 13: Drive the acceptance, asserted against the Wave 1 baseline

The wave's acceptance criterion: `route-before-change (cache hit)` below **75 ms**,
asserted against the baseline Wave 1 recorded on the same host — never against a
number written into a test. This task lowers the published budget, points the bench at
the bundle the hooks now use, adds the baseline-relative assertion, and runs a
**bounded** fix loop that reports red honestly when the bound is spent.

**The bound, before any work starts.** Per `registries/policy.json` `repair`: two fix
attempts, one model-tier escalation, then stop and report red. A red result here is a
correct outcome of this plan. Repeating measurements until one lands under 75 is
sampling until it looks right, and it is forbidden.

**Two numbers, two purposes, and they are not the same number.**
The 75 in `src/bench/run.ts` is the published absolute budget — that file's own header
states the five budget names and the `ok`/`FAIL` line format are public surface. The
baseline file is the *relative* assertion: `src/bench/baseline.ts` compares this run
against what Wave 1 recorded on this host, so a slow CI runner cannot fail the wave
and a regression cannot hide behind a fast one.

**Files:** `src/bench/run.ts` (edit), `src/bench/run.test.ts` (edit),
`src/bench/baseline.ts` (new), `src/bench/baseline.test.ts` (new).

**Interfaces:**

- Consumes (a JSON contract with Wave 1, not a build dependency):
  `docs/perf/baselines/<host-id>.json`, an F6 `LifecycleReport` — `{ host: HostMetadata,
  scenarios: ScenarioResult[] }` where each scenario carries `scenario`, `p50Ms`,
  `p95Ms`. Wave 5 narrows only the fields it reads and treats everything else as
  unknown, so a Wave 1 change that adds fields does not break this.
- Produces:

```ts
export interface BaselineScenario { scenario: string; p50Ms: number; p95Ms: number }
export function hostId(): string;
export function baselinePath(root: string): string;
export function readBaseline(root: string): BaselineScenario[] | null;
export function baselineP50(root: string, scenario: string): number | null;
```

  `null` means "no baseline on this host", which is a skip, not a pass.
- `hostId()` must derive the same identifier Wave 1 writes with. Read Wave 1's plan
  (`docs/superpowers/plans/2026-09-22-engineos-2-fast-core-w1-measurement.md`) for its
  derivation and mirror it exactly. If the two disagree, report it under
  `### Contract notes` and do not invent a third scheme.

- [ ] **Step 1: Read Wave 1's host-id derivation before writing anything.**

```bash
grep -n 'hostId\|host-id\|baselinePath\|baselines/' docs/superpowers/plans/2026-09-22-engineos-2-fast-core-w1-measurement.md | head -30
ls docs/perf/baselines/ 2>/dev/null || echo 'no baselines recorded yet'
```

If Wave 1 has landed, a baseline file exists and its name IS the host id — use it. If
Wave 1 has not landed, mirror the derivation its plan specifies and say so in the
return report; do not block, and do not hardcode a number in its place.

- [ ] **Step 2: Write the failing baseline test.**

```bash
cat > src/bench/baseline.test.ts <<'EOF'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tempRoot } from '../testing/harness';
import { baselineP50, baselinePath, hostId, readBaseline } from './baseline';

function withBaseline(root: string, report: unknown): void {
  mkdirSync(join(root, 'docs', 'perf', 'baselines'), { recursive: true });
  writeFileSync(baselinePath(root), JSON.stringify(report));
}

test('hostId is stable across calls', () => {
  assert.equal(hostId(), hostId());
  assert.notEqual(hostId(), '');
});

test('a missing baseline reads as null, not as zero', (t) => {
  assert.equal(readBaseline(tempRoot(t)), null);
  assert.equal(baselineP50(tempRoot(t), 'route-before-change (cache hit)'), null);
});

test('a baseline scenario is read back by name', (t) => {
  const root = tempRoot(t);
  withBaseline(root, { host: { platform: 'x' }, scenarios: [{ scenario: 'route-before-change (cache hit)', p50Ms: 141.2, p95Ms: 190.0 }] });
  assert.equal(baselineP50(root, 'route-before-change (cache hit)'), 141.2);
});

test('a scenario the baseline does not carry reads as null', (t) => {
  const root = tempRoot(t);
  withBaseline(root, { host: {}, scenarios: [{ scenario: 'other', p50Ms: 1, p95Ms: 2 }] });
  assert.equal(baselineP50(root, 'route-before-change (cache hit)'), null);
});

test('a malformed baseline reads as null rather than throwing', (t) => {
  const root = tempRoot(t);
  mkdirSync(join(root, 'docs', 'perf', 'baselines'), { recursive: true });
  writeFileSync(baselinePath(root), 'not json');
  assert.equal(readBaseline(root), null);
});

test('extra fields in a scenario are ignored, not rejected', (t) => {
  const root = tempRoot(t);
  withBaseline(root, { host: {}, scenarios: [{ scenario: 's', p50Ms: 1, p95Ms: 2, dispatches: 3, contextBytes: 4, samples: [] }] });
  assert.deepEqual(readBaseline(root), [{ scenario: 's', p50Ms: 1, p95Ms: 2 }]);
});
EOF
```

- [ ] **Step 3: Run it and see it fail.**

```bash
npx tsc -p tsconfig.json && cd build && node --test bench/baseline.test.js
```

Expected failure: `error TS2307: Cannot find module './baseline'`.

- [ ] **Step 4: Write the baseline reader.**

```bash
cat > src/bench/baseline.ts <<'EOF'
// The Wave 1 baseline, read as a JSON contract rather than imported as code: Wave 1
// owns the writer, this file owns one reader of three fields, and neither wave has a
// build dependency on the other.
//
// Why relative at all: the spec's 75ms target is "on the reference development host".
// A CI runner three times slower than the reference host is not a regression, and a
// runner twice as fast must not let one through. So the absolute budget lives in
// ./run.ts, where the five published budget names already are, and the wave's real
// acceptance is measured against what this host recorded.
import { readFileSync } from 'node:fs';
import { cpus, platform } from 'node:os';
import { join } from 'node:path';
import { isRecord } from '../lib/json';

export interface BaselineScenario {
  scenario: string;
  p50Ms: number;
  p95Ms: number;
}

// Mirrors Wave 1's derivation; see docs/superpowers/plans/...-w1-measurement.md.
// It must produce the same string, or a baseline written by `engineos bench baseline
// --write` is invisible to this reader.
export function hostId(): string {
  const model = cpus()[0]?.model ?? 'unknown';
  return `${platform()}-${model}-${cpus().length}`.replace(/[^A-Za-z0-9._-]+/g, '-').toLowerCase();
}

export function baselinePath(root: string): string {
  return join(root, 'docs', 'perf', 'baselines', `${hostId()}.json`);
}

// null means "no baseline on this host" — a skip, never a pass. A caller that reads
// null as 0 would turn a missing measurement into an impossible budget, which is the
// same class of defect as reading an unknown token count as free.
export function readBaseline(root: string): BaselineScenario[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(baselinePath(root), 'utf8'));
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  const scenarios = parsed['scenarios'];
  if (!Array.isArray(scenarios)) return null;
  const read: BaselineScenario[] = [];
  for (const entry of scenarios) {
    if (!isRecord(entry)) continue;
    const scenario = entry['scenario'];
    const p50Ms = entry['p50Ms'];
    const p95Ms = entry['p95Ms'];
    if (typeof scenario !== 'string' || typeof p50Ms !== 'number' || typeof p95Ms !== 'number') continue;
    read.push({ scenario, p50Ms, p95Ms });
  }
  return read;
}

export function baselineP50(root: string, scenario: string): number | null {
  const baseline = readBaseline(root);
  if (baseline === null) return null;
  return baseline.find((s) => s.scenario === scenario)?.p50Ms ?? null;
}
EOF
```

- [ ] **Step 5: Run it and see it pass.**

```bash
npx tsc -p tsconfig.json && cd build && node --test bench/baseline.test.js
```

Expected: 6 passing tests, `# fail 0`.

- [ ] **Step 6: Point the bench at the registered command form and lower the budget.**

The bench currently spawns `hooks/route-before-change.sh`, which adds ~15 ms of bash
on the authoring host and is no longer the form Claude Code registers. Measure what
actually runs.

```bash
python3 - <<'EOF'
from pathlib import Path
p = Path('src/bench/run.ts')
s = p.read_text()
old = "{ name: 'route-before-change (cache hit)', actual: routeBeforeChange, budget: 150, unit: 'ms' },"
new = "{ name: 'route-before-change (cache hit)', actual: routeBeforeChange, budget: 75, unit: 'ms' },"
assert old in s
s = s.replace(old, new)
old_cmd = """      command: [join(root, 'hooks/route-before-change.sh')],"""
new_cmd = """      // The command form hooks/hooks.json registers, not the bash shim: the shim
      // costs ~15ms of bash that Claude Code never pays, and measuring it would
      // report a budget nobody is actually held to.
      command: ['node', join(root, 'dist/engineos-hook.cjs'), 'hook', 'route-before-change'],"""
assert old_cmd in s
s = s.replace(old_cmd, new_cmd)
old_c = """// The budget is a CACHE HIT, so the throwaway repo gets one warm run before the
// samples start — the first call populates the route cache and is not what the
// 150ms bound describes."""
new_c = """// The budget is a CACHE HIT, so the throwaway repo gets one warm run before the
// samples start — the first call populates the route cache and the session record,
// and is not what the 75ms bound describes."""
assert old_c in s
s = s.replace(old_c, new_c)
p.write_text(s)
EOF
grep -n "budget: 75" src/bench/run.ts
```

- [ ] **Step 7: Update the pinned budget line in the bench's own test.**

```bash
grep -n 'route-before-change (cache hit)' src/bench/run.test.ts
python3 - <<'EOF'
from pathlib import Path
p = Path('src/bench/run.test.ts')
s = p.read_text()
old = "'ok   route-before-change (cache hit): median=20.0ms budget<150.0ms'"
new = "'ok   route-before-change (cache hit): median=20.0ms budget<75.0ms'"
assert old in s, 'the pinned line moved — read the file and update it by hand'
p.write_text(s.replace(old, new))
EOF
npx tsc -p tsconfig.json && cd build && node --test bench/run.test.js
```

Expected: `# fail 0`. That suite drives `measureAll` through fakes, so it proves the
line format and the budget literal, not the machine.

- [ ] **Step 8: Add the baseline-relative acceptance test.**

```bash
cat >> src/bench/baseline.test.ts <<'EOF'

// The wave's acceptance. It asserts against the number Wave 1 recorded on THIS host,
// never against a literal: a fast runner must not let a regression through, and a
// slow one must not fail the wave.
test('cached routing meets the spec target relative to this host\'s baseline', (t) => {
  const root = checkoutRoot();
  const recorded = baselineP50(root, 'route-before-change (cache hit)');
  if (recorded === null) {
    if (process.env['ENGINEOS_REQUIRE_BASELINE'] === '1') {
      assert.fail(`ENGINEOS_REQUIRE_BASELINE=1 but no Wave 1 baseline exists at ${baselinePath(root)}`);
    }
    t.skip('no Wave 1 baseline recorded on this host — run `engineos bench baseline --write`');
    return;
  }
  const measured = measureRouteBeforeChange(root);
  // The spec's criterion is absolute on the reference host; here it is expressed as
  // "no worse than the baseline scaled to the target", which is the same statement
  // on the reference host and a fair one everywhere else.
  const allowed = recorded * (SPEC_TARGET_MS / BASELINE_TARGET_MS);
  assert.ok(
    measured <= allowed,
    `cached routing measured ${measured.toFixed(1)}ms, allowed ${allowed.toFixed(1)}ms (baseline ${recorded.toFixed(1)}ms on ${hostId()})`,
  );
});
EOF
```

Define `SPEC_TARGET_MS = 75` and `BASELINE_TARGET_MS` as the budget that was in force
when Wave 1 recorded its baseline — read it from Wave 1's plan, do not assume 150 —
and import `checkoutRoot` from `../testing/harness` plus the measurement helper the
bench already exports. If `src/bench/run.ts` exports no single-scenario measurement
function, add one narrow export (`export function measureRouteBeforeChange(root: string): number`)
wrapping the existing private `routeBeforeChangeMedian` rather than duplicating its
temp-repo setup.

- [ ] **Step 9: Run the acceptance.**

```bash
cd /Users/ricardofagmer/projects/engineos && npm run build && npx tsc -p tsconfig.json
node dist/engineos-admin.cjs bench
cd build && node --test bench/baseline.test.js
```

Expected, in order of preference:

1. `ok   route-before-change (cache hit): median=<N>ms budget<75.0ms` and the
   baseline test green. The wave's acceptance is met — record `<N>`.
2. The baseline test **skipped** because Wave 1 has not landed. Record the absolute
   figure from `bench` and report the acceptance as **unverified against the
   baseline**, not as met.
3. `FAIL route-before-change (cache hit): median=<N>ms budget<75.0ms`. Go to Step 10.

- [ ] **Step 10: The bounded fix loop — two attempts, then stop.**

```bash
node scripts/kernel.sh repair --attempt 1
```

Follow what the kernel answers. The two attempts worth making, in order:

**Attempt 1 — find where the time goes.** Do not guess:

```bash
node --cpu-prof --cpu-prof-dir=/tmp/engineos-prof dist/engineos-hook.cjs hook route-before-change <<'EOF'
{"cwd":"/tmp/probe-repo","session_id":"prof","tool_name":"Edit","tool_input":{"file_path":"/tmp/probe-repo/src/Button.tsx"}}
EOF
ls /tmp/engineos-prof
```

Act only on what the profile shows. The two candidates this plan already suspects: a
module still reachable from `src/entries/hook.ts` that belongs in the admin bundle
(check with `npx esbuild --bundle src/entries/hook.ts --platform=node --format=cjs --analyze --outfile=/dev/null`),
and the per-hit `currentSignature` stat pass if a repository carries an unusually
large `.engineos/changes/`.

**Attempt 2 — escalate one tier** per `rules/models.md` and re-examine, once.

**Then stop.** If the bound is spent and the measurement is still red, report:

```text
### Status
DEGRADED

Wave 5 acceptance not met. route-before-change (cache hit) measured <N>ms against
the 75ms budget and <allowed>ms relative to this host's Wave 1 baseline. Repair
bound spent (2 attempts, 1 escalation). The remaining cost is <what the profile
showed>, of which <M>ms is bare node startup and cannot be removed by bundling.
See docs/perf/startup-split.md for the daemon verdict this result feeds.
```

Do not raise the budget to make it pass. Do not re-run until a favourable sample
appears. A red acceptance with an honest cause is a usable input to Wave 7; a green
one obtained by moving the line is not.

- [ ] **Step 11: Full gate.**

```bash
cd /Users/ricardofagmer/projects/engineos
npm run build && npx tsc -p tsconfig.json && cd build && node --test --test-reporter=dot "**/*.test.js"
cd /Users/ricardofagmer/projects/engineos && node dist/engineos.cjs validate && node dist/engineos-admin.cjs bench
```

- [ ] **Step 12: Commit.**

```bash
git add src/bench/ dist/
git commit -m "$(cat <<'EOF'
perf(bench): hold cached routing to 75ms against the Wave 1 baseline

The published budget drops from 150 to 75, and the bench now measures the
command form hooks/hooks.json registers rather than the bash shim, which added
~15ms nobody actually pays.

src/bench/baseline.ts reads the Wave 1 baseline for this host as a JSON contract
and the acceptance asserts against it, so a slow runner cannot fail the wave and
a fast one cannot hide a regression. A missing baseline is a skip, never a pass;
ENGINEOS_REQUIRE_BASELINE=1 turns it into a failure.

dist/*.cjs are generated artifacts; they are excluded from the diff count.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Wave 5 barrier

Before reporting the wave complete, all of:

- [ ] All 13 tasks checked off, each with its own commit.
- [ ] `npm run build && npx tsc -p tsconfig.json && npm test` green, output shown.
- [ ] `node dist/engineos.cjs validate` green.
- [ ] All four `dist/*.cjs` rebuilt and committed.
- [ ] `node dist/engineos-admin.cjs bench` output shown, pass or fail, unedited.
- [ ] `docs/perf/startup-split.md` carries real numbers and one unhedged daemon
      verdict.
- [ ] `docs/COMPATIBILITY.md` names the four bundles and the new hook command form.
- [ ] A handoff written per `templates/handoff.md`, naming the F5 shape Wave 4
      consumes and any acceptance that came back red.
