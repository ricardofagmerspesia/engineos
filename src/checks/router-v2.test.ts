// Family router-v2: one case per declared code of C38, C38b, C38c and C38d,
// each planted in a private copy of the checkout. The last test fails when a
// declared code is produced by no case, so a dead code cannot hide here.
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { isRecord } from '../lib/json';
import type { Finding } from './findings';
import type { CheckId } from './ids';
import { editJson } from './runtime-governance-fixtures';
import { checkoutCopy, checkoutRoot, contextFor, editFile, findingsOf, hasFinding, writeFile } from './testing';
import { C38_FINDINGS, C38B_FINDINGS, C38C_FINDINGS, C38D_FINDINGS, ROUTER_V2_CHECKS } from './router-v2';
import { ROUTER_TABLE_BEGIN, ROUTER_TABLE_END } from '../gen/router-table';

const INTENTS = 'registries/intents.json';
const POLICY = 'registries/policy.json';
const RULES = 'registries/decision-rules.json';

const produced = new Set<string>();

function findingsFor(t: TestContext, id: CheckId, mutate?: (root: string) => void): Finding[] {
  const list = findingsOf(ROUTER_V2_CHECKS, id, contextFor(checkoutCopy(t, mutate)));
  for (const item of list) produced.add(`${id}:${item.code}`);
  return list;
}

function rowsOf(document: Record<string, unknown>, key: string): Record<string, unknown>[] {
  const value = document[key];
  if (!Array.isArray(value)) throw new Error(`${key} is not an array`);
  return value.filter(isRecord);
}

function recordOf(document: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = document[key];
  if (!isRecord(value)) throw new Error(`${key} is not an object`);
  return value;
}

function intentRow(document: Record<string, unknown>, id: string): Record<string, unknown> {
  const row = rowsOf(document, 'intents').find((candidate) => candidate['id'] === id);
  if (row === undefined) throw new Error(`intents.json has no row ${id}`);
  return row;
}

function editIntent(root: string, id: string, mutate: (row: Record<string, unknown>) => void): void {
  editJson(root, INTENTS, (document) => {
    mutate(intentRow(document, id));
  });
}

function fixtureAt(root: string, index: number, mutate: (fixture: Record<string, unknown>) => void): void {
  editJson(root, POLICY, (document) => {
    const fixture = rowsOf(recordOf(document, 'router'), 'fixtures')[index];
    if (fixture === undefined) throw new Error(`policy.json has no router fixture ${index}`);
    mutate(fixture);
  });
}

// Appends `line` to a file of the copy and answers its 1-based line number.
function appendLine(root: string, relativePath: string, line: string): number {
  let lineNumber = 0;
  editFile(root, relativePath, (text) => {
    const base = text.endsWith('\n') || text === '' ? text : `${text}\n`;
    lineNumber = base.split('\n').length;
    return `${base}${line}\n`;
  });
  return lineNumber;
}

function emptyIntents(root: string): void {
  editJson(root, INTENTS, (document) => {
    document['intents'] = [];
  });
}

// ------------------------------------------------------------------ C38

test('C38 passes on an unmutated checkout', (t) => {
  assert.deepEqual(findingsFor(t, 'C38'), []);
});

test('an intents registry whose version is not 2.x is caught', (t) => {
  const findings = findingsFor(t, 'C38', (root) => {
    editJson(root, INTENTS, (document) => {
      document['version'] = '1.9.0';
    });
  });
  assert.ok(hasFinding(findings, 'version-not-v2', '1.9.0'));
});

test('an intents registry with no version is caught as absent', (t) => {
  const findings = findingsFor(t, 'C38', (root) => {
    editJson(root, INTENTS, (document) => {
      delete document['version'];
    });
  });
  assert.ok(hasFinding(findings, 'version-not-v2', 'absent'));
});

test('an active row with its signals dropped is caught even though phrases keep it loadable', (t) => {
  const findings = findingsFor(t, 'C38', (root) => {
    editIntent(root, 'backend', (row) => {
      row['signals'] = [];
    });
  });
  assert.ok(hasFinding(findings, 'signals-dropped', 'backend'));
  assert.ok(!hasFinding(findings, 'intents-unloadable'));
});

test('an inactive row without signals is not reported', (t) => {
  const findings = findingsFor(t, 'C38');
  assert.ok(!hasFinding(findings, 'signals-dropped', 'backend-python'));
});

test('a metasyntactic placeholder in a phrase is caught', (t) => {
  const findings = findingsFor(t, 'C38', (root) => {
    editIntent(root, 'backend', (row) => {
      row['phrases'] = [...rowsOf(row, 'phrases'), { text: 'add X to the service', weight: 1 }];
    });
  });
  assert.ok(hasFinding(findings, 'metasyntax', 'backend:add X to the service'));
});

test('a comparison sign in a negative phrase is caught', (t) => {
  const findings = findingsFor(t, 'C38', (root) => {
    editIntent(root, 'llm', (row) => {
      row['negative'] = [...rowsOf(row, 'negative'), { text: 'more than 3 files ≥ big', weight: 1 }];
    });
  });
  assert.ok(hasFinding(findings, 'metasyntax', 'llm:more than 3 files ≥ big'));
});

test('a threshold above 1 is caught and the loader refuses the registry', (t) => {
  const findings = findingsFor(t, 'C38', (root) => {
    editIntent(root, 'backend', (row) => {
      row['threshold'] = 1.5;
    });
  });
  assert.ok(hasFinding(findings, 'threshold-out-of-range', 'backend'));
  assert.ok(hasFinding(findings, 'intents-unloadable', INTENTS));
});

test('a threshold of exactly 0 is caught', (t) => {
  const findings = findingsFor(t, 'C38', (root) => {
    editIntent(root, 'backend', (row) => {
      row['threshold'] = 0;
    });
  });
  assert.ok(hasFinding(findings, 'threshold-out-of-range', 'backend'));
});

test('a router_row on the folded android-release intent is caught', (t) => {
  const findings = findingsFor(t, 'C38', (root) => {
    editIntent(root, 'android-release', (row) => {
      row['router_row'] = { intent: 'Android store release', load: 'agent `android-builder`' };
    });
  });
  assert.ok(hasFinding(findings, 'folded-router-row', 'android-release'));
});

test('an intents registry the strict loader refuses is caught', (t) => {
  const findings = findingsFor(t, 'C38', emptyIntents);
  assert.ok(hasFinding(findings, 'intents-unloadable', INTENTS));
});

// ------------------------------------------------------------------ C38b

test('C38b passes on an unmutated checkout', (t) => {
  assert.deepEqual(findingsFor(t, 'C38b'), []);
});

test('an active intent with fewer than 3 exemplars is caught', (t) => {
  const findings = findingsFor(t, 'C38b', (root) => {
    editIntent(root, 'backend', (row) => {
      row['exemplars'] = ['add an endpoint', 'fix the controller'];
    });
  });
  assert.ok(hasFinding(findings, 'exemplar-count', 'backend:2'));
});

test('an active intent with more than 10 exemplars is caught', (t) => {
  const findings = findingsFor(t, 'C38b', (root) => {
    editIntent(root, 'backend', (row) => {
      row['exemplars'] = Array.from({ length: 11 }, (_, index) => `add endpoint number ${index}`);
    });
  });
  assert.ok(hasFinding(findings, 'exemplar-count', 'backend:11'));
});

test('exactly 3 and exactly 10 exemplars both pass', (t) => {
  const findings = findingsFor(t, 'C38b', (root) => {
    editJson(root, INTENTS, (document) => {
      intentRow(document, 'backend')['exemplars'] = ['one endpoint', 'two endpoints', 'three endpoints'];
      intentRow(document, 'frontend')['exemplars'] = Array.from({ length: 10 }, (_, index) => `page ${index}`);
    });
  });
  assert.deepEqual(findings, []);
});

test('an inactive intent with no exemplars is not reported', (t) => {
  const findings = findingsFor(t, 'C38b');
  assert.ok(!findings.some((entry) => entry.subject?.startsWith('backend-python:') === true));
});

test('C38b reports an unloadable intents registry instead of counting', (t) => {
  const findings = findingsFor(t, 'C38b', emptyIntents);
  assert.deepEqual(
    findings.map((entry) => [entry.code, entry.subject]),
    [['intents-unloadable', INTENTS]],
  );
});

// ------------------------------------------------------------------ C38c

test('C38c passes on an unmutated checkout', (t) => {
  assert.deepEqual(findingsFor(t, 'C38c'), []);
});

test('a router block the strict loader refuses is caught', (t) => {
  const findings = findingsFor(t, 'C38c', (root) => {
    editJson(root, POLICY, (document) => {
      recordOf(document, 'router')['fixtures'] = 'none';
    });
  });
  assert.ok(hasFinding(findings, 'router-block-malformed', '.router'));
});

test('a judge block the strict loader refuses is caught', (t) => {
  const findings = findingsFor(t, 'C38c', (root) => {
    editJson(root, POLICY, (document) => {
      delete document['judge'];
    });
  });
  assert.ok(hasFinding(findings, 'judge-block-malformed', '.judge'));
});

test('a router fixture naming an intent the registry does not have is caught', (t) => {
  const findings = findingsFor(t, 'C38c', (root) => {
    fixtureAt(root, 0, (fixture) => {
      fixture['intents'] = ['backend', 'teleportation'];
    });
  });
  assert.ok(hasFinding(findings, 'fixture-unknown-intent', '0:teleportation'));
  assert.ok(!hasFinding(findings, 'fixture-unknown-intent', '0:backend'));
});

test('a router fixture naming an inactive intent is caught', (t) => {
  const findings = findingsFor(t, 'C38c', (root) => {
    fixtureAt(root, 0, (fixture) => {
      fixture['intents'] = ['backend-python'];
    });
  });
  assert.ok(hasFinding(findings, 'fixture-unknown-intent', '0:backend-python'));
});

test('a router fixture naming an escalation reason the router never declares is caught', (t) => {
  const findings = findingsFor(t, 'C38c', (root) => {
    fixtureAt(root, 1, (fixture) => {
      fixture['reasons'] = ['moon-phase'];
    });
  });
  assert.ok(hasFinding(findings, 'fixture-unknown-reason', '1:moon-phase'));
});

test('two decision rules sharing one judge fact are caught', (t) => {
  const findings = findingsFor(t, 'C38c', (root) => {
    editJson(root, RULES, (document) => {
      const rule = rowsOf(document, 'rules').find((row) => row['id'] === 'rule-public-contract');
      if (rule === undefined) throw new Error('decision-rules.json has no rule-public-contract');
      rule['judge_fact'] = 'large_change';
    });
  });
  assert.ok(hasFinding(findings, 'judge-fact-duplicate', 'large_change'));
});

test('key material planted in a registry is caught with the redaction kind that matched', (t) => {
  // Built by concatenation so no credential-shaped literal sits in the source.
  const planted = 'AKIA' + 'Q'.repeat(16);
  const findings = findingsFor(t, 'C38c', (root) => {
    editJson(root, 'registries/capabilities.json', (document) => {
      document['planted_note'] = `rotate ${planted} soon`;
    });
  });
  assert.ok(hasFinding(findings, 'key-material', 'registries/capabilities.json:aws-key'));
});

test('a fetch call in a judge source file is caught at its line', (t) => {
  const findings = findingsFor(t, 'C38c', (root) => {
    writeFile(
      root,
      'src/judge/planted-transport.ts',
      ['// the hook injects the transport; this file does not', 'export const send = (): Promise<unknown> => fetch("https://example.invalid");', ''].join('\n'),
    );
  });
  assert.ok(hasFinding(findings, 'judge-calls-fetch', 'src/judge/planted-transport.ts:2'));
  // The comment on line 1 names no call and is not reported.
  assert.ok(!hasFinding(findings, 'judge-calls-fetch', 'src/judge/planted-transport.ts:1'));
});

test('a fetch call in a judge test file is not reported', (t) => {
  const findings = findingsFor(t, 'C38c', (root) => {
    writeFile(root, 'src/judge/planted.test.ts', 'export const probe = (): Promise<unknown> => fetch("https://example.invalid");\n');
  });
  assert.ok(!findings.some((entry) => entry.subject?.startsWith('src/judge/planted.test.ts') === true));
});

test('a fetch call mentioned only in a comment is not reported', (t) => {
  const findings = findingsFor(t, 'C38c', (root) => {
    writeFile(root, 'src/judge/planted-note.ts', ['/**', ' * never call fetch( from here', ' */', 'export const NOTE = 1;', ''].join('\n'));
  });
  assert.ok(!findings.some((entry) => entry.subject?.startsWith('src/judge/planted-note.ts') === true));
});

test('a kernel module importing src/judge is caught at its line', (t) => {
  const findings = findingsFor(t, 'C38c', (root) => {
    writeFile(root, 'src/kernel/planted-bridge.ts', ["import { readFileSync } from 'node:fs';", "import { questions } from '../judge/questions';", 'export const bridge = [readFileSync, questions];', ''].join('\n'));
  });
  assert.ok(hasFinding(findings, 'kernel-imports-judge', 'src/kernel/planted-bridge.ts:2'));
  assert.ok(!hasFinding(findings, 'kernel-imports-judge', 'src/kernel/planted-bridge.ts:1'));
});

test('a kernel comment naming src/judge is not reported', (t) => {
  const findings = findingsFor(t, 'C38c', (root) => {
    writeFile(root, 'src/kernel/planted-comment.ts', ["// see import { x } from '../judge/questions' for the shape", 'export const NOTHING = 0;', ''].join('\n'));
  });
  assert.ok(!findings.some((entry) => entry.subject?.startsWith('src/kernel/planted-comment.ts') === true));
});

test('an adapters module bundled into the root loader is caught', (t) => {
  let line = 0;
  const findings = findingsFor(t, 'C38c', (root) => {
    line = appendLine(root, 'dist/engineos.cjs', '// adapters/claude-code-mod/host/server.ts');
  });
  assert.ok(hasFinding(findings, 'bundle-imports-adapter', `dist/engineos.cjs:${line}`));
});

test('the embedding daemon bundled into the root runtime bundle is caught', (t) => {
  let line = 0;
  const findings = findingsFor(t, 'C38c', (root) => {
    line = appendLine(root, 'dist/runtime/engineos.cjs', '// tools/embedding-daemon/src/server.ts');
  });
  assert.ok(hasFinding(findings, 'bundle-imports-adapter', `dist/runtime/engineos.cjs:${line}`));
});

test('a require of an adapters path from the root runtime bundle is caught', (t) => {
  let line = 0;
  const findings = findingsFor(t, 'C38c', (root) => {
    line = appendLine(root, 'dist/runtime/engineos.cjs', 'var host = require("../../adapters/claude-code-mod/host/server.js");');
  });
  assert.ok(hasFinding(findings, 'bundle-imports-adapter', `dist/runtime/engineos.cjs:${line}`));
});

test('the bundle scan is skipped when the root loader is absent', (t) => {
  const findings = findingsFor(t, 'C38c', (root) => {
    appendLine(root, 'dist/runtime/engineos.cjs', '// adapters/claude-code-mod/host/server.ts');
    rmSync(join(root, 'dist/engineos.cjs'));
  });
  assert.ok(!hasFinding(findings, 'bundle-imports-adapter'));
});

// ------------------------------------------------------------------ C38d

test('C38d passes on an unmutated checkout', (t) => {
  assert.deepEqual(findingsFor(t, 'C38d'), []);
});

test('CLAUDE.md losing both router-table markers is caught', (t) => {
  const findings = findingsFor(t, 'C38d', (root) => {
    editFile(root, 'CLAUDE.md', (text) => withoutLine(withoutLine(text, ROUTER_TABLE_BEGIN), ROUTER_TABLE_END));
  });
  assert.ok(hasFinding(findings, 'markers-missing', 'CLAUDE.md'));
});

test('AGENTS.md carrying a second begin marker is caught as malformed', (t) => {
  const findings = findingsFor(t, 'C38d', (root) => {
    editFile(root, 'AGENTS.md', (text) => `${ROUTER_TABLE_BEGIN}\n${text}`);
  });
  assert.ok(hasFinding(findings, 'markers-malformed', 'AGENTS.md'));
});

test('a registry edit not regenerated into the table is caught at the first stale line', (t) => {
  const findings = findingsFor(t, 'C38d', (root) => {
    editIntent(root, 'backend', (row) => {
      const routerRow = recordOf(row, 'router_row');
      routerRow['intent'] = `${String(routerRow['intent'])} (edited)`;
    });
  });
  // Header, separator, new-feature, big-sweep, bug, then backend: line 6.
  assert.ok(hasFinding(findings, 'region-drift', 'CLAUDE.md:6'));
  assert.ok(hasFinding(findings, 'region-drift', 'AGENTS.md:6'));
});

test('a hand edit inside the CLAUDE.md region is caught', (t) => {
  const findings = findingsFor(t, 'C38d', (root) => {
    editFile(root, 'CLAUDE.md', (text) => text.replace(`${ROUTER_TABLE_BEGIN}\n| Intent (signals) | Load |`, `${ROUTER_TABLE_BEGIN}\n| Intent | Load |`));
  });
  assert.ok(hasFinding(findings, 'region-drift', 'CLAUDE.md:1'));
  assert.ok(!findings.some((entry) => entry.subject?.startsWith('AGENTS.md') === true));
});

test('C38d reports an unloadable intents registry instead of comparing', (t) => {
  const findings = findingsFor(t, 'C38d', emptyIntents);
  assert.deepEqual(
    findings.map((entry) => [entry.code, entry.subject]),
    [['intents-unloadable', INTENTS]],
  );
});

test('the committed CLAUDE.md region starts with the generated header', () => {
  // A guard on the fixture the C38d cases above lean on, read from the real tree.
  const text = readFileSync(join(checkoutRoot(), 'CLAUDE.md'), 'utf8');
  assert.ok(text.includes(`${ROUTER_TABLE_BEGIN}\n| Intent (signals) | Load |\n|---|---|\n`));
});

// ------------------------------------------------------------------ internals

function withoutLine(text: string, line: string): string {
  const lines = text.split('\n');
  const index = lines.indexOf(line);
  if (index === -1) throw new Error(`mutation matched nothing: ${line}`);
  lines.splice(index, 1);
  return lines.join('\n');
}

// ------------------------------------------------------------------- coverage

test('every declared C38/C38b/C38c/C38d code is produced by a case in this file', () => {
  const declared = [
    ...C38_FINDINGS.map((code) => `C38:${code}`),
    ...C38B_FINDINGS.map((code) => `C38b:${code}`),
    ...C38C_FINDINGS.map((code) => `C38c:${code}`),
    ...C38D_FINDINGS.map((code) => `C38d:${code}`),
  ];
  assert.deepEqual(declared.filter((code) => !produced.has(code)), []);
});
