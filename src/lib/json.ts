import { readFileSync } from 'node:fs';

export class KernelError extends Error {
  readonly kind = 'kernel';
}

export function readJsonFile(path: string): unknown {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    throw new KernelError(`cannot read ${path}`);
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new KernelError(`invalid JSON in ${path}`);
  }
}

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function stringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}
