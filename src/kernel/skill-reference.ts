// Bounded named discovery: no recursive filesystem search, loading or installs.
import { readFileSync, statSync, realpathSync } from 'node:fs';
import { isAbsolute, join, relative } from 'node:path';
import { isRecord, KernelError } from '../lib/json';

const IDS: readonly string[] = ['upstream-session-retro', 'engineos-recurring-retro', 'upstream-prototype', 'upstream-to-tickets'];
function field(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  if (typeof value !== 'string' || value.length === 0 || value.length > 256) throw new KernelError(`skill-reference: invalid ${key}`);
  return value;
}
export function skillReference(root: string, id: string): unknown {
  if (!IDS.includes(id)) throw new KernelError('skill-reference: unknown reference id');
  let value: unknown;
  try {
    const file = join(root, 'registries/skill-references.json');
    if (statSync(file).size > 16384) throw new KernelError('skill-reference: manifest exceeds 16 KiB');
    value = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    if (error instanceof KernelError) throw error;
    throw new KernelError('skill-reference: manifest unavailable or invalid JSON');
  }
  if (!isRecord(value) || Object.keys(value).some(key => !['schema_version', 'references'].includes(key)) || value['schema_version'] !== 1 || !Array.isArray(value['references']) || value['references'].length > 16) throw new KernelError('skill-reference: invalid bounded manifest');
  const entries = value['references'].map(item => {
    if (!isRecord(item) || Object.keys(item).some(key => !['id', 'command', 'origin', 'purpose', 'path'].includes(key))) throw new KernelError('skill-reference: invalid entry');
    const path = field(item, 'path');
    if (isAbsolute(path) || !/^[A-Za-z0-9._/-]+$/.test(path) || path.split('/').some(part => part === '..' || part === '.' || part === '') || !path.endsWith('/SKILL.md')) throw new KernelError('skill-reference: invalid relative path');
    if (!IDS.includes(field(item, 'id'))) throw new KernelError('skill-reference: unknown manifest id');
    return {id: field(item, 'id'), command: field(item, 'command'), origin: field(item, 'origin'), purpose: field(item, 'purpose'), path};
  });
  if (new Set(entries.map(entry => entry.id)).size !== entries.length) throw new KernelError('skill-reference: duplicate id');
  const entry = entries.find(candidate => candidate.id === id);
  if (entry === undefined) throw new KernelError('skill-reference: id absent from manifest');
  const path = join(root, entry.path);
  let available = false;
  try {
    const physical = realpathSync(path);
    const local = relative(realpathSync(root), physical);
    available = !isAbsolute(local) && local !== '..' && !local.startsWith('../') && statSync(physical).isFile();
  } catch { /* Missing dependency is explicit, no search or installation. */ }
  return {...entry, absolutePath: path, available, enforcement: 'discovery-only'};
}
