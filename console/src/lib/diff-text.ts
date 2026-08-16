// A dependency-light line diff for the console's file-level diff view. A plain
// positional (index-by-index) comparison was tried first and rejected: any single
// inserted or deleted line shifts every later line out of alignment, so a
// one-line frontmatter addition (e.g. a new `enabled:` key) renders as the whole
// file being rewritten. LCS-based alignment is the minimum that avoids that —
// still no diff library needed (rules/base.md: no dep for what this many lines
// of code can do).
export function buildLineDiff(before: string, after: string): string {
  if (before === after) {
    return '';
  }

  const beforeLines = before.split('\n');
  const afterLines = after.split('\n');
  const output: string[] = [];

  // lcsLength[i][j] = length of the LCS of beforeLines[i:] and afterLines[j:].
  const lcsLength: number[][] = Array.from({ length: beforeLines.length + 1 }, () =>
    new Array<number>(afterLines.length + 1).fill(0),
  );
  for (let i = beforeLines.length - 1; i >= 0; i -= 1) {
    for (let j = afterLines.length - 1; j >= 0; j -= 1) {
      lcsLength[i]![j] =
        beforeLines[i] === afterLines[j]
          ? lcsLength[i + 1]![j + 1]! + 1
          : Math.max(lcsLength[i + 1]![j]!, lcsLength[i]![j + 1]!);
    }
  }

  let i = 0;
  let j = 0;
  while (i < beforeLines.length && j < afterLines.length) {
    if (beforeLines[i] === afterLines[j]) {
      output.push(`  ${beforeLines[i]}`);
      i += 1;
      j += 1;
    } else if (lcsLength[i + 1]![j]! >= lcsLength[i]![j + 1]!) {
      output.push(`- ${beforeLines[i]}`);
      i += 1;
    } else {
      output.push(`+ ${afterLines[j]}`);
      j += 1;
    }
  }
  while (i < beforeLines.length) {
    output.push(`- ${beforeLines[i]}`);
    i += 1;
  }
  while (j < afterLines.length) {
    output.push(`+ ${afterLines[j]}`);
    j += 1;
  }

  return output.join('\n');
}
