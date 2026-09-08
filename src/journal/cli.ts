import type { Command } from '../dispatch';
import type { Io } from '../io';
import { KernelError } from '../lib/json';
import { resolveRoot } from '../registry/paths';
import { appendLine, JournalError, parseAppendArgs, usage, validateFile } from './exec-journal';
import { journalRegistries } from './schema';

// The name the usage block prints. scripts/exec-journal.sh is the public entry
// point (docs/COMPATIBILITY.md); the bundle behind it is an implementation
// detail, so a caller reading the usage line is told the command it can type.
const ARGV0 = 'scripts/exec-journal.sh';

export const runJournal: Command = (argv: string[], io: Io): number => {
  const [name, ...rest] = argv;
  try {
    if (name === 'append') return append(rest, io);
    if (name === 'validate') return validate(rest, io);
    throw new JournalError('', { usage: true });
  } catch (e) {
    if (e instanceof JournalError) {
      if (e.message !== '') io.err(`${e.message}\n`);
      if (e.usage) io.err(usage(ARGV0));
      return 1;
    }
    // A malformed or missing registry reaches here as the loaders' own error.
    // It is reported in this CLI's convention — plain text, exit 1 — not the
    // kernel's JSON envelope.
    if (e instanceof KernelError) {
      io.err(`${e.message}\n`);
      return 1;
    }
    throw e;
  }
};

function append(argv: string[], io: Io): number {
  const root = resolveRoot(io.env);
  const { file } = parseAppendArgs(argv);
  appendLine(root, file, argv, isoNow, journalRegistries(root));
  return 0;
}

function validate(argv: string[], io: Io): number {
  const [file] = argv;
  // bash bound `local file="$1"` under `set -u` and died on an unbound variable
  // when none was given; the port refuses with the usage block instead.
  if (file === undefined || file === '') throw new JournalError('', { usage: true });
  const root = resolveRoot(io.env);
  const result = validateFile(root, file, journalRegistries(root));
  for (const line of result.bad) io.err(`line ${line}: does not match the exec-journal schema\n`);
  if (result.bad.length > 0) {
    io.err(`${result.bad.length} invalid line(s) in ${file}\n`);
    return 1;
  }
  io.out(`${file}: ${result.lines} line(s), all valid\n`);
  return 0;
}

// The format `date -u +%Y-%m-%dT%H:%M:%SZ` produced, which is what the slug
// class admits: toISOString's milliseconds are dropped so a defaulted stamp is
// byte-identical to the one the bash CLI wrote.
function isoNow(): string {
  return new Date().toISOString().replace(/\.[0-9]{3}Z$/, 'Z');
}
