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
The deterministic resolver that turns declared task facts and policy into a
route, risk tier, autonomy ceiling, required gates, and retry decision.
_Avoid_: Router, orchestrator

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
