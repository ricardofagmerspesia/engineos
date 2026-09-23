import { loadModels, type ModelsRegistry } from '../registry/models';
import { loadPolicy, type PolicyRegistry } from '../registry/policy';
import { loadExecJournalPolicy, type ExecJournalPolicy } from '../registry/policy-exec-journal';

// The exec-journal span schema, declared ONCE.
//
// scripts/exec-journal.sh spelled it seven times — a usage comment, usage(),
// EJ_SCHEMA_FIELDS, the flag ladder, the guard block, the jq emit and the jq
// validate — plus its enums twice more, and a family of sed-parsing Checks
// existed to prove the copies agreed. Everything below the table derives from
// the table: the flag parser accepts exactly these flags, the guard runs each
// row's class, the emitter writes the rows in order with each row's JSON type,
// validate checks the same rows with the same classes, and usage() renders one
// line from them. No other file in src/ names a journal field.

export type Guard = 'slug' | 'enum' | 'int' | 'bool' | 'free';
export type JsonType = 'string' | 'number' | 'boolean';
// `always` = emitted as null when unset, which is what a v1 line did for agent
// and note. `optional` = the key never appears at all when unset, so a v1 line
// carries no v2 key and stays byte-identical forever.
export type Presence = 'required' | 'optional' | 'always';

export type FieldName =
  | 'timestamp' | 'run_id' | 'capability_id' | 'agent' | 'model_tier' | 'status'
  | 'tokens_in' | 'tokens_out' | 'duration_ms' | 'note'
  | 'trace_id' | 'span_id' | 'parent_span_id' | 'span_kind' | 'tool' | 'provider'
  | 'model' | 'cost_micros' | 'retry_attempt' | 'cache_hit' | 'route' | 'risk';

export type SpanFields = Partial<Record<FieldName, string | number | boolean>>;

// The registries a row's `values` reads. The plan's frozen signature named the
// kernel's `Registries`, which carries no `.telemetry.exec_journal` block; the
// span-kind and status vocabularies live exactly there, so the journal declares
// its own context rather than widening the kernel's (see the task's Deviation 1).
export interface JournalRegistries {
  readonly models: ModelsRegistry;
  readonly policy: PolicyRegistry;
  readonly execJournal: ExecJournalPolicy;
}

export interface FieldSpec {
  name: FieldName;
  flag: string;
  guard: Guard;
  json: JsonType;
  presence: Presence;
  values?: (regs: JournalRegistries) => readonly string[];
}

// Same no-whitespace class as registries/policy.json telemetry.value_pattern.
// Anchored with a plain `$`: JavaScript's `$` without the `m` flag matches only
// at the true end of the string, which is what Oniguruma needed `\z` for, so a
// trailing newline is rejected here as it was there. Adding `m` would reopen
// the newline channel this class exists to close.
export const SLUG_RE = /^[A-Za-z0-9@_./:-]+$/;

// Not a vocabulary with a registry home: these are JSON's two boolean
// spellings, which is what the bash `in_list "$cache_hit_val" "true false"`
// checked. Every other enum row reads its members from a registry.
const JSON_BOOLEANS: readonly string[] = ['true', 'false'];

const modelTiers = (regs: JournalRegistries): readonly string[] => regs.models.tiers.map((tier) => tier.id);
const spanKinds = (regs: JournalRegistries): readonly string[] => regs.execJournal.span_kinds;
const statuses = (regs: JournalRegistries): readonly string[] => regs.execJournal.statuses;
// The kernel's own risk vocabulary. policy.autonomy.ceiling_by_risk is a
// tier-keyed map built in low/medium/high order by the policy loader, so its
// keys are the tiers in the order the bash VALID_RISKS constant listed them.
const riskTiers = (regs: JournalRegistries): readonly string[] => Object.keys(regs.policy.autonomy.ceiling_by_risk);

// Row order IS emit order, so a v1 append writes the same bytes it always did.
export const EXEC_JOURNAL_FIELDS: readonly FieldSpec[] = [
  { name: 'timestamp', flag: '--timestamp', guard: 'slug', json: 'string', presence: 'required' },
  { name: 'run_id', flag: '--run-id', guard: 'slug', json: 'string', presence: 'required' },
  { name: 'capability_id', flag: '--capability-id', guard: 'slug', json: 'string', presence: 'required' },
  { name: 'agent', flag: '--agent', guard: 'slug', json: 'string', presence: 'always' },
  { name: 'model_tier', flag: '--model-tier', guard: 'enum', json: 'string', presence: 'required', values: modelTiers },
  { name: 'status', flag: '--status', guard: 'enum', json: 'string', presence: 'required', values: statuses },
  { name: 'tokens_in', flag: '--tokens-in', guard: 'int', json: 'number', presence: 'always' },
  { name: 'tokens_out', flag: '--tokens-out', guard: 'int', json: 'number', presence: 'always' },
  { name: 'duration_ms', flag: '--duration-ms', guard: 'int', json: 'number', presence: 'required' },
  { name: 'note', flag: '--note', guard: 'free', json: 'string', presence: 'always' },
  { name: 'trace_id', flag: '--trace-id', guard: 'slug', json: 'string', presence: 'optional' },
  { name: 'span_id', flag: '--span-id', guard: 'slug', json: 'string', presence: 'optional' },
  { name: 'parent_span_id', flag: '--parent-span-id', guard: 'slug', json: 'string', presence: 'optional' },
  { name: 'span_kind', flag: '--span-kind', guard: 'enum', json: 'string', presence: 'optional', values: spanKinds },
  { name: 'tool', flag: '--tool', guard: 'slug', json: 'string', presence: 'optional' },
  { name: 'provider', flag: '--provider', guard: 'slug', json: 'string', presence: 'optional' },
  { name: 'model', flag: '--model', guard: 'slug', json: 'string', presence: 'optional' },
  { name: 'cost_micros', flag: '--cost-micros', guard: 'int', json: 'number', presence: 'optional' },
  { name: 'retry_attempt', flag: '--retry-attempt', guard: 'int', json: 'number', presence: 'optional' },
  { name: 'cache_hit', flag: '--cache-hit', guard: 'enum', json: 'boolean', presence: 'optional', values: () => JSON_BOOLEANS },
  { name: 'route', flag: '--route', guard: 'slug', json: 'string', presence: 'optional' },
  { name: 'risk', flag: '--risk', guard: 'enum', json: 'string', presence: 'optional', values: riskTiers },
];

// Lazy for the same reason the kernel's context is: the append arm reads
// models.json and policy.json, and a caller that only asked for usage() must
// not be refused because a registry is malformed.
export function journalRegistries(root: string): JournalRegistries {
  const models = memo(() => loadModels(root));
  const policy = memo(() => loadPolicy(root));
  const execJournal = memo(() => loadExecJournalPolicy(root));
  return {
    get models(): ModelsRegistry { return models(); },
    get policy(): PolicyRegistry { return policy(); },
    get execJournal(): ExecJournalPolicy { return execJournal(); },
  };
}

function memo<T>(make: () => T): () => T {
  let cell: { value: T } | null = null;
  return (): T => {
    if (cell === null) cell = { value: make() };
    return cell.value;
  };
}
