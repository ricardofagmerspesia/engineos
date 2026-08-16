import { apiFetch } from "./client";
import type { PublishResult } from "../types";

// The branch-guard/validation failure paths are `ok:false` in a 2xx body,
// not thrown errors — publish() resolves in both cases so the caller can
// render `reason` inline instead of catching an exception for an expected
// outcome.
export function publish(): Promise<PublishResult> {
  return apiFetch<PublishResult>("/api/publish", { method: "POST" });
}
