# EngineOS

EngineOS is a risk-proportional operating method for AI-assisted engineering.
Its language separates policy, execution, evidence, and tool-specific enforcement.

## Language

**Task**:
A bounded engineering objective with a testable outcome and one current owner.
_Avoid_: Job, ticket, request

**Task contract**:
The minimum information needed to govern a task: objective, scope, risk,
required gates, verification, evidence, and current state.
_Avoid_: Prompt, plan, checklist

**Route**:
The selected domain guidance and capabilities for a task or file.
_Avoid_: Classification, dispatch

**Decision kernel**:
The deterministic resolver that turns declared facts and policy into a
route, risk tier, autonomy ceiling, required gates, and retry decision.
_Avoid_: Router, orchestrator

**Declared facts**:
The caller-supplied inputs the decision kernel resolves over — a prompt, a
file path, risk signals, work type, units to schedule. What is not declared is
not resolved.
_Avoid_: Args, flags, input, parameters

**Projection**:
A public kernel entry point that answers with one part of the decision kernel's
full answer, named and shaped as callers already expect it.
_Avoid_: Subcommand, wrapper, alias

**Rule**:
A durable constraint on engineering behavior.
_Avoid_: Guideline, best practice

**Skill**:
A reusable procedure for completing a class of task.
_Avoid_: Rule, agent

**Agent**:
A scoped executor or reviewer with a declared capability and return contract.
_Avoid_: Skill, role

**Gate**:
Named exit criteria that must be satisfied before a task advances to a later
state.
_Avoid_: Phase, check

**Check**:
A concrete observation used as evidence for a gate, such as command output or a
review verdict.
_Avoid_: Gate, proof

**Evidence**:
Source-attributed observations supporting a task state or gate decision.
_Avoid_: Assertion, confidence

**Span**:
One recorded unit of execution inside a session's trace — a router decision,
an agent dispatch, a tool or model call, a verification gate — with who ran,
how long, and what outcome.
_Avoid_: Event, log line, entry, record

**Change record**:
The durable account of a completed task, including scope, decisions, evidence,
and residual risk.
_Avoid_: Changelog, handoff

**Handoff**:
The continuity contract for unfinished work crossing an executor, wave, or
session seam.
_Avoid_: Change record, summary

**Adapter**:
The mapping from the EngineOS method to a tool's actual instruction and
enforcement capabilities.
_Avoid_: Integration, port

**Hook envelope**:
The decoded facts a tool hook receives from the harness for one event — working
directory, session, prompt, file, tool, transcript.
_Avoid_: Payload, input JSON, stdin

**Hook decision**:
What a hook hands back to the harness for one event — silence, context to
inject, a block with its reason, a message to show, or a failure.
_Avoid_: Output, response, exit code, payload

**Runner**:
The tool that executes a project's verification targets, such as lint,
typecheck, and tests — Nx or a package-manager script runner.
_Avoid_: Build tool, task runner, toolchain

**Mirror**:
A passage in a rule, constitution, template, or skill that must name or quote
what a registry declares, kept equal by a check.
_Avoid_: Copy, duplicate, sync, prose check
