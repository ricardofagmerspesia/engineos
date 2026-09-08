// Shared vocabulary for the Check families, ported from scripts/checks/lib.sh.
//
// The bash file also carried the registry paths every family addressed as bare
// variables (R, D, C, MJ, ...). Those do not survive the port: a family reads a
// registry through ctx.registries, which is typed and loaded once, so a renamed
// key fails tsc instead of producing an empty grep.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Io } from '../io';
import { lazyRegistries, type Registries } from '../kernel/context';
import { alwaysOnRules, deferralsOf as deferralsOfRoot } from '../lib/deferrals';
import { finding, result, type CheckResult } from './findings';
import type { CheckId } from './ids';

export interface CheckContext {
  readonly root: string;
  readonly io: Io;
  readonly registries: Registries;
  // Tokens and paths already reported by skipOnce/skipPending in this run.
  readonly skipped: Set<string>;
  readText(rel: string): string | undefined;
  exists(rel: string): boolean;
  list(relDir: string): string[];
}

// One context per validate run, shared by every Check: the dedupe sets and the
// lazy registry loaders only mean anything when the families see the same one.
export function makeContext(root: string, io: Io): CheckContext {
  return {
    root,
    io,
    registries: lazyRegistries(root),
    skipped: new Set<string>(),
    readText(rel: string): string | undefined {
      try {
        return readFileSync(join(root, rel), 'utf8');
      } catch {
        // A missing file and an unreadable one are the same answer here: the
        // Check that asked owns the finding, this helper never throws into it.
        return undefined;
      }
    },
    exists(rel: string): boolean {
      return existsSync(join(root, rel));
    },
    list(relDir: string): string[] {
      try {
        return readdirSync(join(root, relDir)).sort(byteOrder);
      } catch {
        return [];
      }
    },
  };
}

// A missing shared precondition is one defect, not one per Check that trips over
// it. First call per token reports it as a counted FAIL; every later call in the
// same run answers with nothing to print.
export function skipOnce(ctx: CheckContext, check: CheckId, title: string, token: string): CheckResult[] {
  if (!claim(ctx, `once:${token}`)) return [];
  return [result(check, title, [finding(check, 'precondition-missing', token)])];
}

// skipOnce's sibling for the other kind of absent input: not a broken tree, but a
// tree that does not carry the artifact YET. It prints on its own `skip` line and
// touches neither counter, so `passed N, failed 0` keeps meaning "every check that
// could run, ran and passed". Gate on the deliverable's own primary artifact, and
// never on something the check's own findings name — a guard satisfiable by the
// thing under test is how a negative case becomes vacuous.
export function skipPending(ctx: CheckContext, check: CheckId, title: string, path: string): CheckResult[] {
  if (!claim(ctx, `pending:${path}`)) return [];
  return [result(check, title, [finding(check, 'artifact-pending', path)], { pending: true })];
}

// Rule `rule` defers to rule `s` when its text names `s.md` and `s` is not supplied
// globally. The derivation itself lives in src/lib/deferrals.ts, shared with the
// eval runner; this binds it to the context's tree.
export function deferralsOf(ctx: CheckContext, rule: string): string[] {
  return deferralsOfRoot(ctx.root, rule, alwaysOnRules(ctx.readText('CLAUDE.md') ?? ''));
}

// -------------------------------------------------------------------- internals

// The two guards share one set but never one key: a token and a path spelled the
// same way are different claims, and letting them collide would silence the second.
function claim(ctx: CheckContext, key: string): boolean {
  if (ctx.skipped.has(key)) return false;
  ctx.skipped.add(key);
  return true;
}

function byteOrder(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
