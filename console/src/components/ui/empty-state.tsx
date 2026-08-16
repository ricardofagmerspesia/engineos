type EmptyStateProps = {
  title: string;
  description?: string;
};

/** A designed empty state, not a blank div (rules/frontend.md). Callers pass
 * different copy for "genuinely zero records" vs. "zero after filtering" —
 * see skills-page-client.tsx for that distinction. */
export function EmptyState({ title, description }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-md border border-dashed border-slate-300 p-8 text-center">
      <p className="font-medium text-slate-700">{title}</p>
      {description ? <p className="text-sm text-slate-500">{description}</p> : null}
    </div>
  );
}
