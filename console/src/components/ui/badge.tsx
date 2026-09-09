import type { EntityStatus } from "../types";

const STATUS_STYLES: Record<EntityStatus, string> = {
  active: "bg-emerald-100 text-emerald-800",
  "draft-only": "bg-amber-100 text-amber-800",
  disabled: "bg-slate-200 text-slate-700",
  error: "bg-red-100 text-red-800",
};

const STATUS_LABEL: Record<EntityStatus, string> = {
  active: "Active",
  "draft-only": "Draft only",
  disabled: "Disabled",
  error: "Error",
};

export function StatusBadge({ status }: { status: EntityStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}
