function isBeforeAfterShape(value: unknown): value is { before: unknown; after: unknown } {
  return typeof value === "object" && value !== null && "before" in value && "after" in value;
}

function formatValue(value: unknown): string {
  if (value === undefined) return "(unset)";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

/** Renders a field-level diff object. The contract only guarantees
 * `fieldDiff: object` — most fields are expected to carry `{before, after}`,
 * but a bare changed-value is rendered too instead of throwing, since the
 * real shape only firms up once Unit C's writer is wired in. */
export function FieldDiffTable({ fieldDiff }: { fieldDiff: Record<string, unknown> }) {
  const entries = Object.entries(fieldDiff);
  if (entries.length === 0) {
    return <p className="text-sm text-slate-500">No field-level changes.</p>;
  }

  return (
    <table className="w-full text-left text-sm">
      <thead>
        <tr className="text-slate-500">
          <th scope="col" className="w-1/4 py-1 pr-2 font-medium">
            Field
          </th>
          <th scope="col" className="w-3/8 py-1 pr-2 font-medium">
            Before
          </th>
          <th scope="col" className="w-3/8 py-1 font-medium">
            After
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {entries.map(([field, value]) => {
          const beforeAfter = isBeforeAfterShape(value) ? value : { before: undefined, after: value };
          return (
            <tr key={field}>
              <td className="py-1 pr-2 font-mono text-xs text-slate-600">{field}</td>
              <td className="py-1 pr-2 font-mono text-xs text-red-700 line-through decoration-red-400">
                {formatValue(beforeAfter.before)}
              </td>
              <td className="py-1 font-mono text-xs text-emerald-700">{formatValue(beforeAfter.after)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** Renders a unified-diff string verbatim in monospace. +/- prefixes carry
 * the add/remove meaning textually, so color is a reinforcement, not the
 * only signal. */
export function FileDiffBlock({ fileDiff }: { fileDiff: string }) {
  if (!fileDiff.trim()) {
    return <p className="text-sm text-slate-500">No file-level changes.</p>;
  }

  return (
    <pre className="max-h-96 overflow-auto rounded-md bg-slate-950 p-3 font-mono text-xs leading-5 text-slate-100">
      {fileDiff.split("\n").map((line, index) => {
        let className = "text-slate-300";
        if (line.startsWith("+") && !line.startsWith("+++")) className = "text-emerald-400";
        else if (line.startsWith("-") && !line.startsWith("---")) className = "text-red-400";
        else if (line.startsWith("@@")) className = "text-sky-400";
        return (
          <div key={index} className={className}>
            {line || " "}
          </div>
        );
      })}
    </pre>
  );
}
