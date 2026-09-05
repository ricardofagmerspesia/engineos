// The agent-frontmatter reader both generators share (scripts/gen-agent-commands.sh
// and scripts/gen-agent-registry.sh carried a byte-identical copy of each helper).
//
// Deliberately a text scanner, not a YAML parser. The bash it replaces read the
// frontmatter with grep and sed over the WHOLE file, and its quirks are observable
// in the files it generated: a `name:` line below the closing `---` still counts,
// and an alias is only looked for inside a `---` range. A real parser would answer
// differently for those files, which is a behaviour change wearing a correctness
// costume — so the quirks are reproduced here and named, not fixed.

// POSIX [[:space:]] minus the newline, which cannot occur inside a line anyway.
const LINE_SPACE = /^[ \t\r\v\f]*/;

// bash: grep -m1 "^field:" FILE | sed -E "s/^field:[[:space:]]*//"
// First line of the WHOLE file starting with `<field>:`, with that prefix and any
// following whitespace stripped. Trailing whitespace is kept (sed only anchored the
// leading side). '' when no line matches — the callers' "field absent" signal.
export function frontmatterValue(text: string, field: string): string {
  const prefix = `${field}:`;
  for (const line of text.split('\n')) {
    if (!line.startsWith(prefix)) continue;
    return line.slice(prefix.length).replace(LINE_SPACE, '');
  }
  return '';
}

// grep -i makes the [a-z0-9-] class match A-Z too; the JS `i` flag does the same.
const ALIAS = /Alias: [a-z0-9-]+/i;

// bash: sed -n '/^---$/,/^---$/p' FILE | grep -oiE 'Alias: [a-z0-9-]+' | head -1
//       | sed -E 's/[Aa]lias: //'
// The alias declared in the frontmatter description ("Alias: <slug> (invocable by
// this name)."), restricted to `---` ranges so body prose can never be read as one.
export function frontmatterAlias(text: string): string {
  const match = ALIAS.exec(dashRanges(text));
  if (match === null) return '';
  // The bash strips the prefix with `[Aa]lias: `, which is NOT the case-insensitive
  // class the grep above matched with: `ALIAS: vera` survives grep and then fails
  // sed, so bash yields the whole `ALIAS: vera`. Reproduced rather than tidied —
  // agents/*.md all write `Alias:`, and a port that silently disagreed with the
  // generator on some input would be discovered by a diff, not by a test.
  return match[0].replace(/[Aa]lias: /, '');
}

// The lines `sed -n '/^---$/,/^---$/p'` prints: from a `---` line through the next
// one inclusive. The range REOPENS at any later `---`, and an unclosed range runs to
// end of file — both are sed range semantics, not an oversight.
function dashRanges(text: string): string {
  const kept: string[] = [];
  let inRange = false;
  for (const line of text.split('\n')) {
    if (!inRange) {
      if (line !== '---') continue;
      inRange = true;
      kept.push(line);
      continue;
    }
    kept.push(line);
    // Checked only from the line after the opener, so `---\n---` is one closed range.
    if (line === '---') inRange = false;
  }
  return kept.join('\n');
}

// jq: split(",") | map(gsub("^\\s+|\\s+$";"")) | map(select(length > 0))
// A frontmatter CSV field (`tools:`) as a list. Empty entries — a trailing comma,
// or a run of them — are dropped rather than becoming empty strings.
export function splitCsv(value: string): string[] {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}
