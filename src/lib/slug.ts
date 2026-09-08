// The two character classes a hook narrows a harness-supplied value to, ported
// from hooks/lib-common.sh `hook_slug` and `hook_path_slug`.
//
// Both operate on UTF-8 BYTES, not code points, because `tr -c` did: a value of
// "café" became "caf--" in bash (two bytes for é) and would become "caf-" under
// a code-point port. During the migration window a span marker can be opened by
// the bash hook and closed by the TypeScript one, and the marker is named by the
// slug — so a one-character disagreement is a lost span. Byte fidelity is the
// contract, not an implementation detail.
//
// Neither function bounds length. The 256-character cap lives on the journal's
// append boundary (registries/policy.json telemetry.exec_journal.max_value_length),
// where a rejection is visible, rather than here, where a truncation would be silent.

// registries/policy.json telemetry.value_pattern: ^[A-Za-z0-9@_./:-]+$
const SLUG_EXTRA = '@_./:-';
// The path class drops '.' and '/' so a value can never escape its directory or
// name a dotted parent. A `case */*|*..*` guard would only block the shapes
// someone thought of; narrowing by class blocks every shape.
const PATH_EXTRA = '@_:-';

export function hookSlug(value: string): string {
  return mapBytes(value, SLUG_EXTRA);
}

// null when nothing survives the narrowing — the caller's cue to skip the write
// rather than fall back to a name it did not choose. bash returned non-zero.
export function hookPathSlug(value: string): string | null {
  const narrowed = mapBytes(value, PATH_EXTRA);
  return narrowed === '' ? null : narrowed;
}

function mapBytes(value: string, extra: string): string {
  const bytes = Buffer.from(value, 'utf8');
  let out = '';
  for (const byte of bytes) out += inClass(byte, extra) ? String.fromCharCode(byte) : '-';
  return out;
}

function inClass(byte: number, extra: string): boolean {
  // 0-9, A-Z, a-z, then the class's punctuation.
  if (byte >= 0x30 && byte <= 0x39) return true;
  if (byte >= 0x41 && byte <= 0x5a) return true;
  if (byte >= 0x61 && byte <= 0x7a) return true;
  return extra.includes(String.fromCharCode(byte));
}
