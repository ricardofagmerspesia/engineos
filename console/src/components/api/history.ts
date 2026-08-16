import { apiFetch } from "./client";
import type { HistoryEntry, RollbackResult } from "../types";

export function fetchHistory(): Promise<HistoryEntry[]> {
  return apiFetch<HistoryEntry[]>("/api/history");
}

// historyId is the store's numeric autoincrement id (see HistoryEntry.id) —
// the route parses it back with Number.parseInt, so a plain template
// interpolation is fine, no URI-component escaping needed for a number.
export function rollback(historyId: number): Promise<RollbackResult> {
  return apiFetch<RollbackResult>(`/api/rollback/${historyId}`, {
    method: "POST",
  });
}
