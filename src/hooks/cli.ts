// The full hook table behind `engineos hook <name>` on dist/engineos.cjs. The
// adapter itself — decode the envelope, run the hook, render its decision —
// lives in ./adapter, shared with the per-call bundle (src/hot-cli.ts). A hook
// body never sees stdin, never writes stdout and never picks an exit code, so
// the hooks are functions of (envelope, context) and their tests deepEqual a
// HookDecision instead of parsing JSON.
import type { MaybeAsyncCommand } from '../dispatch';
import { runHookWith, type HookTable } from './adapter';
import { run as ensureProjectLayout } from './ensure-project-layout';
import { run as markUnrecorded } from './mark-unrecorded';
import { run as recordVerify } from './record-verify';
import { run as routeBeforeChange } from './route-before-change';
import { run as promptAdvisor } from './prompt-advisor';
import { run as announceAgentDispatch } from './announce-agent-dispatch';
import { run as announceAgentReturn } from './announce-agent-return';
import { run as stopVerify } from './stop-verify';
import { run as postEditCheck } from './post-edit-check';
import { run as gitWriteGuard } from './git-write-guard';

// Keys are the names hooks.json registers (`engineos hook <name>`) and the shim
// file names under hooks/. Adding a hook is one import and one row.
export const HOOKS: HookTable = {
  'ensure-project-layout': ensureProjectLayout,
  'mark-unrecorded': markUnrecorded,
  'record-verify': recordVerify,
  'route-before-change': routeBeforeChange,
  'prompt-advisor': promptAdvisor,
  'announce-agent-dispatch': announceAgentDispatch,
  'announce-agent-return': announceAgentReturn,
  'stop-verify': stopVerify,
  'post-edit-check': postEditCheck,
  'git-write-guard': gitWriteGuard,
};

export const runHook: MaybeAsyncCommand = runHookWith(HOOKS);
