import { closeSync, openSync, readSync, readdirSync, statSync } from 'node:fs';
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

// id -> enabled. An id the tree does not carry is simply absent, which is not
// the same fact as `false` (see isSkillEnabled).
export type SkillState = ReadonlyMap<string, boolean>;

export interface SkillRow {
  id: string;
  enabled: boolean;
}

// cmd_skill_state's two answer shapes, in its key order.
export interface SkillStateSection {
  skills: SkillRow[];
  disabled: string[];
}

export interface SkillLookupSection {
  id: string;
  exists: boolean;
  enabled: boolean;
}

// The verdict for one declared skill that was withheld. `reason` is a closed
// vocabulary of one today; it exists so a second cause can be named later
// without changing the shape callers already parse.
export interface SuppressedSkill {
  id: string;
  reason: 'disabled';
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

// Every SKILL.md under <root>/skills, resolved to enabled/disabled. A missing
// skills/ directory answers an empty state rather than an error: a consumer
// project routes against EngineOS registries without carrying its skills tree.
export function readSkillState(root: string): SkillState {
  const dir = join(root, 'skills');
  const state = new Map<string, boolean>();
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
    state.set(id, enabledInFrontmatter(head));
  }
  return state;
}

// jq's `$st[$id] != false`: an id the tree does not carry reads as ENABLED,
// because a routing row may name a skill this installation does not ship, and
// "absent" is not "turned off". Absence of the key inside a SKILL.md means
// enabled for the same reason — it is the console's contract
// (console/src/lib/entities/skills.ts) and the only reading that keeps every
// skill written before the field existed working.
export function isSkillEnabled(state: SkillState, id: string): boolean {
  return state.get(id) !== false;
}

export function enabledSkills(declared: readonly string[], state: SkillState): string[] {
  return declared.filter((id) => isSkillEnabled(state, id));
}

export function suppressedSkills(declared: readonly string[], state: SkillState): SuppressedSkill[] {
  return declared.filter((id) => !isSkillEnabled(state, id)).map((id) => ({ id, reason: 'disabled' }));
}

export function skillStateSection(state: SkillState): SkillStateSection {
  const skills = [...state.entries()].map(([id, enabled]) => ({ id, enabled })).sort(byId);
  return {
    skills,
    // jq sorted this list independently of the first; filtering the already
    // sorted rows is the same answer with one comparator.
    disabled: skills.filter((row) => !row.enabled).map((row) => row.id),
  };
}

export function skillLookupSection(state: SkillState, id: string): SkillLookupSection {
  return { id, exists: state.has(id), enabled: isSkillEnabled(state, id) };
}

// The awk program, line for line. Only the FIRST frontmatter block is read, and
// only when the file OPENS with one: an `enabled:` line in prose further down is
// documentation, not configuration, and a parser that scanned the whole file
// would let a code sample switch a skill off.
export function enabledInFrontmatter(text: string): boolean {
  const lines = text.split('\n');
  const opener = lines[0];
  // awk: `NR==1 && $0 !~ /^---[[:space:]]*$/ {exit}`.
  if (opener === undefined || !FENCE.test(opener)) return true;
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    if (FENCE.test(line)) return true;
    if (!line.startsWith(ENABLED_KEY)) continue;
    const value = line.slice(ENABLED_KEY.length).replace(LEADING_BLANK, '').replace(TRAILING_BLANK, '');
    // bash `case "$value" in false) disabled ;; *) enabled`. Only the literal
    // spelling disables; anything else, the empty value included, leaves the
    // skill on rather than guessing what a malformed line meant.
    return value !== 'false';
  }
  // An unclosed block that never mentions the key: absence means enabled.
  return true;
}

// ------------------------------------------------------------------ internals

// jq sorts strings by codepoint; this is UTF-16 code-unit order, which agrees
// with it for every id a directory name can hold in practice (the two differ
// only across the astral/BMP boundary, and a skill id is a slug).
function byId(a: SkillRow, b: SkillRow): number {
  if (a.id < b.id) return -1;
  return a.id > b.id ? 1 : 0;
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

function readHead(path: string): string | null {
  let fd: number;
  try {
    fd = openSync(path, 'r');
  } catch {
    return null;
  }
  try {
    const buffer = Buffer.alloc(HEAD_BYTES);
    const read = readSync(fd, buffer, 0, HEAD_BYTES, 0);
    return buffer.subarray(0, read).toString('utf8');
  } catch {
    return null;
  } finally {
    closeSync(fd);
  }
}
