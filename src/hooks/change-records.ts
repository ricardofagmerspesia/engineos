// The active change records of one `.engineos/changes` directory, read the
// same way by every hook that asks (CLAUDE.md #5): route-before-change wants to
// know whether one exists, the judge's repository facts want their text.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// grep -l '^status:[[:space:]]*active' over one change record. The class is the
// horizontal whitespace of a single line: grep matches per line, so the newline
// members of [[:space:]] can never participate.
const ACTIVE_RECORD = /^status:[ \t\f\v\r]*active/m;

// The bash glob was `<dir>/*.md`: direct children only, dotfiles excluded. A
// directory that cannot be read holds no active record, which is the same
// answer the failing grep produced, and an unreadable record is skipped. Lazy,
// in directory order, so a caller that only needs the first one stops reading
// there.
export function* activeChangeRecords(dir: string): Generator<string, void, undefined> {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.endsWith('.md') || entry.startsWith('.')) continue;
    let contents: string;
    try {
      contents = readFileSync(join(dir, entry), 'utf8');
    } catch {
      continue;
    }
    if (ACTIVE_RECORD.test(contents)) yield contents;
  }
}
