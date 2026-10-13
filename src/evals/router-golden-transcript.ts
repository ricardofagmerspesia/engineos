// The join between a router span and the prompt it routed (routing-decision-
// layer design §6, contracts §5).
//
// The exec journal stores registry ids only, never prompt text
// (rules/observability.md "Agent traces"), so a router span carries no prompt.
// The prompt lives in Claude Code's session transcript,
// `~/.claude/projects/<encoded-cwd>/<session_id>.jsonl`, and the span's
// `trace_id` IS that session id. The encoded directory is the session's
// starting cwd, which is often not the repo the span was written in (a session
// opened in ~/Documents edits a repo below it), so every project directory is
// probed for the session file rather than deriving one name.
//
// Shape verified read-only on 2026-10-12 against a live transcript: a user turn
// is a line `{ type: "user", timestamp: ISO-8601 with ms, message: { content } }`
// where content is a string or an array of blocks; a tool result is a user line
// whose blocks carry `type: "tool_result"` and is not a turn. A human prompt
// has `origin.kind === "human"` (older lines carry no `origin`); subagent
// hand-backs (`origin.kind === "peer"`, `isMeta: true`) and task notifications
// are user lines too, and they DO fire UserPromptSubmit, so they compete in the
// join and a span that lands on one is reported as non-human, never attributed
// to an earlier human prompt.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { humanPrompt, isHarnessPrompt } from '../lib/harness-prompt';
import { isRecord } from '../lib/json';

export type TurnKind = 'human' | 'non-human';

export interface Turn {
  at: number;
  kind: TurnKind;
  text: string;
}

export type JoinResult =
  | { kind: 'joined'; text: string }
  | { kind: 'non-human' }
  | { kind: 'no-transcript' }
  | { kind: 'no-turn' };

// The span's timestamp is truncated to whole seconds when it is written, and
// it is written AFTER the hook ran, while the transcript stamps the user line
// with milliseconds BEFORE the hook. So the turn may sit up to one second past
// the span's printed second, never more.
const SPAN_RESOLUTION_MS = 1000;
// A hook answers in milliseconds (the Jev budget is 400 ms); a turn older than
// this is not the prompt the span routed, it is the one before a lost turn.
export const JOIN_WINDOW_MS = 60_000;

export function transcriptFiles(home: string, sessionId: string): string[] {
  const projects = join(home, '.claude', 'projects');
  let dirs: string[];
  try {
    dirs = readdirSync(projects, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch {
    return [];
  }
  return dirs.map((dir) => join(projects, dir, `${sessionId}.jsonl`)).filter((path) => existsSync(path));
}

// Every user turn of the given transcripts, oldest first. Unreadable files and
// unparsable lines are skipped: a transcript is evidence, not a contract.
export function readTurns(files: readonly string[]): Turn[] {
  const turns: Turn[] = [];
  for (const file of files) {
    let text: string;
    try {
      text = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    for (const line of text.split('\n')) {
      const turn = parseTurn(line);
      if (turn !== null) turns.push(turn);
    }
  }
  return turns.sort((a, b) => a.at - b.at);
}

function parseTurn(line: string): Turn | null {
  if (line === '') return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return null;
  }
  if (!isRecord(parsed) || parsed['type'] !== 'user' || parsed['isSidechain'] === true) return null;
  const at = typeof parsed['timestamp'] === 'string' ? Date.parse(parsed['timestamp']) : Number.NaN;
  if (!Number.isFinite(at)) return null;
  const message = parsed['message'];
  const text = isRecord(message) ? turnText(message['content']) : null;
  if (text === null) return null;
  return { at, kind: turnKind(parsed, text), text };
}

function turnText(content: unknown): string | null {
  if (typeof content === 'string') return content.trim() === '' ? null : content.trim();
  if (!Array.isArray(content)) return null;
  const blocks: unknown[] = content;
  if (blocks.some((block) => isRecord(block) && block['type'] === 'tool_result')) return null;
  const texts = blocks.flatMap((block) =>
    isRecord(block) && block['type'] === 'text' && typeof block['text'] === 'string' ? [block['text']] : [],
  );
  const joined = texts.join('\n').trim();
  return joined === '' ? null : joined;
}

// The same classification the prompt hook applies (src/lib/harness-prompt.ts),
// so a turn the hook refused to route is never joined as a human prompt, and a
// turn the hook routed by its human part joins by that same part.
function turnKind(line: Record<string, unknown>, text: string): TurnKind {
  if (line['isMeta'] === true) return 'non-human';
  const origin = line['origin'];
  if (isRecord(origin) && origin['kind'] !== 'human') return 'non-human';
  return isHarnessPrompt(text) ? 'non-human' : 'human';
}

// The latest turn at or before the span (with the span's one-second
// resolution), inside the join window. When several turns qualify the latest
// wins: it is the one whose submission fired the hook.
export function joinSpan(turns: readonly Turn[] | null, spanAt: number): JoinResult {
  if (turns === null) return { kind: 'no-transcript' };
  let best: Turn | null = null;
  for (const turn of turns) {
    if (turn.at >= spanAt + SPAN_RESOLUTION_MS || turn.at < spanAt - JOIN_WINDOW_MS) continue;
    if (best === null || turn.at >= best.at) best = turn;
  }
  if (best === null) return { kind: 'no-turn' };
  return best.kind === 'human' ? { kind: 'joined', text: humanPrompt(best.text) } : { kind: 'non-human' };
}
