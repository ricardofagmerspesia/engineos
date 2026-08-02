# Handoff — <unit or wave name>

> Written at a wave barrier (`rules/parallelism.md` step 6), at a session
> boundary, or whenever work passes to someone who cannot read this conversation.
>
> **The test:** could the next executor resume from this file alone, with no
> access to the chat history? If not, it is not a handoff. "Continue where you
> left off" is not a handoff.

## Objective

<the original goal, restated — not the last thing that happened>

## State

<where the work actually stands right now, in one paragraph. Include what is
half-finished, not just what is finished.>

Gate: <discovery | design | implementation | validation | release> — <criteria met> of <criteria total> per `rules/gates.md`
Risk: <low | medium | high> — <the trigger> (per `rules/risk-autonomy.md`)

## Done

- <completed item — with the evidence that it is done>

## Decisions

- <decision> — <why, and what was rejected>

## Files

| File | What changed and why |
|---|---|
| `path/to/file.ts` | <reason> |

## Evidence

```
<actual command output — not "tests pass">
```

## Known failures and open risks

- <what is broken, flaky, or unverified. An empty section here is a claim; make
  sure it is true.>

## Not done

- [ ] <remaining item — and who or what it is blocked on>

## Next step

<the single next action, concretely. Not "continue the implementation".>

## Resume

```bash
# exact commands to get back to a working state
git checkout <branch>
<install / build / test commands>
```
