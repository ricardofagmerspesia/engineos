import { writeJson, type Io } from '../io';
import type { SchedulerAction, SchedulerState, WorkflowEvent } from '../workflow/contracts';

interface SchedulerOutput {
  state: SchedulerState;
  actions: SchedulerAction[];
  events: WorkflowEvent[];
  enforcement: 'conventional';
}

export function writeSchedulerOutput(options: {io: Io; stream: boolean; result: SchedulerOutput}): void {
  const {io, stream, result} = options;
  if (!stream) {
    writeJson(io, result);
    return;
  }
  // Transport tags keep snapshots out of the strict workflow-event journal.
  for (const event of result.events) io.out(`${JSON.stringify({type: 'event', event})}\n`);
  io.out(`${JSON.stringify({type: 'snapshot', state: result.state, actions: result.actions, enforcement: result.enforcement})}\n`);
}

export function writeSchedulerError(options: {io: Io; stream: boolean; error: string}): void {
  const {io, stream, error} = options;
  if (stream) io.out(`${JSON.stringify({type: 'error', error})}\n`);
  else writeJson(io, {error});
}
