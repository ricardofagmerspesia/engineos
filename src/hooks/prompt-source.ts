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
//
// The judge asks a stricter question (D3, review finding #10): its answer
// decides whether text leaves the machine, so judgeMayReceive fails closed
// where classifyPromptSource fails open. Kernel routing keeps the permissive
// classification; only the judge's egress uses the strict one.
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

// The judge's tag-frame test (judgeMayReceive): anchored, one bounded
// quantifier, so constant work whatever the prompt length.
const TAG_FRAME = /^<[A-Za-z][A-Za-z0-9_.:-]{0,63}(?:[\s/>]|$)/;

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

// The judge-only egress test. A prompt is the user's for the judge only when
// the permissive classification says `user` AND its first non-space character
// does not open a tag frame (`<name` followed by whitespace, `>`, `/` or the
// end): the harness wraps what it injects in such frames, and a frame no
// marker lists yet is still not the user's typing. A classification that
// throws, including the registry read that supplies the markers, is non-user.
export function judgeMayReceive(env: HookEnvelope, markers: () => SourceMarkers): boolean {
  try {
    if (classifyPromptSource(env, markers()) !== 'user') return false;
    return !TAG_FRAME.test(env.prompt.trimStart());
  } catch {
    return false;
  }
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
