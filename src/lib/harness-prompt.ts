// The text a UserPromptSubmit hook receives is not always something a human
// typed. The harness fires the same event for subagent hand-backs ("Another
// Claude session sent a message:" + an <agent-message> block), for task and
// system notifications wrapped in <system-reminder>, and for local commands
// echoed as <command-name>/<bash-input> tags — and it prepends reminder blocks
// to genuine prompts too. Routing those as if they were requests injected a
// task contract on every agent report (observed 2026-10-06..12) and would seed
// the golden set with prompts no developer wrote. The rule: strip every leading
// harness block, route what remains, and stay silent when nothing remains.

// Blocks removed wherever they lead the text, in any order and any number.
const BLOCK_TAGS: readonly string[] = [
  'system-reminder',
  'task-notification',
  'agent-message',
  'cross-session-message',
  'command-name',
  'command-message',
  'command-args',
  'local-command-stdout',
  'local-command-stderr',
  'local-command-caveat',
  'bash-input',
  'bash-stdout',
  'bash-stderr',
  'user-memory-input',
];

// Bare lines the harness emits around a hand-back, outside any tag.
const BARE_LINES: readonly RegExp[] = [
  /^Another Claude session sent a message:\s*/,
  /^That "other Claude session" is an agent working inside this same session[^\n]*\n?/,
];

// The human part of a prompt, or '' when the whole text is harness-made.
export function humanPrompt(text: string): string {
  let rest = text;
  for (;;) {
    const before = rest;
    rest = rest.replace(/^\s+/, '');
    for (const tag of BLOCK_TAGS) {
      if (!rest.startsWith(`<${tag}`)) continue;
      const close = `</${tag}>`;
      const end = rest.indexOf(close);
      // An unclosed block swallows the rest: a truncated hand-back is still
      // not a request, and routing its tail would route harness text.
      rest = end === -1 ? '' : rest.slice(end + close.length);
    }
    for (const line of BARE_LINES) rest = rest.replace(line, '');
    if (rest === before) break;
  }
  return rest.trim();
}

export function isHarnessPrompt(text: string): boolean {
  return text.trim() !== '' && humanPrompt(text) === '';
}
