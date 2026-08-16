import { apiFetch } from "./client";
import type { DiffEntry } from "../types";

export function fetchDiff(): Promise<DiffEntry[]> {
  return apiFetch<DiffEntry[]>("/api/diff");
}
