import { writeJson, type Io } from '../io';
import { KernelError } from '../lib/json';
import { resolveRoot } from '../registry/paths';
import { lazyRegistries, type KernelContext } from './context';
import { resolve } from './resolve';

type Sub = (ctx: KernelContext, args: string[]) => unknown;

// bash bound "--prompt" to $1 and discarded the real argument, so route-intent
// answered about the literal string "--prompt". A resolver returning a confident
// wrong answer is worse than one that refuses; the three messages are the bash
// ones, verbatim.
export function requirePositional(cmd: string, what: string, args: string[]): string {
  const first = args[0];
  if (first === undefined || first === '') throw new KernelError(`${cmd} requires ${what}`);
  if (first.startsWith('-')) throw new KernelError(`${cmd} takes ${what} as a positional argument, not a flag (got ${first})`);
  if (args.length !== 1) throw new KernelError(`${cmd} takes exactly one argument, got ${args.length}`);
  return first;
}

export function parseFlags(cmd: string, args: string[], allowed: readonly string[]): Map<string, string> {
  const out = new Map<string, string>();
  const rest = [...args];
  for (;;) {
    const flag = rest.shift();
    if (flag === undefined) break;
    if (!allowed.includes(flag)) throw new KernelError(`${cmd}: unknown flag ${flag}`);
    const value = rest.shift();
    if (value === undefined) throw new KernelError(`${cmd}: ${flag} requires a value`);
    out.set(flag, value);
  }
  return out;
}

// Projection table: each arm parses its flags into DeclaredFacts, calls resolve
// once, and emits its section with the legacy key order. Tasks 9-12 add the rest.
const SUBCOMMANDS: Record<string, Sub> = {
  'route-path': (ctx, args) => routePathSection(ctx, requirePositional('route-path', 'a file path', args)),
  'route-intent': (ctx, args) => routeIntentSection(ctx, requirePositional('route-intent', 'the request text', args)),
};

export function runKernel(argv: string[], io: Io): number {
  const [name, ...args] = argv;
  try {
    const sub = name === undefined ? undefined : SUBCOMMANDS[name];
    if (sub === undefined) throw new KernelError(`unknown subcommand: ${name ?? ''}`);
    const root = resolveRoot(io.env);
    const ctx: KernelContext = { root, registries: lazyRegistries(root) };
    writeJson(io, sub(ctx, args));
    return 0;
  } catch (e) {
    if (e instanceof KernelError) {
      writeJson(io, { error: e.message });
      return 1;
    }
    throw e;
  }
}

function routePathSection(ctx: KernelContext, file: string): unknown {
  const section = resolve({ path: file }, ctx).route;
  // resolve answers a section for every fact it accepts; an absent one here
  // would mean the projection declared a fact the kernel does not read.
  if (section === undefined) throw new KernelError('route-path: the kernel answered no route section');
  return section;
}

function routeIntentSection(ctx: KernelContext, text: string): unknown {
  const section = resolve({ prompt: text }, ctx).route;
  if (section === undefined) throw new KernelError('route-intent: the kernel answered no route section');
  return section;
}
