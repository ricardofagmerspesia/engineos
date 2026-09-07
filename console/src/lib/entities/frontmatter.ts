// The flat `key: value` frontmatter reader, shared by every entity kind whose
// source is a markdown file.
//
// It was private to entities/skills.ts. Agents use the same dialect, and a
// second hand-rolled copy would drift — the two readers would disagree about
// quoting or about where the block ends, and the console would show one thing
// while the runtime read another. One reader, one set of rules.
//
// Still no YAML dependency: the dialect in this repo is flat scalars plus
// comma-separated lists, and JSON.parse/stringify already round-trips quoted
// values safely.

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export type FrontmatterValue = string | boolean;

export interface ParsedFrontmatter {
  block: string;
  body: string;
  data: Record<string, FrontmatterValue>;
}

/** Splits raw markdown into its frontmatter block and body. Throws if the file does not open with one. */
export function splitFrontmatter(raw: string): { block: string; body: string } {
  const match = FRONTMATTER_RE.exec(raw);
  if (!match) {
    throw new Error('no frontmatter block found (file must start with "---")');
  }
  return { block: match[1] ?? '', body: raw.slice(match[0].length) };
}

/** Reads one flat "key: value" line. Values may be a JSON string literal (quoted, escaped) or a bare token. */
export function parseFrontmatterLine(
  line: string,
  lineNumber: number,
): [string, FrontmatterValue] | null {
  if (line.trim() === '') return null;
  const match = /^([A-Za-z0-9_-]+):[ \t]?(.*)$/.exec(line);
  if (!match) {
    throw new Error(`unsupported frontmatter syntax at line ${lineNumber}: ${JSON.stringify(line)}`);
  }
  const key = match[1] as string;
  const rawValue = (match[2] ?? '').trim();
  if (rawValue === 'true') return [key, true];
  if (rawValue === 'false') return [key, false];
  if (rawValue.startsWith('"')) {
    try {
      return [key, JSON.parse(rawValue) as string];
    } catch (err) {
      throw new Error(`malformed quoted value at line ${lineNumber}: ${(err as Error).message}`);
    }
  }
  return [key, rawValue];
}

export function parseFrontmatterBlock(block: string): Record<string, FrontmatterValue> {
  const data: Record<string, FrontmatterValue> = {};
  const lines = block.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const parsed = parseFrontmatterLine(lines[i] ?? '', i + 1);
    if (parsed) data[parsed[0]] = parsed[1];
  }
  return data;
}

export function parseMarkdownWithFrontmatter(raw: string): ParsedFrontmatter {
  const { block, body } = splitFrontmatter(raw);
  return { block, body, data: parseFrontmatterBlock(block) };
}

/** `tools: Read, Grep, Bash` -> `['Read','Grep','Bash']`. An absent or empty value is an empty list, never `['']`. */
export function parseCommaList(value: FrontmatterValue | undefined): string[] {
  if (typeof value !== 'string') return [];
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item !== '');
}
