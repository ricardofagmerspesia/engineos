// The one writer of registries/policy.json `router_decision.default` and
// `default_written_by` (routing-decision-layer contracts §1, §5): the golden-
// set run with `--write-default`, never a hand edit.
//
// The file's own formatting is preserved — inline arrays, key order, the
// description line — by replacing the two values in place, located with a
// small JSON scanner, instead of re-serialising the whole document. The result
// must then load through the strict loader; when it does not, the original
// bytes go back and the caller is told why.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  loadRouterDecisionPolicy,
  type RouterDecisionProvenance,
  type RouterMode,
} from '../registry/policy-router-decision';

export interface RouterDefault {
  mode: RouterMode | null;
  writtenBy: RouterDecisionProvenance | null;
}

export type WriteOutcome = { ok: true; changed: boolean } | { ok: false; reason: string };

interface Member {
  valueStart: number;
  valueEnd: number;
}

export function writeRouterDefault(root: string, value: RouterDefault): WriteOutcome {
  const path = join(root, 'registries', 'policy.json');
  let original: string;
  try {
    original = readFileSync(path, 'utf8');
  } catch (e) {
    return { ok: false, reason: `cannot read ${path}: ${message(e)}` };
  }
  let next: string;
  try {
    next = replaceDefault(original, value);
  } catch (e) {
    return { ok: false, reason: message(e) };
  }
  if (next === original) return { ok: true, changed: false };
  writeFileSync(path, next);
  try {
    const loaded = loadRouterDecisionPolicy(root);
    if (loaded.default !== value.mode) throw new Error(`loader read default ${String(loaded.default)}`);
  } catch (e) {
    writeFileSync(path, original);
    return { ok: false, reason: `the strict loader refused the rewritten policy (restored): ${message(e)}` };
  }
  return { ok: true, changed: true };
}

export function replaceDefault(text: string, value: RouterDefault): string {
  const rootStart = skipWs(text, 0);
  if (text[rootStart] !== '{') throw new Error('policy.json: the document is not an object');
  const block = members(text, rootStart).get('router_decision');
  if (block === undefined || text[block.valueStart] !== '{') throw new Error('policy.json: no router_decision object');
  const fields = members(text, block.valueStart);
  const defaultSpan = fields.get('default');
  const writtenSpan = fields.get('default_written_by');
  if (defaultSpan === undefined || writtenSpan === undefined) {
    throw new Error('policy.json: router_decision lacks default or default_written_by');
  }
  const unit = indentUnit(text);
  // Replaced back to front so the first span's offsets stay valid.
  const spans = [
    { span: defaultSpan, json: JSON.stringify(value.mode) },
    { span: writtenSpan, json: serialise(value.writtenBy, unit, lineIndent(text, writtenSpan.valueStart)) },
  ].sort((a, b) => b.span.valueStart - a.span.valueStart);
  let out = text;
  for (const { span, json } of spans) out = out.slice(0, span.valueStart) + json + out.slice(span.valueEnd);
  JSON.parse(out);
  return out;
}

function serialise(value: unknown, unit: string, indent: string): string {
  return JSON.stringify(value, null, unit).split('\n').join(`\n${indent}`);
}

// The indentation of the line holding `at`, so a multi-line value nests under
// its key the way the rest of the file does.
function lineIndent(text: string, at: number): string {
  const lineStart = text.lastIndexOf('\n', at) + 1;
  const match = /^[ \t]*/.exec(text.slice(lineStart, at));
  return match === null ? '' : match[0];
}

function indentUnit(text: string): string {
  const match = /\n([ \t]+)\S/.exec(text);
  return match?.[1] ?? '  ';
}

// --- a minimal JSON scanner: member value spans of one object ---------------

function members(text: string, objectStart: number): Map<string, Member> {
  const found = new Map<string, Member>();
  let i = skipWs(text, objectStart + 1);
  if (text[i] === '}') return found;
  for (;;) {
    if (text[i] !== '"') throw new Error(`policy.json: expected a key at offset ${i}`);
    const keyEnd = stringEnd(text, i);
    const key: unknown = JSON.parse(text.slice(i, keyEnd));
    i = skipWs(text, keyEnd);
    if (text[i] !== ':') throw new Error(`policy.json: expected ':' at offset ${i}`);
    const valueStart = skipWs(text, i + 1);
    const valueEnd = valueEndAt(text, valueStart);
    if (typeof key === 'string') found.set(key, { valueStart, valueEnd });
    i = skipWs(text, valueEnd);
    if (text[i] === ',') {
      i = skipWs(text, i + 1);
      continue;
    }
    if (text[i] === '}') return found;
    throw new Error(`policy.json: expected ',' or '}' at offset ${i}`);
  }
}

function valueEndAt(text: string, start: number): number {
  const first = text[start];
  if (first === '"') return stringEnd(text, start);
  if (first === '{' || first === '[') {
    let depth = 0;
    let i = start;
    while (i < text.length) {
      const ch = text[i];
      if (ch === '"') {
        i = stringEnd(text, i);
        continue;
      }
      if (ch === '{' || ch === '[') depth += 1;
      if (ch === '}' || ch === ']') {
        depth -= 1;
        if (depth === 0) return i + 1;
      }
      i += 1;
    }
    throw new Error('policy.json: unterminated object or array');
  }
  let i = start;
  while (i < text.length && !/[\s,}\]]/.test(text[i] ?? '')) i += 1;
  return i;
}

function stringEnd(text: string, start: number): number {
  let i = start + 1;
  while (i < text.length) {
    if (text[i] === '\\') {
      i += 2;
      continue;
    }
    if (text[i] === '"') return i + 1;
    i += 1;
  }
  throw new Error('policy.json: unterminated string');
}

function skipWs(text: string, start: number): number {
  let i = start;
  while (i < text.length && /\s/.test(text[i] ?? '')) i += 1;
  return i;
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
