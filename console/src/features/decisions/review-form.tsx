"use client";
import { useState, type FormEvent } from 'react';
import type { DecisionDetail, DecisionReport, ReviewDisposition, ReviewRequest } from '../../lib/decisions/contracts';
import { TextField, buttonStyle } from './fields';
export function ReviewForm({ detail, report, pending, onSubmit }: { detail: DecisionDetail; report: DecisionReport; pending: boolean; onSubmit: (body: ReviewRequest) => void }) {
  const revision = detail.revisions.find((entry) => entry.revision === report.revision);
  const run = detail.runs.find((entry) => entry.id === report.runId);
  const [selectedOptionId, setSelectedOptionId] = useState(report.winnerOptionId ?? '');
  const [disposition, setDisposition] = useState<ReviewDisposition>('request_changes');
  const [rationale, setRationale] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const current = report.revision === detail.decision.revision;
  const disabled = pending || !detail.capabilities.canReview || !current || !run || run.status !== 'completed';
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (!run || disabled) return; onSubmit({ revision: report.revision, reportHash: report.reportHash, policyVersion: report.policyVersion, selectedOptionId, disposition, rationale, expiresAt: expiresAt || null, expectedVersion: run.version }); }
  return <section className="space-y-3"><h2 className="text-lg font-semibold">Human review</h2><p className="text-sm">Required distinct reviewers: {detail.capabilities.requiredReviewers}. Identity mode: {detail.capabilities.identityMode}.</p>
    {detail.capabilities.identityMode === 'local' && <p className="text-sm text-slate-700">The local operator cannot represent two distinct reviewers. Configured high-risk dual review requires trusted multiuser identity.</p>}
    {!current && <p className="text-sm">Historical report: review is disabled. Select the current revision.</p>}
    {!detail.capabilities.canReview && <p className="text-sm">Your server-resolved identity cannot submit reviews.</p>}
    <form onSubmit={submit}><fieldset disabled={disabled} className="space-y-3"><legend className="sr-only">Review disposition</legend><label className="block text-sm">Selected option<select required value={selectedOptionId} onChange={(event) => setSelectedOptionId(event.target.value)} className="focus-ring ml-2 rounded border border-slate-300 p-2"><option value="">Choose option</option>{revision?.input.options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
      <label className="block text-sm">Disposition<select value={disposition} onChange={(event) => { const value = event.target.value; if (value === 'approve' || value === 'reject' || value === 'request_changes') setDisposition(value); }} className="focus-ring ml-2 rounded border border-slate-300 p-2"><option value="request_changes">Request changes</option><option value="approve">Approve adoption</option><option value="reject">Reject</option></select></label>
      <TextField label="Review rationale" multiline required value={rationale} onChange={setRationale} /><TextField label="Expires at (optional UTC ISO timestamp)" value={expiresAt} onChange={setExpiresAt} /><button type="submit" className={buttonStyle}>{pending ? 'Submitting…' : 'Submit review'}</button>
    </fieldset></form><p className="text-sm text-slate-600">The server validates permission, report binding and concurrent updates. Approval grants no action authorization.</p>
  </section>;
}
