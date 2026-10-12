import { KernelError, isRecord } from '../lib/json';

// Every strict loader refuses the same way: a KernelError naming the registry
// file and the JSON path, so a malformed registry is reported where it was
// read rather than answered with a default a gate would then trust.
export interface StrictReader {
  malformed(what: string): never;
  requireRecord(value: unknown, path: string): Record<string, unknown>;
  requireString(value: unknown, path: string): string;
  requireNumber(value: unknown, path: string): number;
  requireBoolean(value: unknown, path: string): boolean;
  requireStrings(value: unknown, path: string): string[];
  requireRows(value: unknown, path: string): Record<string, unknown>[];
  optionalString(value: unknown, path: string): string | null;
  optionalStrings(value: unknown, path: string): string[];
}

// Bounded numbers several policy blocks share. Built over a reader so each
// refusal still names the registry file that reader was made for.
export interface NumberBounds {
  positiveInteger(value: unknown, path: string): number;
  // [0, 1]
  unitInterval(value: unknown, path: string): number;
  // (0, 1]
  aboveZeroAtMostOne(value: unknown, path: string): number;
}

export function numberBounds(reader: Pick<StrictReader, 'malformed' | 'requireNumber'>): NumberBounds {
  const { malformed, requireNumber } = reader;
  return {
    positiveInteger(value: unknown, path: string): number {
      const number = requireNumber(value, path);
      if (!Number.isInteger(number) || number < 1) malformed(`${path} must be a positive integer`);
      return number;
    },
    unitInterval(value: unknown, path: string): number {
      const number = requireNumber(value, path);
      if (number < 0 || number > 1) malformed(`${path} must be between 0 and 1`);
      return number;
    },
    aboveZeroAtMostOne(value: unknown, path: string): number {
      const number = requireNumber(value, path);
      if (number <= 0 || number > 1) malformed(`${path} must be greater than 0 and at most 1`);
      return number;
    },
  };
}

export function strictReader(file: string): StrictReader {
  function malformed(what: string): never {
    throw new KernelError(`registries/${file}: ${what}`);
  }
  function requireRecord(value: unknown, path: string): Record<string, unknown> {
    if (!isRecord(value)) malformed(`${path || 'the document'} must be an object`);
    return value;
  }
  function requireString(value: unknown, path: string): string {
    if (typeof value !== 'string') malformed(`${path} must be a string`);
    return value;
  }
  function requireNumber(value: unknown, path: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) malformed(`${path} must be a number`);
    return value;
  }
  function requireBoolean(value: unknown, path: string): boolean {
    if (typeof value !== 'boolean') malformed(`${path} must be a boolean`);
    return value;
  }
  function requireStrings(value: unknown, path: string): string[] {
    if (!Array.isArray(value)) malformed(`${path} must be an array of strings`);
    return value.map((item, i) => requireString(item, `${path}[${i}]`));
  }
  function requireRows(value: unknown, path: string): Record<string, unknown>[] {
    if (!Array.isArray(value)) malformed(`${path} must be an array of objects`);
    return value.map((item, i) => requireRecord(item, `${path}[${i}]`));
  }
  // jq's `// null` reads an absent and an explicitly null field the same way; a
  // present field of the wrong type is malformed, not absent.
  function optionalString(value: unknown, path: string): string | null {
    if (value === undefined || value === null) return null;
    return requireString(value, path);
  }
  function optionalStrings(value: unknown, path: string): string[] {
    if (value === undefined || value === null) return [];
    return requireStrings(value, path);
  }
  return {
    malformed,
    requireRecord,
    requireString,
    requireNumber,
    requireBoolean,
    requireStrings,
    requireRows,
    optionalString,
    optionalStrings,
  };
}
