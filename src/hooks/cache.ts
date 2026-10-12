// Port of the cache section of hooks/route-before-change.sh.
//
// A path's route is immutable until routing.json changes, so the compact answer
// is cached per session in the worktree git dir. The registry signature and an
// optional operator buster make invalidation explicit without touching project
// files, and the session id keeps one session's cache out of another's.

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Decision, EscalateReason, FallbackReason } from '../kernel/decision-layer';
import { isRecord } from '../lib/json';
import { isRouterMode, isRouterSetting, type RouterMode, type RouterSetting } from '../registry/policy-router-decision';
import { parseProjectConfig, type PackageStack } from '../registry/project-config';

export interface RouteCachePaths {
  route: string;
  output: string;
}

// Null means "do not cache": no git dir, no relative path, or a path that is not
// normalized. A `..` or `.` segment is refused rather than resolved — a tool path
// the harness did not normalize must never escape the private cache tree.
export function routeCachePaths(
  gitDir: string,
  sid: string,
  routingSig: string,
  buster: string,
  rel: string,
): RouteCachePaths | null {
  if (gitDir === '' || rel === '') return null;
  if (/\/\.\.?\//.test(`/${rel}/`)) return null;
  const key = `${safeSid(sid)}-${routingSig}-${buster === '' ? '0' : buster}`;
  const route = `${gitDir}/engineos-route-cache/${key}/${rel}.route`;
  return { route, output: `${route}.output` };
}

// The session id reaches the hook from the harness and lands in a directory
// name; every character outside the slug class becomes an underscore, one for
// one, so two different ids can never collapse to the same key by length.
function safeSid(sid: string): string {
  return sid.replace(/[^A-Za-z0-9._-]/g, '_');
}

// ------------------------------------------------------- prompt advisor cache
//
// The prompt advisor's half (routing-decision-layer contracts §3): the resolved
// stack per project root, and the routing Decision per prompt, both for the
// session, beside the route cache in the same git dir. A resubmitted prompt
// costs no second Jev call and no second tree walk. Every read is lenient — an
// entry that does not parse back into the exact shape is a miss, never an
// error — and every write is best-effort.

// The session's advisor directory, or null when there is no git dir to hold it.
export function advisorCacheDir(gitDir: string, sid: string, buster: string): string | null {
  if (gitDir === '') return null;
  return `${gitDir}/engineos-route-cache/${safeSid(sid)}-advisor-${buster === '' ? '0' : buster}`;
}

export function stackCachePath(dir: string, projectRoot: string): string {
  return `${dir}/stack-${sha256(projectRoot).slice(0, 32)}.json`;
}

// What decides a routing answer besides the prompt: the stack it was offered
// against and the mode that ran. `requested` is in the key too, because the
// Decision reports it and an `auto` answer must not be replayed as a `jev` one.
export interface DecisionKey {
  prompt: string;
  languages: readonly string[];
  frameworks: readonly string[];
  focus: string | null;
  requested: RouterSetting;
  mode: RouterMode;
}

// sha256(prompt) + the stack + the mode, as the contract names it, folded into
// one hash so no prompt text and no unbounded list lands in a file name.
export function decisionCachePath(dir: string, key: DecisionKey): string {
  const material = JSON.stringify([sha256(key.prompt), key.languages, key.frameworks, key.focus, key.requested, key.mode]);
  return `${dir}/decision-${sha256(material).slice(0, 40)}.json`;
}

// The package list is stored in the .engineos/config.json shape so the reader
// can validate it with the same parser that validates the real file.
export function readCachedPackages(path: string): PackageStack[] | null {
  const parsed = readJson(path);
  if (parsed === undefined) return null;
  try {
    return parseProjectConfig(parsed, path).stack.packages;
  } catch {
    return null;
  }
}

export function writeCachedPackages(path: string, packages: readonly PackageStack[]): void {
  writeAtomic(path, `${JSON.stringify({ version: 1, stack: { packages } })}\n`);
}

export function readCachedDecision(path: string): Decision | null {
  const parsed = readJson(path);
  return parsed === undefined ? null : parseDecision(parsed);
}

export function writeCachedDecision(path: string, decision: Decision): void {
  writeAtomic(path, `${JSON.stringify(decision)}\n`);
}

const ESCALATE_REASONS: readonly EscalateReason[] = ['generic-only', 'low-confidence', 'tie', 'needs-router', 'no-match'];
const FALLBACK_REASON = /^(no-key|timeout|bad-answer|network|no-cli|http-\d{3})$/;

// The Decision's exact shape, field by field; anything else is a miss. Rebuilt
// rather than returned as parsed, so an extra key in a tampered entry never
// reaches the renderer.
export function parseDecision(value: unknown): Decision | null {
  if (!isRecord(value)) return null;
  const { mode, requested, intents, confidence, escalate, shadow } = value;
  const fallback = value['fallback_reason'];
  const latency = value['latency_ms'];
  const cost = value['cost_micros'];
  const reason = value['escalate_reason'];
  if (!isRouterMode(mode) || !isRouterSetting(requested) || !isStringList(intents)) return null;
  if (confidence !== null && !isUnit(confidence)) return null;
  if (typeof escalate !== 'boolean') return null;
  if (fallback !== null && !(typeof fallback === 'string' && FALLBACK_REASON.test(fallback))) return null;
  if (!isCount(latency) || (cost !== null && !isCount(cost))) return null;
  const escalateReason = ESCALATE_REASONS.find((known) => known === reason) ?? null;
  if (escalate !== (escalateReason !== null) || (reason !== null && escalateReason === null)) return null;
  let parsedShadow: Decision['shadow'] = null;
  if (shadow !== null) {
    if (!isRecord(shadow) || !isStringList(shadow['keyword_intents']) || typeof shadow['disagreement'] !== 'boolean') return null;
    parsedShadow = { keyword_intents: [...shadow['keyword_intents']], disagreement: shadow['disagreement'] };
  }
  return {
    mode,
    requested,
    intents: [...intents],
    confidence,
    escalate,
    // Narrowed by the pattern above: every string it accepts is a FallbackReason.
    fallback_reason: fallback === null ? null : fallbackReason(fallback),
    shadow: parsedShadow,
    latency_ms: latency,
    cost_micros: cost,
    escalate_reason: escalateReason,
  };
}

function fallbackReason(text: string): FallbackReason {
  if (text === 'no-key' || text === 'timeout' || text === 'bad-answer' || text === 'network' || text === 'no-cli') return text;
  return `http-${Number.parseInt(text.slice('http-'.length), 10)}`;
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isUnit(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as unknown;
  } catch {
    return undefined;
  }
}

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

// tmp + rename, so a concurrent hook fire never reads half an entry. A cache
// that cannot be written costs a recomputation next time and nothing else.
function writeAtomic(path: string, contents: string): void {
  try {
    mkdirSync(dirname(path), { recursive: true });
    const tmp = `${path}.${process.pid}`;
    writeFileSync(tmp, contents);
    renameSync(tmp, path);
  } catch {
    // Best-effort by design: see above.
  }
}
