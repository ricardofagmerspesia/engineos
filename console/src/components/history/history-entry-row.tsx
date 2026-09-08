"use client";

import { useState } from "react";
import type { HistoryEntry } from "../types";
import { ChevronRightIcon } from "../ui/icon";
import { FieldDiffTable, FileDiffBlock } from "../ui/diff-view";

// GET /api/history serializes `PublishHistoryRecord.diff` as-is (see
// console/src/lib/store/client.ts) — already a parsed JSON value, not a
// string to re-parse. The publish route currently records only
// `{entityId, kind}` pairs there (no fieldDiff/fileDiff yet), so both are
// read defensively and rendered as "no data" rather than assumed present.
type DiffPayloadEntry = {
  entityId?: string;
  kind?: string;
  fieldDiff?: Record<string, unknown>;
  fileDiff?: string;
};

function asDiffPayloadEntries(diff: unknown): DiffPayloadEntry[] {
  if (Array.isArray(diff)) return diff as DiffPayloadEntry[];
  if (diff && typeof diff === "object") return [diff as DiffPayloadEntry];
  return [];
}

type HistoryEntryRowProps = {
  entry: HistoryEntry;
  onRollback: (historyId: number) => void;
};

export function HistoryEntryRow({ entry, onRollback }: HistoryEntryRowProps) {
  const [expanded, setExpanded] = useState(false);
  const payloadEntries = asDiffPayloadEntries(entry.diff);
  const createdAt = new Date(entry.createdAt);
  const createdAtLabel = Number.isNaN(createdAt.getTime()) ? entry.createdAt : createdAt.toLocaleString();

  return (
    <li className="rounded-md border border-slate-200">
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          className="focus-ring-inset flex flex-1 items-center gap-2 text-left"
        >
          <ChevronRightIcon className={`h-4 w-4 shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`} />
          <span>
            <span className="font-mono text-sm font-medium text-slate-900">{entry.commitSha.slice(0, 7)}</span>
            <span className="ml-2 text-xs text-slate-500">{createdAtLabel}</span>
            <span className="block text-sm text-slate-700">{entry.summary}</span>
          </span>
        </button>
        <button
          type="button"
          onClick={() => onRollback(entry.id)}
          className="focus-ring shrink-0 rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          Rollback to here
        </button>
      </div>
      {expanded ? (
        <div className="space-y-3 border-t border-slate-200 px-3 py-3">
          {payloadEntries.length === 0 ? (
            <p className="text-sm text-slate-500">No diff payload recorded for this publish.</p>
          ) : (
            payloadEntries.map((item, index) => (
              <div key={item.entityId ?? index} className="space-y-2">
                {item.entityId ? (
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {item.entityId}
                    {item.kind ? <span className="ml-1 normal-case text-slate-400">({item.kind})</span> : null}
                  </p>
                ) : null}
                <FieldDiffTable fieldDiff={item.fieldDiff ?? {}} />
                <FileDiffBlock fileDiff={item.fileDiff ?? ""} />
              </div>
            ))
          )}
        </div>
      ) : null}
    </li>
  );
}
