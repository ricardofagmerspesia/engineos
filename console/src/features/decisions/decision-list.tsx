"use client";
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listDecisions } from './api';
import { Banner } from '../../components/ui/banner';
import { EmptyState } from '../../components/ui/empty-state';
import { SkeletonRows } from '../../components/ui/skeleton';
import { buttonStyle } from './fields';
export function DecisionListView() {
  const [offset, setOffset] = useState(0);
  const query = useQuery({ queryKey: ['decisions', { offset }], queryFn: ({ signal }) => listDecisions(offset, signal) });
  return <div className="space-y-4"><a className={buttonStyle} href="/decisions/new">Create decision</a>
    {query.isLoading && <SkeletonRows rows={4} columns={2} />}
    {query.isError && <Banner variant="error" title="Could not load decisions">{query.error.message} <button className="focus-ring-danger underline" onClick={() => query.refetch()}>Retry</button></Banner>}
    {query.data && query.data.items.length === 0 && <EmptyState title="No decisions on this page" description="Create a decision with at least two candidate options." />}
    {query.data && <><ul className="space-y-3">{query.data.items.map((decision) => <li key={decision.id} className="rounded border border-slate-200 p-4"><a className="focus-ring font-medium underline" href={`/decisions/${encodeURIComponent(decision.id)}`}>{decision.question}</a><p className="text-sm text-slate-600">Revision {decision.revision} · Created {decision.createdAt}</p></li>)}</ul><div className="flex items-center gap-3"><button className={buttonStyle} disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 20))}>Previous</button><span className="text-sm">{query.data.total} decisions</span><button className={buttonStyle} disabled={offset + query.data.limit >= query.data.total} onClick={() => setOffset(offset + 20)}>Next</button></div></>}
  </div>;
}
