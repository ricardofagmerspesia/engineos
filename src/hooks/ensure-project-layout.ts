// SessionStart: expire the bypass, reap stale session state, and scaffold the
// standard project layout. Port of hooks/ensure-project-layout.sh.
//
// The order below is the whole design and it is not alphabetical: the bypass
// marker dies and the stale gate flags are reaped BEFORE the engineos-repo skip,
// so a forgotten bypass always expires at the next session start — including
// inside the EngineOS checkout itself, which that skip would otherwise exempt.
//
// Every path returns a non-failing decision. This hook runs on every session
// start and must never break one, so a malformed registry, an unwritable git dir
// or a hostile worktree ends as `silent`, never as an error.
import { lstatSync, readdirSync, rmSync, statSync, unlinkSync, type Dirent, type Stats } from 'node:fs';
import { join } from 'node:path';
import { bypassMarker } from './bypass';
import type { HookEnvelope } from './envelope';
import { context, silent, type HookContext, type HookDecision } from './output';
import { loadLayoutManifest, scaffoldLayout } from './scaffold';
import { languagesOf, packageLabel, resolveStack } from '../kernel/stack';
import { gitDir, repoRoot } from '../lib/git';
import { KernelError } from '../lib/json';
import { loadTelemetryPolicy } from '../registry/policy-telemetry';
import { loadProjectConfig, type Language } from '../registry/project-config';

const DAY_MS = 86_400_000;

// The record-change skill clears these per session on completion; a crashed or
// abandoned session can otherwise leave one behind indefinitely and block the
// Stop gate for good.
const UNRECORDED_PREFIX = 'ENGINEOS_UNRECORDED.';
const UNRECORDED_MAX_AGE_DAYS = 7;

const ROUTE_CACHE = 'engineos-route-cache';
const TELEMETRY = 'engineos-telemetry';
const SPANS = 'spans';

const OPT_IN_HINT =
  '[engineos] layout not scaffolded (opt-in): run `mkdir .engineos` in the project or set ENGINEOS_SCAFFOLD=1';

export function run(env: HookEnvelope, ctx: HookContext): HookDecision {
  if (env.cwd === '') return silent;

  // A bypass never outlives the session that asked for it. Done first, so the
  // two skips below cannot exempt it.
  const marker = bypassMarker(env.cwd, ctx.spawn);
  if (marker !== null) removeFile(marker);

  const project = repoRoot(env.cwd, ctx.spawn);
  if (project === null) return silent;

  const git = gitDir(env.cwd, ctx.spawn);
  if (git !== null && isDirectory(git)) {
    const now = ctx.now();
    reapUnrecordedFlags(git, now);
    // Route answers are session-scoped hot-path data. Removing the bounded cache
    // here also clears entries left by clients that omitted a session id.
    wipeTree(join(git, ROUTE_CACHE));
    reapTelemetry(git, ctx, now);
  }

  // Skip the engineos repo itself (it ships the manifest at its root).
  if (isFile(join(project, 'hooks', 'layout-manifest.sh')) && isFile(join(project, 'install.sh'))) return silent;

  // Opt-in gate: scaffolding dirties the worktree, so it never runs on repos that
  // haven't adopted EngineOS. Adopted = `.engineos/` already present, or the user
  // opts a new project in with ENGINEOS_SCAFFOLD=1. ENGINEOS_SCAFFOLD=0 disables
  // even for adopted repos.
  const optIn = ctx.io.env['ENGINEOS_SCAFFOLD'];
  if (optIn === '0') return silent;
  if (optIn !== '1' && !isDirectory(join(project, '.engineos'))) return context('SessionStart', OPT_IN_HINT);

  const lines: string[] = [];
  try {
    const created = scaffoldLayout(project, ctx.root, loadLayoutManifest(ctx.root));
    if (created.length > 0) lines.push(`[engineos] scaffolded standard layout: ${created.join(', ')} (review seeded READMEs)`);
  } catch {
    // A missing or malformed manifest must never print an error into a session
    // start; bash swallowed the same failure with `. scaffold-layout.sh || exit 0`.
    return silent;
  }
  // The stack line rides the same context decision as the scaffold line: one
  // hook, one decision, so a session start never renders two payloads.
  const stack = stackLine(project);
  if (stack !== null) lines.push(stack);
  if (lines.length === 0) return silent;
  return context('SessionStart', lines.join('\n'));
}

// `[engineos] stack: fastapi@backend · react@frontend · runners: python: ruff/pyright/pytest, node: lint/typecheck scripts`
// Config or detection, whichever resolveStack answers. Null when nothing
// resolves — a repo with no package marker gets no line rather than an empty
// one. A config that does not load is reported on the line instead of being
// swallowed: the runner will refuse the same file, and a session that opens
// with the reason beats one that finds out at the Stop gate.
const RUNNERS: Readonly<Record<Language, string>> = {
  python: 'python: ruff/pyright/pytest',
  node: 'node: lint/typecheck scripts',
};

function stackLine(project: string): string | null {
  let packages;
  try {
    packages = resolveStack(project, loadProjectConfig(project)).packages;
  } catch (e) {
    return e instanceof KernelError ? `[engineos] stack: ${e.message}` : null;
  }
  if (packages.length === 0) return null;
  const labels = packages.map(packageLabel);
  const runners = languagesOf(packages).map((language) => RUNNERS[language]);
  return `[engineos] stack: ${labels.join(' · ')} · runners: ${runners.join(', ')}`;
}

// bash `find <gitdir> -maxdepth 1 -name 'ENGINEOS_UNRECORDED.*' -mtime +7 -delete`.
function reapUnrecordedFlags(git: string, now: number): void {
  for (const name of readDirNames(git)) {
    if (!name.startsWith(UNRECORDED_PREFIX)) continue;
    reapIfStale(join(git, name), UNRECORDED_MAX_AGE_DAYS, now);
  }
}

// Kernel-telemetry event files and agent-span journals past their retention
// window. The window is registries/policy.json telemetry.retention_days, read at
// runtime and never hardcoded, so a private-copy window cannot drift from the
// registry.
function reapTelemetry(git: string, ctx: HookContext, now: number): void {
  const dir = join(git, TELEMETRY);
  if (!isDirectory(dir)) return;
  let days: number;
  try {
    days = loadTelemetryPolicy(ctx.root).retention_days;
  } catch {
    return;
  }
  if (!Number.isInteger(days) || days < 0) return;
  // The '*.jsonl' glob already covers the agent-span journals as well —
  // <session>.exec.jsonl ends in .jsonl (rules/observability.md "Agent traces") —
  // so both streams retire on the one registry window.
  for (const name of readDirNames(dir)) {
    if (name.endsWith('.jsonl')) reapIfStale(join(dir, name), days, now);
  }
  // Span start markers under engineos-telemetry/spans are one file per in-flight
  // dispatch, removed by announce-agent-return when the span closes. A dispatch
  // whose return hook never fired leaves one behind, and the pass above never
  // descends into their directory, so they retire on the same window rather than
  // accumulating for the life of the repo.
  const spans = join(dir, SPANS);
  if (isDirectory(spans)) reapFilesBelow(spans, days, now);
}

function reapFilesBelow(dir: string, days: number, now: number): void {
  for (const entry of readDirEntries(dir)) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) reapFilesBelow(path, days, now);
    else if (entry.isFile()) reapIfStale(path, days, now);
  }
}

// `-mtime +N` counts whole 24-hour periods and compares strictly, so a file is
// stale only once it is more than N full days old.
function reapIfStale(path: string, days: number, now: number): void {
  const stat = lstatOrNull(path);
  if (stat === null || !stat.isFile()) return;
  if (Math.floor((now - stat.mtimeMs) / DAY_MS) > days) removeFile(path);
}

// bash wiped the cache with two `find` passes (files, then empty dirs), which
// left a planted symlink and its parent standing. Removing the tree outright is
// the wipe the passes were approximating; `rm` never follows a link out of it.
function wipeTree(dir: string): void {
  if (!isDirectory(dir)) return;
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // A cache that cannot be removed is a stale cache, not a broken session.
  }
}

function removeFile(path: string): void {
  try {
    unlinkSync(path);
  } catch {
    // bash `rm -f`: absent or unremovable is not an error here.
  }
}

function readDirNames(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

function readDirEntries(dir: string): Dirent[] {
  try {
    return readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

function lstatOrNull(path: string): Stats | null {
  try {
    return lstatSync(path);
  } catch {
    return null;
  }
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}
