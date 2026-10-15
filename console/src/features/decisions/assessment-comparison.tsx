import type { DecisionInput, ProviderSuccess } from '../../lib/decisions/contracts';
import { Table, TableHead, TableHeaderCell, TableBody, TableRow, TableCell } from '../../components/ui/table';
export function displayScore(value: number | null): string { return value === null ? 'Unavailable' : value.toFixed(2); }
function AssessmentCell({ result, optionId, criterionId }: { result: ProviderSuccess | undefined; optionId: string; criterionId: string }) {
  const criterion = result?.evaluation.options.find((option) => option.optionId === optionId)?.criteria.find((entry) => entry.criterionId === criterionId);
  if (!criterion) return <TableCell>Unavailable — no valid assessment</TableCell>;
  return <TableCell><p className="font-medium">{displayScore(criterion.score)} · [{displayScore(criterion.lower)}, {displayScore(criterion.upper)}]</p><p>{criterion.rationale}</p><p className="mt-1 text-slate-600">Evidence: {criterion.evidenceIds.join(', ') || 'None cited'}</p><ul className="list-inside list-disc">{criterion.assumptions.map((assumption, index) => <li key={index}>Assumption: {assumption}</li>)}</ul></TableCell>;
}
export function AssessmentComparison({ input, evaluations, label }: { input: DecisionInput; evaluations: ProviderSuccess[]; label: string }) {
  const gpt = evaluations.find((entry) => entry.metadata.provider === 'openai');
  const claude = evaluations.find((entry) => entry.metadata.provider === 'anthropic');
  return <section className="space-y-3"><h3 className="font-semibold">{label}</h3><p className="text-sm text-slate-600">Plausible score bounds are utility intervals, not calibrated probabilities. Model statements remain assessments until evidence is verified.</p>
    <Table><TableHead><TableRow><TableHeaderCell>Option / criterion</TableHeaderCell><TableHeaderCell>GPT {gpt?.metadata.model ?? '(unavailable)'}</TableHeaderCell><TableHeaderCell>Claude {claude?.metadata.model ?? '(unavailable)'}</TableHeaderCell></TableRow></TableHead><TableBody>{input.options.flatMap((option) => input.criteria.map((criterion) => <TableRow key={`${option.id}:${criterion.id}`}><TableCell>{option.label} / {criterion.label}</TableCell><AssessmentCell result={gpt} optionId={option.id} criterionId={criterion.id} /><AssessmentCell result={claude} optionId={option.id} criterionId={criterion.id} /></TableRow>))}</TableBody></Table>
    {evaluations.map((result) => <details key={result.metadata.provider} className="rounded border border-slate-200 p-3"><summary className="focus-ring cursor-pointer">{result.metadata.provider === 'openai' ? 'GPT' : 'Claude'} constraints, risks and questions</summary>
      <p className="text-sm">Preferred option: {result.evaluation.preferredOptionId ?? 'None'} · Request ID: {result.metadata.requestId ?? 'Unavailable'} · Tokens: {result.metadata.inputTokens ?? 'Unavailable'} in / {result.metadata.outputTokens ?? 'Unavailable'} out · Cost: {result.metadata.costMicros === null ? 'Unavailable' : `${result.metadata.costMicros} micro-units`}</p>
      {result.evaluation.options.map((option) => <div key={option.optionId} className="mt-3 space-y-2"><h4 className="font-medium">{option.optionId}</h4><ul className="list-inside list-disc">{option.constraints.map((constraint) => <li key={constraint.constraintId}>{constraint.constraintId}: {constraint.status} — {constraint.rationale} (evidence: {constraint.evidenceIds.join(', ') || 'None'})</li>)}</ul><ul className="list-inside list-disc">{option.risks.map((risk) => <li key={risk.id}>{risk.severity} risk: {risk.description} · Mitigations: {risk.mitigations.join('; ') || 'None'} · Evidence: {risk.evidenceIds.join(', ') || 'None'}</li>)}</ul></div>)}
      <ul className="mt-3 list-inside list-disc">{result.evaluation.unresolvedQuestions.map((question, index) => <li key={index}>Unresolved: {question}</li>)}</ul>
      <ul className="list-inside list-disc">{result.evaluation.materialClaims.map((claim) => <li key={claim.id}>Claim {claim.id} ({claim.optionId}): {claim.claim} · Evidence: {claim.evidenceIds.join(', ') || 'None'}</li>)}</ul>
    </details>)}
  </section>;
}
