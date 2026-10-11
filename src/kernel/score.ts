import { globMatch } from '../lib/glob';
import type { IntentRow, IntentsRegistry, Phrase } from '../registry/intents';
import type { RoutingDomain, RoutingRegistry } from '../registry/routing';
import type { Registries } from './context';
import { asciiDowncase } from './scale';

// Tier 1 of the router (contracts.md@rev1 §9): a deterministic scored
// classifier over intents.json. Pure — no Date, no random, no I/O. The matching
// primitives (boundedContains, the path matcher) live here so that
// route.ts -> score.ts is the only import direction.

// One ranked candidate. `features` are the §9.4 strings: never prompt text other
// than a matched registry phrase or a path token.
export interface RankedIntent {
  id: string;
  score: number;
  confidence: number;
  features: string[];
}

// BM25 constants of §9.1; not policy knobs, so they stay in code.
const K1 = 1.2;
const B = 0.75;

// Function words with no routing evidence; a tokenizer detail, not contract.
const STOPWORDS: ReadonlySet<string> = new Set(
  'a an the to of for and or in on at is it this that with be our we i me my you your can could should would will just which what when how all each'.split(' '),
);

// Every candidate with score > 0, score descending, ties by registry order, NOT
// truncated: route.ts applies min_score, max_intents and top_k.
export function scoreIntents(text: string, regs: Registries): RankedIntent[] {
  const scoring = regs.policy.router.scoring;
  const compiled = compile(regs.intents);
  const lower = asciiDowncase(text);
  const query = new Set(tokenize(text));
  const lexical = exemplarScores(query, compiled.index, compiled.rows.length);
  const maxLexical = Math.max(0, ...lexical);
  const paths = compiled.pathAware ? pathDomains(text, regs.routing) : new Map<string, string>();

  const candidates: { order: number; id: string; score: number; features: string[] }[] = [];
  compiled.rows.forEach((row, order) => {
    const features: string[] = [];
    let sum = 0;
    for (const phrase of row.phrases) {
      if (!boundedContains(lower, phrase.lower)) continue;
      sum += phrase.weight;
      features.push(`+${formatNumber(phrase.weight)} "${phrase.text}"`);
    }
    const pair = row.pair === null ? null : pairHit(row.pair, query);
    if (pair !== null) {
      sum += pair.weight;
      features.push(`+${formatNumber(pair.weight)} pair ${pair.label}`);
    }
    for (const phrase of row.negative) {
      if (!boundedContains(lower, phrase.lower)) continue;
      sum -= phrase.weight;
      features.push(`-${formatNumber(phrase.weight)} "${phrase.text}"`);
    }
    const token = row.pathDomain === null ? undefined : paths.get(row.pathDomain);
    if (token !== undefined && scoring.path_weight > 0) {
      sum += scoring.path_weight;
      features.push(`+${formatNumber(scoring.path_weight)} path ${token}`);
    }
    const lex = lexical[order] ?? 0;
    if (lex > 0 && maxLexical > 0 && scoring.bm25_weight > 0) {
      const contribution = (scoring.bm25_weight * lex) / maxLexical;
      sum += contribution;
      features.push(`+${formatNumber(contribution)} exemplar`);
    }
    const score = Math.max(0, round2(sum));
    if (score > 0) candidates.push({ order, id: row.id, score, features });
  });

  candidates.sort((a, b) => b.score - a.score || a.order - b.order);
  const total = candidates.reduce((acc, c) => acc + c.score, 0);
  return candidates.map((c) => ({ id: c.id, score: c.score, confidence: round2(c.score / total), features: c.features }));
}

// §2.2: relative gap between the top two scores; 1 for a lone candidate, null
// for none. Read from the untruncated ranking so top_k = 1 still has a margin.
export function marginOf(ranked: readonly RankedIntent[]): number | null {
  const top = ranked[0];
  if (top === undefined) return null;
  const second = ranked[1];
  if (second === undefined) return 1;
  return round2((top.score - second.score) / top.score);
}

// asciiDowncase, non-[a-z0-9] runs to one space, split, stopwords dropped,
// light stemming. Shared by the query, the BM25 documents and the verb-object
// pairs so all three agree on what a term is.
export function tokenize(text: string): string[] {
  const out: string[] = [];
  for (const word of asciiDowncase(text).split(/[^a-z0-9]+/)) {
    if (word === '' || STOPWORDS.has(word)) continue;
    out.push(stem(word));
  }
  return out;
}

function stem(word: string): string {
  if (word.length > 4 && word.endsWith('ing')) return word.slice(0, -3);
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

// The jq bounded_contains helper, literally: both edges of a phrase must sit
// against the text's start/end or a non-alphanumeric character ("add" matches
// "add endpoint", never "addressed"). indexOf rather than a built regex: a
// phrase is registry data, and turning data into a pattern is an injection.
// An empty phrase would match everywhere, so it matches nothing.
export function boundedContains(haystack: string, needle: string): boolean {
  if (needle === '') return false;
  for (let i = haystack.indexOf(needle); i !== -1; i = haystack.indexOf(needle, i + 1)) {
    if (!isAlnum(haystack[i - 1]) && !isAlnum(haystack[i + needle.length])) return true;
  }
  return false;
}

// Oniguruma's Unicode-aware POSIX [[:alnum:]]: letters and decimal digits in any
// script; marks, "_" and punctuation are boundaries (verified against jq for
// U+00B2, U+2167, U+0663, U+0308, U+AC00, U+00B7, "_"). Known limit: a lone
// surrogate reads as a boundary here and as alphanumeric in jq.
const ALNUM = /^[\p{Alphabetic}\p{Nd}]$/u;

// undefined is the text's own edge — start or end — which bounds a match.
function isAlnum(char: string | undefined): boolean {
  return char !== undefined && ALNUM.test(char);
}

export type PathMatch = { kind: 'domain'; domain: RoutingDomain } | { kind: 'excluded' } | { kind: 'none' };

// route-path's matching, shared by routeByPath and the path feature. `root` is
// null for prompt tokens: self_dirs names files of THIS checkout by absolute
// prefix, which a word in a prompt never is.
export function matchPathDomain(file: string, reg: RoutingRegistry, root: string | null): PathMatch {
  const base = file.slice(file.lastIndexOf('/') + 1);
  const norm = `/${file}`;

  // Exclusions first, in registry order: self dirs of THIS checkout (resolved
  // against root, so a consumer's own hooks/ or docs/ stay routable), then path
  // globs, then basename globs.
  if (root !== null) {
    for (const dir of reg.excluded.self_dirs) {
      if (file.startsWith(`${root}/${dir}/`)) return { kind: 'excluded' };
    }
  }
  for (const pattern of reg.excluded.paths) {
    if (globMatch(pattern, norm)) return { kind: 'excluded' };
  }
  for (const pattern of reg.excluded.basenames) {
    if (globMatch(pattern, base)) return { kind: 'excluded' };
  }

  for (const id of reg.precedence) {
    const domain = reg.domains.find((d) => d.id === id);
    if (domain === undefined) continue;
    // Fidelity with the bash loop: every path glob of a domain is tried before
    // any of its basename globs, per domain in precedence order.
    const hit =
      domain.match.paths.some((p) => globMatch(p, norm)) ||
      domain.match.basenames.some((p) => globMatch(p, base));
    if (hit) return { kind: 'domain', domain };
  }
  return { kind: 'none' };
}

// Wrapping punctuation around a whitespace-delimited token ("`src/a.ts`,") is
// not part of the path; a leading "." is kept because ".env" is a filename.
const LEADING_WRAP = /^[`'"([{<]+/;
const TRAILING_WRAP = /[`'",;:!?)\]}>.]+$/;
const FILE_EXTENSION = /\.[A-Za-z0-9]+$/;

// Domain id -> the first raw token that routed to it.
function pathDomains(text: string, reg: RoutingRegistry): Map<string, string> {
  const found = new Map<string, string>();
  for (const raw of text.split(/\s+/)) {
    const token = raw.replace(LEADING_WRAP, '').replace(TRAILING_WRAP, '');
    if (token === '' || !(token.includes('/') || FILE_EXTENSION.test(token))) continue;
    const match = matchPathDomain(token, reg, null);
    if (match.kind === 'domain' && !found.has(match.domain.id)) found.set(match.domain.id, token);
  }
  return found;
}

interface LoweredPhrase extends Phrase {
  lower: string;
}

interface Term {
  text: string;
  terms: string[];
}

interface CompiledPair {
  verbs: Term[];
  objects: Term[];
  weight: number;
}

interface CompiledRow {
  id: string;
  phrases: LoweredPhrase[];
  negative: LoweredPhrase[];
  pair: CompiledPair | null;
  // Only rows that declare `phrases` take the path feature: a v1 row must score
  // exactly as the any-match router did (contracts.md@rev1 §1.5).
  pathDomain: string | null;
}

interface ExemplarDocument { row: number; frequencies: Map<string, number>; length: number }
interface ExemplarIndex { documents: ExemplarDocument[]; documentFrequency: Map<string, number>; averageLength: number }
interface CompiledIntents { rows: CompiledRow[]; index: ExemplarIndex; pathAware: boolean }

// Compiled once per loaded registry (lazyRegistries memoizes per root), so the
// per-prompt cost is substring scans and one BM25 pass.
const compiledByRegistry = new WeakMap<IntentsRegistry, CompiledIntents>();

function compile(intents: IntentsRegistry): CompiledIntents {
  const cached = compiledByRegistry.get(intents);
  if (cached !== undefined) return cached;
  const rows = intents.intents.map(compileRow);
  const compiled: CompiledIntents = {
    rows,
    index: buildIndex(intents.intents),
    pathAware: rows.some((row) => row.pathDomain !== null),
  };
  compiledByRegistry.set(intents, compiled);
  return compiled;
}

function compileRow(row: IntentRow): CompiledRow {
  const lowered = (phrase: Phrase): LoweredPhrase => ({ ...phrase, lower: asciiDowncase(phrase.text) });
  const terms = (text: string): Term => ({ text, terms: tokenize(text) });
  return {
    id: row.id,
    phrases: row.phrases.map(lowered),
    negative: row.negative.map(lowered),
    pair:
      row.verb_object === null
        ? null
        : { verbs: row.verb_object.verbs.map(terms), objects: row.verb_object.objects.map(terms), weight: row.verb_object.weight },
    pathDomain: row.phrases_declared ? row.domain : null,
  };
}

// The first verb and first object whose every term is in the query, labelled
// "<verb>+<object>". A term list emptied by the stopword filter never fires.
function pairHit(pair: CompiledPair, query: ReadonlySet<string>): { label: string; weight: number } | null {
  const present = (entry: Term): boolean => entry.terms.length > 0 && entry.terms.every((term) => query.has(term));
  const verb = pair.verbs.find(present);
  const object = pair.objects.find(present);
  return verb === undefined || object === undefined ? null : { label: `${verb.text}+${object.text}`, weight: pair.weight };
}

// Documents are exemplars only (contracts.md@rev1 §9.1); a row without them has
// no document and scores 0 on this feature.
function buildIndex(rows: readonly IntentRow[]): ExemplarIndex {
  const documents: ExemplarDocument[] = [];
  const documentFrequency = new Map<string, number>();
  rows.forEach((row, index) => {
    const tokens = tokenize(row.exemplars.join(' '));
    if (tokens.length === 0) return;
    const frequencies = new Map<string, number>();
    for (const token of tokens) frequencies.set(token, (frequencies.get(token) ?? 0) + 1);
    for (const token of frequencies.keys()) documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1);
    documents.push({ row: index, frequencies, length: tokens.length });
  });
  const totalLength = documents.reduce((acc, doc) => acc + doc.length, 0);
  return { documents, documentFrequency, averageLength: documents.length === 0 ? 0 : totalLength / documents.length };
}

function exemplarScores(query: ReadonlySet<string>, index: ExemplarIndex, rowCount: number): number[] {
  const scores = new Array<number>(rowCount).fill(0);
  const total = index.documents.length;
  if (total === 0 || query.size === 0) return scores;
  for (const doc of index.documents) {
    let sum = 0;
    for (const term of query) {
      const frequency = doc.frequencies.get(term);
      if (frequency === undefined) continue;
      const df = index.documentFrequency.get(term) ?? 0;
      const idf = Math.log(1 + (total - df + 0.5) / (df + 0.5));
      sum += (idf * frequency * (K1 + 1)) / (frequency + K1 * (1 - B + (B * doc.length) / index.averageLength));
    }
    scores[doc.row] = sum;
  }
  return scores;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// §9.4: up to two decimals, integers without trailing zeros ("3", "1.5", "0.43").
function formatNumber(value: number): string {
  return String(round2(value));
}
