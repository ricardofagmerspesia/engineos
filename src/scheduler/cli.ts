import type { Io } from '../io';
import { lazyRegistries } from '../kernel/context';
import { KernelError } from '../lib/json';
import { resolveRoot } from '../registry/paths';
import type { SchedulerState } from '../workflow/contracts';
import { schedulerEvents } from './events';
import { appendUnits, sealPlanning } from './incremental';
import { writeSchedulerError, writeSchedulerOutput } from './output';
import { actions, applyEvent, initialState } from './state';
import { requireCount, requireText, validateEvent, validateState, validateUnits } from './validation';

export function runScheduler(argv: string[], io: Io): number {
  let stream = false;
  try {
    let commandIndex = 0;
    while (argv[commandIndex] === '--stream') {
      if (stream) throw new KernelError('scheduler invalid or duplicate flag');
      stream = true;
      commandIndex++;
    }
    const command = argv[commandIndex];
    const args = argv.slice(commandIndex + 1);
    const allowed = command === 'plan' ? ['--units', '--run-id', '--host-capacity', '--time-ms']
      : command === 'step' ? ['--state', '--event']
      : command === 'append' ? ['--state', '--units', '--revision', '--time-ms']
      : command === 'seal' ? ['--state', '--revision', '--time-ms'] : [];
    const flags = new Map<string, string>();
    let planningOpen = false;
    let invalidFlags = false;
    for (let index = 0; index < args.length;) {
      const flag = args[index];
      if (flag === '--stream') {
        if (stream) invalidFlags = true;
        stream = true;
        index++;
        continue;
      }
      if (flag === '--planning-open') {
        if (command !== 'plan' || planningOpen) invalidFlags = true;
        planningOpen = true;
        index++;
        continue;
      }
      const value = args[index + 1];
      if (value === '--stream' || value === '--planning-open') {
        invalidFlags = true;
        index++;
        continue;
      }
      if (flag === undefined || value === undefined || !allowed.includes(flag) || flags.has(flag)) invalidFlags = true;
      else flags.set(flag, value);
      index += 2;
    }
    if (command !== 'plan' && command !== 'step' && command !== 'append' && command !== 'seal') throw new KernelError('scheduler requires plan, step, append or seal');
    if (invalidFlags) throw new KernelError('scheduler invalid or duplicate flag');
    const regs = lazyRegistries(resolveRoot(io.env));
    if (command === 'plan') {
      const units = parseJson(flags.get('--units'));
      validateUnits(units);
      const runId = flags.get('--run-id');
      requireText(runId, 'run id');
      const hostCapacity = numberFlag(flags.get('--host-capacity'));
      const timestampMs = flags.has('--time-ms') ? numberFlag(flags.get('--time-ms')) : Date.now();
      const options = {units, runId, hostCapacity, timestampMs};
      const state = initialState(planningOpen ? {...options, planningOpen: true} : options, regs);
      writeSchedulerOutput({io, stream, result: {state, actions: actions(state, regs), events: schedulerEvents(null, state, null), enforcement: 'conventional'}});
    } else if (command === 'step') {
      const before = parseJson(flags.get('--state'));
      const event = parseJson(flags.get('--event'));
      validateState(before, regs);
      validateEvent(event);
      const state = applyEvent(before, event, regs);
      writeSchedulerOutput({io, stream, result: {state, actions: actions(state, regs), events: schedulerEvents(before, state, event), enforcement: 'conventional'}});
    } else {
      const before = parseJson(flags.get('--state'));
      validateState(before, regs);
      const revision = numberFlag(flags.get('--revision'));
      const timestampMs = numberFlag(flags.get('--time-ms'));
      let state: SchedulerState;
      if (command === 'append') {
        const units = parseJson(flags.get('--units'));
        validateUnits(units, false, before.units.map(unit => unit.id));
        state = appendUnits(before, {units, revision, timestampMs}, regs);
      } else state = sealPlanning(before, {revision, timestampMs}, regs);
      writeSchedulerOutput({io, stream, result: {state, actions: actions(state, regs), events: schedulerEvents(before, state, null), enforcement: 'conventional'}});
    }
    return 0;
  } catch (error) {
    if (!(error instanceof KernelError)) throw error;
    writeSchedulerError({io, stream, error: error.message});
    return 1;
  }
}

function parseJson(value: string | undefined): unknown {
  if (value === undefined || value.length > 2_000_000) throw new KernelError('scheduler missing or oversized JSON');
  try { return JSON.parse(value); } catch { throw new KernelError('scheduler invalid JSON'); }
}

function numberFlag(value: string | undefined): number {
  if (value === undefined || !/^\d+$/.test(value)) throw new KernelError('scheduler requires numeric flag');
  const number = Number(value);
  requireCount(number, 'numeric flag');
  return number;
}
