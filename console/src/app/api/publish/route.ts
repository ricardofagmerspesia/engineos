import { NextResponse } from 'next/server';

import { CONSOLE_ROOT, REPO_ROOT } from '@/lib/config';
import { resolveInside } from '@/lib/contained-path';
import { detectBaseConflicts, hashSource, writeSkills } from '@/lib/entities/skills';
import { applyFileChanges } from '@/lib/fs-writer';
import { checkoutPaths, commit, getCurrentBranch } from '@/lib/git';
import { logMutation } from '@/lib/logs';
import { PublishLockedError, withPublishLock } from '@/lib/publish-lock';
import { appendHistory, getSnapshot, listEntities, replaceSnapshot, upsertEntity } from '@/lib/store';
import { validateSkill } from '@/lib/validate/skills';
import type { BaseConflict } from '@/lib/entities/skills';
import type { SkillEntity, ValidationIssue } from '@/lib/entities/types';

const PROTECTED_BRANCHES = new Set(['main', 'master']);

type PublishResult =
  | { ok: true; commitSha: string; summary: string }
  | { ok: false; reason: string; errors?: ValidationIssue[]; conflicts?: BaseConflict[] };

const CONFLICT_EXPLANATION: Record<BaseConflict['reason'], string> = {
  changed: 'changed on disk since this draft was captured',
  'unknown-base': 'draft has no recorded base revision (written before the guard existed) — reopen the skill to recapture it',
  missing: 'source file no longer exists',
};

function sourceAbsolutePath(entity: SkillEntity): string {
  return resolveInside(REPO_ROOT, entity.sourcePaths[0] ?? '');
}

// POST /api/publish — design §6.4. Every branch is fail-closed: no real file
// stays modified on disk unless a commit actually lands.
//
// Serialized against rollback and against a second publish (including one from
// another console process) by the repository write lock: the read-check-write
// sequence below is not safe to interleave, and a double-click on Publish is
// enough to interleave it.
export function POST(): NextResponse<PublishResult> {
  try {
    return withPublishLock(CONSOLE_ROOT, 'publish', publishOnce);
  } catch (error) {
    if (error instanceof PublishLockedError) {
      logMutation(CONSOLE_ROOT, { path: '(lock)', action: 'publish-blocked', result: 'error', detail: error.message });
      return NextResponse.json({ ok: false, reason: error.message });
    }
    const reason = error instanceof Error ? error.message : 'Unknown error during publish.';
    return NextResponse.json({ ok: false, reason });
  }
}

function publishOnce(): NextResponse<PublishResult> {
  const branch = getCurrentBranch(REPO_ROOT);
  if (PROTECTED_BRANCHES.has(branch)) {
    const reason = 'Publish refuses to run on main/master — checkout a feature branch first.';
    logMutation(CONSOLE_ROOT, {
      path: '(branch guard)', // no file is involved yet; publish never got past the guard
      action: 'publish-blocked',
      result: 'error',
      detail: reason,
    });
    return NextResponse.json({ ok: false, reason });
  }

  const draftSkills = listEntities<SkillEntity>('skill');
  const snapshotById = new Map(getSnapshot<SkillEntity>('skill').map((entity) => [entity.id, entity]));

  const changed = draftSkills.filter((entity) => {
    const snapshot = snapshotById.get(entity.id);
    return !snapshot || JSON.stringify(snapshot) !== JSON.stringify(entity);
  });

  if (changed.length === 0) {
    return NextResponse.json({ ok: false, reason: 'No changes to publish.' });
  }

  // The base-revision guard, before validation and before any write. The
  // console edits a copy; if the file moved on since this draft captured it,
  // publishing would discard whoever moved it — with no error and no diff.
  // Refuse and name the files instead.
  const conflicts = detectBaseConflicts(REPO_ROOT, changed);
  if (conflicts.length > 0) {
    const detail = conflicts
      .map((conflict) => `${conflict.sourcePath} (${CONFLICT_EXPLANATION[conflict.reason]})`)
      .join('; ');
    const reason = `Publish refused — ${conflicts.length} file(s) no longer match the revision this draft was based on: ${detail}`;
    logMutation(CONSOLE_ROOT, { path: '(base guard)', action: 'publish-blocked', result: 'error', detail: reason });
    return NextResponse.json({ ok: false, reason, conflicts });
  }

  // Re-validate authoritatively (inline validation on PUT is advisory only).
  // Any error anywhere aborts before a single real file is touched.
  const allIssues = changed.flatMap((entity) => validateSkill(entity));
  if (allIssues.some((issue) => issue.level === 'error')) {
    return NextResponse.json({ ok: false, reason: 'Validation failed', errors: allIssues });
  }

  let changes: ReturnType<typeof writeSkills>;
  try {
    changes = writeSkills(REPO_ROOT, changed);
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Failed to compute file changes.';
    logMutation(CONSOLE_ROOT, { path: '(publish)', action: 'publish', result: 'error', detail: reason });
    return NextResponse.json({ ok: false, reason });
  }

  if (changes.length === 0) {
    // `changed` is draft-vs-snapshot (all rows on a still-empty first-run
    // snapshot); `changes` is draft-vs-disk (what writeSkills would actually
    // touch). They can diverge — e.g. the snapshot is stale but every entity
    // already matches its file — and only the second is true for the commit.
    replaceSnapshot('skill', draftSkills);
    return NextResponse.json({ ok: false, reason: 'No changes to publish.' });
  }

  // The set of entities that produced a real file write — never `changed`,
  // which includes rows only flagged because no snapshot row existed yet.
  // Using `changed` here previously produced a commit message and history
  // entry claiming every entity was "updated" when only one file changed.
  // Both sides of every path comparison below go through `resolveInside`, the
  // same function `writeSkills` used to produce `change.path`. `path.join` and
  // `path.resolve` agree on a relative source path but not on an absolute one,
  // and a mismatch here silently drops an entity from the commit message and
  // from the base-hash rebase further down.
  const changedPaths = new Set(changes.map((change) => change.path));
  const actuallyChanged = changed.filter((entity) =>
    changedPaths.has(sourceAbsolutePath(entity)),
  );

  try {
    applyFileChanges(changes);
    for (const change of changes) {
      logMutation(CONSOLE_ROOT, { path: change.path, action: 'write', result: 'ok' });
    }

    // TODO(routing-ticket): once the console owns routing entities, write them
    // into registries/routing.json here and gate on
    // `hooks/test-route.sh` — inserted between the file write above and the
    // commit below. On failure that ticket must checkoutPaths() and abort,
    // exactly like the catch block below does for any other failure.

    const summaryLines = actuallyChanged
      .map((entity) => `- ${entity.kind}: ${entity.name} (${entity.id})`)
      .join('\n');
    const paths = changes.map((change) => change.path);
    const commitSha = commit(REPO_ROOT, paths, `feat(engineos): publish config changes\n\n${summaryLines}`);

    // The published bytes are the new base. Without this, a second publish of
    // the same draft would conflict with the file this publish just wrote —
    // the guard would fire on the operator's own successful write.
    const hashByPath = new Map(changes.map((change) => [change.path, hashSource(change.after)]));
    const rebased = draftSkills.map((entity) => {
      const nextHash = hashByPath.get(sourceAbsolutePath(entity));
      return nextHash ? { ...entity, baseHash: nextHash } : entity;
    });
    for (const entity of rebased) {
      if (hashByPath.has(sourceAbsolutePath(entity))) {
        upsertEntity(entity);
      }
    }

    // Snapshot must reflect the *entire* kind, not just what changed, so
    // untouched rows stay a no-op diff on the next GET /api/diff.
    replaceSnapshot('skill', rebased);

    const summary = `Updated ${actuallyChanged.length} skill(s):\n${summaryLines}`;
    appendHistory({
      commitSha,
      summary,
      diff: actuallyChanged.map((entity) => ({ entityId: entity.id, kind: entity.kind })),
    });

    logMutation(CONSOLE_ROOT, { path: REPO_ROOT, action: 'commit', result: 'ok', detail: commitSha });

    return NextResponse.json({ ok: true, commitSha, summary });
  } catch (error) {
    // Fail-closed: discard whatever applyFileChanges wrote before reporting
    // failure, so disk state never drifts from the last real commit.
    try {
      checkoutPaths(REPO_ROOT, changes.map((change) => change.path));
    } catch {
      // Best-effort — the original error below is what gets reported either way.
    }

    const reason = error instanceof Error ? error.message : 'Unknown error during publish.';
    logMutation(CONSOLE_ROOT, { path: REPO_ROOT, action: 'publish', result: 'error', detail: reason });

    return NextResponse.json({ ok: false, reason });
  }
}
