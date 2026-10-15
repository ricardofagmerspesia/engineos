"use client";
import { useState, type FormEvent } from 'react';
import { decisionInputSchema, type DecisionInput } from '../../lib/decisions/contracts';
import { Banner } from '../../components/ui/banner';
import { TextField, buttonStyle } from './fields';
function blankInput(): DecisionInput {
  return { question: '', context: '', riskTier: 'low', reversible: false, options: [{ id: 'option-1', label: '', description: '' }, { id: 'option-2', label: '', description: '' }], criteria: [{ id: 'criterion-1', label: '', weight: 1, rubric: '', minimumScore: null }], constraints: [], evidence: [] };
}
async function hashExcerpt(excerpt: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(excerpt));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
export function DecisionForm({ initialInput, pending, onSubmit, onCancel }: { initialInput?: DecisionInput; pending: boolean; onSubmit: (input: DecisionInput) => Promise<void>; onCancel?: () => void }) {
  const [input, setInput] = useState<DecisionInput>(() => initialInput ?? blankInput());
  const [errors, setErrors] = useState<string[]>([]);
  const [preparing, setPreparing] = useState(false);
  function update<K extends keyof DecisionInput>(key: K, value: DecisionInput[K]) { setInput((previous) => ({ ...previous, [key]: value })); }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setErrors([]); setPreparing(true);
    try {
      const evidence = await Promise.all(input.evidence.map(async (record) => ({ ...record, contentHash: await hashExcerpt(record.excerpt) })));
      const result = decisionInputSchema.safeParse({ ...input, evidence });
      if (!result.success) { setErrors(result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`)); return; }
      if (result.data.criteria.reduce((sum, criterion) => sum + criterion.weight, 0) <= 0) { setErrors(['The total criterion weight must be positive.']); return; }
      for (const collection of [result.data.options, result.data.criteria, result.data.constraints, result.data.evidence]) {
        if (new Set(collection.map((entry) => entry.id)).size !== collection.length) { setErrors(['IDs must be unique within each collection.']); return; }
      }
      await onSubmit(result.data);
    } catch (error) { setErrors([error instanceof Error ? error.message : 'Could not save decision.']); }
    finally { setPreparing(false); }
  }
  const busy = pending || preparing;
  return <form onSubmit={submit} className="space-y-6">
    {errors.length > 0 && <Banner variant="error" title="Please correct the decision"><ul className="list-inside list-disc">{errors.map((error) => <li key={error}>{error}</li>)}</ul></Banner>}
    <fieldset disabled={busy} className="space-y-4"><legend className="text-lg font-semibold">Decision input</legend>
      <TextField label="Question" value={input.question} onChange={(value) => update('question', value)} required />
      <TextField label="Context" value={input.context} onChange={(value) => update('context', value)} multiline />
      <label className="block text-sm">Risk tier<select className="focus-ring ml-3 rounded border border-slate-300 p-2" value={input.riskTier} onChange={(event) => { const tier = event.target.value; if (tier === 'low' || tier === 'medium' || tier === 'high') update('riskTier', tier); }}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>
      <label className="flex items-center gap-2 text-sm"><input className="focus-ring" type="checkbox" checked={input.reversible} onChange={(event) => update('reversible', event.target.checked)} />This decision is reversible</label>
    </fieldset>
    <fieldset disabled={busy} className="space-y-3"><legend className="text-lg font-semibold">Candidate options (at least two)</legend>
      {input.options.map((option, index) => <fieldset key={index} className="space-y-2 rounded border border-slate-200 p-3"><legend className="text-sm">Option {index + 1}</legend>
        <TextField label="Option ID" value={option.id} onChange={(id) => update('options', input.options.map((entry, position) => position === index ? { ...entry, id } : entry))} required />
        <TextField label="Label" value={option.label} onChange={(label) => update('options', input.options.map((entry, position) => position === index ? { ...entry, label } : entry))} required />
        <TextField label="Description" value={option.description} onChange={(description) => update('options', input.options.map((entry, position) => position === index ? { ...entry, description } : entry))} multiline />
        <button type="button" className={buttonStyle} disabled={input.options.length <= 2} onClick={() => update('options', input.options.filter((_, position) => position !== index))}>Remove option {index + 1}</button>
      </fieldset>)}
      <button type="button" className={buttonStyle} disabled={input.options.length >= 20} onClick={() => update('options', [...input.options, { id: crypto.randomUUID(), label: '', description: '' }])}>Add option</button>
    </fieldset>
    <fieldset disabled={busy} className="space-y-3"><legend className="text-lg font-semibold">Criteria and utility rubrics</legend>
      <p className="text-sm text-slate-600">Every score is 0–100, higher is better. Define how lower cost, time or risk translates into higher utility. Weights are normalized by the server.</p>
      {input.criteria.map((criterion, index) => <fieldset key={index} className="space-y-2 rounded border border-slate-200 p-3"><legend className="text-sm">Criterion {index + 1}</legend>
        <TextField label="Criterion ID" value={criterion.id} onChange={(id) => update('criteria', input.criteria.map((entry, position) => position === index ? { ...entry, id } : entry))} required />
        <TextField label="Label" value={criterion.label} onChange={(label) => update('criteria', input.criteria.map((entry, position) => position === index ? { ...entry, label } : entry))} required />
        <TextField label="Nonnegative weight" type="number" value={String(criterion.weight)} onChange={(value) => update('criteria', input.criteria.map((entry, position) => position === index ? { ...entry, weight: value === '' ? 0 : Number(value) } : entry))} />
        <TextField label="Scoring rubric" value={criterion.rubric} onChange={(rubric) => update('criteria', input.criteria.map((entry, position) => position === index ? { ...entry, rubric } : entry))} multiline required />
        <TextField label="Minimum acceptable score (optional)" type="number" value={criterion.minimumScore === null ? '' : String(criterion.minimumScore)} onChange={(value) => update('criteria', input.criteria.map((entry, position) => position === index ? { ...entry, minimumScore: value === '' ? null : Number(value) } : entry))} />
        <button type="button" className={buttonStyle} disabled={input.criteria.length <= 1} onClick={() => update('criteria', input.criteria.filter((_, position) => position !== index))}>Remove criterion {index + 1}</button>
      </fieldset>)}
      <button type="button" className={buttonStyle} disabled={input.criteria.length >= 30} onClick={() => update('criteria', [...input.criteria, { id: crypto.randomUUID(), label: '', weight: 1, rubric: '', minimumScore: null }])}>Add criterion</button>
    </fieldset>
    <fieldset disabled={busy} className="space-y-3"><legend className="text-lg font-semibold">Hard constraints</legend>
      {input.constraints.map((constraint, index) => <div key={index} className="space-y-2 rounded border border-slate-200 p-3">
        <TextField label={`Constraint ${index + 1} ID`} value={constraint.id} onChange={(id) => update('constraints', input.constraints.map((entry, position) => position === index ? { ...entry, id } : entry))} required />
        <TextField label="Constraint description" value={constraint.description} onChange={(description) => update('constraints', input.constraints.map((entry, position) => position === index ? { ...entry, description } : entry))} multiline required />
        <button type="button" className={buttonStyle} onClick={() => update('constraints', input.constraints.filter((_, position) => position !== index))}>Remove constraint {index + 1}</button>
      </div>)}
      <button type="button" className={buttonStyle} disabled={input.constraints.length >= 30} onClick={() => update('constraints', [...input.constraints, { id: crypto.randomUUID(), description: '' }])}>Add constraint</button>
    </fieldset>
    <fieldset disabled={busy} className="space-y-3"><legend className="text-lg font-semibold">Supplied evidence</legend>
      <p className="text-sm text-slate-600">Source text is treated as untrusted data. No remote source is fetched. SHA-256 hashes are calculated from the exact excerpt on submission; verification is separate.</p>
      {input.evidence.map((evidence, index) => <div key={index} className="space-y-2 rounded border border-slate-200 p-3">
        <TextField label={`Evidence ${index + 1} ID`} value={evidence.id} onChange={(id) => update('evidence', input.evidence.map((entry, position) => position === index ? { ...entry, id } : entry))} required />
        <TextField label="Source" value={evidence.source} onChange={(source) => update('evidence', input.evidence.map((entry, position) => position === index ? { ...entry, source } : entry))} required />
        <TextField label="Excerpt" value={evidence.excerpt} onChange={(excerpt) => update('evidence', input.evidence.map((entry, position) => position === index ? { ...entry, excerpt } : entry))} multiline />
        <TextField label="Observed at (UTC ISO timestamp)" value={evidence.observedAt} onChange={(observedAt) => update('evidence', input.evidence.map((entry, position) => position === index ? { ...entry, observedAt } : entry))} required />
        <TextField label="Expires at (optional UTC ISO timestamp)" value={evidence.expiresAt ?? ''} onChange={(expiresAt) => update('evidence', input.evidence.map((entry, position) => position === index ? { ...entry, expiresAt: expiresAt || null } : entry))} />
        <button type="button" className={buttonStyle} onClick={() => update('evidence', input.evidence.filter((_, position) => position !== index))}>Remove evidence {index + 1}</button>
      </div>)}
      <button type="button" className={buttonStyle} disabled={input.evidence.length >= 100} onClick={() => update('evidence', [...input.evidence, { id: crypto.randomUUID(), source: '', excerpt: '', contentHash: '', observedAt: '', expiresAt: null }])}>Add evidence</button>
    </fieldset>
    <p className="text-sm text-slate-600">Owner and tenant identity are resolved by the server. Saving freezes an immutable revision.</p>
    <div className="flex gap-2"><button type="submit" disabled={busy} className={buttonStyle}>{busy ? 'Saving…' : initialInput ? 'Save new revision' : 'Create decision'}</button>{onCancel && <button type="button" onClick={onCancel} disabled={busy} className={buttonStyle}>Cancel editing</button>}</div>
  </form>;
}
