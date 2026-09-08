import { KernelError } from '../lib/json';
import type { PromptSignals } from '../registry/policy';
import type { Registries } from './context';

// Big-task / spec-authoring / design-work classification of a prompt
// (cmd_scale). The expressions live in registries/policy.json
// .parallelism.prompt_signals; this module only applies them, and the typed
// policy loader has already refused a file without that block — the bash arm's
// "policy.json has no parallelism.prompt_signals block" guard moved one layer
// out, to the loader that reads the field.

export interface ScaleFacts {
  prompt: string;
}

// cmd_scale's key order: big_task, spec_authoring, design_work.
export interface ScaleSection {
  big_task: boolean;
  spec_authoring: boolean;
  design_work: boolean;
}

export function scaleSection(facts: ScaleFacts, regs: Registries): ScaleSection {
  const signals = regs.policy.parallelism.prompt_signals;
  const compiled = compiledSignals(signals);
  const lower = asciiDowncase(facts.prompt);
  // A scale or a weak design word only counts beside an action verb: "the
  // button design looks good" is not design work, and the bash arm bound the
  // same `$action` once for both questions.
  const action = compiled.action.test(lower);
  return {
    big_task: action && compiled.scale.test(lower),
    spec_authoring: compiled.spec.test(lower),
    design_work: compiled.designStrong.test(lower) || (action && compiled.designWeak.test(lower)),
  };
}

// jq's ascii_downcase lowercases A-Z and nothing else. String.toLowerCase()
// also folds non-ASCII (U+212A KELVIN SIGN becomes "k"), which would match an
// ASCII-only signal the bash kernel never matched. Exported so the decision-rules
// arm lowercases identically instead of keeping a second definition.
export function asciiDowncase(prompt: string): string {
  return prompt.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
}

// Registry regexes are EREs. Every construct the shipped registries use —
// alternation, `\b`, `\w`, bounded `.{0,40}` — has the same meaning in a JS
// RegExp, and the 'i' flag is redundant against an already-lowercased prompt
// while making an uppercase signal behave the way a reader expects. A pattern
// that will not compile is a KernelError: the bash kernel's jq raised on it,
// and silently never matching is how a gate disappears.
export function compilePromptRegex(source: string, describe: string): RegExp {
  try {
    return new RegExp(source, 'i');
  } catch {
    throw new KernelError(`${describe} is not a valid regex: ${source}`);
  }
}

interface CompiledSignals {
  action: RegExp;
  scale: RegExp;
  spec: RegExp;
  designStrong: RegExp;
  designWeak: RegExp;
}

// Keyed on the signals object, which the memoised policy loader hands out once
// per root, so the five expressions compile once rather than per prompt.
const cache = new WeakMap<PromptSignals, CompiledSignals>();

function compiledSignals(signals: PromptSignals): CompiledSignals {
  const cached = cache.get(signals);
  if (cached !== undefined) return cached;
  const at = 'registries/policy.json: .parallelism.prompt_signals';
  const compiled: CompiledSignals = {
    action: compilePromptRegex(signals.action, `${at}.action`),
    scale: compilePromptRegex(signals.scale, `${at}.scale`),
    spec: compilePromptRegex(signals.spec, `${at}.spec`),
    designStrong: compilePromptRegex(signals.design_strong, `${at}.design_strong`),
    designWeak: compilePromptRegex(signals.design_weak, `${at}.design_weak`),
  };
  cache.set(signals, compiled);
  return compiled;
}
