// Family `portability`: the two invariants that, when they break, make every
// other check unreadable rather than merely failing — adapter-mirror parity
// (C32) and the LF end-of-line policy (C33).
//
// Both were written after a Windows checkout rewrote 509 files to CRLF and the
// diff showed 512 changed files without a single semantic change. A repository
// in that state cannot be reviewed at all, so the regression has to be caught
// by a check rather than by reading.
//
// Ported from scripts/checks/80-portability.sh, which was registered nowhere:
// the 1.7.0 port stopped at C31, so neither invariant was being asserted.
import { readFileSync, readdirSync, type Dirent } from 'node:fs';
import { join } from 'node:path';
import { finding, result, type CheckResult, type Finding } from './findings';
import type { Check } from './index';
import { skipPending, type CheckContext } from './lib';

export const C32_FINDINGS = [
  'mirror-missing',
  'file-missing-in-mirror',
  'file-diverged',
  'file-only-in-mirror',
] as const;

export const C33_FINDINGS = ['crlf'] as const;

declare module './codes' {
  interface CheckCodes {
    C32: (typeof C32_FINDINGS)[number];
    C33: (typeof C33_FINDINGS)[number];
  }
}

export const PORTABILITY_CHECKS: readonly Check[] = [
  { id: 'C32', codes: C32_FINDINGS, run: checkC32 },
  { id: 'C33', codes: C33_FINDINGS, run: checkC33 },
];

export const C32_TITLE =
  'the adapter mirrors .trae/skills and .windsurf/skills are byte-identical to .agents/skills';

export const C33_TITLE =
  'every text file a POSIX parser reads is stored with LF line endings, *.ps1 being the one exception .gitattributes declares';

const MIRROR_BASE = '.agents/skills';
const MIRRORS: readonly string[] = ['.trae/skills', '.windsurf/skills'];

// The extensions the bash `find` branch named. *.ps1 is absent on purpose: it
// runs on a Windows host, is read by no POSIX parser, and .gitattributes gives
// it eol=crlf, so a CR in one is the policy holding rather than breaking.
const POSIX_TEXT_EXTENSIONS: readonly string[] = [
  '.sh', '.md', '.json', '.jsonl', '.ts', '.tsx', '.mjs', '.cjs', '.yaml', '.yml', '.py', '.sql',
];

// Skipped at ANY depth, not just the top level: none of these is under the eol
// policy (generated output, an installed dependency tree, a tool cache), and
// auditing them produces a FAIL nobody can fix.
const SKIPPED_DIRECTORIES: ReadonlySet<string> = new Set([
  '.git', 'node_modules', 'build', 'dist-release', '.next', '.claude', 'coverage',
]);

const CR = 0x0d;

// The mirrors enter the release zip only with --with-ide-mirrors, so a tree
// without the base directory is a packaged artifact rather than a broken
// checkout. Gated on the BASE, which no finding below names.
export function checkC32(ctx: CheckContext): CheckResult[] {
  if (!ctx.exists(MIRROR_BASE)) return skipPending(ctx, 'C32', C32_TITLE, MIRROR_BASE);

  // A wholly absent mirror is one defect, not one per file it does not carry:
  // the bash stopped here too, because a finding per base file would say
  // nothing the missing directory has not already said.
  const absent = MIRRORS.filter((mirror) => !ctx.exists(mirror));
  if (absent.length > 0) {
    return [result('C32', C32_TITLE, absent.map((mirror) => finding('C32', 'mirror-missing', mirror)))];
  }

  // The tree, not the git index. The bash preferred `git ls-files` inside a
  // work tree so a new, still-untracked skill did not read as mirror drift;
  // that branch is deliberately dropped, because this check also runs inside an
  // unzipped artifact where there is no index, and one check must not answer
  // two different things about the same bytes. The accepted consequence: an
  // untracked file under .agents/skills counts as missing from the mirrors.
  const base = filesUnder(ctx.root, MIRROR_BASE);
  const declared = new Set(base);
  const findings: Finding[] = [];
  for (const mirror of MIRRORS) {
    const mirrored = new Set(filesUnder(ctx.root, mirror));
    for (const relative of base) {
      if (!mirrored.has(relative)) {
        findings.push(finding('C32', 'file-missing-in-mirror', `${mirror}/${relative}`));
        continue;
      }
      if (!sameBytes(join(ctx.root, MIRROR_BASE, relative), join(ctx.root, mirror, relative))) {
        findings.push(finding('C32', 'file-diverged', `${mirror}/${relative}`));
      }
    }
    // The inverse direction: present in the mirror, absent from the base.
    for (const relative of mirrored) {
      if (!declared.has(relative)) findings.push(finding('C32', 'file-only-in-mirror', `${mirror}/${relative}`));
    }
  }
  return [result('C32', C32_TITLE, findings)];
}

export function checkC33(ctx: CheckContext): CheckResult[] {
  const findings = crlfOffenders(ctx.root).map((relative) => finding('C33', 'crlf', relative));
  return [result('C33', C33_TITLE, findings)];
}

// ------------------------------------------------------------------ internals

// Every offender is reported rather than the bash's first three: `result()` has
// no subject cap, and the renderer lists the findings, so truncating here would
// hide files a reader has to fix anyway.
function crlfOffenders(root: string): string[] {
  const offenders: string[] = [];
  walk(root, '', (relative) => {
    if (!isPosixText(relative)) return;
    if (containsCr(join(root, relative))) offenders.push(relative);
  });
  return offenders.sort(byteOrder);
}

function isPosixText(relative: string): boolean {
  return POSIX_TEXT_EXTENSIONS.some((extension) => relative.endsWith(extension));
}

// Relative to `base`, `/`-separated, in byte order so a finding list never
// depends on the order the filesystem happened to hand back.
function filesUnder(root: string, base: string): string[] {
  const collected: string[] = [];
  walk(join(root, base), '', (relative) => collected.push(relative));
  return collected.sort(byteOrder);
}

// Symlinks are neither read nor followed, which is what `find -type f` did: a
// link's target may sit outside the tree, and comparing its bytes would make
// the answer depend on the machine.
function walk(directory: string, prefix: string, visit: (relative: string) => void): void {
  let entries: Dirent[];
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    // A directory the check cannot read is reported by the caller's own guard
    // (ctx.exists) or is simply not there; this walker never throws into a check.
    return;
  }
  for (const entry of entries) {
    const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) {
      if (SKIPPED_DIRECTORIES.has(entry.name)) continue;
      walk(join(directory, entry.name), relative, visit);
      continue;
    }
    if (entry.isFile()) visit(relative);
  }
}

function sameBytes(left: string, right: string): boolean {
  const first = bytesOf(left);
  const second = bytesOf(right);
  if (first === undefined || second === undefined) return false;
  return first.equals(second);
}

function containsCr(path: string): boolean {
  return bytesOf(path)?.includes(CR) === true;
}

function bytesOf(path: string): Buffer | undefined {
  try {
    return readFileSync(path);
  } catch {
    return undefined;
  }
}

function byteOrder(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
