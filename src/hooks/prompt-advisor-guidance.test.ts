import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from '../kernel';
import { lazyRegistries, type KernelContext } from '../kernel/context';
import type { JevFact, JudgeFact } from '../judge';
import { resolveRoot } from '../registry/paths';
import { guidanceLookups, guidanceNotes, judgeNote, type JudgeNoteInput, type RouterView, type TaskAnswer } from './prompt-advisor-guidance';

const root = resolveRoot({}, __dirname);
const kernel: KernelContext = { root, registries: lazyRegistries(root) };

// ------------------------------------------------------------------ judgeNote

function jevFact(overrides: Partial<JevFact> = {}): JevFact {
  return {
    source: 'jev',
    model: 'jev-1.13.0',
    latency_ms: 120,
    is_project_change: 0.9,
    primary: { id: 'backend', confidence: 0.8, margin: 0.3 },
    intents: { dba: 0.55, backend: 0.8, frontend: 0.2 },
    rules: { destructive: 0.7, large_change: 0.4, public_contract: 0.9 },
    scale: 1,
    design_work: 0.1,
    risk: { reversibility: 0, blast_radius: 0, data_sensitivity: 0, contract_surface: 0, spend: 0 },
    ...overrides,
  };
}

function noteInput(fact: JudgeFact | null, overrides: Partial<JudgeNoteInput> = {}): JudgeNoteInput {
  return {
    mode: 'advisory',
    fact,
    intentThreshold: 0.5,
    ruleThreshold: 0.5,
    ruleOf: { destructive: 'rule-destructive-ddl', public_contract: 'rule-public-contract' },
    riskProposal: 'medium',
    ...overrides,
  };
}

test('shadow mode says nothing, whatever the judge answered', () => {
  assert.deepEqual(judgeNote(noteInput(jevFact(), { mode: 'shadow' })), []);
  assert.deepEqual(judgeNote(noteInput({ source: 'fallback', reason: 'timeout' }, { mode: 'shadow' })), []);
});

test('a judge that could not be consulted at all says nothing', () => {
  assert.deepEqual(judgeNote(noteInput(null)), []);
});

test('a judge that was never switched on says nothing', () => {
  assert.deepEqual(judgeNote(noteInput({ source: 'fallback', reason: 'disabled' })), []);
});

test('a switched-on judge that could not answer says so, naming the reason', () => {
  assert.deepEqual(judgeNote(noteInput({ source: 'fallback', reason: 'network' })), [
    '[engineos] judge (fallback, network): no model judgment for this prompt — the contract above is deterministic only.',
  ]);
});

test('a jev answer ranks intents and flags rules above their thresholds, highest first, as rule ids', () => {
  assert.deepEqual(judgeNote(noteInput(jevFact())), [
    '[engineos] judge (jev, jev-1.13.0): ranked=backend:0.80,dba:0.55 flags=rule-public-contract:0.90,rule-destructive-ddl:0.70 risk_proposal=medium — model judgment, not a gate',
  ]);
});

test('a probability exactly at the threshold qualifies', () => {
  const [line] = judgeNote(noteInput(jevFact({ intents: { backend: 0.5 }, rules: {} })));
  assert.match(line ?? '', /ranked=backend:0\.50 flags=- /);
});

test('a rule question no rule declares is shown by its own name', () => {
  const [line] = judgeNote(noteInput(jevFact({ intents: {}, rules: { mystery: 0.6 } })));
  assert.match(line ?? '', /ranked=- flags=mystery:0\.60 /);
});

test('no risk proposal renders as a dash', () => {
  const [line] = judgeNote(noteInput(jevFact(), { riskProposal: null }));
  assert.match(line ?? '', /risk_proposal=- — model judgment, not a gate$/);
});

test('authoritative mode speaks the same line as advisory', () => {
  assert.deepEqual(judgeNote(noteInput(jevFact(), { mode: 'authoritative' })), judgeNote(noteInput(jevFact())));
});

// ------------------------------------------------------------------ guidanceNotes: the tie-break field

function taskFor(prompt: string): TaskAnswer {
  const answer = resolve({ prompt, taskContract: true }, kernel);
  const { route, decision_rules: decisions, task_contract: contract } = answer;
  if (route === undefined || !('escalate' in route) || decisions === undefined || contract === undefined) {
    throw new Error(`no task contract for: ${prompt}`);
  }
  return { route, decisions, contract, hitl: answer.hitl ?? null, router: null };
}

function contractLine(task: TaskAnswer): string {
  const line = guidanceNotes(task, guidanceLookups(kernel.registries)).find((note) => note.startsWith('[engineos] task contract'));
  if (line === undefined) throw new Error('no task contract line');
  return line;
}

test('a tie-break winner is named on the contract line, after the autonomy ceiling', () => {
  const task = taskFor('add a component for the user avatar');
  const line = contractLine({ ...task, contract: { ...task.contract, tiebreak: 'frontend' } });
  assert.match(line, /autonomy_ceiling_at_floor=\S+ tiebreak=frontend — load these before acting/);
});

test('without a tie-break winner the contract line carries no tiebreak field', () => {
  const task = taskFor('add a component for the user avatar');
  const line = contractLine({ ...task, contract: { ...task.contract, tiebreak: null } });
  assert.ok(!line.includes('tiebreak='), line);
});

// ------------------------------------------------------------------ guidanceNotes: the routing decision layer

const lookups = guidanceLookups(kernel.registries);

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

test('a fallback is always said out loud, naming the mode that took over', () => {
  const llmView: RouterView = { mode: 'llm', confidence: null, fallback: { requested: 'jev', reason: 'timeout' }, escalation: null };
  const llmNotes = guidanceNotes({ ...taskFor(RESOLVED), router: llmView }, lookups);
  assert.ok(llmNotes.includes('[engineos] router: llm (jev unavailable: timeout)'), llmNotes.join('\n'));
  const view: RouterView = { ...KEYWORD, fallback: { requested: 'jev', reason: 'no-key' } };
  const notes = guidanceNotes({ ...taskFor(RESOLVED), router: view }, lookups);
  assert.ok(notes.includes('[engineos] router: keyword (jev unavailable: no-key)'), notes.join('\n'));
});

test('an undecided request is handed to the router agent with its candidates', () => {
  const view: RouterView = { mode: 'llm', confidence: null, fallback: null, escalation: { reason: 'generic-only', candidates: ['backend-python', 'new-feature'] } };
  const notes = guidanceNotes({ ...taskFor(RESOLVED), router: view }, lookups);
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
  const notes = guidanceNotes({ ...taskFor(RESOLVED), router: view }, lookups);
  assert.ok(notes.some((note) => note.includes('(no-match)') && note.includes('before any write: -.')));
});

test('the residue line is left out when the kernel already escalated, the fallback is not', () => {
  const view: RouterView = { mode: 'keyword', confidence: null, fallback: { requested: 'jev', reason: 'timeout' }, escalation: { reason: 'tie', candidates: ['backend'] } };
  const task = taskFor(ESCALATED);
  assert.equal(task.route.escalate, true);
  const notes = guidanceNotes({ ...task, router: view }, lookups);
  assert.ok(notes.some((note) => note.startsWith('[engineos] route escalation')));
  assert.ok(!notes.some((note) => note.includes('could not decide')));
  assert.ok(notes.includes('[engineos] router: keyword (jev unavailable: timeout)'));
});
