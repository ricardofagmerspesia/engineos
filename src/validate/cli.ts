// `engineos validate` — the self-integrity harness scripts/validate-engineos.sh
// drives today.
//
// The harness prints no sentence of its own: every check line is render() over a
// CheckResult, and the counters read the result's status. `--only`, `--list`, the
// exit codes (0 clear, 1 violation, 2 bad arguments) and `passed N, failed N` are
// byte-compatible with the bash driver.
//
// The root comes from resolveRoot rather than the runtime's own location, so a
// relocated copy validates its own tree.
import type { Io } from '../io';
import { CHECKS, orderIds, selectIds, type Check } from '../checks/index';
import { finding, render, result, type CheckResult } from '../checks/findings';
import { makeContext, type CheckContext } from '../checks/lib';
import type { CheckId } from '../checks/ids';
import { resolveRoot } from '../registry/paths';

const EXIT_OK = 0;
const EXIT_VIOLATION = 1;
const EXIT_USAGE = 2;

const ALL = 'all';

interface Args {
  readonly only: string;
  readonly list: boolean;
}

export function runValidate(argv: string[], io: Io, checks: readonly Check[] = CHECKS): number {
  const args = parseArgs(argv, io);
  if (args === undefined) return EXIT_USAGE;

  const ids = orderIds(checks.map((check) => check.id));
  if (ids.length === 0) {
    io.err('no Checks registered\n');
    return EXIT_USAGE;
  }
  if (args.list) {
    for (const id of ids) io.out(`${id}\n`);
    return EXIT_OK;
  }

  const { selected, unknown } = selectIds(ids, args.only);
  if (unknown.length > 0) {
    io.err(`unknown check id: ${unknown.join(' ')}\n`);
    return EXIT_USAGE;
  }

  const byId = new Map<CheckId, Check>(checks.map((check) => [check.id, check]));
  // One context for the whole run: skipOnce and skipPending dedupe across
  // families, and the registries load once rather than once per Check.
  const context = makeContext(resolveRoot(io.env), io);
  io.out('== EngineOS integrity ==\n');
  let passed = 0;
  let failed = 0;
  for (const id of selected) {
    const check = byId.get(id);
    if (check === undefined) continue;
    for (const checkResult of runCheck(check, context, io)) {
      io.out(`${render(checkResult)}\n`);
      if (checkResult.status === 'ok') passed += 1;
      if (checkResult.status === 'fail') failed += 1;
    }
  }

  io.out(`\npassed ${passed}, failed ${failed}\n`);
  return failed > 0 ? EXIT_VIOLATION : EXIT_OK;
}

// -------------------------------------------------------------------- internals

function parseArgs(argv: string[], io: Io): Args | undefined {
  let only = ALL;
  let list = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--only') {
      // The bash guard is `[ $# -ge 2 ]`: any following token is the value, even
      // one that looks like another flag.
      const value = argv[index + 1];
      if (value === undefined) {
        io.err('--only requires a comma-separated check list\n');
        return undefined;
      }
      only = value;
      index += 1;
      continue;
    }
    if (arg === '--list') {
      list = true;
      continue;
    }
    io.err(`unknown argument: ${arg ?? ''}\n`);
    return undefined;
  }
  return { only, list };
}

// A Check that throws is a defect in the Check, not a clean tree: it reports as
// one counted FAIL naming itself, and the reason goes to stderr where it cannot
// be mistaken for a finding.
function runCheck(check: Check, context: CheckContext, io: Io): CheckResult[] {
  try {
    return check.run(context);
  } catch (error) {
    io.err(`validate: ${check.id} threw: ${messageOf(error)}\n`);
    return [result(check.id, check.id, [finding(check.id, 'precondition-missing', check.id)])];
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
