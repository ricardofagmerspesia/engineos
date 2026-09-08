// The C21c archive walk: every checked-era record under `.engineos/archived/`
// is a well-formed done claim whose spec link resolves.
//
// This is not a mirror. A mirror asserts that a document names what a registry
// declares; this asserts that ~85 instances each satisfy a schema the registry
// carries, with a date cutoff and two escape hatches. It stays code, as plan
// Task 39 says.
//
// The `finding('C21c', ...)` calls compile against the CheckCodes augmentation
// declared in ./contracts, which is program-wide — this file holds the walk,
// that one holds the check and the code list.
import { readdirSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { finding, type Finding } from './findings';
import type { CheckContext } from './lib';
import { ISO_DATE, firstField, hasHeading, intentRow, recordAt, stringAt, stringsAt } from './contracts-intents';

const ARCHIVE_DIR = '.engineos/archived';

export interface ArchiveContract {
  readonly grandfatheredBefore: string;
  readonly instanceSectionsSince: string;
  readonly specPathPrefix: string;
  // undefined when the registry's pattern is absent or is not a valid regex.
  // The bash's `grep -qE` exited 2 there, which made the `elif` false and sent
  // every record down the prefix branch; treating it as "matches nothing" is
  // the same answer.
  readonly specExemptPattern: RegExp | undefined;
  readonly domains: ReadonlySet<string>;
  readonly instanceSections: readonly string[];
  readonly sinceSections: readonly string[];
}

// Two bash `ok`/`bad` lines came out of one walk, so the walk returns two
// buckets rather than being run twice.
export interface ArchiveAudit {
  readonly wellFormed: Finding[];
  readonly specLinks: Finding[];
}

// The registry side of the walk, read once per run. C21 checks these same
// fields for well-formedness; C21c only needs their values.
export function archiveContract(ctx: CheckContext): ArchiveContract {
  const contract = recordAt(intentRow(ctx, 'record-change'), 'archive_contract');
  const since = recordAt(contract, 'instance_sections_since');
  return {
    grandfatheredBefore: stringAt(contract, 'grandfathered_before'),
    instanceSectionsSince: stringAt(since, 'date'),
    specPathPrefix: stringAt(contract, 'spec_path_prefix'),
    specExemptPattern: compilePattern(stringAt(contract, 'spec_exempt_pattern')),
    domains: new Set(stringsAt(contract, 'domains')),
    instanceSections: stringsAt(contract, 'instance_sections'),
    sinceSections: stringsAt(since, 'sections'),
  };
}

// The bash asked grep whether the pattern compiled; this asks the regex engine.
// The dialects differ (POSIX ERE there, JS here), so a pattern valid in one and
// not the other would be judged differently — no such pattern is in the
// registry, and the family test pins the invalid case the suite already had.
export function compilePattern(source: string): RegExp | undefined {
  if (source === '') return undefined;
  try {
    return new RegExp(source);
  } catch {
    return undefined;
  }
}

export function auditArchive(ctx: CheckContext, contract: ArchiveContract): ArchiveAudit {
  const wellFormed: Finding[] = [];
  const specLinks: Finding[] = [];
  for (const record of archivedRecords(ctx.root)) {
    const text = ctx.readText(record) ?? '';
    const completed = firstField(text, 'completed');
    const name = firstField(text, 'name');
    // A record with no `completed:` is dated from its filename, so losing the
    // field cannot smuggle it past the cutoff into the unchecked era.
    const gate = completed !== '' ? completed : name.slice(0, DATE_LENGTH);
    if (gate < contract.grandfatheredBefore) continue;
    const base = basename(record, '.md');
    auditRecord({ record, base, text, completed, name, contract }, wellFormed);
    auditSpecLink({ ctx, base, text, contract }, specLinks);
  }
  return { wellFormed, specLinks };
}

// ------------------------------------------------------------------ internals

const DATE_LENGTH = 10;

interface RecordUnderTest {
  readonly record: string;
  readonly base: string;
  readonly text: string;
  readonly completed: string;
  readonly name: string;
  readonly contract: ArchiveContract;
}

function auditRecord(subject: RecordUnderTest, into: Finding[]): void {
  const { record, base, text, completed, name, contract } = subject;
  const status = firstField(text, 'status');
  const domain = firstField(text, 'domain');
  if (status !== 'done') into.push(finding('C21c', 'status-not-done', `${base}:${status}`));
  if (!ISO_DATE.test(completed)) into.push(finding('C21c', 'completed-missing-or-malformed', base));
  if (name !== base) into.push(finding('C21c', 'name-drifts-from-filename', base));
  if (!contract.domains.has(domain)) into.push(finding('C21c', 'domain-not-in-enum', `${base}:${domain}`));
  // The layout is derived from the record's own front matter, so a record that
  // is internally consistent but filed elsewhere is caught by the same read.
  const want = `${ARCHIVE_DIR}/${completed.slice(0, 4)}/${completed.slice(5, 7)}/${domain}/${base}.md`;
  if (record !== want) into.push(finding('C21c', 'filed-at-wrong-path', base));
  if (hasOpenChecklistItem(text)) into.push(finding('C21c', 'unresolved-checklist-item', base));
  for (const section of contract.instanceSections) {
    if (!hasHeading(text, section)) into.push(finding('C21c', 'missing-section', `${base}:${section}`));
  }
  // The P6 cutoff: the three evidence sections became required on a date, and
  // records completed before it legitimately lack them.
  if (!(completed < contract.instanceSectionsSince)) {
    for (const section of contract.sinceSections) {
      if (!hasHeading(text, section)) into.push(finding('C21c', 'missing-section', `${base}:${section}`));
    }
  }
}

function auditSpecLink(
  subject: { ctx: CheckContext; base: string; text: string; contract: ArchiveContract },
  into: Finding[],
): void {
  const { ctx, base, text, contract } = subject;
  const spec = firstField(text, 'spec');
  if (spec === '') {
    into.push(finding('C21c', 'spec-field-missing-or-empty', base));
    return;
  }
  // The explicit, reasoned exemption ("n/a — <reason>"): a bare "n/a" carries
  // no reason and is not one.
  if (contract.specExemptPattern?.test(spec) === true) return;
  if (!spec.startsWith(contract.specPathPrefix)) {
    into.push(finding('C21c', 'spec-not-under-prefix', `${base}:${spec}`));
    return;
  }
  if (!isNonEmptyFile(join(ctx.root, spec))) {
    into.push(finding('C21c', 'spec-file-missing-or-empty', `${base}:${spec}`));
  }
}

// `find .engineos/archived -name '*.md' ! -name README.md | sort`.
function archivedRecords(root: string): string[] {
  const found: string[] = [];
  walk(join(root, ARCHIVE_DIR), ARCHIVE_DIR, found);
  return found.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

function walk(absolute: string, relative: string, into: string[]): void {
  let names: string[];
  try {
    names = readdirSync(absolute);
  } catch {
    return;
  }
  for (const name of names) {
    const child = join(absolute, name);
    if (isDirectory(child)) walk(child, `${relative}/${name}`, into);
    else if (name.endsWith('.md') && name !== 'README.md') into.push(`${relative}/${name}`);
  }
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

// `[ -s "$spec" ]`: present AND not empty. An empty file is a dangling link
// that happens to exist.
function isNonEmptyFile(path: string): boolean {
  try {
    return statSync(path).size > 0;
  } catch {
    return false;
  }
}

// `grep -q '^- \[ \]'`: an unticked checklist box in a record claiming done.
function hasOpenChecklistItem(text: string): boolean {
  return text.split('\n').some((line) => line.startsWith('- [ ]'));
}
