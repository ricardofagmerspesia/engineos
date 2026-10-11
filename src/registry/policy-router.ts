import { strictReader } from './strict';

// The `.router` block of registries/policy.json, split from policy.ts so each
// sibling stays one concern. Scoring feeds src/kernel/score.ts and route.ts,
// combination declares src/kernel/combine.ts's invariants, and source_markers
// feed src/hooks/prompt-source.ts (contracts.md@rev2 §2, §5, §7).

export interface EscalateWhen {
  multi_agent_intents_min: number;
  unrouted_scale_signals: string[];
}

export interface RouterFixture {
  prompt: string;
  escalate: boolean;
  reasons: string[];
  intents: string[];
}

export interface ScoringPolicy {
  min_score: number;
  threshold: number;
  margin: number;
  top_k: number;
  max_intents: number;
  bm25_weight: number;
  path_weight: number;
}

// Literal, not string: combine.ts implements exactly these invariants, so the
// loader refuses any other value instead of letting the registry claim a
// combination the code does not perform (fail closed).
export interface CombinationPolicy {
  gates: 'deterministic-wins';
  judge: 'add-only';
  intents: 'noul-then-primary';
  escalate_on_doubt: true;
}

export interface SourceMarkers {
  notification: string[];
  tool_result: string[];
  hook_echo: string[];
}

export interface RouterPolicy {
  agent: string;
  capability: string;
  reasons: string[];
  escalate_when: EscalateWhen;
  scoring: ScoringPolicy;
  combination: CombinationPolicy;
  source_markers: SourceMarkers;
  fixtures: RouterFixture[];
}

const { malformed, requireRecord, requireString, requireNumber, requireBoolean, requireStrings, requireRows } =
  strictReader('policy.json');

export function parseRouter(value: unknown): RouterPolicy {
  const router = requireRecord(value, '.router');
  const escalateWhen = requireRecord(router['escalate_when'], '.router.escalate_when');
  return {
    agent: requireString(router['agent'], '.router.agent'),
    capability: requireString(router['capability'], '.router.capability'),
    reasons: requireStrings(router['reasons'], '.router.reasons'),
    escalate_when: {
      multi_agent_intents_min: requireNumber(
        escalateWhen['multi_agent_intents_min'],
        '.router.escalate_when.multi_agent_intents_min',
      ),
      unrouted_scale_signals: requireStrings(
        escalateWhen['unrouted_scale_signals'],
        '.router.escalate_when.unrouted_scale_signals',
      ),
    },
    scoring: parseScoring(router['scoring']),
    combination: parseCombination(router['combination']),
    source_markers: parseSourceMarkers(router['source_markers']),
    fixtures: requireRows(router['fixtures'], '.router.fixtures').map((row, i) => ({
      prompt: requireString(row['prompt'], `.router.fixtures[${i}].prompt`),
      escalate: requireBoolean(row['escalate'], `.router.fixtures[${i}].escalate`),
      reasons: requireStrings(row['reasons'], `.router.fixtures[${i}].reasons`),
      intents: requireStrings(row['intents'], `.router.fixtures[${i}].intents`),
    })),
  };
}

function parseScoring(value: unknown): ScoringPolicy {
  const at = '.router.scoring';
  const scoring = requireRecord(value, at);
  return {
    min_score: atLeastZero(scoring['min_score'], `${at}.min_score`),
    threshold: unitInterval(scoring['threshold'], `${at}.threshold`),
    margin: unitInterval(scoring['margin'], `${at}.margin`),
    top_k: positiveInteger(scoring['top_k'], `${at}.top_k`),
    max_intents: positiveInteger(scoring['max_intents'], `${at}.max_intents`),
    bm25_weight: atLeastZero(scoring['bm25_weight'], `${at}.bm25_weight`),
    path_weight: atLeastZero(scoring['path_weight'], `${at}.path_weight`),
  };
}

function parseCombination(value: unknown): CombinationPolicy {
  const at = '.router.combination';
  const combination = requireRecord(value, at);
  return {
    gates: literal(combination['gates'], 'deterministic-wins', `${at}.gates`),
    judge: literal(combination['judge'], 'add-only', `${at}.judge`),
    intents: literal(combination['intents'], 'noul-then-primary', `${at}.intents`),
    escalate_on_doubt: literal(combination['escalate_on_doubt'], true, `${at}.escalate_on_doubt`),
  };
}

// Returns the expected literal itself, so the narrowing never depends on a
// never-returning call through an inferred binding.
function literal<T extends string | boolean>(value: unknown, expected: T, path: string): T {
  if (value !== expected) return malformed(`${path} must be ${String(expected)}`);
  return expected;
}

// An empty marker list would classify nothing as that source, and an empty
// marker would prefix every prompt; both silently change what is routed.
function parseSourceMarkers(value: unknown): SourceMarkers {
  const at = '.router.source_markers';
  const markers = requireRecord(value, at);
  return {
    notification: markerList(markers['notification'], `${at}.notification`),
    tool_result: markerList(markers['tool_result'], `${at}.tool_result`),
    hook_echo: markerList(markers['hook_echo'], `${at}.hook_echo`),
  };
}

function markerList(value: unknown, path: string): string[] {
  const list = requireStrings(value, path);
  if (list.length === 0) malformed(`${path} must not be empty`);
  list.forEach((marker, i) => {
    if (marker.trim() === '') malformed(`${path}[${i}] must not be blank`);
  });
  return list;
}

function atLeastZero(value: unknown, path: string): number {
  const number = requireNumber(value, path);
  if (number < 0) malformed(`${path} must be at least 0`);
  return number;
}

function unitInterval(value: unknown, path: string): number {
  const number = requireNumber(value, path);
  if (number < 0 || number > 1) malformed(`${path} must be between 0 and 1`);
  return number;
}

function positiveInteger(value: unknown, path: string): number {
  const number = requireNumber(value, path);
  if (!Number.isInteger(number) || number < 1) malformed(`${path} must be a positive integer`);
  return number;
}
