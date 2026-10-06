# Activity context

Goal: give each routed worker the smallest complete context for its assigned task.

1. The supervisor resolves intent and paths, applies always-on policy, and loads
   the matched routing row's closed rule/skill set.
2. Each worker receives its role, goal, acceptance criteria, exclusive paths,
   relevant source references, frozen contracts, dependencies, risk/autonomy,
   current branch/PR and return format. Use fresh task context when supported;
   carry binding policy explicitly rather than replay unrelated conversation.
3. Load the activity entrypoint first. Follow conditional references only for
   branches needed by the task. Keep security, approval and completion conditions.
4. Search the Markdown map by activity or filename; load only matching source
   sections. The map is a discovery aid, never an always-on instruction import.
5. Historical records, fixtures, vendored skills and IDE mirrors retain their
   evidence. Their summaries locate sources; they do not supersede current rules.

The supervisor refills useful worker slots, integrates changes on the current
branch/PR, and performs final non-test validation. Test/eval authoring and execution
still require explicit current-task user approval after integration.

Authoritative workflow: [routing](../../CLAUDE.md),
[context rules](../../rules/context.md),
[worker rules](../../rules/subagents.md),
[parallelism](../../rules/parallelism.md).

Search the [file-purpose map](markdown-map.md) for any of the 777 files reviewed
at task start. The [inventory](markdown-inventory.json) records each disposition,
review depth and before/after measurements. Historical/vendor entries received
purpose/structure or canonical-equivalence review, not line-by-line revalidation.

Active guidance across rules, skills, patterns, roles, commands, templates and
root entrypoints fell from 87,759 to about 67,000 whitespace-separated words
(about 24%). These are word counts, not measured model tokens or a speed benchmark.
The optional map adds discovery material; it does not enter default task context.
