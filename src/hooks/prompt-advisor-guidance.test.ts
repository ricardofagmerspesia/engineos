import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from '../kernel';
import { lazyRegistries } from '../kernel/context';
import { resolveRoot } from '../registry/paths';
import { guidanceNotes, type RouterView, type TaskAnswer } from './prompt-advisor-guidance';

const checkout = resolveRoot({}, __dirname);

// A real kernel answer, so the lines asserted here sit in the payload exactly
// where a session reads them.
function taskFor(prompt: string): TaskAnswer {
  const answer = resolve({ prompt, taskContract: true }, { root: checkout, registries: lazyRegistries(checkout) });
  const { route, decision_rules: decisions, task_contract: contract } = answer;
  if (route === undefined || !('escalate' in route) || decisions === undefined || contract === undefined) {
    throw new Error('the kernel answered no task contract');
  }
  return { route, decisions, contract, hitl: answer.hitl ?? null, router: null };
}

function contractLine(task: TaskAnswer): string {
  const line = guidanceNotes(task).find((note) => note.startsWith('[engineos] task contract'));
  if (line === undefined) throw new Error('no contract line');
  return line;
}

const RESOLVED = 'add a component for the user avatar';
const ESCALATED = 'add a paginated orders endpoint to the API and mirror the screen to mobile';

const KEYWORD: RouterView = { mode: 'keyword', confidence: null, fallback: null, escalation: null };

test('without a decision the contract line is unchanged', () => {
  const line = contractLine(taskFor(RESOLVED));
  assert.ok(line.endsWith('No router dispatch needed.'));
  assert.ok(!line.includes(' router='));
  assert.ok(!line.includes(' rebound='));
});

test('the contract line names the mode, with the confidence when one was measured', () => {
  const task = taskFor(RESOLVED);
  assert.match(contractLine({ ...task, router: KEYWORD }), / router=keyword — load these/);
  assert.match(contractLine({ ...task, router: { ...KEYWORD, mode: 'jev', confidence: 0.876 } }), / router=jev\/0\.88 — load these/);
});

test('every rebind is named with its evidence level and scope', () => {
  const task = taskFor(RESOLVED);
  const rebound: TaskAnswer = {
    ...task,
    router: KEYWORD,
    route: {
      ...task.route,
      rebound: [
        { from: 'backend', to: 'backend-python', reason: 'framework', scope: 'package' },
        { from: 'x', to: 'y', reason: 'language', scope: 'repo' },
      ],
    },
  };
  assert.match(contractLine(rebound), / router=keyword rebound=backend->backend-python\(framework\/package\),x->y\(language\/repo\) — load these/);
});

test('a fallback is always said out loud', () => {
  const view: RouterView = { ...KEYWORD, fallback: { requested: 'jev', reason: 'no-key' } };
  const notes = guidanceNotes({ ...taskFor(RESOLVED), router: view });
  assert.ok(notes.includes('[engineos] router: keyword (jev unavailable: no-key)'), notes.join('\n'));
});

test('an undecided request is handed to the router agent with its candidates', () => {
  const view: RouterView = { mode: 'llm', confidence: null, fallback: null, escalation: { reason: 'generic-only', candidates: ['backend-python', 'new-feature'] } };
  const notes = guidanceNotes({ ...taskFor(RESOLVED), router: view });
  assert.ok(
    notes.includes(
      '[engineos] router: llm could not decide (generic-only) — dispatch the router agent (agents/router.md, model opus) via the Task tool with the request text, the repository languages/frameworks and these candidates before any write: backend-python,new-feature. A hook cannot dispatch an agent — you must invoke it.',
    ),
    notes.join('\n'),
  );
  assert.ok(notes.some((note) => note.startsWith('[engineos] task contract') && note.endsWith('Router dispatch needed — see the router line below.')));
  assert.ok(!notes.some((note) => note.includes('No router dispatch needed')));
  // After the contract line: the session reads what to load, then who decides.
  const contractAt = notes.findIndex((note) => note.startsWith('[engineos] task contract'));
  const routerAt = notes.findIndex((note) => note.startsWith('[engineos] router: llm'));
  assert.ok(contractAt >= 0 && routerAt > contractAt);
});

test('no candidates read as a dash', () => {
  const view: RouterView = { mode: 'llm', confidence: null, fallback: null, escalation: { reason: 'no-match', candidates: [] } };
  const notes = guidanceNotes({ ...taskFor(RESOLVED), router: view });
  assert.ok(notes.some((note) => note.includes('(no-match)') && note.includes('before any write: -.')));
});

test('the residue line is left out when the kernel already escalated, the fallback is not', () => {
  const view: RouterView = { mode: 'keyword', confidence: null, fallback: { requested: 'jev', reason: 'timeout' }, escalation: { reason: 'tie', candidates: ['backend'] } };
  const task = taskFor(ESCALATED);
  assert.equal(task.route.escalate, true);
  const notes = guidanceNotes({ ...task, router: view });
  assert.ok(notes.some((note) => note.startsWith('[engineos] route escalation')));
  assert.ok(!notes.some((note) => note.includes('could not decide')));
  assert.ok(notes.includes('[engineos] router: keyword (jev unavailable: timeout)'));
});
