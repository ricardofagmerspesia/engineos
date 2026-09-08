// End-to-end port of hooks/test-verify.sh: the REAL Stop gate driven through
// `engineos hook stop-verify` over npm-only fixture repos (no pnpm-lock.yaml /
// yarn.lock), with the assertions the bash suite made — decision JSON, block
// reason, telemetry event, verification span.
//
// Tests are opt-in in the gate itself (rules/verification.md "Tests are
// opt-in"): the default target list is "lint typecheck" and ENGINEOS_VERIFY_TESTS=1
// is what folds "test" back in. Every case states that env explicitly rather than
// relying on whatever leaked into the runner's environment.
//
// src/hooks/stop-verify.test.ts covers the same ladder in process with an
// injected spawner; this file is the other half — real npm, real git, real
// telemetry files — so the two are deliberately not the same assertions.
//
// Every fixture carries `.engineos/.keep`: the gate runs only in an adopted
// project, so a fixture without the marker would make its case pass on the
// opt-in guard rather than on the behaviour it names.
//
// Each case that supplies a transcript runs twice, once per transcript shape:
// the harness default (`input`, what a real Claude transcript carries) and
// `{ legacy: true }` (`tool_input`, the shape the bash suite planted).
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isRecord } from '../lib/json';
import { resolveRoot } from '../registry/paths';
import { envelope, fixtureRepo, runCli, tempRoot, transcript, type RunResult, type ToolUse } from '../testing/harness';

const checkout = resolveRoot({}, __dirname);

// Isolate from the operator's bypass switches: a machine-wide pause must never
// make this suite go quiet and report green (bash suite, line 12).
const ISOLATED: Record<string, string> = { ENGINEOS_BYPASS_FLAG: '/nonexistent/engineos.bypass' };

interface InvokeOptions {
  stopHookActive?: boolean;
  sid?: string;
  env?: Record<string, string>;
}

// ------------------------------------------------------------------ helpers

function hasTool(command: string): boolean {
  return spawnSync(command, ['--version'], { encoding: 'utf8' }).status === 0;
}

// The bash suite refused to run at all without git and npm; a node:test suite
// says so per case instead of aborting the whole run.
function skipWithoutTooling(t: TestContext): boolean {
  if (!hasTool('git')) {
    t.skip('git is not installed');
    return true;
  }
  if (!hasTool('npm')) {
    t.skip('npm is not installed');
    return true;
  }
  return false;
}

// bash `invoke`: one Stop payload on stdin, the hook's stdout back.
function invoke(repo: string, transcriptPath: string, opts: InvokeOptions = {}): RunResult {
  const stdin = envelope({
    event: 'Stop',
    cwd: repo,
    sid: opts.sid ?? 'nosession',
    transcript: transcriptPath,
    stopHookActive: opts.stopHookActive ?? false,
  });
  return runCli(['hook', 'stop-verify'], { stdin, env: { ...ISOLATED, ...(opts.env ?? {}) }, cwd: repo });
}

// bash `jq -r '.decision // empty' 2>/dev/null || true`: an empty or unparseable
// stdout is "no decision", which is also what a systemMessage (infra skip) reads
// as — the bash suite asserted the same field for both.
function decisionOf(stdout: string): string {
  const field = jsonField(stdout, 'decision');
  return typeof field === 'string' ? field : '';
}

function reasonOf(stdout: string): string {
  const field = jsonField(stdout, 'reason');
  return typeof field === 'string' ? field : '';
}

function jsonField(stdout: string, name: string): unknown {
  if (stdout.trim() === '') return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout) as unknown;
  } catch {
    return undefined;
  }
  return isRecord(parsed) ? parsed[name] : undefined;
}

// bash make_transcript, in both shapes. Written inside the repo: the gate only
// collects .ts/.tsx/.js/.jsx edits, so a .jsonl beside the package is inert.
function transcriptFile(repo: string, toolUses: ToolUse[], legacy: boolean): string {
  const path = join(repo, 'transcript.jsonl');
  writeFileSync(path, transcript(toolUses, { legacy }));
  return path;
}

function edits(repo: string, ...files: string[]): ToolUse[] {
  return files.map((file) => ({ name: 'Edit', input: { file_path: join(repo, file) } }));
}

function reads(repo: string, ...files: string[]): ToolUse[] {
  return files.map((file) => ({ name: 'Read', input: { file_path: join(repo, file) } }));
}

// bash make_mixed_transcript: ONE JSONL line carrying both a Read and an Edit.
// The harness `transcript` writes one tool_use per line, so this line is built
// here rather than adding a helper to the shared harness.
function mixedTranscriptFile(repo: string, readPath: string, editPath: string, legacy: boolean): string {
  const key = legacy ? 'tool_input' : 'input';
  const line = JSON.stringify({
    type: 'assistant',
    message: {
      content: [
        { type: 'tool_use', name: 'Read', [key]: { file_path: readPath } },
        { type: 'tool_use', name: 'Edit', [key]: { file_path: editPath } },
      ],
    },
  });
  const path = join(repo, 'mixed.jsonl');
  writeFileSync(path, `${line}\n`);
  return path;
}

function telemetryDir(repo: string): string {
  return join(repo, '.git', 'engineos-telemetry');
}

function telemetryLines(repo: string, sid: string, suffix: string): Record<string, unknown>[] {
  const path = join(telemetryDir(repo), `${sid}${suffix}`);
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => {
      const parsed: unknown = JSON.parse(line);
      assert.equal(isRecord(parsed), true, `${path} carries a non-object line`);
      return isRecord(parsed) ? parsed : {};
    });
}

function dataOf(line: Record<string, unknown>): Record<string, unknown> {
  const data = line['data'];
  return isRecord(data) ? data : {};
}

// A package.json whose scripts are the deterministic, offline commands the bash
// suite planted (`exit 0` / `exit 1` are shell builtins — no network, no
// toolchain, one exit code).
function pkg(scripts: Record<string, string>): Record<string, unknown> {
  return { scripts };
}

// Registers the same case twice, once per transcript shape.
function both(name: string, body: (t: TestContext, legacy: boolean) => void): void {
  for (const legacy of [false, true]) {
    test(legacy ? `${name} (legacy transcript)` : name, (t) => {
      body(t, legacy);
    });
  }
}

// ------------------------------------------------------------------ the cases

both('case1 no-package.json — no block', (t, legacy) => {
  if (skipWithoutTooling(t)) return;
  const repo = fixtureRepo(tempRoot(t), { files: { 'src/x.ts': '', '.engineos/.keep': '' } });
  const path = transcriptFile(repo, edits(repo, 'src/x.ts'), legacy);
  assert.equal(decisionOf(invoke(repo, path).stdout), '');
});

// rules/verification.md "Tests are opt-in": with ENGINEOS_VERIFY_TESTS unset,
// "test" is not in the default target list, so a package whose only script is a
// failing test must not block the gate.
both('case2 failing-test-not-opted-in — no block', (t, legacy) => {
  if (skipWithoutTooling(t)) return;
  const repo = fixtureRepo(tempRoot(t), { pkg: pkg({ test: 'exit 1' }), files: { 'src/x.ts': '', '.engineos/.keep': '' } });
  const path = transcriptFile(repo, edits(repo, 'src/x.ts'), legacy);
  assert.equal(decisionOf(invoke(repo, path).stdout), '');
});

// Same package as case 2, but with the opt-in flag set: "test" joins the targets
// and the failing script must now block.
both('case2b failing-test-opted-in — block', (t, legacy) => {
  if (skipWithoutTooling(t)) return;
  const repo = fixtureRepo(tempRoot(t), { pkg: pkg({ test: 'exit 1' }), files: { 'src/x.ts': '', '.engineos/.keep': '' } });
  const path = transcriptFile(repo, edits(repo, 'src/x.ts'), legacy);
  const result = invoke(repo, path, { env: { ENGINEOS_VERIFY_TESTS: '1' } });
  assert.equal(decisionOf(result.stdout), 'block');
});

// Proves the opt-in path itself does not spuriously block when the test passes.
both('case3 passing-test-opted-in — no block', (t, legacy) => {
  if (skipWithoutTooling(t)) return;
  const repo = fixtureRepo(tempRoot(t), { pkg: pkg({ test: 'exit 0' }), files: { 'src/x.ts': '', '.engineos/.keep': '' } });
  const path = transcriptFile(repo, edits(repo, 'src/x.ts'), legacy);
  const result = invoke(repo, path, { env: { ENGINEOS_VERIFY_TESTS: '1' } });
  assert.equal(decisionOf(result.stdout), '');
});

both('case4 loop-guard — no block with stop_hook_active=true', (t, legacy) => {
  if (skipWithoutTooling(t)) return;
  const repo = fixtureRepo(tempRoot(t), { pkg: pkg({ test: 'exit 1' }), files: { 'src/x.ts': '', '.engineos/.keep': '' } });
  const path = transcriptFile(repo, edits(repo, 'src/x.ts'), legacy);
  assert.equal(decisionOf(invoke(repo, path, { stopHookActive: true }).stdout), '');
});

both('case5 no-test-script — no block', (t, legacy) => {
  if (skipWithoutTooling(t)) return;
  const repo = fixtureRepo(tempRoot(t), { pkg: pkg({ lint: 'exit 0' }), files: { 'src/x.ts': '', '.engineos/.keep': '' } });
  const path = transcriptFile(repo, edits(repo, 'src/x.ts'), legacy);
  assert.equal(decisionOf(invoke(repo, path).stdout), '');
});

both('case6 failing-lint-pass-test — block', (t, legacy) => {
  if (skipWithoutTooling(t)) return;
  const repo = fixtureRepo(tempRoot(t), { pkg: pkg({ test: 'exit 0', lint: 'exit 1' }), files: { 'src/x.ts': '', '.engineos/.keep': '' } });
  const path = transcriptFile(repo, edits(repo, 'src/x.ts'), legacy);
  assert.equal(decisionOf(invoke(repo, path).stdout), 'block');
});

// The edited file lives under a directory whose name contains a space, and that
// directory — not the repo root — is the package the gate must enter. Opted in,
// since "test" is the only script the spaced package declares.
both('case7 space-in-path — block', (t, legacy) => {
  if (skipWithoutTooling(t)) return;
  const repo = fixtureRepo(tempRoot(t), {
    files: {
      'my pkg/package.json': `${JSON.stringify(pkg({ test: 'exit 1' }))}\n`,
      'my pkg/src/x.ts': '',
      '.engineos/.keep': '',
    },
  });
  const path = transcriptFile(repo, edits(repo, 'my pkg/src/x.ts'), legacy);
  const result = invoke(repo, path, { env: { ENGINEOS_VERIFY_TESTS: '1' } });
  assert.equal(decisionOf(result.stdout), 'block');
});

// A transcript containing only a Read tool_use for a .ts file must NOT pull that
// file's package into the gate, even when its test script exits 1.
both('case8 read-only-no-block', (t, legacy) => {
  if (skipWithoutTooling(t)) return;
  const repo = fixtureRepo(tempRoot(t), { pkg: pkg({ test: 'exit 1' }), files: { 'src/readonly.ts': '', '.engineos/.keep': '' } });
  const path = transcriptFile(repo, reads(repo, 'src/readonly.ts'), legacy);
  assert.equal(decisionOf(invoke(repo, path).stdout), '');
});

// A flat line-grep cannot tell which tool_use a "file_path" belongs to on a line
// carrying both a Read and an Edit; the structured parse must exclude the Read
// file's package (failing) and pick up only the Edit file's package (passing).
both('case9 mixed-read-edit-line — no block', (t, legacy) => {
  if (skipWithoutTooling(t)) return;
  const repo = fixtureRepo(tempRoot(t), {
    pkg: pkg({ test: 'exit 0' }),
    files: {
      'src/edited.ts': '',
      'pkgR/package.json': `${JSON.stringify(pkg({ test: 'exit 1' }))}\n`,
      'pkgR/src/readonly.ts': '',
      '.engineos/.keep': '',
    },
  });
  const path = mixedTranscriptFile(repo, join(repo, 'pkgR/src/readonly.ts'), join(repo, 'src/edited.ts'), legacy);
  assert.equal(decisionOf(invoke(repo, path).stdout), '');
});

// Historically this covered the hook's own jq-free fallback. The runtime is node
// now and there is no jq path left to get wrong, so what the case proves is the
// other half, and it is the half that can still regress: jq is not a DEPENDENCY
// of the Stop gate, and the loop guard still fires with jq genuinely off PATH.
// Dropping jq's directory is not enough on a machine carrying jq twice (e.g.
// /usr/bin AND a conda env), so the PATH here holds exactly one entry — a
// directory containing node and nothing else.
both('case10 no-jq-loop-guard — no block with stop_hook_active=true', (t, legacy) => {
  if (skipWithoutTooling(t)) return;
  const root = tempRoot(t);
  const repo = fixtureRepo(root, { pkg: pkg({ test: 'exit 1' }), files: { 'src/x.ts': '', '.engineos/.keep': '' } });
  const path = transcriptFile(repo, edits(repo, 'src/x.ts'), legacy);
  const bin = join(root, 'nojq-bin');
  mkdirSync(bin, { recursive: true });
  symlinkSync(process.execPath, join(bin, 'node'));
  assert.equal(existsSync(join(bin, 'jq')), false, 'the sandbox PATH must not resolve jq');
  const result = invoke(repo, path, { stopHookActive: true, env: { PATH: bin } });
  assert.equal(decisionOf(result.stdout), '');
});

// The bash hook pasted the fix-loop bound into the reason itself, so this case
// grepped for the words it pasted. The node runtime asks the kernel instead
// (src/hooks/stop-verify.ts -> src/kernel/repair, the one reader of policy.json
// .repair), so the assertion follows the wiring rather than the old wording: the
// reason must carry, verbatim, what the kernel answers for the FIRST red of that
// check. A hook that kept a private copy of the ladder fails here, and so does
// one that stopped consulting the kernel at all.
both('case11 repair-ladder-in-reason', (t, legacy) => {
  if (skipWithoutTooling(t)) return;
  const answer = runCli(['kernel', 'repair', '--check', 'lint', '--attempt', '1'], { env: ISOLATED });
  const ladder = reasonOf(answer.stdout);
  assert.notEqual(ladder, '', 'kernel repair --check lint --attempt 1 answered no reason');
  // red via lint, not test: tests are opt-in, so a failing "test" script alone no
  // longer makes the default gate go red.
  const repo = fixtureRepo(tempRoot(t), { pkg: pkg({ lint: 'exit 1' }), files: { 'src/x.ts': '', '.engineos/.keep': '' } });
  const path = transcriptFile(repo, edits(repo, 'src/x.ts'), legacy);
  const reason = reasonOf(invoke(repo, path).stdout);
  assert.equal(
    reason.startsWith(`EngineOS gate: verification failed. ${ladder} `),
    true,
    `expected the kernel's own reason [${ladder}] after the gate prefix, got: ${reason}`,
  );
});

both('case12 red-run-writes-verify-event', (t, legacy) => {
  if (skipWithoutTooling(t)) return;
  const repo = fixtureRepo(tempRoot(t), {
    pkg: pkg({ lint: 'exit 1' }),
    files: { 'src/x.ts': '', '.engineos/.keep': '' },
  });
  const path = transcriptFile(repo, edits(repo, 'src/x.ts'), legacy);
  invoke(repo, path, { sid: 'vsmoke1' });
  const lines = telemetryLines(repo, 'vsmoke1', '.jsonl');
  assert.equal(lines.length, 1);
  const line = lines[0] ?? {};
  assert.equal(line['event'], 'verify');
  assert.equal(dataOf(line)['failed'], true);
});

both('case13 green-run-writes-failed-false', (t, legacy) => {
  if (skipWithoutTooling(t)) return;
  const repo = fixtureRepo(tempRoot(t), {
    pkg: pkg({ test: 'exit 0' }),
    files: { 'src/x.ts': '', '.engineos/.keep': '' },
  });
  const path = transcriptFile(repo, edits(repo, 'src/x.ts'), legacy);
  invoke(repo, path, { sid: 'vsmoke2' });
  const lines = telemetryLines(repo, 'vsmoke2', '.jsonl');
  assert.equal(lines.length, 1);
  assert.equal(dataOf(lines[0] ?? {})['failed'], false);
});

both('case14 one-stop-cycle-logs-one-verify-event', (t, legacy) => {
  if (skipWithoutTooling(t)) return;
  const repo = fixtureRepo(tempRoot(t), {
    pkg: pkg({ test: 'exit 1' }),
    files: { 'src/x.ts': '', '.engineos/.keep': '' },
  });
  const path = transcriptFile(repo, edits(repo, 'src/x.ts'), legacy);
  invoke(repo, path, { sid: 'vsmoke3' });
  invoke(repo, path, { sid: 'vsmoke3', stopHookActive: true });
  assert.equal(telemetryLines(repo, 'vsmoke3', '.jsonl').length, 1);
});

both('case15 ENGINEOS_TELEMETRY=0-writes-no-file', (t, legacy) => {
  if (skipWithoutTooling(t)) return;
  const repo = fixtureRepo(tempRoot(t), {
    pkg: pkg({ test: 'exit 1' }),
    files: { 'src/x.ts': '', '.engineos/.keep': '' },
  });
  const path = transcriptFile(repo, edits(repo, 'src/x.ts'), legacy);
  invoke(repo, path, { sid: 'vsmoke4', env: { ENGINEOS_TELEMETRY: '0' } });
  assert.equal(existsSync(telemetryDir(repo)), false);
});

// The ONE case still driven as bash: the stand-in node below cannot execute
// dist/engineos.cjs, so what it exercises is the SHIM's refusal to produce a
// decision under an unusable node — `runCli` spawns the bundle with the running
// node and would never reach that code path. The gate's own node-too-old rung is
// covered where it can be driven honestly: src/hooks/stop-verify.test.ts passes
// the node version in, and src/node-guard.ts owns the skip message the CLI
// prints for a real node below 18.
both('case16 ancient-node-infra-skip — no block (shim, driven as bash)', (t, legacy) => {
  if (skipWithoutTooling(t)) return;
  if (!hasTool('bash')) {
    t.skip('bash is not installed');
    return;
  }
  const root = tempRoot(t);
  const repo = fixtureRepo(root, { pkg: pkg({ test: 'exit 1' }), files: { 'src/x.ts': '', '.engineos/.keep': '' } });
  const path = transcriptFile(repo, edits(repo, 'src/x.ts'), legacy);
  const oldBin = join(root, 'oldbin');
  mkdirSync(oldBin, { recursive: true });
  const fakeNode = join(oldBin, 'node');
  writeFileSync(fakeNode, '#!/bin/sh\necho v16.17.0\n');
  chmodSync(fakeNode, 0o755);
  // No .nvm under this HOME — the rescue is unavailable.
  const fakeHome = join(root, 'fakehome');
  mkdirSync(fakeHome, { recursive: true });
  const stdin = envelope({ event: 'Stop', cwd: repo, sid: 'nodesmoke', transcript: path, stopHookActive: false });
  const result = spawnSync('bash', [join(checkout, 'hooks', 'stop-verify.sh')], {
    input: stdin,
    env: { ...ISOLATED, HOME: fakeHome, PATH: `${oldBin}:${process.env['PATH'] ?? ''}` },
    encoding: 'utf8',
  });
  assert.equal(decisionOf(result.stdout ?? ''), '');
});

// Before the runner seam, the "target was never really there" guard existed only
// in the Nx arm; a package-manager run reporting a missing script still went red.
// Both arms now share one guard (src/hooks/classify-failure.ts). The script emits
// the runner's own missing-script wording itself because `npm run -s` silences
// npm's real report, so npm cannot produce it here — the guard matches on that
// wording wherever the runner does emit it (pnpm, yarn).
both('case17 npm-arm-infra-guard — no block', (t, legacy) => {
  if (skipWithoutTooling(t)) return;
  const repo = fixtureRepo(tempRoot(t), {
    pkg: pkg({ lint: 'echo "Missing script: \\"lint\\""; exit 1' }),
    files: { 'src/x.ts': '', '.engineos/.keep': '' },
  });
  const path = transcriptFile(repo, edits(repo, 'src/x.ts'), legacy);
  assert.equal(decisionOf(invoke(repo, path).stdout), '');
});

// The Nx and package-manager ladders each carried their own copy of the 90s/180s
// budgets and had already drifted apart. Asserted at the source, because proving
// it through behaviour would need a fake runner adapter — rejected by the owner
// (docs/specs/2026-09-02-deepen-runtime-modules-design.md), tests stay on real
// npm. The caller states each budget exactly once and the adapter states none —
// it takes the budget as a parameter. No transcript, so this case has no legacy
// twin. (bash counted grep MATCHES for the caller and grep LINES for the
// adapter; both are counted as matches here, and zero is zero either way.)
test('case18 one-timeout-table', () => {
  const caller = readFileSync(join(checkout, 'src', 'hooks', 'stop-verify.ts'), 'utf8');
  const adapter = readFileSync(join(checkout, 'src', 'hooks', 'runner.ts'), 'utf8');
  assert.equal((caller.match(/\b90\b/g) ?? []).length, 1, 'src/hooks/stop-verify.ts states the 90s budget exactly once');
  assert.equal((caller.match(/\b180\b/g) ?? []).length, 1, 'src/hooks/stop-verify.ts states the 180s budget exactly once');
  assert.equal((adapter.match(/\b(?:90|180)\b/g) ?? []).length, 0, 'src/hooks/runner.ts carries no budget literal');
});

// The kernel-decision event (case 12) says which packages went red; the span says
// the gate ran, how long it took and whether it passed (rules/observability.md
// "Agent traces"). Same guarded block, so the re-entry assertion here is the span
// half of case 14.
both('case19 stop-gate-writes-a-verification-span', (t, legacy) => {
  if (skipWithoutTooling(t)) return;
  const repo = fixtureRepo(tempRoot(t), {
    pkg: pkg({ lint: 'exit 1' }),
    files: { 'src/x.ts': '', '.engineos/.keep': '' },
  });
  const path = transcriptFile(repo, edits(repo, 'src/x.ts'), legacy);
  invoke(repo, path, { sid: 'vspan1' });
  invoke(repo, path, { sid: 'vspan1', stopHookActive: true });
  const lines = telemetryLines(repo, 'vspan1', '.exec.jsonl');
  assert.equal(lines.length, 1);
  const line = lines[0] ?? {};
  assert.equal(line['span_kind'], 'verification');
  assert.equal(line['status'], 'FAILED');
  assert.equal(line['capability_id'], 'validate');
  assert.equal(line['trace_id'], 'vspan1');
  assert.equal(typeof line['duration_ms'], 'number');
  // The line has to satisfy the exec-journal schema, not merely carry the fields
  // this case reads (bash: scripts/exec-journal.sh validate).
  const validated = runCli(['journal', 'validate', join(telemetryDir(repo), 'vspan1.exec.jsonl')], { env: ISOLATED });
  assert.equal(validated.status, 0, validated.stderr);
});

// The failure direction alone would pass against a hook hardwired to FAILED.
both('case20 green-run-writes-status-OK-span', (t, legacy) => {
  if (skipWithoutTooling(t)) return;
  const repo = fixtureRepo(tempRoot(t), {
    pkg: pkg({ lint: 'exit 0' }),
    files: { 'src/x.ts': '', '.engineos/.keep': '' },
  });
  const path = transcriptFile(repo, edits(repo, 'src/x.ts'), legacy);
  invoke(repo, path, { sid: 'vspan2' });
  const lines = telemetryLines(repo, 'vspan2', '.exec.jsonl');
  assert.equal(lines.length, 1);
  const line = lines[0] ?? {};
  assert.equal(line['span_kind'], 'verification');
  assert.equal(line['status'], 'OK');
});

// Case 15 covers the event file; the span shares the switch and the directory, so
// an unguarded span writer would recreate the directory case 15 asserts away.
both('case21 ENGINEOS_TELEMETRY=0-writes-no-span', (t, legacy) => {
  if (skipWithoutTooling(t)) return;
  const repo = fixtureRepo(tempRoot(t), {
    pkg: pkg({ lint: 'exit 1' }),
    files: { 'src/x.ts': '', '.engineos/.keep': '' },
  });
  const path = transcriptFile(repo, edits(repo, 'src/x.ts'), legacy);
  invoke(repo, path, { sid: 'vspan3', env: { ENGINEOS_TELEMETRY: '0' } });
  assert.equal(existsSync(telemetryDir(repo)), false);
});

// The gate runs the target repo's own scripts outside the tool-permission
// prompt, and `.engineos/` at the session root is the consent it reads. A
// package.json ABOVE that root — a non-adopted outer checkout, or one planted in
// a world-writable directory — never consented, and the unbounded ascent reached
// it anyway. This repo carries no package.json of its own, so the outer one is
// the only marker the edited file has: a gate that still blocks here is a gate
// that just ran a stranger's script.
both('case22 package-above-the-adopted-root — no block', (t, legacy) => {
  if (skipWithoutTooling(t)) return;
  const root = tempRoot(t);
  const repo = fixtureRepo(root, { files: { 'src/x.ts': '', '.engineos/.keep': '' } });
  writeFileSync(join(root, 'package.json'), `${JSON.stringify(pkg({ lint: 'exit 1', typecheck: 'exit 1' }))}\n`);
  const path = transcriptFile(repo, edits(repo, 'src/x.ts'), legacy);
  const result = invoke(repo, path, { sid: 'contain1' });
  assert.equal(decisionOf(result.stdout), '');
  assert.equal(reasonOf(result.stdout), '');
  // Nothing was verified, so there is no verdict to record either.
  assert.deepEqual(telemetryLines(repo, 'contain1', '.jsonl'), []);
});
