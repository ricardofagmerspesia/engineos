---
name: pr
description: "Prepare an EngineOS pull request description and evidence; perform forge writes only under the current Git authorization."
---

# Reviewable pull request

`rules/git.md` owns branch/PR preservation and Git/forge authorization. This skill
supplies no approval to create, push, merge or mark a PR ready.

1. Inspect the current branch/PR and scoped diff. Keep unrelated changes outside
   the described scope. If no PR exists, prepare the description first; do not
   automatically create a branch or PR.
2. Lead with the concrete problem and resulting behavior. Give a before/after
   example or visual only where it improves assessment. Link the governing spec
   and relevant ADR rather than duplicating design history.
3. Attach actual revision-bound validation evidence, pending checks and residual
   risks. State compatibility changes, blast radius and concrete rollback. Report
   large diffs and generated-output exclusions honestly.
4. Self-review; preserve required independent/security reviews. Prepare title/body
   as reviewable artifacts before requesting a required forge approval. Authorized
   writes use structured inputs or a body file, never shell-interpolated text.
5. Mark ready only with applicable evidence and authorization. Never merge
   automatically. Record the resulting PR link and attach it to the current task
   when the host supports PR attachments.

Reference: Matt Pocock's PR-description skill informed before/after evidence,
reversibility and blast-radius presentation. No upstream install is required.
