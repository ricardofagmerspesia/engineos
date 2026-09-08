// Shared fixture harness for kernel and hook tests (plan Task 6b). Seven exports,
// never imported from src/cli.ts, so esbuild never bundles it.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import type { TestContext } from 'node:test';
import { memoryIo } from '../io';
import type { Command } from '../dispatch';
import { isRecord, readJsonFile } from '../lib/json';
import { resolveRoot } from '../registry/paths';

export type HookEvent = 'SessionStart' | 'UserPromptSubmit' | 'PreToolUse' | 'PostToolUse' | 'Stop' | 'SubagentStart' | 'SubagentStop';
export interface ToolUse { name: string; input: Record<string, unknown> }
export interface RunResult { status: number; stdout: string; stderr: string }
export interface RunOptions { stdin?: string; env?: Record<string, string>; cwd?: string }

// One fresh directory per test, removed by t.after. Throws when the resolved path
// lies under the EngineOS checkout, so a test can never dirty the repo.
export function tempRoot(t: TestContext): string {
  const base = tmpdir();
  // Checked BEFORE mkdtemp: a TMPDIR aimed at the checkout must fail without
  // having created anything there.
  assertOutsideCheckout(base, 'TMPDIR');
  const dir = realOrResolved(mkdtempSync(join(base, 'engineos-test-')));
  assertOutsideCheckout(dir, 'temp root');
  t.after(() => {
    rmSync(dir, { recursive: true, force: true });
  });
  return dir;
}

// A git-initialised project under root with an optional package.json, nx.json and
// extra files. Returns the repo path. Enough for the runner probes in stop-verify.
export function fixtureRepo(root: string, opts: { pkg?: Record<string, unknown>; nx?: Record<string, unknown>; files?: Record<string, string> } = {}): string {
  assertOutsideCheckout(root, 'fixture repo root');
  mkdirSync(root, { recursive: true });
  // mkdtemp rather than a fixed name: one root may hold several repos, and a
  // second fixtureRepo call must not land on the first one's tree.
  const repo = realOrResolved(mkdtempSync(join(root, 'repo-')));
  git(repo, ['init', '-q']);
  // An empty initial commit so HEAD exists for diff-based probes.
  git(repo, ['commit', '-q', '--allow-empty', '-m', 'init']);
  if (opts.pkg !== undefined) writeJsonFile(join(repo, 'package.json'), opts.pkg);
  if (opts.nx !== undefined) writeJsonFile(join(repo, 'nx.json'), opts.nx);
  for (const [relativePath, contents] of Object.entries(opts.files ?? {})) {
    const target = join(repo, relativePath);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, contents);
  }
  return repo;
}

// Copies registries/ (and the bash shim while it exists) under root, applies
// mutate to the COPY of policy.json, returns the new ENGINEOS_ROOT. The checkout's
// registries are never written.
export function relocatedRoot(root: string, opts: { mutate?: (policy: Record<string, unknown>) => void } = {}): string {
  assertOutsideCheckout(root, 'relocated root');
  mkdirSync(root, { recursive: true });
  const dir = realOrResolved(mkdtempSync(join(root, 'engineos-')));
  assertOutsideCheckout(dir, 'relocated root');
  const checkout = checkoutRoot();
  cpSync(join(checkout, 'registries'), join(dir, 'registries'), { recursive: true });
  // scripts/kernel.sh derives its own root from where it sits, so a relocated copy
  // needs the script beside the registries it should answer against. Copied only
  // while that file is still bash; the shim swap (plan Task 13) makes it moot.
  const kernel = join(checkout, 'scripts', 'kernel.sh');
  if (existsSync(kernel)) {
    mkdirSync(join(dir, 'scripts'), { recursive: true });
    cpSync(kernel, join(dir, 'scripts', 'kernel.sh'));
  }
  if (opts.mutate !== undefined) {
    const policyPath = join(dir, 'registries', 'policy.json');
    const policy = readJsonRecord(policyPath);
    opts.mutate(policy);
    writeJsonFile(policyPath, policy);
  }
  return dir;
}

// The stdin JSON a hook receives for one event (design "Hook envelope").
export function envelope(opts: { event: HookEvent; cwd: string; sid: string; tool?: ToolUse; transcript?: string; stopHookActive?: boolean }): string {
  const payload: Record<string, unknown> = {
    hook_event_name: opts.event,
    cwd: opts.cwd,
    session_id: opts.sid,
  };
  if (opts.tool !== undefined) {
    payload['tool_name'] = opts.tool.name;
    payload['tool_input'] = opts.tool.input;
  }
  if (opts.transcript !== undefined) payload['transcript_path'] = opts.transcript;
  // Always emitted: every decoder defaults it to false anyway, and a fixed key set
  // keeps two envelopes for the same event byte-comparable.
  payload['stop_hook_active'] = opts.stopHookActive ?? false;
  return JSON.stringify(payload);
}

// A Claude transcript JSONL with one tool_use per entry. Default is the real
// harness shape (`input`); { legacy: true } emits the older `tool_input` key the
// bash suites still exercise. stop-verify e2e runs one case per form.
export function transcript(toolUses: ToolUse[], opts: { legacy?: boolean } = {}): string {
  const inputKey = opts.legacy === true ? 'tool_input' : 'input';
  const lines = toolUses.map((toolUse) =>
    JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'tool_use', name: toolUse.name, [inputKey]: toolUse.input }] },
    }),
  );
  return lines.length === 0 ? '' : `${lines.join('\n')}\n`;
}

// Black-box drive: spawnSync(process.execPath, ['dist/engineos.cjs', ...args]).
export function runCli(args: string[], opts: RunOptions = {}): RunResult {
  const bundle = join(checkoutRoot(), 'dist', 'engineos.cjs');
  const result = spawnSync(process.execPath, [bundle, ...args], {
    input: opts.stdin ?? '',
    env: childEnv(opts.env),
    // Mirrors memoryIo's deliberately non-existent-repo default (src/io.ts): a case
    // that forgets cwd must never resolve against the real checkout.
    cwd: opts.cwd ?? '/',
    encoding: 'utf8',
  });
  if (result.error !== undefined) throw new Error(`runCli could not spawn ${bundle}: ${result.error.message}`);
  return { status: result.status ?? 1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

// White-box drive: calls a Command with memoryIo(opts); stdout/stderr joined.
export function runInProcess(command: Command, argv: string[], opts: RunOptions = {}): RunResult {
  const io = memoryIo({ stdin: opts.stdin ?? '', env: opts.env ?? {}, cwd: opts.cwd ?? '/' });
  const status = command(argv, io);
  return { status, stdout: io.stdout.join(''), stderr: io.stderr.join('') };
}

// ------------------------------------------------------------------ internals

// Only these reach a spawned CLI. An operator's ENGINEOS_* switch (a bypass flag, a
// stray ENGINEOS_ROOT) must never leak into a case and quietly make it pass; PATH
// and HOME stay because the CLI probes git and package runners through them.
const CLI_ENV_ALLOWLIST = ['PATH', 'HOME', 'TMPDIR', 'LANG', 'SHELL', 'SystemRoot', 'USERPROFILE', 'COMSPEC'];

let cachedCheckout: string | undefined;

// The checkout this harness was compiled into. resolveRoot is given an EMPTY env
// rather than process.env on purpose: the guard below exists to keep a test out of
// the real checkout, and a case that has already pointed ENGINEOS_ROOT at a
// relocated copy must not thereby disarm it.
function checkoutRoot(): string {
  if (cachedCheckout !== undefined) return cachedCheckout;
  cachedCheckout = realOrResolved(resolveRoot({}, realOrResolved(__dirname)));
  return cachedCheckout;
}

function realOrResolved(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

function isUnder(child: string, parent: string): boolean {
  return child === parent || child.startsWith(parent + sep);
}

function assertOutsideCheckout(path: string, what: string): void {
  const target = realOrResolved(path);
  const root = checkoutRoot();
  if (isUnder(target, root)) {
    throw new Error(`${what} resolves inside the EngineOS checkout (${target}); fixtures never write there`);
  }
}

function childEnv(overrides: Record<string, string> | undefined): NodeJS.ProcessEnv {
  const base: NodeJS.ProcessEnv = {};
  for (const name of CLI_ENV_ALLOWLIST) {
    const value = process.env[name];
    if (value !== undefined) base[name] = value;
  }
  return { ...base, ...overrides };
}

function git(cwd: string, args: string[]): void {
  // Identity is passed per command so a fixture never depends on the operator's
  // global git config, and never signs.
  const identity = ['-c', 'user.email=harness@engineos.test', '-c', 'user.name=EngineOS Harness', '-c', 'commit.gpgsign=false'];
  const result = spawnSync('git', [...identity, ...args], { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed in ${cwd}: ${result.stderr ?? result.error?.message ?? ''}`);
}

function readJsonRecord(path: string): Record<string, unknown> {
  const parsed = readJsonFile(path);
  if (!isRecord(parsed)) throw new Error(`${path} is not a JSON object`);
  return parsed;
}

function writeJsonFile(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}
