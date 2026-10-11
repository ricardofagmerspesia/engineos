// S0 of the routing replacement (contracts.md@rev2 §5): decide whether the text
// UserPromptSubmit handed us was typed by the user at all.
//
// The harness submits more than user prompts through this event. A background
// task's completion arrives as a queued prompt opening with `<task-notification>`,
// and a subagent's message as one opening with `<agent-message from="...">`;
// routing either as a request is misroute 3 of the plan (a subagent's audit
// report read as a seven-intent dispatch demand). Those frames are recognised
// here, deterministically, from literal prefixes held as data in
// policy.router.source_markers — never as regular expressions, so a marker can
// neither over-match nor cost a backtracking pass on a long prompt.
//
// Pure: no I/O, no clock, no registry read. The caller passes the markers.
import { isRecord } from '../lib/json';
import type { HookEnvelope } from './envelope';

export type PromptSource = 'user' | 'notification' | 'tool-result' | 'hook-echo';

export interface SourceMarkers {
  notification: readonly string[];
  tool_result: readonly string[];
  hook_echo: readonly string[];
}

// Fields a host MAY add to the payload to say where the text came from. Claude
// Code sends none today; a host that does is believed over the text, because the
// harness knows what it submitted and the markers only infer it.
const HOST_SOURCE_FIELDS: readonly string[] = ['source', 'prompt_source'];

// Both spellings of the two-word ids, since a host vocabulary is not ours to
// fix. Any other declared value is ignored and the markers decide.
const HOST_SOURCE_VALUES: Readonly<Record<string, PromptSource>> = {
  user: 'user',
  notification: 'notification',
  'tool-result': 'tool-result',
  tool_result: 'tool-result',
  'hook-echo': 'hook-echo',
  hook_echo: 'hook-echo',
};

export function classifyPromptSource(env: HookEnvelope, markers: SourceMarkers): PromptSource {
  const declared = hostDeclaredSource(env.raw);
  if (declared !== null) return declared;
  // Leading whitespace only: a frame is a prefix, and text the user typed
  // before it makes the prompt the user's.
  const text = env.prompt.trimStart();
  if (startsWithAny(text, markers.notification)) return 'notification';
  if (startsWithAny(text, markers.tool_result)) return 'tool-result';
  if (startsWithAny(text, markers.hook_echo)) return 'hook-echo';
  return 'user';
}

function hostDeclaredSource(raw: unknown): PromptSource | null {
  if (!isRecord(raw)) return null;
  for (const field of HOST_SOURCE_FIELDS) {
    const value = raw[field];
    if (typeof value !== 'string') continue;
    const source = HOST_SOURCE_VALUES[value];
    if (source !== undefined) return source;
  }
  return null;
}

// An empty marker would match every prompt and silence routing entirely; it is
// skipped rather than trusted, whatever the loader let through.
function startsWithAny(text: string, markers: readonly string[]): boolean {
  return markers.some((marker) => marker !== '' && text.startsWith(marker));
}
