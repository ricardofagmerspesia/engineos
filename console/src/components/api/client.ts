import type { ValidationIssue } from "../types";

/** Thrown for transport/server failures (non-2xx). Expected in-band failures
 * (branch guard, validation-at-publish) come back as `{ok:false,...}` in a
 * 2xx body per the frozen contract and are NOT exceptions — callers check
 * `.ok` on the parsed result instead. */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly issues?: ValidationIssue[],
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiFetch<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const body = await response
      .json()
      .catch(() => undefined as { reason?: string; errors?: ValidationIssue[] } | undefined);
    const message = body?.reason ?? body?.errors?.[0]?.message ?? `Request failed (${response.status})`;
    throw new ApiError(message, response.status, body?.errors);
  }

  return (await response.json()) as T;
}
