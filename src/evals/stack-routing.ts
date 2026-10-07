// Stack-tagged intent cases (routing-decision-layer contracts §5, design §6):
// the deterministic tier's guard on the keyword floor's stack rebind.
//
// A case MAY carry `stack`: a list of packages, each `<language>` or
// `<language>:<framework>` — `["python"]`, `["python:fastapi", "node:react"]`.
// Such a case is routed through the real kernel — `resolve({prompt,
// taskContract})`, the same call the prompt advisor makes — with a throwaway
// project holding one directory per entry and only that package's manifest
// (naming the framework as a dependency when one is given), so the kernel
// resolves exactly the packages the case declares. It passes when every `expect_intents` id survives and no
// surviving intent belongs to a stack the case does not have. An untagged case
// is never routed here: the rest of the set grades conformance only, as it
// always has.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { lazyRegistries, type KernelContext } from '../kernel/context';
import { resolve, type Answer, type DeclaredFacts } from '../kernel/resolve';
import { KernelError, isRecord, readJsonFile } from '../lib/json';
import { FRAMEWORK_LANGUAGE, LANGUAGES, isFramework, isLanguage, type Framework, type Language } from '../registry/project-config';
import type { Grader } from './deterministic';

// One package of a tagged case: a language, and the framework its manifest
// names, or null for a framework-less package.
export interface CasePackage {
  language: Language;
  framework: NonNullable<Framework> | null;
}

// The intents that survived routing for one prompt under one stack.
export type StackRouter = (prompt: string, packages: readonly CasePackage[]) => string[];

export interface StackRouterHandle {
  route: StackRouter;
  dispose(): void;
}

export type StackRouterFactory = (root: string) => StackRouterHandle;

type Resolver = (facts: DeclaredFacts, ctx: KernelContext) => Answer;

export type CaseStack =
  | { kind: 'untagged' }
  | { kind: 'tagged'; languages: Language[]; packages: CasePackage[] }
  | { kind: 'malformed' };

// The dependency name src/kernel/stack.ts reads each framework from.
const FRAMEWORK_DEPENDENCY: Readonly<Record<NonNullable<Framework>, string>> = {
  fastapi: 'fastapi',
  django: 'django',
  flask: 'flask',
  nestjs: '@nestjs/core',
  next: 'next',
  'react-native': 'react-native',
  react: 'react',
};

// The least each manifest parser accepts, plus the framework as a dependency
// when the entry names one.
function manifestFor(pkg: CasePackage): { file: string; text: string } {
  const dep = pkg.framework === null ? null : FRAMEWORK_DEPENDENCY[pkg.framework];
  if (pkg.language === 'python') {
    const deps = dep === null ? '' : `dependencies = ["${dep}"]\n`;
    return { file: 'pyproject.toml', text: `[project]\nname = "engineos-eval"\n${deps}` };
  }
  const body = dep === null ? { name: 'engineos-eval' } : { name: 'engineos-eval', dependencies: { [dep]: '*' } };
  return { file: 'package.json', text: `${JSON.stringify(body)}\n` };
}

export function parseCaseStack(value: unknown): CaseStack {
  if (value === undefined) return { kind: 'untagged' };
  if (!Array.isArray(value) || value.length === 0) return { kind: 'malformed' };
  const entries: unknown[] = value;
  const packages: CasePackage[] = [];
  for (const entry of entries) {
    const pkg = parseEntry(entry);
    if (pkg === null) return { kind: 'malformed' };
    packages.push(pkg);
  }
  const keys = packages.map((pkg) => `${pkg.language}:${pkg.framework ?? ''}`);
  if (new Set(keys).size !== keys.length) return { kind: 'malformed' };
  const languages = LANGUAGES.filter((language) => packages.some((pkg) => pkg.language === language));
  return { kind: 'tagged', languages, packages };
}

function parseEntry(entry: unknown): CasePackage | null {
  if (typeof entry !== 'string') return null;
  const [language, framework, extra] = entry.split(':');
  if (extra !== undefined || !isLanguage(language)) return null;
  if (framework === undefined) return { language, framework: null };
  if (!isFramework(framework) || FRAMEWORK_LANGUAGE[framework] !== language) return null;
  return { language, framework };
}

// The registries come from the EngineOS root being graded; only ctx.project
// varies, because the stack is the one input resolve derives from the caller's
// repository. One temp project per distinct stack, created on first use and
// removed by dispose(), so a set of fifty cases builds at most three directories.
export function kernelStackRouter(engineosRoot: string, resolver: Resolver = resolve): StackRouterHandle {
  const registries = lazyRegistries(engineosRoot);
  const roots = new Map<string, string>();

  // One directory per package, so two node packages (a NestJS api and a React
  // frontend) are two packages to the kernel, exactly as in a real monorepo.
  function projectFor(packages: readonly CasePackage[]): string {
    const key = packages.map((pkg) => `${pkg.language}:${pkg.framework ?? ''}`).sort().join('+');
    const existing = roots.get(key);
    if (existing !== undefined) return existing;
    const dir = mkdtempSync(join(tmpdir(), 'engineos-eval-stack-'));
    packages.forEach((pkg, i) => {
      const pkgDir = join(dir, `pkg${i}`);
      mkdirSync(pkgDir);
      const manifest = manifestFor(pkg);
      writeFileSync(join(pkgDir, manifest.file), manifest.text);
    });
    roots.set(key, dir);
    return dir;
  }

  return {
    route(prompt: string, packages: readonly CasePackage[]): string[] {
      const ctx: KernelContext = { root: engineosRoot, registries, project: projectFor(packages) };
      const answer = resolver({ prompt, taskContract: true }, ctx);
      return answer.task_contract?.intents ?? [];
    },
    dispose(): void {
      for (const dir of roots.values()) rmSync(dir, { recursive: true, force: true });
      roots.clear();
    },
  };
}

// Prints nothing when no case carries `stack`, so a set without stack tags
// grades exactly as it did before the field existed.
export function gradeStackRouting(
  root: string,
  cases: readonly unknown[],
  g: Grader,
  makeRouter: StackRouterFactory = kernelStackRouter,
): void {
  const tagged = cases.filter((value) => isRecord(value) && value['stack'] !== undefined);
  if (tagged.length === 0) return;

  const malformed: string[] = [];
  const valid: { id: string; input: string; expect: string[]; languages: Language[]; packages: CasePackage[] }[] = [];
  for (const value of tagged) {
    const record = isRecord(value) ? value : {};
    const id = stringField(record, 'id') || '<no-id>';
    const stack = parseCaseStack(record['stack']);
    if (stack.kind !== 'tagged') {
      malformed.push(id);
      continue;
    }
    valid.push({ id, input: stringField(record, 'input'), expect: stringsField(record, 'expect_intents'), languages: stack.languages, packages: stack.packages });
  }
  if (malformed.length === 0) g.ok(`every stack field lists ${LANGUAGES.join('/')} packages, optionally :framework, each at most once`);
  else g.bad(`cases with a malformed stack field: ${malformed.join(' ')}`);

  const stacks = intentStacks(root);
  const misrouted: string[] = [];
  const router = makeRouter(root);
  try {
    for (const item of valid) {
      const problem = routingProblem(item, router.route, stacks);
      if (problem !== null) misrouted.push(`${item.id}(${problem})`);
    }
  } finally {
    router.dispose();
  }
  if (misrouted.length === 0) g.ok(`every stack-tagged case routes to its expect_intents under its stack (${valid.length} cases)`);
  else g.bad(`stack-tagged cases misrouted: ${misrouted.join(' ')}`);
}

function routingProblem(
  item: { input: string; expect: string[]; languages: Language[]; packages: CasePackage[] },
  route: StackRouter,
  stacks: ReadonlyMap<string, Language>,
): string | null {
  let intents: string[];
  try {
    intents = route(item.input, item.packages);
  } catch (e) {
    if (e instanceof KernelError) return `kernel refused: ${e.message}`;
    throw e;
  }
  const missing = item.expect.filter((id) => !intents.includes(id));
  const foreign = intents.filter((id) => {
    const stack = stacks.get(id);
    return stack !== undefined && !item.languages.includes(stack);
  });
  if (missing.length === 0 && foreign.length === 0) return null;
  const parts: string[] = [];
  if (missing.length > 0) parts.push(`missing ${missing.join(',')}`);
  if (foreign.length > 0) parts.push(`foreign-stack ${foreign.join(',')}`);
  parts.push(`got ${intents.length > 0 ? intents.join(',') : 'none'}`);
  return parts.join('; ');
}

// registries/intents.json read RAW, the way ./deterministic reads routing.json's
// risk floors: the grader asks only which stack a row declares, and a row
// without one is stack-neutral and can never be foreign.
function intentStacks(root: string): Map<string, Language> {
  const stacks = new Map<string, Language>();
  let raw: unknown;
  try {
    raw = readJsonFile(join(root, 'registries', 'intents.json'));
  } catch {
    return stacks;
  }
  const rows = isRecord(raw) && Array.isArray(raw['intents']) ? raw['intents'] : [];
  for (const row of rows.filter(isRecord)) {
    const id = row['id'];
    const stack = row['stack'];
    if (typeof id === 'string' && isLanguage(stack)) stacks.set(id, stack);
  }
  return stacks;
}

function stringField(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === 'string' ? value : '';
}

function stringsField(record: Record<string, unknown>, key: string): string[] {
  const value = record[key];
  if (!Array.isArray(value)) return [];
  const entries: unknown[] = value;
  return entries.filter((entry): entry is string => typeof entry === 'string');
}
