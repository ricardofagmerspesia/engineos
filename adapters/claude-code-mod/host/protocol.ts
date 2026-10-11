// The wire between the mod (hooks/, no Node) and its host process (host/,
// Node). Imported by both sides, so it holds types and literal constants only:
// nothing here may reach a Node API or anything outside this plugin folder,
// because the mod runtime loads only files of the plugin.
//
// WireDecision re-declares src/hooks/output.ts HookDecision field for field.
// host/server.ts assigns a HookDecision to it, so a drift in the kernel's
// union fails the host's typecheck rather than the mod at run time.

export const HOST_PROTOCOL_VERSION = 1;

// The first line the host prints on stdout once its socket accepts requests.
export const READY_PREFIX = 'engineos-inprocess ready ';

// The harness envelope of one event; a prompt or tool input past this is not a
// hook payload worth serving, and the host answers 413 without reading on.
export const MAX_ENVELOPE_BYTES = 1_048_576;

// Paths on the socket. The host answers nothing else.
export const ROUTES_PATH = '/v1/routes';
export const HOOK_PATH_PREFIX = '/v1/hook/';

// The classic events hooks/hooks.json registers today. A new event in
// hooks.json that is not named here is reported by the host and not served.
export type HostEvent = 'SessionStart' | 'UserPromptSubmit' | 'PreToolUse' | 'PostToolUse' | 'Stop';

export const HOST_EVENTS: readonly HostEvent[] = ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Stop'];

// One matcher group of hooks/hooks.json: the hooks it runs, in file order.
export interface HostRoute {
  event: HostEvent;
  matcher: string;
  hooks: string[];
}

export interface RoutesResponse {
  v: typeof HOST_PROTOCOL_VERSION;
  routes: HostRoute[];
  // hooks.json entries the host cannot serve (unknown event or hook name);
  // the mod surfaces them once so a drift is visible, never silent.
  unserved: string[];
}

export type WireEventName =
  | 'SessionStart'
  | 'UserPromptSubmit'
  | 'PreToolUse'
  | 'PostToolUse'
  | 'Stop'
  | 'SubagentStart'
  | 'SubagentStop';

export type WireDecision =
  | { kind: 'silent' }
  | { kind: 'context'; event: WireEventName; text: string }
  | { kind: 'block'; reason: string }
  | { kind: 'ask'; event: 'PreToolUse'; reason: string }
  | { kind: 'message'; text: string }
  | { kind: 'fail'; stderr: string };

export interface HookResponse {
  v: typeof HOST_PROTOCOL_VERSION;
  decision: WireDecision;
  // What the hook wrote to its stderr channel; the mod logs it to the debug log.
  stderr: string;
}
