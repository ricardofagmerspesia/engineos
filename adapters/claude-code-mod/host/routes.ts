// The route table the mod serves, read from the same hooks/hooks.json the shell
// hooks are registered from. Deriving it (instead of restating the events in
// the mod) is what keeps the two carriers registering the same events: a row
// added to hooks.json is served in-process on the next session with no edit
// here, and a row this host cannot serve is reported, never dropped silently.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isRecord } from '../../../src/lib/json';
import { HOST_EVENTS, type HostEvent, type HostRoute } from './protocol';

// `node "${CLAUDE_PLUGIN_ROOT}/dist/engineos.cjs" hook <name>`, and the
// per-call bundle's form; the hook name is the last word.
const HOOK_COMMAND = /\bhook\s+([a-z][a-z0-9-]*)\s*$/;

export interface RouteTable {
  routes: HostRoute[];
  unserved: string[];
}

export function readRouteTable(root: string, servable: ReadonlySet<string>): RouteTable {
  const parsed: unknown = JSON.parse(readFileSync(join(root, 'hooks', 'hooks.json'), 'utf8'));
  const events = isRecord(parsed) && isRecord(parsed['hooks']) ? parsed['hooks'] : {};
  const routes: HostRoute[] = [];
  const unserved: string[] = [];
  for (const [event, groups] of Object.entries(events)) {
    if (!Array.isArray(groups)) continue;
    const hostEvent = asHostEvent(event);
    for (const group of groups) {
      const route = routeOf(hostEvent, event, group, servable, unserved);
      if (route !== null) routes.push(route);
    }
  }
  return { routes, unserved };
}

function routeOf(
  hostEvent: HostEvent | null,
  event: string,
  group: unknown,
  servable: ReadonlySet<string>,
  unserved: string[],
): HostRoute | null {
  if (!isRecord(group) || !Array.isArray(group['hooks'])) return null;
  const matcher = typeof group['matcher'] === 'string' ? group['matcher'] : '';
  const hooks: string[] = [];
  for (const entry of group['hooks']) {
    const name = hookName(entry);
    if (name === null) continue;
    if (hostEvent === null || !servable.has(name)) unserved.push(`${event}:${matcher}:${name}`);
    else hooks.push(name);
  }
  return hostEvent === null || hooks.length === 0 ? null : { event: hostEvent, matcher, hooks };
}

function hookName(entry: unknown): string | null {
  if (!isRecord(entry) || entry['type'] !== 'command' || typeof entry['command'] !== 'string') return null;
  return HOOK_COMMAND.exec(entry['command'])?.[1] ?? null;
}

function asHostEvent(event: string): HostEvent | null {
  return HOST_EVENTS.find((known) => known === event) ?? null;
}
