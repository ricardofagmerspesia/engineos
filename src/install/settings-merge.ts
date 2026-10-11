// Port of the three jq programs in install.sh (lines 231-333) and their
// install.ps1 mirror: derive the hook list from hooks/hooks.json, scrub every
// previously installed EngineOS entry from the consumer's settings.json, add the
// current ones, and union templates/permissions.template.json into
// permissions.allow.
//
// Pure by design — no file I/O, no process access. Reading, the atomic write and
// the warnings live in ./cli, so a test can drive every merge rule in memory.
//
// Three command forms are accepted, because a consumer's settings.json can still
// carry the pre-1.7.0 one: the bash shim path, the node runtime call, and the
// node call to the per-call bundle. The scrub predicate matches ALL of them;
// keying on the hooks dir alone would leave a node entry in place and duplicate
// every hook on the second install.
import { isRecord } from '../lib/json';

export interface MergeResult { added: number; removed: number; changed: boolean }

// The one settings-shape refusal the installer contract names by text.
export const SETTINGS_NOT_OBJECT = 'settings.json is not a JSON object';

// Single-quoted so TypeScript never interpolates the shell placeholder.
const PLACEHOLDER = '${CLAUDE_PLUGIN_ROOT}';
const QUOTED_PLACEHOLDER = '"${CLAUDE_PLUGIN_ROOT}"';
const OLD_PREFIX = '"${CLAUDE_PLUGIN_ROOT}"/hooks/';
const NEW_PREFIX = 'node "${CLAUDE_PLUGIN_ROOT}/dist/engineos.cjs" hook ';
// The per-call hooks run from their own bundle (src/hot-cli.ts).
const HOT_PREFIX = 'node "${CLAUDE_PLUGIN_ROOT}/dist/engineos-hot.cjs" hook ';
const EXPECTED_FORMS =
  'Expected "${CLAUDE_PLUGIN_ROOT}"/hooks/<script>.sh, node "${CLAUDE_PLUGIN_ROOT}/dist/engineos.cjs" hook <name> or node "${CLAUDE_PLUGIN_ROOT}/dist/engineos-hot.cjs" hook <name>';

// Root-independent half of the scrub predicate: a node entry pointing at another
// checkout is still an EngineOS entry, and leaving it fires two runtimes at once.
// Both bundles count: an entry moved from one to the other between installs must
// be scrubbed, not duplicated.
const RUNTIME_BUNDLES: readonly string[] = ['dist/engineos.cjs', 'dist/engineos-hot.cjs'];

// A derived name is a bare hook identifier. Anything else means the command form
// was not the one this installer knows how to place.
const UNPLACEABLE_NAME = /[/\\ ]/;

export class SettingsMergeError extends Error {
  readonly kind = 'settings-merge';
  // Rendered as a second stderr line: the installer's ABORT message carries the
  // accepted forms under it, exactly as the bash `red` pair did.
  readonly detail: string | undefined;

  constructor(message: string, detail?: string) {
    super(message);
    this.name = 'SettingsMergeError';
    this.detail = detail;
  }
}

interface DerivedHook { event: string; matcher: string; command: string }

// The one place a plugin-relative path string is built, so an error message can
// never name a file the reader did not actually open.
export function pluginFile(pluginRoot: string, relativePath: string): string {
  return `${trimTrailingSeparators(pluginRoot)}/${relativePath}`;
}

export function isEngineosCommand(command: string, pluginRoot: string): boolean {
  const normalized = toSlashes(command);
  if (RUNTIME_BUNDLES.some((bundle) => normalized.includes(bundle))) return true;
  return normalized.includes(`${toSlashes(trimTrailingSeparators(pluginRoot))}/hooks/`);
}

export function mergeSettings(
  settings: unknown,
  hooksJson: unknown,
  pluginRoot: string,
  permissionsTemplate: unknown,
): { settings: unknown; result: MergeResult } {
  if (!isRecord(settings)) throw new SettingsMergeError(SETTINGS_NOT_OBJECT);
  // Derive before touching anything: an unrecognized command must abort with the
  // consumer's settings untouched, which is what the bash ordering bought.
  const derived = deriveHooks(hooksJson, pluginRoot);

  const before = JSON.stringify(settings);
  const cloned: unknown = JSON.parse(before);
  if (!isRecord(cloned)) throw new SettingsMergeError(SETTINGS_NOT_OBJECT);

  const events = objectField(cloned, 'hooks', 'hooks');
  const removed = scrubEngineosHooks(events, pluginRoot);
  for (const hook of derived) addHook(events, hook);
  cloned['hooks'] = events;

  if (permissionsTemplate !== null && permissionsTemplate !== undefined) {
    mergePermissions(cloned, permissionsTemplate);
  }

  return {
    settings: cloned,
    // Idempotence is judged on the output, not on the counters: a second run
    // removes and re-adds the same N entries and still reports changed=false.
    result: { added: derived.length, removed, changed: JSON.stringify(cloned) !== before },
  };
}

// ------------------------------------------------------------------ derivation

function deriveHooks(hooksJson: unknown, pluginRoot: string): DerivedHook[] {
  const root = trimTrailingSeparators(pluginRoot);
  const source = pluginFile(root, 'hooks/hooks.json');
  const container = isRecord(hooksJson) ? hooksJson['hooks'] : undefined;
  if (!isRecord(container)) throw new SettingsMergeError(`no .hooks object in ${source}`);

  const derived: DerivedHook[] = [];
  for (const [event, value] of Object.entries(container)) {
    const entries = asArray(value);
    if (entries === null) throw new SettingsMergeError(`${source}: hooks.${event} is not an array`);
    for (const entry of entries) {
      if (!isRecord(entry)) throw new SettingsMergeError(`${source}: an entry under hooks.${event} is not a JSON object`);
      const matcher = typeof entry['matcher'] === 'string' ? entry['matcher'] : '';
      const inner = asArray(entry['hooks']);
      if (inner === null) throw new SettingsMergeError(`${source}: an entry under hooks.${event} has no hooks array`);
      for (const hook of inner) {
        const raw = isRecord(hook) && typeof hook['command'] === 'string' ? hook['command'] : '';
        derived.push({ event, matcher, command: resolveCommand(raw, root, source) });
      }
    }
  }
  return derived;
}

function resolveCommand(raw: string, root: string, source: string): string {
  const name = hookNameOf(raw);
  if (name === null || name === '' || UNPLACEABLE_NAME.test(name)) {
    throw new SettingsMergeError(`ABORT: unrecognized hook command in ${source}: ${raw}`, EXPECTED_FORMS);
  }
  // split/join rather than replace: a `$` in the checkout path would otherwise be
  // read as a replacement pattern. The quoted form goes first so the old command
  // loses its quotes (as jq's sub did) while the new one keeps them.
  return raw.split(QUOTED_PLACEHOLDER).join(root).split(PLACEHOLDER).join(root);
}

function hookNameOf(raw: string): string | null {
  if (raw.startsWith(OLD_PREFIX)) return raw.slice(OLD_PREFIX.length);
  if (raw.startsWith(NEW_PREFIX)) return raw.slice(NEW_PREFIX.length);
  if (raw.startsWith(HOT_PREFIX)) return raw.slice(HOT_PREFIX.length);
  return null;
}

// ----------------------------------------------------------------- hook merge

function scrubEngineosHooks(events: Record<string, unknown>, pluginRoot: string): number {
  let removed = 0;
  for (const [event, value] of Object.entries(events)) {
    if (value === null || value === undefined) continue;
    const entries = asArray(value);
    if (entries === null) throw new SettingsMergeError(`settings.json "hooks.${event}" is not an array`);
    const kept: unknown[] = [];
    for (const entry of entries) {
      const inner = isRecord(entry) ? asArray(entry['hooks']) : null;
      if (!isRecord(entry) || inner === null) {
        // A shape this port does not understand belongs to somebody else; it
        // survives untouched rather than being dropped as collateral.
        kept.push(entry);
        continue;
      }
      const survivors = inner.filter((hook) => !isEngineosHook(hook, pluginRoot));
      removed += inner.length - survivors.length;
      if (survivors.length === 0) continue;
      kept.push({ ...entry, hooks: survivors });
    }
    events[event] = kept;
  }
  return removed;
}

function isEngineosHook(hook: unknown, pluginRoot: string): boolean {
  if (!isRecord(hook)) return false;
  const command = hook['command'];
  return typeof command === 'string' && isEngineosCommand(command, pluginRoot);
}

function addHook(events: Record<string, unknown>, hook: DerivedHook): void {
  const existing = asArray(events[hook.event]) ?? [];
  existing.push({ matcher: hook.matcher, hooks: [{ type: 'command', command: hook.command }] });
  events[hook.event] = existing;
}

// ---------------------------------------------------------------- permissions

function mergePermissions(settings: Record<string, unknown>, template: unknown): void {
  if (!isRecord(template)) throw new SettingsMergeError('permissions template is not a JSON object');
  const permissions = objectField(settings, 'permissions', 'permissions');
  const existing = arrayField(permissions, 'allow', 'permissions.allow');
  const shared = asArray(template['allow']) ?? [];

  // Set union preserving order — existing first, then the template's extras. The
  // bash used jq `unique`, which sorted the whole list on every install and
  // churned the consumer's file; the order-preserving union is the frozen contract.
  const seen = new Set<string>();
  const union: unknown[] = [];
  for (const value of [...existing, ...shared]) {
    const key = typeof value === 'string' ? `s:${value}` : `j:${JSON.stringify(value)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    union.push(value);
  }

  permissions['allow'] = union;
  settings['permissions'] = permissions;
}

// --------------------------------------------------------------------- shapes

// jq's `//=` defaults null and false only. Any other non-object made the
// installer's jq program fail BEFORE the `mv`, so refusing here — rather than
// overwriting — is the faithful port: the consumer's file is never destroyed.
function objectField(container: Record<string, unknown>, key: string, label: string): Record<string, unknown> {
  const value = container[key];
  if (value === undefined || value === null || value === false) return {};
  if (!isRecord(value)) throw new SettingsMergeError(`settings.json "${label}" is not a JSON object`);
  return value;
}

function arrayField(container: Record<string, unknown>, key: string, label: string): unknown[] {
  const value = container[key];
  if (value === undefined || value === null || value === false) return [];
  const array = asArray(value);
  if (array === null) throw new SettingsMergeError(`settings.json "${label}" is not an array`);
  return array;
}

function asArray(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null;
}

function toSlashes(value: string): string {
  return value.split('\\').join('/');
}

function trimTrailingSeparators(value: string): string {
  return value.replace(/[\\/]+$/, '');
}
