# Pinned legacy journal CLIs

Frozen copies of the bash CLIs that `src/journal/` and `src/telemetry/` were
ported from. Each has a differential parity suite that runs the pinned bash and
the TypeScript port over the same arguments and asserts the same behaviour, so a
red case always means "the port disagrees with the CLI we ported" and never
"someone moved the target".

Both need `bash` and `jq` on the machine running the suite; each suite skips
rather than fails when either is missing.

## exec-journal.sh

Byte copy of `scripts/exec-journal.sh` as it stood immediately before plan
Task 14 replaced it with a shim over `dist/engineos.cjs`. It is the last real
bash implementation of the execution-journal schema, and `src/journal/parity.test.ts`
is what keeps the port honest against it.

### What the parity suite asserts

| Surface | Asserted |
|---|---|
| `append` | The same **line bytes** in the journal file, and the same exit code |
| `append` refusals | The same exit code, and that neither side wrote anything |
| `validate` | The same exit code and the same stdout/stderr text, per forged-line class |

Line bytes, not a parsed object: a journal line is the contract two consumers
join on, so key order, number rendering and string escaping are all part of the
answer. Getting U+007F right (jq escapes it, `JSON.stringify` does not) was a
real port bug this suite caught.

The one thing deliberately **not** compared is the usage block. The port renders
it from the field table rather than restating it as a string, so its wording
differs on purpose; `src/journal/cli.test.ts` asserts the port's own text, and
the exit code of every path that reaches usage is still a parity case.

### How the harness points it at a registry set

The pinned CLI derives its own root from where the file sits
(`EJ_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"`) and never reads
`ENGINEOS_ROOT`. A copy sitting here would resolve its root to `test/fixtures/`
and find no registries. So the suite stages it into a fresh temp directory per
test as `<tmp>/scripts/exec-journal.sh` alongside `<tmp>/registries/`, and hands
the TypeScript side `ENGINEOS_ROOT=<tmp>` — one root, one set of registry bytes,
two implementations.

### The registries are copied live, not snapshotted

Unlike `legacy-kernel/`, this fixture stores **no** `registries/` of its own: the
suite copies the checkout's. The kernel fixture needs a snapshot because
`routing.json` dropped two derived fields the pinned bash still reads directly.
Nothing equivalent applies here — the journal CLI reads only four values
(`registries/models.json` tier ids, and `telemetry.exec_journal`'s `span_kinds`,
`statuses` and `max_value_length` from `registries/policy.json`), the port reads
the same four, and both must answer from whatever the repo carries today. A
vocabulary extended in the registry should move both sides together; pinning it
here would instead turn a correct port red.

### Refreshing

Don't. `scripts/exec-journal.sh` is a shim now, so there is nothing to copy from
and this file is frozen for good. If a behaviour here is genuinely wrong, the fix
is a change to `src/journal/` plus a deliberate, argued-for edit to this fixture
in the same PR — never a silent refresh, which moves the target the port is
measured against.

### Lifetime

Deleted together with the bash shim at 2.0, along with `src/journal/parity.test.ts`.

## telemetry.sh

A byte copy of `scripts/telemetry.sh` as it stood before plan Task 15 replaced it
with a shim over `dist/engineos.cjs`. `src/journal/telemetry-parity.test.ts` runs
this copy and the TypeScript port over the same argv and the same registries, and
asserts the same exit code, the same stdout, the same stderr for `validate`, and,
for `append`, the same bytes in the file.

It is pinned rather than tracked: the harness must compare the port against a CLI
that cannot drift under it, so a red parity case always means "the port disagrees
with the CLI we ported" and never "someone moved the target".

**Staging.** The pinned CLI derives its own root from where it sits
(`DIR="$(cd "$(dirname "$0")/.." && pwd)"`) and never reads `ENGINEOS_ROOT`; the
live shim is what exports that now. So the harness stages a fresh temp root per
test as `<tmp>/scripts/telemetry.sh` + `<tmp>/registries/policy.json` (copied from
the live registry) and spawns the staged path; the TypeScript side is handed
`ENGINEOS_ROOT=<tmp>`. One root, one set of registry bytes, two implementations.

**Refreshing.** Only the registry side is refreshable: `scripts/telemetry.sh` is
no longer copyable, so this file is the last real bash implementation and stays
frozen. The harness reads `registries/policy.json` from the checkout at stage
time, so a registry change needs no copy here; a new event in
`.telemetry.events` grows the parity case list on its own.

**Needs.** `bash` and `jq` on the machine running the suite; the parity test skips
rather than fails when either is missing. Deleted together with the bash shim at
2.0, along with `src/journal/telemetry-parity.test.ts`.
