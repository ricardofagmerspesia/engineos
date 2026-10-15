import { resolve } from 'node:path';
import type { Command } from '../dispatch';
import { writeJson } from '../io';
import { loadWorkflowEvents, parseWorkflowText, WorkflowInputError } from '../journal/workflow';
import { reportWorkflow } from './workflow';

export const runWorkflowReport: Command = (argv, io): number => {
  try {
    if (argv.length !== 0 && (argv.length !== 2 || argv[0] !== '--file' || !argv[1])) {
      throw new WorkflowInputError('usage: engineos workflow-report [--file <local-jsonl>]');
    }
    const file = argv[1];
    const events = file === undefined ? parseWorkflowText(io.readStdin()) : loadWorkflowEvents(resolve(io.cwd(), file));
    writeJson(io, reportWorkflow(events));
    return 0;
  } catch (error) {
    if (!(error instanceof WorkflowInputError)) throw error;
    writeJson(io, { error: error.message });
    return 1;
  }
};
