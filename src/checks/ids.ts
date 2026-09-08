// The check ids the validator answers for, in the order the shell families ran
// them: the ids the 1.7.0 port carried over from scripts/checks/*.sh, plus C32
// to C35, whose two bash families were never registered by that port and were
// ported and deleted in the audit-remediation wave, plus C36 and C37, which had
// no bash ancestor at all — they were written for the prose-truth family. There
// is no bash left to diff this list against, so it is authoritative rather than
// derived, and `--only <id>` and `--list` keep their byte-exact surface for
// every earlier id.
export const CHECK_IDS = [
  'C1',
  'C2',
  'C3',
  'C5',
  'C5b',
  'C6',
  'C7',
  'C8',
  'C9',
  'C10',
  'C11',
  'C12',
  'C13',
  'C14',
  'C15',
  'C15b',
  'C16',
  'C17',
  'C17b',
  'C17c',
  'C17e',
  'C18',
  'C18b',
  'C18c',
  'C18d',
  'C18e',
  'C18f',
  'C18g',
  'C19',
  'C19b',
  'C19c',
  'C20',
  'C20b',
  'C20c',
  'C20d',
  'C21',
  'C21b',
  'C21c',
  'C21e',
  'C22',
  'C22b',
  'C22c',
  'C23',
  'C23c',
  'C24',
  'C24b',
  'C24c',
  'C25',
  'C25b',
  'C25c',
  'C26',
  'C26b',
  'C26c',
  'C26d',
  'C27',
  'C27b',
  'C27c',
  'C27d',
  'C28',
  'C29',
  'C30',
  'C31',
  'C32',
  'C33',
  'C34',
  'C35',
  'C36',
  'C37',
] as const;

export type CheckId = (typeof CHECK_IDS)[number];

const DECLARED: ReadonlySet<string> = new Set(CHECK_IDS);

// The CLI takes `--only <id>` from a human, so the narrowing has to happen at
// that boundary rather than by trusting the argument's declared type.
export function isCheckId(value: string): value is CheckId {
  return DECLARED.has(value);
}
