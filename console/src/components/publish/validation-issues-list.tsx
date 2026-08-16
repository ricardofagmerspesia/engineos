import type { ValidationIssue } from "../types";
import { ErrorIcon, WarningIcon } from "../ui/icon";

/** Errors and warnings are visually distinct AND separately labeled — the
 * task brief calls out "never color alone" for the error styling
 * specifically. */
export function ValidationIssuesList({ issues }: { issues: ValidationIssue[] }) {
  if (issues.length === 0) return null;

  return (
    <ul className="mt-2 space-y-1">
      {issues.map((issue, index) => {
        const isError = issue.level === "error";
        return (
          <li
            key={`${issue.entityId}-${index}`}
            className={`flex items-start gap-2 rounded px-2 py-1 text-sm ${
              isError ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-800"
            }`}
          >
            {isError ? (
              <ErrorIcon className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
            ) : (
              <WarningIcon className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            )}
            <span>
              <span className="font-medium">{isError ? "Error: " : "Warning: "}</span>
              {issue.message}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
