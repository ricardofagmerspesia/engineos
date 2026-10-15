"use client";
import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { cancelRun, readDecision, reviseDecision, startRun, submitReview, verifyEvidence, DecisionApiError } from './api';
import type { DecisionInput } from '../../lib/decisions/contracts';
import { Banner } from '../../components/ui/banner';
import { SkeletonRows } from '../../components/ui/skeleton';
import { EmptyState } from '../../components/ui/empty-state';
import { buttonStyle } from './fields';
import { DecisionForm } from './decision-form';
import { ReportView } from './report-view';
import { ReviewForm } from './review-form';
import { EvidencePanel } from './evidence-panel';
import { DecisionHistory } from './decision-history';
import { AssessmentComparison } from './assessment-comparison';
export function DecisionDetailView({ decisionId }: { decisionId: string }) {
  const queryClient = useQueryClient();
  const [selectedRevision, setSelectedRevision] = useState<number | null>(null);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const runKey = useRef<{ revision: number; key: string } | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);
  const queryKey = ['decision', decisionId];
  const query = useQuery({ queryKey, queryFn: ({ signal }) => readDecision(decisionId, signal), refetchInterval: (state) => state.state.data?.runs.some((run) => run.status === 'queued' || run.status === 'running') ? 1500 : false });
  async function refresh() { await queryClient.invalidateQueries({ queryKey }); await queryClient.invalidateQueries({ queryKey: ['decisions'] }); }
  function handleError(error: Error) { setOperationError(error instanceof DecisionApiError && error.status === 409 ? `A concurrent update changed this decision. The view is refreshing; review the current report before retrying. ${error.message}` : error.message); void refresh(); }
  const start = useMutation({ mutationFn: (revision: number) => { if (!runKey.current || runKey.current.revision !== revision) runKey.current = { revision, key: crypto.randomUUID() }; return startRun(decisionId, revision, runKey.current.key); }, onSuccess: () => { runKey.current = null; setOperationError(null); void refresh(); }, onError: handleError });
  const cancel = useMutation({ mutationFn: (runId: string) => cancelRun(decisionId, runId), onSuccess: () => { setOperationError(null); void refresh(); }, onError: handleError });
  const revisionMutation = useMutation({ mutationFn: ({ input, expectedRevision }: { input: DecisionInput; expectedRevision: number }) => reviseDecision(decisionId, input, expectedRevision), onSuccess: () => { setEditing(false); setSelectedRevision(null); setSelectedReportId(null); setOperationError(null); void refresh(); }, onError: handleError });
  const review = useMutation({ mutationFn: (body: Parameters<typeof submitReview>[1]) => submitReview(decisionId, body), onSuccess: () => { setOperationError(null); void refresh(); }, onError: handleError });
  const evidence = useMutation({ mutationFn: (body: Parameters<typeof verifyEvidence>[1]) => verifyEvidence(decisionId, body), onSuccess: () => { setOperationError(null); void refresh(); }, onError: handleError });
  if (query.isLoading) return <SkeletonRows rows={6} columns={2} />;
  if (query.isError) return <Banner variant="error" title="Could not load decision">{query.error.message} <button className="focus-ring-danger underline" onClick={() => query.refetch()}>Retry</button></Banner>;
  const detail = query.data;
  if (!detail) return <EmptyState title="Decision unavailable" description="Return to the decisions list." />;
  const revisionNumber = selectedRevision ?? detail.decision.revision;
  const revision = detail.revisions.find((entry) => entry.revision === revisionNumber);
  if (!revision) return <EmptyState title="Revision unavailable" description="Refresh the decision to load its immutable revisions." />;
  const runs = detail.runs.filter((run) => run.revision === revisionNumber);
  const reports = detail.reports.filter((report) => report.revision === revisionNumber);
  const latestReport = [...reports].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const report = reports.find((entry) => entry.id === selectedReportId) ?? latestReport;
  const active = detail.runs.some((run) => run.status === 'queued' || run.status === 'running');
  const busy = start.isPending || cancel.isPending || revisionMutation.isPending || review.isPending || evidence.isPending;
  return <div className="space-y-6"><h1 className="text-xl font-semibold">{detail.decision.question}</h1>
    {operationError && <Banner variant="error" title="The operation was not accepted">{operationError}</Banner>}
    <label className="block text-sm">Immutable revision<select value={revisionNumber} className="focus-ring ml-3 rounded border border-slate-300 p-2" onChange={(event) => { setSelectedRevision(Number(event.target.value)); setSelectedReportId(null); setEditing(false); }}>{detail.revisions.map((entry) => <option key={entry.revision} value={entry.revision}>Revision {entry.revision}{entry.revision === detail.decision.revision ? ' (current)' : ''}</option>)}</select></label>
    <p className="whitespace-pre-wrap text-sm">{revision.input.context}</p><p className="text-sm">Risk {revision.input.riskTier} · {revision.input.reversible ? 'Reversible' : 'Irreversible'} · Identity {detail.capabilities.identityMode}</p>
    <details className="rounded border border-slate-200 p-3"><summary className="focus-ring cursor-pointer">Frozen input, criteria weights and rubrics</summary><pre className="overflow-x-auto whitespace-pre-wrap text-sm">{JSON.stringify(revision.input, null, 2)}</pre></details>
    <div className="flex gap-3"><button className={buttonStyle} disabled={busy || active || revisionNumber !== detail.decision.revision} onClick={() => start.mutate(revisionNumber)}>Start evaluation run</button><button className={buttonStyle} disabled={busy || active || revisionNumber !== detail.decision.revision} onClick={() => setEditing(!editing)}>{editing ? 'Close revision editor' : 'Create new revision'}</button></div>
    {editing && <DecisionForm key={revisionNumber} initialInput={revision.input} pending={revisionMutation.isPending} onCancel={() => setEditing(false)} onSubmit={async (input) => { await revisionMutation.mutateAsync({ input, expectedRevision: detail.decision.revision }); }} />}
    <section className="space-y-3" aria-labelledby="run-heading"><h2 id="run-heading" className="text-lg font-semibold">Run progress</h2>{runs.length === 0 && <p className="text-sm">No runs for this revision.</p>}{runs.map((run) => <article key={run.id} className="space-y-2 rounded border border-slate-200 p-3"><p role="status">{run.status} · Stage {run.stage} · Calls reserved {run.callsReserved}/{run.maxCalls}</p><p className="text-sm">Run {run.id} · Policy {run.policyVersion} · Deadline {run.deadlineAt}</p>{run.error && <Banner variant="warning" title="Run issue">{run.error}</Banner>}{run.evaluations.map((result, index) => <p key={index} className="text-sm">{result.ok ? `${result.metadata.provider}: valid evaluation persisted` : `${result.provider}: ${result.kind} — ${result.message}`}</p>)}{(run.status === 'queued' || run.status === 'running') && <button className={buttonStyle} disabled={busy} onClick={() => cancel.mutate(run.id)}>Cancel this run</button>}{!reports.some((entry) => entry.runId === run.id) && run.evaluations.some((entry) => entry.ok) && <AssessmentComparison input={revision.input} evaluations={run.evaluations.flatMap((entry) => entry.ok ? [entry] : [])} label="Provisional persisted assessments — report pending" />}</article>)}</section>
    {reports.length > 0 && <label className="block text-sm">Report snapshot<select className="focus-ring ml-3 rounded border border-slate-300 p-2" value={report?.id ?? ''} onChange={(event) => setSelectedReportId(event.target.value)}>{reports.map((entry) => <option key={entry.id} value={entry.id}>{entry.createdAt} — {entry.outcome}</option>)}</select></label>}
    {report ? <><ReportView report={report} input={revision.input} /><ReviewForm key={report.id} detail={detail} report={report} pending={review.isPending} onSubmit={(body) => review.mutate(body)} /></> : <EmptyState title="No final report" description="An evaluation run must finish before a report can be reviewed." />}
    <EvidencePanel key={`${revisionNumber}:${report?.id ?? 'none'}`} revision={revision} report={report} checks={detail.evidenceChecks} canVerify={detail.capabilities.canReview && revisionNumber === detail.decision.revision && !active} pending={evidence.isPending} onSubmit={(body) => evidence.mutate(body)} />
    <DecisionHistory detail={detail} />
  </div>;
}
