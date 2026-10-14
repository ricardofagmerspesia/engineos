"use client";
import { useState, type FormEvent } from 'react';
import { z } from 'zod';
import { evidenceVerificationRequestSchema, type DecisionRevision, type EvidenceVerification, type DecisionReport } from '../../lib/decisions/contracts';
import { TextField, buttonStyle } from './fields';
type Request = z.infer<typeof evidenceVerificationRequestSchema>;
export function EvidencePanel({ revision, report, checks, canVerify, pending, onSubmit }: { revision: DecisionRevision; report?: DecisionReport; checks: EvidenceVerification[]; canVerify: boolean; pending: boolean; onSubmit: (body: Request) => void }) {
  const [evidenceId, setEvidenceId] = useState('');
  const [optionId, setOptionId] = useState('');
  const [targetType, setTargetType] = useState<Request['targetType']>('criterion');
  const [targetId, setTargetId] = useState('');
  const [disposition, setDisposition] = useState<Request['disposition']>('unverified');
  const [rationale, setRationale] = useState('');
  const claims = report?.evaluations.flatMap((result) => result.evaluation.materialClaims.filter((claim) => claim.optionId === optionId)) ?? [];
  const targets = targetType === 'criterion' ? revision.input.criteria.map((entry) => ({ id: entry.id, label: entry.label })) : targetType === 'constraint' ? revision.input.constraints.map((entry) => ({ id: entry.id, label: entry.description })) : Array.from(new Map(claims.map((entry) => [entry.id, { id: entry.id, label: entry.claim }])).values());
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); onSubmit({ revision: revision.revision, evidenceId, optionId, targetType, targetId, disposition, rationale }); }
  return <section className="space-y-3"><h2 className="text-lg font-semibold">Evidence and verification</h2>
    {revision.input.evidence.length === 0 && <p className="text-sm">No evidence supplied. Factual support is unresolved.</p>}
    {revision.input.evidence.map((evidence) => <details key={evidence.id} className="rounded border border-slate-200 p-3"><summary className="focus-ring cursor-pointer">{evidence.id} — {evidence.source}</summary><p className="whitespace-pre-wrap text-sm">{evidence.excerpt}</p><p className="break-all text-sm">SHA-256: {evidence.contentHash}</p><p className="text-sm">Observed: {evidence.observedAt} · Expires: {evidence.expiresAt ?? 'No expiry supplied'}</p><ul className="list-inside list-disc text-sm">{checks.filter((check) => check.evidenceId === evidence.id && check.revision === revision.revision).map((check) => <li key={check.id}>{check.optionId}/{check.targetType}/{check.targetId}: {check.disposition} — {check.rationale} · {check.reviewerId} · {check.createdAt}</li>)}</ul><p className="text-sm text-slate-600">A matching evidence ID and content hash do not establish factual support.</p></details>)}
    <form onSubmit={submit}><fieldset disabled={!canVerify || pending || revision.input.evidence.length === 0} className="space-y-3"><legend className="font-medium">Record a scoped evidence check</legend>
      <label className="block text-sm">Evidence<select required className="focus-ring ml-2 rounded border border-slate-300 p-2" value={evidenceId} onChange={(event) => setEvidenceId(event.target.value)}><option value="">Choose evidence</option>{revision.input.evidence.map((entry) => <option key={entry.id} value={entry.id}>{entry.id}</option>)}</select></label>
      <label className="block text-sm">Option<select required className="focus-ring ml-2 rounded border border-slate-300 p-2" value={optionId} onChange={(event) => { setOptionId(event.target.value); setTargetId(''); }}><option value="">Choose option</option>{revision.input.options.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}</select></label>
      <label className="block text-sm">Target type<select className="focus-ring ml-2 rounded border border-slate-300 p-2" value={targetType} onChange={(event) => { const value = event.target.value; if (value === 'criterion' || value === 'constraint' || value === 'claim') { setTargetType(value); setTargetId(''); } }}><option value="criterion">Criterion</option><option value="constraint">Hard constraint</option><option value="claim">Material claim</option></select></label>
      <label className="block text-sm">Target<select required className="focus-ring ml-2 rounded border border-slate-300 p-2" value={targetId} onChange={(event) => setTargetId(event.target.value)}><option value="">Choose target</option>{targets.map((entry) => <option key={entry.id} value={entry.id}>{entry.id}: {entry.label}</option>)}</select></label>
      <label className="block text-sm">Disposition<select className="focus-ring ml-2 rounded border border-slate-300 p-2" value={disposition} onChange={(event) => { const value = event.target.value; if (value === 'supported' || value === 'contradicted' || value === 'unverified') setDisposition(value); }}><option value="unverified">Unverified</option><option value="supported">Supported</option><option value="contradicted">Contradicted</option></select></label>
      <TextField label="Verification rationale" multiline required value={rationale} onChange={setRationale} /><button className={buttonStyle} type="submit">{pending ? 'Recording…' : 'Record evidence check'}</button>
    </fieldset></form><p className="text-sm text-slate-600">Checks do not mutate an existing report. Start a new run to incorporate current checks. New evidence requires a new revision.</p>
  </section>;
}
