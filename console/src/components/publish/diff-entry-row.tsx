"use client";

import { useState } from "react";
import { getValidationIssues, type DiffEntry } from "../types";
import { ChevronRightIcon } from "../ui/icon";
import { FieldDiffTable, FileDiffBlock } from "../ui/diff-view";
import { ValidationIssuesList } from "./validation-issues-list";

export function DiffEntryRow({ entry }: { entry: DiffEntry }) {
  const [expanded, setExpanded] = useState(false);
  const issues = getValidationIssues(entry);
  const errorCount = issues.filter((issue) => issue.level === "error").length;
  const warnCount = issues.filter((issue) => issue.level === "warn").length;

  return (
    <li className="rounded-md border border-slate-200">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-2 px-3 py-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-slate-500"
      >
        <ChevronRightIcon className={`h-4 w-4 shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`} />
        <span className="flex-1">
          <span className="font-medium text-slate-900">{entry.entityId}</span>
          <span className="ml-2 text-xs uppercase tracking-wide text-slate-500">{entry.kind}</span>
        </span>
        {errorCount > 0 ? (
          <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
            {errorCount} error{errorCount === 1 ? "" : "s"}
          </span>
        ) : null}
        {warnCount > 0 ? (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
            {warnCount} warning{warnCount === 1 ? "" : "s"}
          </span>
        ) : null}
      </button>
      {expanded ? (
        <div className="space-y-3 border-t border-slate-200 px-3 py-3">
          <ValidationIssuesList issues={issues} />
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Field changes</h4>
            <div className="mt-1">
              <FieldDiffTable fieldDiff={entry.fieldDiff} />
            </div>
          </div>
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">File changes</h4>
            <div className="mt-1">
              <FileDiffBlock fileDiff={entry.fileDiff} />
            </div>
          </div>
        </div>
      ) : null}
    </li>
  );
}
