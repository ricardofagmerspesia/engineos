// Family 50-kernel: one case per bash `case_` row of C17*/C18*, plus the cases
// the bash suite never had (a code with no case is a dead code, and the last
// test in this file fails when one exists).
//
// Every case mutates a PRIVATE copy of the checkout, exactly as the bash
// harness did, so a planted breakage can never touch the real tree and each
// check reads what the validator reads.
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { isRecord } from '../lib/json';
import type { Finding } from './findings';
import type { CheckId } from './ids';
import { KERNEL_CHECKS } from './kernel';
import { checkoutCopy, contextFor, editFile, findingsOf, hasFinding } from './testing';

const ROUTING = 'registries/routing.json';
const POLICY = 'registries/policy.json';
const INTENTS = 'registries/intents.json';
const CAPABILITIES = 'registries/capabilities.json';
const ROUTER_MD = 'agents/router.md';

// Every `<check>:<code>` any case in this file produced. The last test compares
// it against the declared code lists, so a code nothing can produce is a failure
// here rather than a comment nobody rereads.
const produced = new Set<string>();

function findingsFor(t: TestContext, id: CheckId, mutate?: (root: string) => void): Finding[] {
  const list = findingsOf(KERNEL_CHECKS, id, contextFor(checkoutCopy(t, mutate)));
  for (const item of list) produced.add(`${id}:${item.code}`);
  return list;
}

function editJson(root: string, relativePath: string, mutate: (document: Record<string, unknown>) => void): void {
  editFile(root, relativePath, (text) => {
    const parsed: unknown = JSON.parse(text);
    if (!isRecord(parsed)) throw new Error(`${relativePath} is not a JSON object`);
    mutate(parsed);
    return `${JSON.stringify(parsed, null, 2)}\n`;
  });
}

function rowsAt(document: Record<string, unknown>, key: string): Record<string, unknown>[] {
  const value = document[key];
  if (!Array.isArray(value)) throw new Error(`${key} is not an array`);
  return value.filter(isRecord);
}

function recordAt(document: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = document[key];
  if (!isRecord(value)) throw new Error(`${key} is not an object`);
  return value;
}

function rowById(rows: readonly Record<string, unknown>[], id: string): Record<string, unknown> {
  const row = rows.find((candidate) => candidate['id'] === id);
  if (row === undefined) throw new Error(`no row with id ${id}`);
  return row;
}

function fixtureAt(document: Record<string, unknown>, index: number): Record<string, unknown> {
  const fixture = rowsAt(recordAt(document, 'router'), 'fixtures')[index];
  if (fixture === undefined) throw new Error(`policy.json declares no router fixture ${index}`);
  return fixture;
}

// ------------------------------------------------------------------ C17

test('C17 passes on an unmutated checkout', (t) => {
  assert.deepEqual(findingsFor(t, 'C17'), []);
});

test('a domain with its match patterns emptied is caught', (t) => {
  const findings = findingsFor(t, 'C17', (root) => {
    editJson(root, ROUTING, (document) => {
      rowById(rowsAt(document, 'domains'), 'frontend')['match'] = { paths: [], basenames: [] };
    });
  });
  assert.ok(hasFinding(findings, 'no-patterns', 'frontend'));
});

test('a domain without a sample_path is caught', (t) => {
  const findings = findingsFor(t, 'C17', (root) => {
    editJson(root, ROUTING, (document) => {
      delete rowById(rowsAt(document, 'domains'), 'frontend')['sample_path'];
    });
  });
  assert.ok(hasFinding(findings, 'no-sample', 'frontend'));
});

// The bash pipeline answered an unparseable registry with an empty jq result and
// then reported nothing at all. This is the fail-open the port closes.
test('an unparseable routing registry is reported rather than passing vacuously', (t) => {
  const findings = findingsFor(t, 'C17', (root) => {
    editFile(root, ROUTING, () => '{ not json');
  });
  assert.ok(hasFinding(findings, 'precondition-missing', ROUTING));
});

// ------------------------------------------------------------------ C17b

test('C17b passes on an unmutated checkout', (t) => {
  assert.deepEqual(findingsFor(t, 'C17b'), []);
});

test('a sample_path that routes to the wrong domain is caught', (t) => {
  const findings = findingsFor(t, 'C17b', (root) => {
    editJson(root, ROUTING, (document) => {
      rowById(rowsAt(document, 'domains'), 'dba')['sample_path'] = '/tmp/web/src/Button.tsx';
    });
  });
  assert.ok(hasFinding(findings, 'sample-routes-elsewhere', 'dba->frontend'));
});

// ------------------------------------------------------------------ C17c

test('C17c passes on an unmutated checkout', (t) => {
  assert.deepEqual(findingsFor(t, 'C17c'), []);
});

test("dropping .excluded.self_dirs stops excluding EngineOS's own hooks/ tree", (t) => {
  const findings = findingsFor(t, 'C17c', (root) => {
    editJson(root, ROUTING, (document) => {
      delete recordAt(document, 'excluded')['self_dirs'];
    });
  });
  assert.ok(hasFinding(findings, 'excluded-path-routed', 'self-hooks'));
});

// The other direction of the same rule: self_dirs is resolved against THIS
// checkout, so a consumer project's own hooks/ tree must still route.
test("excluding a consumer project's own hooks/ tree is caught", (t) => {
  const findings = findingsFor(t, 'C17c', (root) => {
    editJson(root, ROUTING, (document) => {
      recordAt(document, 'excluded')['paths'] = ['*/.engineos/*', '*/hooks/*'];
    });
  });
  assert.ok(hasFinding(findings, 'foreign-path-excluded', 'foreign-hooks'));
});

// ------------------------------------------------------------------ C17e

test('C17e passes on an unmutated checkout', (t) => {
  assert.deepEqual(findingsFor(t, 'C17e'), []);
});

test('an invalid prompt_signals regex is caught', (t) => {
  const findings = findingsFor(t, 'C17e', (root) => {
    editJson(root, POLICY, (document) => {
      recordAt(recordAt(document, 'parallelism'), 'prompt_signals')['scale'] = '([unclosed';
    });
  });
  assert.ok(hasFinding(findings, 'signal-invalid-regex', 'scale'));
});

test('a removed prompt_signals key is caught', (t) => {
  const findings = findingsFor(t, 'C17e', (root) => {
    editJson(root, POLICY, (document) => {
      delete recordAt(recordAt(document, 'parallelism'), 'prompt_signals')['spec'];
    });
  });
  assert.ok(hasFinding(findings, 'signal-missing', 'spec'));
});

// ------------------------------------------------------------------ C18

test('C18 passes on an unmutated checkout', (t) => {
  assert.deepEqual(findingsFor(t, 'C18'), []);
});

test('route capability model_tier downgraded off design is caught', (t) => {
  const findings = findingsFor(t, 'C18', (root) => {
    editJson(root, CAPABILITIES, (document) => {
      rowById(rowsAt(document, 'capabilities'), 'route')['model_tier'] = 'build';
    });
  });
  assert.ok(hasFinding(findings, 'capability-not-bound', 'router/build'));
});

test("route capability's tier drifting off the router agent's model is caught", (t) => {
  const findings = findingsFor(t, 'C18', (root) => {
    editFile(root, ROUTER_MD, (text) => text.replace(/^model: opus$/m, 'model: haiku'));
  });
  assert.ok(hasFinding(findings, 'tier-model-mismatch', 'opus!=haiku'));
});

// bash folded this into the "not bound" branch, which named the registry for a
// defect in the agent file.
test('a missing agents/router.md is caught as an agent defect, not a registry one', (t) => {
  const findings = findingsFor(t, 'C18', (root) => {
    rmSync(join(root, ROUTER_MD));
  });
  assert.ok(hasFinding(findings, 'router-agent-missing', ROUTER_MD));
});

// ------------------------------------------------------------------ C18b

test('C18b passes on an unmutated checkout', (t) => {
  assert.deepEqual(findingsFor(t, 'C18b'), []);
});

test('router agent losing a required kernel fact is caught', (t) => {
  const findings = findingsFor(t, 'C18b', (root) => {
    editFile(root, ROUTER_MD, (text) => text.split('kernel.sh resolve --facts').join('kernel.sh resolv --facts'));
  });
  assert.ok(hasFinding(findings, 'kernel-fact-missing', 'resolve-call'));
});

// ------------------------------------------------------------------ C18c

test('C18c passes on an unmutated checkout', (t) => {
  assert.deepEqual(findingsFor(t, 'C18c'), []);
});

test('router agent gaining Write is caught', (t) => {
  const findings = findingsFor(t, 'C18c', (root) => {
    editFile(root, ROUTER_MD, (text) =>
      text.replace(/^tools: Read, Grep, Glob, Bash$/m, 'tools: Read, Grep, Glob, Bash, Write'),
    );
  });
  assert.ok(hasFinding(findings, 'forbidden-tool', 'Write'));
});

test('router agent losing Bash is caught', (t) => {
  const findings = findingsFor(t, 'C18c', (root) => {
    editFile(root, ROUTER_MD, (text) => text.replace(/^tools: Read, Grep, Glob, Bash$/m, 'tools: Read, Grep, Glob'));
  });
  assert.ok(hasFinding(findings, 'bash-tool-missing', 'Bash'));
});

// ------------------------------------------------------------------ C18d

test('C18d passes on an unmutated checkout', (t) => {
  assert.deepEqual(findingsFor(t, 'C18d'), []);
});

test('a self-referencing suppressed_by is caught', (t) => {
  const findings = findingsFor(t, 'C18d', (root) => {
    editJson(root, INTENTS, (document) => {
      rowById(rowsAt(document, 'intents'), 'route-planning')['suppressed_by'] = ['route-planning'];
    });
  });
  assert.ok(hasFinding(findings, 'suppressed-by-self', 'route-planning'));
});

test('a suppressed_by naming no intent is caught', (t) => {
  const findings = findingsFor(t, 'C18d', (root) => {
    editJson(root, INTENTS, (document) => {
      rowById(rowsAt(document, 'intents'), 'route-planning')['suppressed_by'] = ['ghost-intent'];
    });
  });
  assert.ok(hasFinding(findings, 'suppressed-by-unknown-intent', 'ghost-intent'));
});

test('a two-cycle in suppressed_by is caught', (t) => {
  const findings = findingsFor(t, 'C18d', (root) => {
    editJson(root, INTENTS, (document) => {
      rowById(rowsAt(document, 'intents'), 'ios-release')['suppressed_by'] = ['mobile'];
    });
  });
  assert.ok(hasFinding(findings, 'suppression-cycle', 'mobile'));
  assert.ok(hasFinding(findings, 'suppression-cycle', 'ios-release'));
});

test('every intent being suppressible is caught', (t) => {
  const findings = findingsFor(t, 'C18d', (root) => {
    editJson(root, INTENTS, (document) => {
      for (const row of rowsAt(document, 'intents')) row['suppressible'] = true;
    });
  });
  assert.ok(hasFinding(findings, 'all-intents-suppressible'));
});

test('no intent requiring a dispatch plan is caught', (t) => {
  const findings = findingsFor(t, 'C18d', (root) => {
    editJson(root, INTENTS, (document) => {
      for (const row of rowsAt(document, 'intents')) delete row['requires_dispatch_plan'];
    });
  });
  assert.ok(hasFinding(findings, 'no-dispatch-plan-intent'));
});

// The typed loader coerces this to false, so only a check reading the raw
// document can see it at all.
test('a non-boolean suppressible is caught', (t) => {
  const findings = findingsFor(t, 'C18d', (root) => {
    editJson(root, INTENTS, (document) => {
      rowById(rowsAt(document, 'intents'), 'new-feature')['suppressible'] = 'yes';
    });
  });
  assert.ok(hasFinding(findings, 'non-boolean-flag', 'new-feature'));
});

// ------------------------------------------------------------------ C18e

test('C18e passes on an unmutated checkout', (t) => {
  assert.deepEqual(findingsFor(t, 'C18e'), []);
});

test('a flipped router fixture expectation is caught', (t) => {
  const findings = findingsFor(t, 'C18e', (root) => {
    editJson(root, POLICY, (document) => {
      const fixture = fixtureAt(document, 0);
      fixture['escalate'] = fixture['escalate'] !== true;
    });
  });
  assert.ok(hasFinding(findings, 'fixture-escalate-mismatch', '0'));
});

test('a router fixture declaring the wrong escalation reasons is caught', (t) => {
  const findings = findingsFor(t, 'C18e', (root) => {
    editJson(root, POLICY, (document) => {
      fixtureAt(document, 0)['reasons'] = ['unrouted-scale'];
    });
  });
  assert.ok(hasFinding(findings, 'fixture-reasons-mismatch', '0'));
});

// The assertion that told correct non-escalation from a router resolving
// nothing at all: a fixture matching zero intents used to pass on escalate and
// reasons alone.
test('a router fixture declaring the wrong intents is caught', (t) => {
  const findings = findingsFor(t, 'C18e', (root) => {
    editJson(root, POLICY, (document) => {
      fixtureAt(document, 0)['intents'] = ['llm'];
    });
  });
  assert.ok(hasFinding(findings, 'fixture-intents-mismatch', '0'));
});

// ------------------------------------------------------------------ C18f

test('C18f passes on an unmutated checkout', (t) => {
  assert.deepEqual(findingsFor(t, 'C18f'), []);
});

test('prompt-advisor.sh removed from hooks.json is caught', (t) => {
  const findings = findingsFor(t, 'C18f', (root) => {
    editJson(root, 'hooks/hooks.json', (document) => {
      for (const entry of rowsAt(recordAt(document, 'hooks'), 'UserPromptSubmit')) {
        entry['hooks'] = rowsAt(entry, 'hooks').filter(
          (hook) => typeof hook['command'] !== 'string' || !hook['command'].includes('prompt-advisor'),
        );
      }
    });
  });
  assert.ok(hasFinding(findings, 'registration-not-single-adapter', 'hooks/hooks.json'));
});

test('the resolve-task call renamed out of src/hooks/prompt-advisor.ts is caught', (t) => {
  const findings = findingsFor(t, 'C18f', (root) => {
    editFile(root, 'src/hooks/prompt-advisor.ts', (text) => text.split('resolve-task').join('resolve-later'));
  });
  assert.ok(hasFinding(findings, 'resolve-task-call-missing', 'src/hooks/prompt-advisor.ts'));
});

// The mode bit matters because a consumer who copied the old hooks.json entry
// still executes the shim by path.
test('hooks/prompt-advisor.sh losing its executable bit is caught', (t) => {
  const findings = findingsFor(t, 'C18f', (root) => {
    chmodSync(join(root, 'hooks/prompt-advisor.sh'), 0o644);
  });
  assert.ok(hasFinding(findings, 'adapter-not-executable', 'hooks/prompt-advisor.sh'));
});

// hook-target-missing: a hooks.json row whose script, or whose loader's
// runtime bundle, is not in the tree fails every event it is registered on.

const PLUGIN_ROOT_TOKEN = '${CLAUDE_PLUGIN_ROOT}';

// Rewrites the stop-verify registration to run `node "<root>/<script>" hook stop-verify`.
function pointStopVerifyAt(root: string, script: string): void {
  editJson(root, 'hooks/hooks.json', (document) => {
    let rewritten = 0;
    for (const entry of rowsAt(recordAt(document, 'hooks'), 'Stop')) {
      for (const hook of rowsAt(entry, 'hooks')) {
        if (typeof hook['command'] === 'string' && hook['command'].endsWith(' hook stop-verify')) {
          hook['command'] = `node "${PLUGIN_ROOT_TOKEN}/${script}" hook stop-verify`;
          rewritten += 1;
        }
      }
    }
    if (rewritten === 0) throw new Error('hooks.json registers no stop-verify command to rewrite');
  });
}

test('a hooks.json command naming a script that does not exist is caught', (t) => {
  const findings = findingsFor(t, 'C18f', (root) => {
    pointStopVerifyAt(root, 'dist/engineos-gone.cjs');
  });
  assert.ok(hasFinding(findings, 'hook-target-missing', 'dist/engineos-gone.cjs'));
});

test('a committed loader whose runtime bundle is missing is caught', (t) => {
  const findings = findingsFor(t, 'C18f', (root) => {
    rmSync(join(root, 'dist/runtime/engineos-hot.cjs'));
  });
  assert.ok(hasFinding(findings, 'hook-target-missing', 'dist/runtime/engineos-hot.cjs'));
  // The loader itself is present, so only the bundle behind it is reported.
  assert.ok(!hasFinding(findings, 'hook-target-missing', 'dist/engineos-hot.cjs'));
});

test('a hooks.json script path that climbs out of the plugin root is caught even when the file exists', (t) => {
  const findings = findingsFor(t, 'C18f', (root) => {
    pointStopVerifyAt(root, 'dist/../dist/engineos.cjs');
  });
  assert.ok(hasFinding(findings, 'hook-target-missing', 'dist/../dist/engineos.cjs'));
});

test('a hooks.json script path carrying a backslash is caught', (t) => {
  const findings = findingsFor(t, 'C18f', (root) => {
    pointStopVerifyAt(root, 'dist\\engineos.cjs');
  });
  assert.ok(hasFinding(findings, 'hook-target-missing', 'dist\\engineos.cjs'));
});

// ------------------------------------------------------------------ C18g

test('C18g passes on an unmutated checkout', (t) => {
  assert.deepEqual(findingsFor(t, 'C18g'), []);
});

test('a substantive prompt losing the policy bundle is caught', (t) => {
  const findings = findingsFor(t, 'C18g', (root) => {
    editJson(root, POLICY, (document) => {
      recordAt(recordAt(document, 'parallelism'), 'prompt_signals')['substantive_action'] = '\\bneverfires\\b';
    });
  });
  assert.ok(hasFinding(findings, 'policy-closure-drift', 'verification'));
});

test('a pure question gaining the policy bundle is caught', (t) => {
  const findings = findingsFor(t, 'C18g', (root) => {
    editJson(root, POLICY, (document) => {
      recordAt(recordAt(document, 'parallelism'), 'prompt_signals')['substantive_action'] = '\\b(update|weather)\\b';
    });
  });
  assert.ok(hasFinding(findings, 'pure-question-not-lean', '5'));
});

// ------------------------------------------------------------------ coverage

// A declared code no case can produce is either a dead branch or an untested
// one, and both read as coverage from the outside.
test('every declared code of the family is produced by a case in this file', () => {
  const unproduced: string[] = [];
  for (const check of KERNEL_CHECKS) {
    for (const code of check.codes) {
      if (!produced.has(`${check.id}:${code}`)) unproduced.push(`${check.id}:${code}`);
    }
  }
  assert.deepEqual(unproduced, []);
});
