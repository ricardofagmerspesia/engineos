// Epoch-millisecond helpers, ported from hooks/lib-common.sh `hook_now_ms`,
// `hook_plausible_ms` and the duration clamp that appeared three times there.
//
// bash needed a four-rung ladder (EPOCHREALTIME, GNU date, perl Time::HiRes,
// whole seconds x1000) because /bin/bash 3.2 and BSD date cannot produce
// sub-second time. Node's clock is epoch milliseconds already, so the ladder
// collapses to one rung and only the PLAUSIBILITY bar it existed to enforce
// survives — applied now to values read back off disk instead of to rungs.

// Epoch milliseconds have had 13 digits since 2001 and will until 2286, so a
// 10-digit all-digit value is SECONDS wearing an `ms` label: a silent 1000x
// error that a digits-only test waves through.
export const MS_DIGITS_MIN = 12;

export function nowMs(): number {
  return Date.now();
}

// The port of hook_plausible_ms: all digits, and long enough to be milliseconds
// rather than seconds.
export function plausibleMs(value: string): boolean {
  if (!/^[0-9]+$/.test(value)) return false;
  return value.length >= MS_DIGITS_MIN;
}

// A persisted instant (a span's start marker) read back as a number, or null
// when the text is not plausible epoch milliseconds. bash accepted any digit
// string here and would have turned a marker of "5" into a ~54-year duration;
// holding the read to the same bar the rungs were held to keeps an implausible
// value from winning rather than falling through.
export function parseMs(text: string): number | null {
  const trimmed = text.trim();
  if (!plausibleMs(trimmed)) return null;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

// The clamp bash spelled `[ "$dur" -ge 0 ] || dur=0`, guarding a clock that
// moved backwards (an NTP step, DST on a non-UTC clock). Non-finite and
// fractional values land on the same floor, because the journal's duration_ms
// column is a non-negative integer and a rejected span is a lost one.
export function clampMs(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const floored = Math.floor(value);
  return floored > 0 ? floored : 0;
}
