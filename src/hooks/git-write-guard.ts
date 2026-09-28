// PreToolUse(Bash): turn every git/forge WRITE into the harness's own permission
// prompt, so the developer — not the constitution — decides whether Claude may
// write to git. Reads are never prompted; the decision is `ask`, never `deny`.
//
// Personal setting, not a project one: ENGINEOS_GIT_WRITES=ask (default) | auto,
// set in ~/.claude/settings.local.json's `env` block. Design 2026-09-28 §5
// (Part C), contracts §3.
//
// Bypass is deliberately NOT consulted here (design §C1): /engineos:bypass turns
// the constitution off, and this guard is the developer's own safety net rather
// than a constitutional rule — turning EngineOS off must not turn it off. It is
// the one hook that does not start with `bypassActive(...)`.
//
// Failure directions are asymmetric on purpose. The tokenizer fails CLOSED: a
// command it cannot read (unbalanced quote, heredoc) that mentions git/gh asks.
// The hook body fails OPEN: an internal error is rendered silent, because an
// exception here would surface as EngineOS refusing every Bash call.
import { isRecord } from '../lib/json';
import type { HookEnvelope } from './envelope';
import { ask, silent, type HookContext, type HookDecision } from './output';

export type GitWriteSetting = 'ask' | 'auto';

// Only the exact word `auto` switches the guard off. An unset, empty or
// misspelled value is `ask`: the safe reading of a setting nobody set.
export function gitWriteSetting(env: NodeJS.ProcessEnv): GitWriteSetting {
  return env['ENGINEOS_GIT_WRITES'] === 'auto' ? 'auto' : 'ask';
}

export interface GitCall {
  tool: 'git' | 'gh';
  subcommand: string;
  args: readonly string[];
}

// Design §C2, verbatim. Closed on the read side: a subcommand missing here asks.
// The five starred there (branch, tag, stash, remote, config) are read only for
// the argument shapes `isWrite` inspects.
export const READ_ONLY_GIT: ReadonlySet<string> = new Set([
  'status',
  'log',
  'diff',
  'show',
  'blame',
  'branch',
  'remote',
  'rev-parse',
  'ls-files',
  'check-ignore',
  'describe',
  'shortlog',
  'cat-file',
  'config',
  'merge-base',
  'stash',
  'tag',
]);

// ------------------------------------------------------------------ tokenizer

// Words that may precede the command word in a segment without being it:
// shell keywords, `env`/`command`/`exec`/`xargs` style wrappers, `!`, and the
// braces of a group. `cd <dir> &&` needs no entry — `&&` already makes it a
// segment of its own, and a segment starting with `cd` is not a git call.
const WRAPPER_WORDS: ReadonlySet<string> = new Set([
  '!',
  '{',
  '}',
  'if',
  'then',
  'else',
  'elif',
  'while',
  'until',
  'do',
  'time',
  'command',
  'exec',
  'env',
  'nohup',
  'xargs',
  'sudo',
]);

const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;

// git global options that take their value as the NEXT word (git.c accepts these
// only in the separate form). The `--opt=value` spellings are one word and fall
// through the generic "leading dash" skip.
const GIT_VALUE_OPTIONS: ReadonlySet<string> = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--exec-path', '--config-env', '--super-prefix']);
const GH_VALUE_OPTIONS: ReadonlySet<string> = new Set(['-R', '--repo', '--hostname']);

type Mode = 'dq' | 'subst';

interface Scan {
  segments: string[][];
  current: string[];
  token: string | null;
  dropNext: boolean;
}

// Splits `command` into segments on && || ; | & newline, `(`…`)`, backticks and
// `$(`…`)`, honouring single and double quotes and backslash escapes, dropping
// comments and redirection targets. Returns the git/gh calls found, or null when
// the text cannot be read as shell: an unbalanced quote or a heredoc (`<<`),
// whose body could hold anything.
export function gitCalls(command: string): GitCall[] | null {
  const segments = segmentsOf(command);
  if (segments === null) return null;
  const calls: GitCall[] = [];
  for (const segment of segments) {
    const call = callOf(segment);
    if (call !== null) calls.push(call);
  }
  return calls;
}

function segmentsOf(command: string): string[][] | null {
  const scan: Scan = { segments: [], current: [], token: null, dropNext: false };
  const stack: Mode[] = [];
  const text = command;
  let i = 0;
  while (i < text.length) {
    const ch = text[i] ?? '';
    const next = text[i + 1] ?? '';
    if (stack[stack.length - 1] === 'dq') {
      if (ch === '\\') {
        // Inside double quotes only $ ` " \ and newline are escapable; any other
        // backslash is literal. Either way the next char is data.
        append(scan, '$`"\\\n'.includes(next) ? next : `\\${next}`);
        i += 2;
        continue;
      }
      if (ch === '"') {
        stack.pop();
        i += 1;
        continue;
      }
      if (ch === '$' && next === '(') {
        stack.push('subst');
        endSegment(scan);
        i += 2;
        continue;
      }
      append(scan, ch);
      i += 1;
      continue;
    }
    switch (ch) {
      case ' ':
      case '\t':
      case '\r':
        flush(scan);
        i += 1;
        continue;
      case '\n':
        endSegment(scan);
        i += 1;
        continue;
      case "'": {
        const close = text.indexOf("'", i + 1);
        if (close === -1) return null;
        append(scan, text.slice(i + 1, close));
        i = close + 1;
        continue;
      }
      case '"':
        stack.push('dq');
        append(scan, '');
        i += 1;
        continue;
      case '\\':
        if (next === '\n') {
          // Line continuation: the word carries on past the newline.
          flush(scan);
          i += 2;
          continue;
        }
        if (next === '') {
          append(scan, '\\');
          i += 1;
          continue;
        }
        append(scan, next);
        i += 2;
        continue;
      case '#':
        if (scan.token === null) {
          const eol = text.indexOf('\n', i);
          endSegment(scan);
          i = eol === -1 ? text.length : eol + 1;
          continue;
        }
        append(scan, ch);
        i += 1;
        continue;
      case ';':
        endSegment(scan);
        i += 1;
        continue;
      case '&':
        if (next === '&') {
          endSegment(scan);
          i += 2;
          continue;
        }
        if (next === '>') {
          i = redirect(scan, text, i);
          continue;
        }
        endSegment(scan);
        i += 1;
        continue;
      case '|':
        endSegment(scan);
        i += next === '|' || next === '&' ? 2 : 1;
        continue;
      case '$':
        if (next === '(') {
          stack.push('subst');
          endSegment(scan);
          i += 2;
          continue;
        }
        append(scan, ch);
        i += 1;
        continue;
      case '(':
        endSegment(scan);
        i += 1;
        continue;
      case ')':
        endSegment(scan);
        if (stack[stack.length - 1] === 'subst') stack.pop();
        i += 1;
        continue;
      case '`':
        endSegment(scan);
        i += 1;
        continue;
      case '<':
        if (next === '<') {
          // `<<<` is a here-string: one data word follows. `<<` is a heredoc
          // whose body runs to a delimiter this tokenizer does not track.
          if (text[i + 2] === '<') {
            flush(scan);
            scan.dropNext = true;
            i += 3;
            continue;
          }
          return null;
        }
        i = redirect(scan, text, i);
        continue;
      case '>':
        i = redirect(scan, text, i);
        continue;
      default:
        append(scan, ch);
        i += 1;
    }
  }
  if (stack.includes('dq')) return null;
  endSegment(scan);
  return scan.segments;
}

// A redirection at text[i]: drops a bare fd number before it (`2>&1`), consumes
// the operator run (`>>`, `>&`, `&>`, `>|`), and either eats an fd duplicate
// (`&1`, `&-`) or marks the next word as the target to drop. Returns the index
// to resume at.
function redirect(scan: Scan, text: string, i: number): number {
  if (scan.token !== null && /^\d+$/.test(scan.token)) scan.token = null;
  else flush(scan);
  let j = i;
  while (j < text.length && '<>&|'.includes(text[j] ?? '')) j += 1;
  const operator = text.slice(i, j);
  const dup = /^[-\d]+/.exec(text.slice(j));
  if (operator.endsWith('&') && dup !== null) return j + dup[0].length;
  scan.dropNext = true;
  return j;
}

function append(scan: Scan, piece: string): void {
  scan.token = (scan.token ?? '') + piece;
}

function flush(scan: Scan): void {
  if (scan.token === null) return;
  if (scan.dropNext) scan.dropNext = false;
  else scan.current.push(scan.token);
  scan.token = null;
}

function endSegment(scan: Scan): void {
  flush(scan);
  scan.dropNext = false;
  if (scan.current.length > 0) scan.segments.push(scan.current);
  scan.current = [];
}

// The git/gh call a segment makes, or null when its command word is neither.
function callOf(segment: readonly string[]): GitCall | null {
  let start = 0;
  while (start < segment.length) {
    const word = segment[start] ?? '';
    if (WRAPPER_WORDS.has(word) || ASSIGNMENT.test(word) || word.startsWith('-')) start += 1;
    else break;
  }
  const head = segment[start];
  if (head === undefined) return null;
  const tool = basename(head);
  if (tool !== 'git' && tool !== 'gh') return null;
  const valued = tool === 'git' ? GIT_VALUE_OPTIONS : GH_VALUE_OPTIONS;
  let at = start + 1;
  while (at < segment.length) {
    const word = segment[at] ?? '';
    if (valued.has(word)) at += 2;
    else if (word.startsWith('-')) at += 1;
    else break;
  }
  return { tool, subcommand: segment[at] ?? '', args: segment.slice(at + 1) };
}

function basename(word: string): string {
  const cut = word.lastIndexOf('/');
  return cut === -1 ? word : word.slice(cut + 1);
}

// ------------------------------------------------------------------ classifier

// Argument shapes that keep the starred subcommands on the read side.
const BRANCH_LISTING = new Set(['-l', '--list', '-a', '--all', '-r', '--remotes', '--show-current', '--contains', '--no-contains', '--merged', '--no-merged', '--points-at']);
const BRANCH_WRITING = new Set(['-d', '-D', '--delete', '-m', '-M', '--move', '-c', '-C', '--copy', '-u', '--set-upstream-to', '--unset-upstream', '--edit-description', '-f', '--force', '-t', '--track', '--no-track']);
const TAG_LISTING = new Set(['-l', '--list', '-n', '--contains', '--no-contains', '--merged', '--no-merged', '--points-at', '-v', '--verify', '-i', '--ignore-case']);
const TAG_WRITING = new Set(['-a', '--annotate', '-s', '--sign', '-u', '--local-user', '-m', '--message', '-F', '--file', '-d', '--delete', '-f', '--force', '-e', '--edit', '--create-reflog']);
const REMOTE_READS = new Set(['-v', '--verbose', 'show', 'get-url']);
const CONFIG_READ_FLAGS = new Set(['--get', '--get-all', '--get-regexp', '--list', '-l']);
const CONFIG_WRITE_FLAGS = new Set(['--unset', '--unset-all', '--add', '--replace-all', '--edit', '-e', '--remove-section', '--rename-section']);
const CONFIG_READ_VERBS = new Set(['get', 'list']);

const GH_PR_WRITES = new Set(['create', 'merge', 'close', 'edit', 'comment', 'review', 'checkout', 'ready', 'reopen', 'lock', 'unlock', 'update-branch']);
const GH_ISSUE_WRITES = new Set(['create', 'close', 'edit', 'comment', 'reopen', 'delete', 'transfer', 'pin', 'unpin', 'lock', 'unlock', 'develop']);
const GH_ALWAYS_WRITE = new Set(['release', 'repo', 'secret', 'variable']);
const GH_API_WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Closed read side, open write side: anything not recognised as a read asks.
export function isWrite(call: GitCall): boolean {
  return call.tool === 'git' ? isGitWrite(call) : isGhWrite(call);
}

function isGitWrite(call: GitCall): boolean {
  const { subcommand, args } = call;
  // A bare `git` prints usage; `git --version` / `git --help` land here too
  // once the leading options are skipped.
  if (subcommand === '') return false;
  if (!READ_ONLY_GIT.has(subcommand)) return true;
  switch (subcommand) {
    case 'branch':
      return inspectsRefs(args, BRANCH_LISTING, BRANCH_WRITING);
    case 'tag':
      return inspectsRefs(args, TAG_LISTING, TAG_WRITING);
    case 'stash':
      return args[0] !== 'list';
    case 'remote':
      return args.length > 0 && !REMOTE_READS.has(args[0] ?? '');
    case 'config':
      return isConfigWrite(args);
    default:
      return false;
  }
}

// branch/tag: a write flag wins; a listing flag then makes any positional a
// pattern, not a name; otherwise a positional creates something and asks.
function inspectsRefs(args: readonly string[], listing: ReadonlySet<string>, writing: ReadonlySet<string>): boolean {
  const flags = args.filter((arg) => arg.startsWith('-')).map(flagName);
  if (flags.some((flag) => writing.has(flag))) return true;
  if (flags.some((flag) => listing.has(flag))) return false;
  return args.some((arg) => !arg.startsWith('-'));
}

function isConfigWrite(args: readonly string[]): boolean {
  const flags = args.filter((arg) => arg.startsWith('-')).map(flagName);
  if (flags.some((flag) => CONFIG_WRITE_FLAGS.has(flag))) return true;
  if (flags.some((flag) => CONFIG_READ_FLAGS.has(flag))) return false;
  const positionals = args.filter((arg) => !arg.startsWith('-'));
  // git >= 2.46 verb form: `config get <key>` / `config list` read, the rest write.
  if (positionals.length > 0 && CONFIG_READ_VERBS.has(positionals[0] ?? '')) return false;
  // Legacy form: `config <key>` reads it, `config <key> <value>` sets it; bare
  // `config` prints usage.
  return positionals.length > 1;
}

// `--sort=refname` and `--format=%(refname)` carry their value inline.
function flagName(arg: string): string {
  const eq = arg.indexOf('=');
  return eq === -1 ? arg : arg.slice(0, eq);
}

function isGhWrite(call: GitCall): boolean {
  const { subcommand, args } = call;
  const action = args[0] ?? '';
  if (GH_ALWAYS_WRITE.has(subcommand)) return true;
  if (subcommand === 'pr') return GH_PR_WRITES.has(action);
  if (subcommand === 'issue') return GH_ISSUE_WRITES.has(action);
  if (subcommand === 'api') return isGhApiWrite(args);
  return false;
}

// `-X`/`--method` with a mutating verb, or any request field: gh switches a
// fielded request to POST on its own, so `-f title=x` is a write with no -X.
function isGhApiWrite(args: readonly string[]): boolean {
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i] ?? '';
    const name = flagName(arg);
    if (name === '-X' || name === '--method') {
      const value = arg.includes('=') ? arg.slice(arg.indexOf('=') + 1) : (args[i + 1] ?? '');
      if (GH_API_WRITE_METHODS.has(value.toUpperCase())) return true;
    }
    if (name === '-f' || name === '-F' || name === '--field' || name === '--raw-field' || name === '--input') return true;
  }
  return false;
}

// ------------------------------------------------------------------ hook body

const GIT_MENTION = /\b(git|gh)\s/;
const SETTING_NOTE = 'ENGINEOS_GIT_WRITES=ask';

export function gitWriteGuard(env: HookEnvelope, ctx: HookContext): HookDecision {
  try {
    return decide(env, ctx.io.env);
  } catch {
    // Fail open on the hook, never on the tokenizer: an exception here would be
    // EngineOS refusing every Bash call, which is not what the setting asks for.
    return silent;
  }
}

export const run = gitWriteGuard;

function decide(env: HookEnvelope, processEnv: NodeJS.ProcessEnv): HookDecision {
  if (gitWriteSetting(processEnv) === 'auto') return silent;
  if (env.tool !== 'Bash') return silent;
  const command = commandOf(env);
  if (command === null) return silent;
  const calls = gitCalls(command);
  if (calls === null) {
    return GIT_MENTION.test(command) ? ask(`[engineos] git write: unparsable command containing git/gh — ${SETTING_NOTE}`) : silent;
  }
  const write = calls.find(isWrite);
  if (write === undefined) return silent;
  return ask(`[engineos] git write: ${label(write)} — ${SETTING_NOTE} (set auto in settings.local.json to disable)`);
}

// `tool_input.command` read from the raw payload: the shared envelope decodes
// only `file_path`, which every other PreToolUse hook needs and this one does not.
function commandOf(env: HookEnvelope): string | null {
  if (!isRecord(env.raw)) return null;
  const input = env.raw['tool_input'];
  if (!isRecord(input)) return null;
  const command = input['command'];
  return typeof command === 'string' ? command : null;
}

// `git commit`; for gh the action too (`gh pr create`), since the subcommand
// alone names a family, not an act.
function label(call: GitCall): string {
  const action = call.tool === 'gh' && call.args[0] !== undefined && !call.args[0].startsWith('-') ? ` ${call.args[0]}` : '';
  return `${call.tool} ${call.subcommand}${action}`;
}
