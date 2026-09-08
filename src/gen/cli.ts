// `engineos gen <target>` — the code generators the scripts/gen-*.sh shims call.
//
// Both targets resolve their own root through resolveRoot rather than an argument:
// each shim exports ENGINEOS_ROOT from where it sits, so a relocated copy of the
// repo generates into its own agents/ and commands/ instead of whichever checkout
// the runtime happens to live in.
import type { Command } from '../dispatch';
import type { Io } from '../io';
import { resolveRoot } from '../registry/paths';
import { generateAgentCommands } from './agent-commands';
import { generateAgentRegistry } from './agent-registry';

const EXIT_USAGE = 1;

const USAGE = 'usage: engineos gen agent-commands|agent-registry';

export const runGen: Command = (argv: string[], io: Io): number => {
  switch (argv[0]) {
    case 'agent-commands':
      return generateAgentCommands(resolveRoot(io.env), io);
    case 'agent-registry':
      return generateAgentRegistry(resolveRoot(io.env), io);
    default:
      io.err(`${USAGE}\n`);
      return EXIT_USAGE;
  }
};
