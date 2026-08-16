"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchHistory, rollback } from "../../components/api/history";
import { Banner } from "../../components/ui/banner";
import { EmptyState } from "../../components/ui/empty-state";
import { SkeletonRows } from "../../components/ui/skeleton";
import { ConfirmDialog } from "../../components/ui/confirm-dialog";
import { HistoryEntryRow } from "../../components/history/history-entry-row";

export function HistoryPageClient() {
  const queryClient = useQueryClient();
  const historyQuery = useQuery({ queryKey: ["history"], queryFn: fetchHistory });
  const [pendingRollbackId, setPendingRollbackId] = useState<number | null>(null);

  const rollbackMutation = useMutation({
    mutationFn: rollback,
    onSuccess: (result) => {
      if (result.ok) {
        // A successful rollback commits a revert and refreshes the
        // published snapshot, which the skills list and diff both read.
        queryClient.invalidateQueries({ queryKey: ["history"] });
        queryClient.invalidateQueries({ queryKey: ["diff"] });
        queryClient.invalidateQueries({ queryKey: ["skills"] });
      }
      setPendingRollbackId(null);
    },
    onError: () => setPendingRollbackId(null),
  });

  const entries = useMemo(() => {
    const data = historyQuery.data ?? [];
    // Reverse-chronological is this screen's contract regardless of what
    // order the API happens to return rows in.
    return [...data].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [historyQuery.data]);

  if (historyQuery.isLoading) {
    return <SkeletonRows rows={4} columns={1} />;
  }

  if (historyQuery.isError) {
    return (
      <Banner variant="error" title="Could not load publish history">
        {historyQuery.error instanceof Error ? historyQuery.error.message : "Unknown error."}
        <button
          type="button"
          onClick={() => historyQuery.refetch()}
          className="ml-2 underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
        >
          Retry
        </button>
      </Banner>
    );
  }

  if (entries.length === 0) {
    return <EmptyState title="No publishes yet" description="Publish a draft from /publish to see it here." />;
  }

  const pendingEntry = entries.find((entry) => entry.id === pendingRollbackId) ?? null;
  const rollbackResult = rollbackMutation.data;

  return (
    <div className="space-y-4">
      {rollbackResult && !rollbackResult.ok ? (
        <Banner variant="error" title={rollbackResult.reason ?? "Rollback failed"} />
      ) : null}
      {rollbackResult && rollbackResult.ok ? (
        <Banner variant="success" title={`Reverted via ${rollbackResult.revertSha?.slice(0, 7) ?? "new commit"}`} />
      ) : null}
      {rollbackMutation.isError ? (
        <Banner variant="error" title="Rollback request failed">
          {rollbackMutation.error instanceof Error ? rollbackMutation.error.message : "Unknown error."}
        </Banner>
      ) : null}

      <ul className="space-y-2">
        {entries.map((entry) => (
          <HistoryEntryRow key={entry.id} entry={entry} onRollback={setPendingRollbackId} />
        ))}
      </ul>

      <ConfirmDialog
        open={pendingEntry !== null}
        title="Rollback to this publish?"
        description={
          <>
            This reverts the commit <span className="font-mono">{pendingEntry?.commitSha.slice(0, 7)}</span> ({" "}
            {pendingEntry?.summary}) via <span className="font-mono">git revert</span>. It creates a new commit; it
            does not rewrite history.
          </>
        }
        confirmLabel="Rollback"
        pending={rollbackMutation.isPending}
        onCancel={() => setPendingRollbackId(null)}
        onConfirm={() => {
          if (pendingEntry) rollbackMutation.mutate(pendingEntry.id);
        }}
      />
    </div>
  );
}
