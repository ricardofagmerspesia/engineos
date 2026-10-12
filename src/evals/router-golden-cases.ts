// The curated router golden set, evals/router-golden/cases.jsonl
// (routing-decision-layer contracts §5): one case per line, labelled by the
// developer from the candidates `collect` writes. A line that is not a
// well-formed, labelled case is malformed — the run refuses to score a set it
// cannot read whole, because a silently dropped case changes the default.
import { LANGUAGES, type Language } from '../registry/project-config';
import { isRecord } from '../lib/json';
import { parseCaseStack, type CasePackage } from './stack-routing';

export type CaseSource = 'real' | 'synthetic';

export interface GoldenCase {
  id: string;
  source: CaseSource;
  repo: string;
  prompt: string;
  // Empty when the case's repository has no manifest: no stack is known, so
  // the floor rules nothing out, exactly as in such a repository.
  packages: CasePackage[];
  languages: Language[];
  expectIntents: string[];
}

export interface ParsedCases {
  cases: GoldenCase[];
  malformed: string[];
}

export function parseCases(text: string): ParsedCases {
  const cases: GoldenCase[] = [];
  const malformed: string[] = [];
  const ids = new Set<string>();
  text.split('\n').forEach((line, index) => {
    if (line.trim() === '') return;
    const label = `line ${index + 1}`;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      malformed.push(`${label}: not JSON`);
      return;
    }
    const result = parseCase(parsed);
    if (typeof result === 'string') {
      malformed.push(`${label}: ${result}`);
      return;
    }
    if (ids.has(result.id)) {
      malformed.push(`${label}: duplicate id ${result.id}`);
      return;
    }
    ids.add(result.id);
    cases.push(result);
  });
  return { cases, malformed };
}

// A string is the reason the line is malformed.
function parseCase(value: unknown): GoldenCase | string {
  if (!isRecord(value)) return 'not an object';
  const { id, source, repo, prompt } = value;
  if (typeof id !== 'string' || id === '') return 'id must be a non-empty string';
  if (source !== 'real' && source !== 'synthetic') return `${id}: source must be real or synthetic`;
  if (typeof repo !== 'string') return `${id}: repo must be a string`;
  if (typeof prompt !== 'string' || prompt.trim() === '') return `${id}: prompt must be a non-empty string`;
  const expect = value['expect_intents'];
  if (!Array.isArray(expect) || expect.length === 0) return `${id}: expect_intents must be a non-empty list (null = not curated yet)`;
  const entries: unknown[] = expect;
  if (!entries.every((entry): entry is string => typeof entry === 'string' && entry !== '')) {
    return `${id}: expect_intents must list intent ids`;
  }
  const stackValue = value['stack'];
  if (Array.isArray(stackValue) && stackValue.length === 0) {
    return { id, source, repo, prompt, packages: [], languages: [], expectIntents: entries };
  }
  const stack = parseCaseStack(stackValue);
  if (stack.kind !== 'tagged') return `${id}: stack must list ${LANGUAGES.join('/')} packages, optionally :framework, each once`;
  return { id, source, repo, prompt, packages: stack.packages, languages: stack.languages, expectIntents: entries };
}
