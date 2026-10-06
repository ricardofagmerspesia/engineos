# Handoff — <unit or wave name>

> Write at dependency/contract integration (rules/parallelism.md step 6), session
> boundary or transfer to an executor without chat history. It must enable resume
> from this file alone. All ## headings and Gate:/Risk: lines are registry contract
> (handoff intent; validator C19): change only with the registry in the same commit.

## Objective

<the original goal, restated — not the last thing that happened>

## State

<where the work actually stands right now, in one paragraph. Include what is
half-finished, not just what is finished.>

<task id, ledger state, owner, prerequisite ids and affected descendants. Distinguish
implementation returned from integrated; list ready units that can refill free slots.>

Gate: <discovery | design | implementation | validation | release> — <criteria met> of <criteria total> per `rules/gates.md`
Risk: <low | medium | high> — <the trigger> (per `rules/risk-autonomy.md`)

## Done

- <completed item — with the evidence that it is done>

## Decisions

- <decision> — <why, and what was rejected>
- <consumed contract path@revision and contract owner; proposed drift, frozen delta
  and rebrief status for affected consumers, if any>

## Files

| File | What changed and why |
|---|---|
| `path/to/file.ts` | <reason> |

<exclusive write scopes and their owners; name the single owner of shared wiring,
lockfiles and generated outputs, and any ownership transfer required to resume.>

## Evidence

```
<actual command output — not "tests pass">
```

<read-only diff/contract inspection evidence; final non-test check results when
available. Record tests/evals as pending approval or cite the current-task approval
and final execution results. Worker return alone is not validation evidence.>

## Known failures and open risks

- <what is broken, flaky, or unverified. An empty section here is a claim; make
  sure it is true.>

## Not done

- [ ] <remaining item — and who or what it is blocked on>
- [ ] <integration, contract reconciliation or final validation still required>

## Next step

<the single next action, concretely. Not "continue the implementation".>

<which task can become ready, the prerequisite/revision that releases it, and
whether its consumer must be rebriefed before dispatch.>

## Resume

```bash
# exact commands to get back to a working state
git checkout <branch>
<required resume commands, within existing permissions>
```

<resume from the ledger and frozen contracts above. Run build/type checks only
at the final validation gate; test/eval commands require explicit current-task
approval after integration. Commands shown here do not grant execution permission.>
