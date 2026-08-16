"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchDiff } from "../../components/api/diff";
import { publish } from "../../components/api/publish";
import { getValidationIssues } from "../../components/types";
import { Banner } from "../../components/ui/banner";
import { EmptyState } from "../../components/ui/empty-state";
import { SkeletonRows } from "../../components/ui/skeleton";
import { DiffEntryRow } from "../../components/publish/diff-entry-row";

export function PublishPageClient() {
  const queryClient = useQueryClient();
  const diffQuery = useQuery({ queryKey: ["diff"], queryFn: fetchDiff });

  const publishMutation = useMutation({
    mutationFn: publish,
    onSuccess: (result) => {
      if (result.ok) {
        // Publish rewrote the real files and the snapshot the diff is
        // computed against, and it appended a history row.
        queryClient.invalidateQueries({ queryKey: ["diff"] });
        queryClient.invalidateQueries({ queryKey: ["history"] });
        queryClient.invalidateQueries({ queryKey: ["skills"] });
      }
    },
  });

  // Loading
  if (diffQuery.isLoading) {
    return <SkeletonRows rows={3} columns={1} />;
  }

  // Error
  if (diffQuery.isError) {
    return (
      <Banner variant="error" title="Could not load pending changes">
        {diffQuery.error instanceof Error ? diffQuery.error.message : "Unknown error."}
        <button
          type="button"
          onClick={() => diffQuery.refetch()}
          className="ml-2 underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
        >
          Retry
        </button>
      </Banner>
    );
  }

  const diffs = diffQuery.data ?? [];

  // Empty
  if (diffs.length === 0) {
    return <EmptyState title="Nothing to publish" description="Every entity matches the last published snapshot." />;
  }

  // Success (has data)
  const hasBlockingError = diffs.some((entry) => getValidationIssues(entry).some((issue) => issue.level === "error"));
  const result = publishMutation.data;

  return (
    <div className="space-y-4">
      {result && !result.ok ? (
        <Banner variant="error" title={result.reason ?? "Publish failed"}>
          {result.errors && result.errors.length > 0 ? (
            <ul className="mt-1 list-inside list-disc">
              {result.errors.map((issue, index) => (
                <li key={index}>{issue.message}</li>
              ))}
            </ul>
          ) : null}
        </Banner>
      ) : null}
      {result && result.ok ? (
        <Banner variant="success" title={`Published ${result.commitSha?.slice(0, 7) ?? ""}`}>
          {result.summary}
        </Banner>
      ) : null}
      {publishMutation.isError ? (
        <Banner variant="error" title="Publish request failed">
          {publishMutation.error instanceof Error ? publishMutation.error.message : "Unknown error."}
        </Banner>
      ) : null}

      <ul className="space-y-2">
        {diffs.map((entry) => (
          <DiffEntryRow key={entry.entityId} entry={entry} />
        ))}
      </ul>

      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={hasBlockingError || publishMutation.isPending}
          onClick={() => publishMutation.mutate()}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {publishMutation.isPending ? "Publishing…" : "Publish"}
        </button>
        {hasBlockingError ? (
          <span className="text-sm text-red-700">Resolve every error before publishing.</span>
        ) : null}
      </div>
    </div>
  );
}
