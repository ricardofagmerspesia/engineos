// Wording of the Jev question set. The registries decide WHICH questions are
// asked and in what order (src/judge/questions.ts); this file holds only HOW
// each one is phrased, because neither intents.json nor decision-rules.json
// carries question prose. Changing any string here is a prompt change: it needs
// a regenerated docs/specs/2026-10-10-jev-shadow-request.json and fresh shadow
// eval evidence (ADR docs/adr/2026-10-10-three-tier-router-and-jev-judge.md).
//
// Phrasing follows the TypeSafe guidance recorded in the routing plan: each
// Noul tests one condition, Score levels describe situations rather than
// numbers, and every question points at state through `request.text`.
import type { Description, NoulQuestion, RiskLevels, ScoreQuestion } from './types';

export const PRIMARY_INTENT_INSTRUCTIONS: Readonly<{ question: string; focus: string }> = {
  question: 'Which kind of work does `request.text` mainly ask the assistant to do?',
  focus: 'Judge what the user wants done, not which topics the text mentions.',
};

export const INTENT_QUESTION = 'Does `request.text` ask the assistant to do this kind of `work`?';

export const OTHER_OPTION = 'other';

// Keyed by intents.json id. An active registry intent without an entry here is
// a configuration error (questions.ts refuses it), never a silent omission.
export const INTENT_WORK: Readonly<Record<string, Description>> = {
  'new-feature': {
    what: 'Build new behavior or a new capability in a project, such as a feature, module, endpoint, screen or integration spanning several files',
    not_for: 'Plans, evaluations or decisions about how to build something without building it yet; restructuring that keeps behavior; fixing broken behavior',
  },
  'big-sweep': {
    what: 'Apply one change across many places or domains, such as a migration, backfill, rename or upgrade across all modules, services or files',
    not_for: 'A change confined to one module or feature',
  },
  bug: {
    what: 'Investigate or fix something that is broken, failing, erroring or behaving unexpectedly',
    not_for: 'Adding behavior that never existed',
  },
  backend: {
    what: 'Server-side application code: NestJS modules, controllers, services, API endpoints, queues or workers',
    not_for: 'Database schema or migrations alone; LLM agent logic; Claude Code tooling or the EngineOS framework itself',
  },
  frontend: {
    what: 'Web user interface: React or Next.js components, pages, styling, client state or forms',
    not_for: 'React Native mobile screens',
  },
  mobile: {
    what: 'React Native mobile app work: screens, navigation, native modules, or mirroring a web feature to mobile',
    not_for: 'Building, signing or publishing the app to an app store',
  },
  'ios-release': {
    what: 'Build, sign or publish the iOS app to TestFlight or the Apple App Store',
    not_for: 'Android or Google Play releases',
  },
  'android-release': {
    what: 'Build, sign or publish the Android app to Google Play',
    not_for: 'iOS or Apple App Store releases',
  },
  llm: {
    what: 'Build or change an LLM-powered product feature: a chatbot, prompts, retrieval, embeddings, model tool schemas, evals or Mastra agents inside an application',
    not_for: 'Designing how several product agents coordinate; Claude Code subagents, hooks, skills or mods that help the developer work; the EngineOS framework\'s own agents',
  },
  'agent-system': {
    what: 'Design the topology of a product system in which several AI agents cooperate: a supervisor, handoffs or orchestration between agents',
    not_for: 'A single chatbot or agent; Claude Code development subagents',
  },
  dba: 'Database layer work: SQL, schema design, migrations, indexes or query performance',
  devops: 'Infrastructure and delivery: CI/CD pipelines, GitHub workflows, Docker, Kubernetes, Helm, Terraform or cloud resources',
  'security-files': 'Change authentication, authorization, guards, middleware, secrets, credentials or environment-file handling',
  'system-comprehension': {
    what: 'Write documentation that explains how an existing system works, for onboarding or architecture understanding',
    not_for: 'Finding defects or health problems',
  },
  'interview-gaps': 'Have the assistant interview the user with questions to fill gaps in system documentation',
  'qa-endpoints': {
    what: 'Run end-to-end QA across all API endpoints of an integrated system, for example a Postman or Newman run',
    not_for: 'Writing unit or integration tests for specific code',
  },
  audit: {
    what: 'Run a read-only health check across a system or several domains to find what is broken or risky',
    not_for: 'Reviewing one diff or pull request; writing onboarding documentation',
  },
  refactor: 'Restructure or clean up existing code without changing its behavior: simplify, remove technical debt or rename',
  adr: {
    what: 'Choose between technical options or decide how to structure something, and record the decision; includes planning or evaluating an architectural change before building it',
    not_for: 'Business, career or market decisions',
  },
  'release-notes': 'Write release notes or document what changed in a version',
  strategy: {
    what: 'Business, market, career, positioning or monetization strategy',
    not_for: 'Choosing between technical options',
  },
  review: {
    what: 'Review a diff, branch or pull request before merging, or judge whether a specific change is safe',
    not_for: 'A system-wide audit',
  },
  'test-writing': 'Write or add automated tests or test coverage for specific code',
  'eval-setup': 'Set up evaluations or a golden set for an LLM feature',
  'critic-verification': 'Independently challenge whether completed high-risk work is actually correct',
  handoff: 'Hand work over to another agent, wave or session with a written account of progress',
  retro: {
    what: 'Run a retrospective over past work to propose improvements to rules, skills or registries',
    not_for: 'Logging a single observation',
  },
  'task-observer': {
    what: 'Log one observation about friction with a rule or skill noticed during work',
    not_for: 'Running a full retrospective',
  },
  'record-change': {
    what: 'Write or close the change record that describes work already done',
    not_for: 'Confirming that the work is correct',
  },
  'verify-done': {
    what: 'Confirm that work is done, shipped or ready to archive, with evidence',
    not_for: 'Writing the change record',
  },
  'route-planning': 'Ask which agents should handle a request or how to split it into a dispatch plan',
};

export const OTHER_WORK: Description = {
  what: 'None of the listed kinds of work: a general question, or work outside these categories, such as configuring Claude Code itself (hooks, settings, mods or the status line)',
  not_for: 'Requests that fit one of the listed kinds of work',
};

export const IS_PROJECT_CHANGE_QUESTION: Readonly<NoulQuestion> = {
  type: 'noul',
  instructions: 'Does `request.text` ask the assistant to change files in a project, such as code, configuration, documentation or design files?',
  criteria: {
    true: 'Asks for something to be built, edited, written or removed in the project',
    false: 'Only asks for an explanation, an answer, an opinion or advice',
  },
};

export const DESIGN_WORK_QUESTION: Readonly<NoulQuestion> = {
  type: 'noul',
  instructions: 'Does `request.text` ask for design work, such as an architecture, an interface or contract, a data model or a plan, before implementation?',
};

// Keyed by decision-rules.json `judge_fact` (contracts §6.3).
export const FACT_QUESTIONS: Readonly<Record<string, NoulQuestion>> = {
  large_change: {
    type: 'noul',
    instructions: 'Does `request.text` ask to rewrite, overhaul or re-architect a large part of a system?',
  },
  affects_public_contract: {
    type: 'noul',
    instructions: 'Would the work in `request.text` change a public or published API, a database schema, an event payload or another contract that external consumers depend on?',
  },
  handles_sensitive_data: {
    type: 'noul',
    instructions: 'Does the work in `request.text` involve personal data, payment data, health data, credentials, or data protected by privacy law such as LGPD or GDPR?',
  },
  production_write: {
    type: 'noul',
    instructions: 'Does `request.text` ask for an action that directly changes a production environment, such as deploying, releasing or writing to live systems?',
  },
  destructive_ddl_or_dml: {
    type: 'noul',
    instructions: 'Does the work in `request.text` involve deleting data or dropping or truncating database tables, columns, indexes or schemas?',
  },
  secret_reached_git_or_shared_file: {
    type: 'noul',
    instructions: 'Does `request.text` report that a secret, API key, token, password or credential was committed, pushed, leaked or exposed?',
  },
  knowledge_changes_frequently: {
    type: 'noul',
    instructions: 'Does the work in `request.text` involve retrieval-augmented generation, embeddings or fine-tuning?',
  },
  retrieval_over_shared_corpus: {
    type: 'noul',
    instructions: 'Does the work in `request.text` involve retrieving documents from a corpus shared by several users or tenants?',
  },
  multi_agent_system: {
    type: 'noul',
    instructions: 'Does `request.text` ask to design or build a product system in which more than one AI agent cooperates?',
    criteria: {
      true: 'A product with several cooperating agents, such as a supervisor with workers or agents handing off to each other',
      false: 'A single agent or chatbot, or Claude Code subagents that the developer uses while working',
    },
  },
};

export const SCALE_QUESTION: Readonly<ScoreQuestion> = {
  type: 'score',
  instructions: 'How widely does the work in `request.text` spread across the project?',
  criteria: [
    'A single focused change or question in one place',
    'Several related changes within one area or domain',
    'Changes spanning several domains, or the same change repeated across many modules, services or files',
  ],
};

// Order is the wire order and the JevFact `risk` key order.
export const RISK_QUESTIONS: ReadonlyArray<readonly [keyof RiskLevels, ScoreQuestion]> = [
  ['reversibility', {
    type: 'score',
    instructions: 'If the work in `request.text` is carried out, how hard is it to undo?',
    criteria: [
      'Trivially undone, for example by reverting a commit',
      'Can be undone, but only with real effort',
      'Irreversible, or reversible only with data loss',
    ],
  }],
  ['blast_radius', {
    type: 'score',
    instructions: 'If the work in `request.text` is carried out, how far do its effects reach?',
    criteria: [
      'Confined to one module and the local machine',
      'Affects a whole service or one team\'s surface',
      'Reaches production, other teams or external consumers',
    ],
  }],
  ['data_sensitivity', {
    type: 'score',
    instructions: 'What kind of data does the work in `request.text` touch?',
    criteria: [
      'No real data',
      'Internal business data',
      'Personal, credential, financial or clinical data',
    ],
  }],
  ['contract_surface', {
    type: 'score',
    instructions: 'Which interfaces does the work in `request.text` change?',
    criteria: [
      'Only private internals',
      'An internal module interface',
      'A public or published API, a database schema or an event payload',
    ],
  }],
  ['spend', {
    type: 'score',
    instructions: 'What money does the work in `request.text` commit?',
    criteria: [
      'A negligible cost',
      'A bounded, known cost',
      'An unbounded cost, or a commitment of real money',
    ],
  }],
];
