import { createHash } from 'node:crypto';

// Which machine a recorded baseline describes. A baseline compared across
// different hardware is not a regression signal, so the id below names the
// hardware and deliberately excludes the EngineOS version: upgrading EngineOS
// must compare against the same host's previous numbers, not start a new file.
export interface HostMetadata {
  platform: string;
  cpuModel: string;
  cpuCount: number;
  nodeVersion: string;
  engineosVersion: string;
}

export interface HostDeps {
  platform: () => string;
  cpus: () => readonly { model: string }[];
  nodeVersion: () => string;
}

export function collectHost(deps: HostDeps, engineosVersion: string): HostMetadata {
  const cpus = deps.cpus();
  const first = cpus[0];
  return {
    platform: deps.platform(),
    // A container with no readable cpu list reports `unknown` rather than
    // crashing a measurement run that is otherwise valid.
    cpuModel: first === undefined ? 'unknown' : first.model,
    cpuCount: cpus.length,
    nodeVersion: deps.nodeVersion(),
    engineosVersion,
  };
}

export function hostId(meta: HostMetadata): string {
  const material = `${meta.platform}|${meta.cpuModel}|${String(meta.cpuCount)}`;
  const digest = createHash('sha256').update(material).digest('hex').slice(0, 12);
  return `${slug(meta.platform)}-${String(meta.cpuCount)}x-${digest}`;
}

// A file-name component, so the class is narrower than the journal's slug:
// no dots and no slashes can reach a path built from this value.
function slug(value: string): string {
  const lowered = value.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
  return lowered.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'unknown';
}
