// C30: hook entry points are executable, libraries are not.
//
// hooks/hooks.json registers the node form now, but a settings.json that copied
// the old entries still executes each hooks/*.sh shim BY PATH, and so do the
// e2e shim cases. An entry point that loses +x therefore does not degrade — it dies
// with "permission denied" on every fire and the guardrail is gone, silently and
// permanently. The mode bit is load-bearing, and nothing else checks it.
//
// install.sh used to decide which files to chmod by searching each file's own
// first eight lines for the phrase a library introduces itself with, unanchored,
// so a header sentence that contained the phrase while DENYING it was enough to
// leave an entry point at 644. It now reads an explicit list; this check is what
// makes that list honest, in three directions at once:
//   - every listed name exists, introduces itself as a library, and is NOT +x;
//   - every other hooks/*.sh IS +x and does not introduce itself as a library;
//   - install.sh does not go back to deciding it from the file's own text.
// The last one is the anchor itself, and the only assertion here that a tree
// with correct modes cannot satisfy by accident: revert the loop and every mode
// above still agrees, because the files themselves have not moved.
import { finding, result, type CheckResult, type Finding } from './findings';
import { skipOnce, type CheckContext } from './lib';
import { isExecutable } from './runtime-surface-fs';

export const C30_FINDINGS = [
  'library-list-unreadable',
  'listed-library-does-not-exist',
  'listed-library-does-not-introduce-itself-as-one',
  'library-carries-the-executable-bit',
  'hook-entry-point-is-not-executable',
  'introduces-itself-as-a-library-but-is-not-listed',
  'install-decides-executability-from-file-text',
] as const;

export const C30_TITLE =
  'hook modes are the honest signal install.sh treats them as: every hooks/*.sh outside install.sh\'s library list is executable, every library in it exists, says so in its header and is not executable, and the list — not the files\' own text — is what the installer reads';

const INSTALLER = 'install.sh';
const HOOKS_DIR = 'hooks';
// The self-introduction phrase is matched the same loose way install.sh used to
// match it, and that is deliberate: a false positive in THIS direction fails the
// build, where a false positive in the installer silently disabled a hook.
// Fail-closed and fail-open are not the same mistake.
const LIB_MARKER = 'Sourced only';
const HEADER_LINES = 8;
const LIST_PATTERN = /^ENGINEOS_HOOK_LIBRARIES="(.*)"$/m;

export function checkC30(ctx: CheckContext): CheckResult[] {
  const installer = ctx.readText(INSTALLER);
  if (installer === undefined || !ctx.exists(HOOKS_DIR)) {
    return skipOnce(ctx, 'C30', C30_TITLE, 'hook-modes');
  }
  const declared = LIST_PATTERN.exec(installer)?.[1];
  if (declared === undefined || declared.trim() === '') {
    return [result('C30', C30_TITLE, [finding('C30', 'library-list-unreadable', INSTALLER)])];
  }
  const libraries = declared.split(/\s+/).filter((name) => name !== '');
  const findings: Finding[] = [
    ...libraryFindings(ctx, libraries),
    ...entryPointFindings(ctx, new Set(libraries)),
    ...installerFindings(installer),
  ];
  return [result('C30', C30_TITLE, findings)];
}

// ------------------------------------------------------------------ internals

function libraryFindings(ctx: CheckContext, libraries: readonly string[]): Finding[] {
  const findings: Finding[] = [];
  for (const name of libraries) {
    const text = ctx.readText(`${HOOKS_DIR}/${name}`);
    if (text === undefined) {
      findings.push(finding('C30', 'listed-library-does-not-exist', name));
      continue;
    }
    if (!header(text).includes(LIB_MARKER)) {
      findings.push(finding('C30', 'listed-library-does-not-introduce-itself-as-one', name));
    }
    if (isExecutable(ctx.root, `${HOOKS_DIR}/${name}`)) {
      findings.push(finding('C30', 'library-carries-the-executable-bit', name));
    }
  }
  return findings;
}

function entryPointFindings(ctx: CheckContext, libraries: ReadonlySet<string>): Finding[] {
  const findings: Finding[] = [];
  for (const name of ctx.list(HOOKS_DIR)) {
    if (!name.endsWith('.sh') || libraries.has(name)) continue;
    const text = ctx.readText(`${HOOKS_DIR}/${name}`);
    // A directory or an unreadable entry is not a hook script.
    if (text === undefined) continue;
    if (!isExecutable(ctx.root, `${HOOKS_DIR}/${name}`)) {
      findings.push(finding('C30', 'hook-entry-point-is-not-executable', name));
    }
    if (header(text).includes(LIB_MARKER)) {
      findings.push(finding('C30', 'introduces-itself-as-a-library-but-is-not-listed', name));
    }
  }
  return findings;
}

// The phrase may appear in install.sh's prose — this check's own reason for
// existing is written there — but never in a line it runs.
function installerFindings(installer: string): Finding[] {
  const live = installer.split('\n').some((line) => line.includes(LIB_MARKER) && !/^\s*#/.test(line));
  return live ? [finding('C30', 'install-decides-executability-from-file-text', INSTALLER)] : [];
}

function header(text: string): string {
  return text.split('\n').slice(0, HEADER_LINES).join('\n');
}
