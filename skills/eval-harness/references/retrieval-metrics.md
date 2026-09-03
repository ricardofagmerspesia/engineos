# Retrieval metrics

Inputs per golden case: `relevant` = set of chunk ids that answer the question
(1-3 typically), `ranked` = the retriever's ordered ids (length >= K).

| Metric | Formula | Reads as |
|---|---|---|
| Recall@K | \|relevant ∩ ranked[:K]\| / \|relevant\| | did the right chunks make it into the window at all |
| Precision@K | \|relevant ∩ ranked[:K]\| / K | how much of the window is noise |
| MRR | mean over cases of 1 / rank of the first relevant id (0 if none in ranked) | does the best chunk sit near the top |

Report at the K the generator actually receives (after re-ranking) AND at the
candidate-set size before re-ranking; the gap is the re-ranker's contribution.

```ts
export function recallAtK(relevant: Set<string>, ranked: string[], k: number): number {
  const hits = ranked.slice(0, k).filter((id) => relevant.has(id)).length;
  return relevant.size === 0 ? 0 : hits / relevant.size;
}
export function precisionAtK(relevant: Set<string>, ranked: string[], k: number): number {
  const hits = ranked.slice(0, k).filter((id) => relevant.has(id)).length;
  return k === 0 ? 0 : hits / k;
}
export function reciprocalRank(relevant: Set<string>, ranked: string[]): number {
  const idx = ranked.findIndex((id) => relevant.has(id));
  return idx === -1 ? 0 : 1 / (idx + 1);
}
export function meanReciprocalRank(cases: Array<{ relevant: Set<string>; ranked: string[] }>): number {
  return cases.length === 0 ? 0 : cases.reduce((s, c) => s + reciprocalRank(c.relevant, c.ranked), 0) / cases.length;
}
```

Thresholds to start from (raise, never lower silently): Recall@K >= 0.9 at the
generator's K, MRR >= 0.7. Record them in `evals/<feature>/retrieval/BASELINE.md`
with date, index version and chunking version.

Groundedness / faithfulness are judge criteria (yes/no per claim), scored by a
model outside the feature's family — the `judge` scorer rules in SKILL.md apply.
