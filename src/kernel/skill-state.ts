import { closeSync, fstatSync, openSync, readSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Skill enablement: the port of the bash kernel's `skill_state_json` and
// `cmd_skill_state`.
//
// `enabled: false` in skills/<id>/SKILL.md frontmatter is the console's disable
// switch, and before the kernel read it nothing outside the console did: a skill
// disabled in the UI was still handed to the model by every routing answer. A
// control that changes a file and nothing else is not a control.
//
// What this makes true: the kernel stops RECOMMENDING a disabled skill, and says
// so in `skills_suppressed` rather than dropping it silently — a suppressed
// recommendation has to be visible, or an operator cannot tell an empty list
// from an enforced one.
//
// What it does NOT make true, and must not be advertised as: EngineOS cannot
// stop a person from invoking a disabled skill by name, because the Skill tool
// reads the directory and no hook sits between. See docs/COMPATIBILITY.md,
// "What `enabled: false` does and does not do".

// The reading of one skill's frontmatter. `unreadable` is the answer for the far
// side of the bounded read below: the deciding line lies past HEAD_BYTES, so the
// kernel does not have the fact and refuses to invent it (frontmatterReading).
export type SkillReading = 'enabled' | 'disabled' | 'unreadable';

// id -> reading. An id the tree does not carry is simply absent, which is not
// the same fact as `disabled` (see isSkillEnabled).
export type SkillState = ReadonlyMap<string, SkillReading>;

export interface SkillRow {
  id: string;
  enabled: boolean;
}

// cmd_skill_state's two answer shapes, in its key order. `unreadable` is sparse
// — present only when some skill is in that state — because the bash kernel had
// no such key and every answer over a tree without one must stay byte-identical
// to it.
export interface SkillStateSection {
  skills: SkillRow[];
  disabled: string[];
  unreadable?: string[];
}

export interface SkillLookupSection {
  id: string;
  exists: boolean;
  enabled: boolean;
  unreadable?: true;
}

// The verdict for one declared skill that was withheld. `reason` was a closed
// vocabulary of one, and it existed so a second cause could be named later
// without changing the shape callers already parse. `unreadable` is that cause.
export interface SuppressedSkill {
  id: string;
  reason: 'disabled' | 'unreadable';
}

// SKILL.md is operator-authored content the kernel does not control, so the read
// is bounded: only the head of a file can hold its FIRST frontmatter block, and
// a multi-megabyte SKILL.md must not be pulled into memory to answer a boolean.
// The cap is far past any real frontmatter block, so the bound is on the damage,
// not on the behaviour.
const HEAD_BYTES = 64 * 1024;

// awk `/^---[[:space:]]*$/`. Newline cannot occur inside a line, so POSIX space
// minus it is the class — which is also what makes a CRLF file's `---\r` fence
// close correctly.
const FENCE = /^---[ \t\r\v\f]*$/;
const LEADING_BLANK = /^[ \t]*/;
const TRAILING_BLANK = /[ \t\r\v\f]*$/;
const ENABLED_KEY = 'enabled:';

// Every SKILL.md under <root>/skills, resolved to a reading. A missing skills/
// directory answers an empty state rather than an error: a consumer project
// routes against EngineOS registries without carrying its skills tree.
export function readSkillState(root: string): SkillState {
  const dir = join(root, 'skills');
  const state = new Map<string, SkillReading>();
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return state;
  }
  for (const id of entries) {
    // bash globbed `skills/*/`, which skips dotfiles and keeps only directories
    // (symlinks to one included), then required a regular SKILL.md inside.
    if (id.startsWith('.')) continue;
    if (!isDirectory(join(dir, id))) continue;
    const file = join(dir, id, 'SKILL.md');
    if (!isFile(file)) continue;
    const head = readHead(file);
    if (head === null) continue;
    state.set(id, frontmatterReading(head.text, head.truncated));
  }
  return state;
}

// jq's `$st[$id] != false`: an id the tree does not carry reads as ENABLED,
// because a routing row may name a skill this installation does not ship, and
// "absent" is not "turned off". Absence of the key inside a SKILL.md means
// enabled for the same reason — it is the console's contract
// (console/src/lib/entities/skills.ts) and the only reading that keeps every
// skill written before the field existed working.
//
// Every reading that is not `enabled` withholds the skill, so `unreadable`
// fails CLOSED: a switch whose position the kernel cannot see is treated as off,
// because handing over a skill an operator may have disabled is the failure
// that cannot be undone by the next answer.
export function isSkillEnabled(state: SkillState, id: string): boolean {
  const reading = state.get(id);
  return reading === undefined || reading === 'enabled';
}

export function enabledSkills(declared: readonly string[], state: SkillState): string[] {
  return declared.filter((id) => isSkillEnabled(state, id));
}

export function suppressedSkills(declared: readonly string[], state: SkillState): SuppressedSkill[] {
  return declared
    .filter((id) => !isSkillEnabled(state, id))
    // An id that is absent reads as enabled, so it never reaches here: the
    // reading is always one of the two withholding ones.
    .map((id): SuppressedSkill => ({ id, reason: state.get(id) === 'unreadable' ? 'unreadable' : 'disabled' }));
}

export function skillStateSection(state: SkillState): SkillStateSection {
  const readings = [...state.entries()].sort(byEntryId);
  const section: SkillStateSection = {
    skills: readings.map(([id, reading]) => ({ id, enabled: reading === 'enabled' })),
    // jq sorted this list independently of the first; filtering the already
    // sorted rows is the same answer with one comparator.
    disabled: readings.filter(([, reading]) => reading !== 'enabled').map(([id]) => id),
  };
  // An unreadable skill is ALSO in `disabled` above, so a consumer that knows
  // only the bash kernel's two keys still fails closed; this key adds why, and
  // only when there is a why to add.
  const unreadable = readings.filter(([, reading]) => reading === 'unreadable').map(([id]) => id);
  if (unreadable.length > 0) section.unreadable = unreadable;
  return section;
}

export function skillLookupSection(state: SkillState, id: string): SkillLookupSection {
  const section: SkillLookupSection = { id, exists: state.has(id), enabled: isSkillEnabled(state, id) };
  if (state.get(id) === 'unreadable') section.unreadable = true;
  return section;
}

// The awk program, line for line, over a text that is known complete. Only the
// FIRST frontmatter block is read, and only when the file OPENS with one: an
// `enabled:` line in prose further down is documentation, not configuration, and
// a parser that scanned the whole file would let a code sample switch a skill
// off.
export function enabledInFrontmatter(text: string): boolean {
  // A complete text can never read `unreadable`, so the boolean stays total.
  return frontmatterReading(text, false) !== 'disabled';
}

// The same scan, plus the one fact the awk program could not have: whether what
// it read was all there was. A block whose closing fence lies past the bound was
// read as "unclosed, key absent" — enabled — with no diagnostic, so the bound
// failed open exactly where an operator could not see it.
export function frontmatterReading(text: string, truncated: boolean): SkillReading {
  const lines = text.split('\n');
  // A truncated read cuts mid-line, so the last element is a fragment rather
  // than a line, and a fragment is not evidence. Dropping it is what keeps the
  // far side failing closed: `enabled: false` straddling byte 65536 would
  // otherwise be read as the value `fals`, which is not the literal `false`,
  // which is enabled.
  if (truncated) lines.pop();
  const opener = lines[0];
  // awk: `NR==1 && $0 !~ /^---[[:space:]]*$/ {exit}`. A file that does not open
  // with a fence has no frontmatter to be unreadable, however long it is.
  if (opener === undefined || !FENCE.test(opener)) return 'enabled';
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    if (FENCE.test(line)) return 'enabled';
    if (!line.startsWith(ENABLED_KEY)) continue;
    const value = line.slice(ENABLED_KEY.length).replace(LEADING_BLANK, '').replace(TRAILING_BLANK, '');
    // bash `case "$value" in false) disabled ;; *) enabled`. Only the literal
    // spelling disables; anything else, the empty value included, leaves the
    // skill on rather than guessing what a malformed line meant.
    return value === 'false' ? 'disabled' : 'enabled';
  }
  // Nothing inside the block decided the answer. On a complete text that is
  // absence of the key, which means enabled; on a truncated one the deciding
  // line may be just past the bound, and "may be off" is not "is on".
  return truncated ? 'unreadable' : 'enabled';
}

// ------------------------------------------------------------------ internals

// What one bounded read saw, and whether that was the whole file. The second
// half is the part the old signature could not express, and its absence is what
// made the bound fail open.
interface SkillHead {
  text: string;
  truncated: boolean;
}

// jq sorts strings by codepoint; this is UTF-16 code-unit order, which agrees
// with it for every id a directory name can hold in practice (the two differ
// only across the astral/BMP boundary, and a skill id is a slug).
function byEntryId(a: readonly [string, SkillReading], b: readonly [string, SkillReading]): number {
  if (a[0] < b[0]) return -1;
  return a[0] > b[0] ? 1 : 0;
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

// bash `[ -f ... ]`: follows symlinks, and a directory or device named SKILL.md
// is not a file.
function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function readHead(path: string): SkillHead | null {
  let fd: number;
  try {
    fd = openSync(path, 'r');
  } catch {
    return null;
  }
  try {
    const buffer = Buffer.alloc(HEAD_BYTES);
    const read = readSync(fd, buffer, 0, HEAD_BYTES, 0);
    // Both halves are the claim: a short read did not hit the bound, and a file
    // of exactly HEAD_BYTES has nothing past it. Only a full read of a bigger
    // file leaves an answer the kernel has not seen.
    const truncated = read === HEAD_BYTES && fstatSync(fd).size > HEAD_BYTES;
    return { text: buffer.subarray(0, read).toString('utf8'), truncated };
  } catch {
    return null;
  } finally {
    closeSync(fd);
  }
}
