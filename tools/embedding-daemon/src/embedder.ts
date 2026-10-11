// The warm model: loaded once when the daemon starts, then every request costs
// one forward pass for the prompt (exemplar vectors are cached by text).
//
// Model and revision are pinned: a moving `main` would change scores under a
// calibrated threshold without any diff in this repository. MiniLM-L6 (384
// dimensions, int8 ONNX weights, about 23 MB) is the class the plan names; a
// model change is a new revision constant plus a recalibration in the approved
// eval stage, never a silent swap.
import { env, pipeline } from '@huggingface/transformers';
import type { Candidate } from './protocol.ts';

export const MODEL_ID = 'Xenova/all-MiniLM-L6-v2';
// https://huggingface.co/api/models/Xenova/all-MiniLM-L6-v2 sha, read 2026-10-11.
export const MODEL_REVISION = '751bff37182d3f1213fa05d7196b954e230abad9';
const MODEL_DTYPE = 'q8';
// Exemplars are registry data (a few hundred strings); the bound only matters
// if a client sends arbitrary text as exemplars.
const MAX_CACHED_VECTORS = 4_096;
const SCORE_DECIMALS = 100;

export interface EmbedderOptions {
  cacheDir: string;
  // true: never reach the Hugging Face hub; the model must already be cached.
  offline: boolean;
}

export interface Embedder {
  model: string;
  rank(text: string, candidates: readonly Candidate[]): Promise<Record<string, number>>;
}

export class EmbeddingShapeError extends Error {
  override readonly name = 'EmbeddingShapeError';
}

export async function createEmbedder(options: EmbedderOptions): Promise<Embedder> {
  env.cacheDir = options.cacheDir;
  env.allowRemoteModels = !options.offline;
  const extractor = await pipeline('feature-extraction', MODEL_ID, { revision: MODEL_REVISION, dtype: MODEL_DTYPE });
  const cache = new Map<string, number[]>();

  async function embed(texts: readonly string[]): Promise<number[][]> {
    const output = await extractor([...texts], { pooling: 'mean', normalize: true });
    return vectorsOf(output.tolist(), texts.length);
  }

  async function exemplarVectors(texts: readonly string[]): Promise<number[][]> {
    const missing = [...new Set(texts.filter((text) => !cache.has(text)))];
    if (missing.length > 0) {
      const vectors = await embed(missing);
      missing.forEach((text, index) => remember(cache, text, vectors[index] ?? []));
    }
    return texts.map((text) => cache.get(text) ?? []);
  }

  return {
    model: `${MODEL_ID}@${MODEL_REVISION}`,
    async rank(text, candidates): Promise<Record<string, number>> {
      const [query] = await embed([text]);
      if (query === undefined) throw new EmbeddingShapeError('no vector for the prompt');
      const scores: Record<string, number> = {};
      for (const candidate of candidates) {
        const vectors = await exemplarVectors(candidate.exemplars);
        scores[candidate.id] = similarity(query, vectors);
      }
      return scores;
    },
  };
}

// Best exemplar wins: an intent is as close as its closest paraphrase. Vectors
// are unit length, so the dot product is the cosine; a negative cosine says
// "unrelated" and reads as 0, keeping the contract's [0,1] range.
function similarity(query: readonly number[], exemplars: readonly (readonly number[])[]): number {
  let best = 0;
  for (const vector of exemplars) {
    let dot = 0;
    for (let i = 0; i < query.length; i += 1) dot += (query[i] ?? 0) * (vector[i] ?? 0);
    if (dot > best) best = dot;
  }
  return Math.round(Math.min(1, best) * SCORE_DECIMALS) / SCORE_DECIMALS;
}

function remember(cache: Map<string, number[]>, text: string, vector: number[]): void {
  if (cache.size >= MAX_CACHED_VECTORS) {
    const oldest = cache.keys().next();
    if (oldest.done !== true) cache.delete(oldest.value);
  }
  cache.set(text, vector);
}

// tolist() is untyped nested arrays; narrowed here so nothing downstream sees
// a value the model did not actually produce.
function vectorsOf(value: unknown, expected: number): number[][] {
  if (!Array.isArray(value) || value.length !== expected) throw new EmbeddingShapeError(`expected ${expected} vectors`);
  const rows: readonly unknown[] = value;
  return rows.map((row) => {
    if (!Array.isArray(row)) throw new EmbeddingShapeError('a vector is not an array');
    const cells: readonly unknown[] = row;
    const numbers = cells.filter(isFiniteNumber);
    if (numbers.length !== cells.length) throw new EmbeddingShapeError('a vector holds a non-number');
    return numbers;
  });
}

function isFiniteNumber(cell: unknown): cell is number {
  return typeof cell === 'number' && Number.isFinite(cell);
}
