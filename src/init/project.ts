// `engineos init` — adopt EngineOS in ONE project, in one command.
// Port of scripts/init-project.sh.
//
// install.sh is machine-scoped (links skills/agents/hooks into ~/.claude and
// imports the constitution). This is project-scoped: it creates the .engineos/ +
// docs/ layout (which is also the opt-in signal every EngineOS hook reads),
// drops a deltas-only CLAUDE.md if the project has none, and prints the optional
// follow-ups. Idempotent; never overwrites user files.
//
// The refusal order is load-bearing: git work tree, then the EngineOS repo
// itself, then HOME, then the machine install, then the checkout's own siblings.
// The self-repo check sits BEFORE the machine-level guards so running this inside
// the EngineOS checkout always answers 3 — the honest reason — instead of a 1
// about the local install.
import { lstatSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { spawnSync } from 'node:child_process';
import type { Io } from '../io';
import { loadLayoutManifest, scaffoldLayout, type ManifestEntry } from '../hooks/scaffold';
import { repoRoot } from '../lib/git';

// The one regex install.sh writes and greps for, carried here as the same
// literal string so the two sides cannot drift (plan Task 26). It is a POSIX
// ERE, which is what `grep -E` needs and what the installer still runs;
// IMPORT_LINE below is the same expression with the two POSIX classes
// translated for JavaScript, and project.test.ts pins both to install.sh.
export const IMPORT_RE: string = '^@[^[:space:]]+[/\\\\]CLAUDE\\.md[[:space:]]*$';
const IMPORT_LINE = /^@\S+[/\\]CLAUDE\.md\s*$/;

const EXIT_OK = 0;
// No machine install, no usable HOME, or a broken EngineOS checkout.
const EXIT_ENVIRONMENT = 1;
const EXIT_NOT_GIT = 2;
const EXIT_SELF = 3;
const EXIT_USAGE = 64;

const USAGE = 'usage: engineos init [--dir PATH] [--dry-run]';

// The bash halves of the scaffold stay on disk (versioned, sourced surface,
// frozen until 2.0) and their absence still reads as a broken checkout; the JSON
// manifest joins them because it is what this port actually reads.
const REQUIRED_SIBLINGS = ['hooks/scaffold-layout.sh', 'hooks/layout-manifest.sh', 'registries/layout-manifest.json'];

// A one-entry manifest rather than a second call into the scaffolder's guard: the
// CLAUDE.md seed must go through the SAME containment checks the manifest seeds
// use, so the two write sites can never drift apart. `dir: ''` is the project
// root itself, which is exactly what bash asked for with
// `engineos_scaffold_dir "$ROOT" ""`.
const CLAUDE_MD_SEED: ManifestEntry[] = [
  { dir: '', seeds: [{ src: '@templates/project-claude.md', dest: 'CLAUDE.md' }] },
];

export interface InitDeps {
  io: Io;
  root: string;
  spawn: typeof spawnSync;
}

interface Options {
  dir: string;
  dryRun: boolean;
}

type Parsed = { ok: true; options: Options } | { ok: false; message: string };

export function initProject(argv: string[], deps: InitDeps): number {
  const { io, root } = deps;
  const parsed = parseArgs(argv, io.cwd());
  if (!parsed.ok) {
    io.err(`${parsed.message}\n`);
    return EXIT_USAGE;
  }
  const { dir: target, dryRun } = parsed.options;

  const project = repoRoot(target, deps.spawn);
  if (project === null) {
    io.err(`[engineos] ${target} is not inside a git work tree\n`);
    return EXIT_NOT_GIT;
  }

  if (isEngineosCheckout(project, root)) {
    io.err('[engineos] refusing to init inside the EngineOS repo\n');
    return EXIT_SELF;
  }

  const home = io.env['HOME'];
  if (home === undefined || home === '') {
    io.err('[engineos] HOME is unset or empty — cannot locate ~/.claude/CLAUDE.md\n');
    return EXIT_ENVIRONMENT;
  }
  if (!hasMachineInstall(join(home, '.claude', 'CLAUDE.md'))) {
    io.err(`[engineos] machine install not found in ~/.claude/CLAUDE.md — run once: ${root}/install.sh\n`);
    return EXIT_ENVIRONMENT;
  }

  for (const sibling of REQUIRED_SIBLINGS) {
    if (!isFile(`${root}/${sibling}`)) {
      io.err(`[engineos] broken checkout: ${root}/${sibling} is missing\n`);
      return EXIT_ENVIRONMENT;
    }
  }
  let manifest: ManifestEntry[];
  try {
    manifest = loadLayoutManifest(root);
  } catch {
    io.err(`[engineos] broken checkout: ${root}/registries/layout-manifest.json is unreadable\n`);
    return EXIT_ENVIRONMENT;
  }

  io.out(`[engineos] adopting EngineOS in ${project}\n`);
  if (dryRun) io.out('(dry run — nothing written)\n');

  if (dryRun) {
    io.out(`  would ensure: ${manifest.map((entry) => entry.dir).join(', ')}\n`);
  } else {
    const created = scaffoldLayout(project, root, manifest);
    io.out(created.length > 0 ? `  created: ${created.join(', ')}\n` : '  layout: already complete\n');
  }

  writeProjectClaudeMd({ io, project, root, dryRun });
  io.out(doneMessage(root));
  return EXIT_OK;
}

// The existence test is `-e || -L`, not `-f`: `-f` is FALSE for a dangling
// symlink, so a repo that ships CLAUDE.md as a link to an absolute path
// elsewhere on the machine would have the template copied THROUGH it.
function writeProjectClaudeMd(opts: { io: Io; project: string; root: string; dryRun: boolean }): void {
  const { io, project, root, dryRun } = opts;
  const claudeMd = join(project, 'CLAUDE.md');
  if (lstatOk(claudeMd)) {
    io.out('  CLAUDE.md: exists, left untouched (declare your stack there — see templates/project-claude.md)\n');
    return;
  }
  if (dryRun) {
    io.out('  would create CLAUDE.md from templates/project-claude.md\n');
    return;
  }
  scaffoldLayout(project, root, CLAUDE_MD_SEED);
  io.out(
    isFile(claudeMd)
      ? '  CLAUDE.md: created from templates/project-claude.md — fill in the Stack and Commands sections\n'
      : '  CLAUDE.md: skipped — the project root did not resolve to a directory inside itself\n',
  );
}

function doneMessage(root: string): string {
  return `
Done. EngineOS is now the default methodology for this project:
  - routing, risk, gates and the change-record Stop gate are active on the next Claude Code session
  - commit .engineos/ and CLAUDE.md so teammates get the same behaviour

Optional next steps (docs/ADOPTION.md sections 4-6):
  - MCP servers for the read-only specialists: ${root}/templates/mcp.template.json
  - CI agents:                                  ${root}/docs/ADOPTION.md#5
  - confirm the gates are live:                 open a session, edit a file, expect a [router] line
`;
}

function parseArgs(argv: string[], cwd: string): Parsed {
  let dir = cwd;
  let dryRun = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dir') {
      const value = argv[i + 1];
      if (value === undefined) return { ok: false, message: '--dir needs a path' };
      dir = value;
      i += 1;
    } else if (arg === '--dry-run') {
      dryRun = true;
    } else {
      return { ok: false, message: USAGE };
    }
  }
  return { ok: true, options: { dir, dryRun } };
}

// Two independent signals: the repo's own marker files, or the target simply
// being this runtime's own checkout.
function isEngineosCheckout(project: string, root: string): boolean {
  const marked =
    isFile(join(project, 'hooks', 'layout-manifest.sh')) &&
    isFile(join(project, 'hooks', 'hooks.json')) &&
    isFile(join(project, 'install.sh'));
  return marked || project === root || physical(project) === physical(root);
}

function hasMachineInstall(claudeMd: string): boolean {
  let text: string;
  try {
    text = readFileSync(claudeMd, 'utf8');
  } catch {
    return false;
  }
  return text.split('\n').some((line) => IMPORT_LINE.test(line));
}

function physical(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

function lstatOk(path: string): boolean {
  try {
    lstatSync(path);
    return true;
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
