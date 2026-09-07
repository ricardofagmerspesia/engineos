import { NextRequest, NextResponse } from 'next/server';

import { CONSOLE_ROOT, REPO_ROOT } from '@/lib/config';
import { parseSkills } from '@/lib/entities/skills';
import { dirtyPaths, pathsInCommit, revertCommit } from '@/lib/git';
import { logMutation } from '@/lib/logs';
import { PublishLockedError, withPublishLock } from '@/lib/publish-lock';
import { listHistory, replaceSnapshot } from '@/lib/store';

interface RouteContext {
  params: Promise<{ historyId: string }>;
}

type RollbackResult = { ok: true; revertSha: string } | { ok: false; reason: string };

// POST /api/rollback/:historyId — design §6.5. Reverts via `git revert`
// (never rewrites history), then resyncs the snapshot from what's on disk
// afterward. The draft table is intentionally left untouched — only the
// snapshot resyncs, per the ticket brief.
//
// Two guards, both about not destroying work that is not this rollback's to
// destroy: the repository write lock (so a rollback and a publish cannot
// interleave their read-check-write sequences), and a refusal to revert over
// files with uncommitted modifications. Left to itself, `git revert` on a dirty
// tree either aborts or stops mid-conflict, and in both cases the operator's
// uncommitted edit is what is at risk.
export async function POST(
  _request: NextRequest,
  { params }: RouteContext,
): Promise<NextResponse<RollbackResult>> {
  const { historyId } = await params;
  const numericId = Number.parseInt(historyId, 10);

  if (Number.isNaN(numericId)) {
    return NextResponse.json({ ok: false, reason: `Invalid history id: ${historyId}.` });
  }

  const row = listHistory().find((entry) => entry.id === numericId);

  if (!row) {
    return NextResponse.json({ ok: false, reason: `No publish history entry with id ${numericId}.` });
  }

  try {
    return withPublishLock(CONSOLE_ROOT, `rollback:${numericId}`, () => {
      const touched = pathsInCommit(REPO_ROOT, row.commitSha);
      const dirty = dirtyPaths(REPO_ROOT, touched);
      if (dirty.length > 0) {
        const reason = `Rollback refused — ${dirty.length} file(s) this revert would rewrite have uncommitted changes: ${dirty.join(', ')}. Commit or discard them first.`;
        logMutation(CONSOLE_ROOT, { path: REPO_ROOT, action: 'revert-blocked', result: 'error', detail: reason });
        return NextResponse.json({ ok: false, reason });
      }

      const revertSha = revertCommit(REPO_ROOT, row.commitSha);

      // Resync from disk: the revert moved the files, so every recorded base is
      // now stale. A draft still holding a pre-revert base will be refused by
      // the publish guard, which is the correct outcome — the file it was
      // edited against no longer exists.
      const skills = parseSkills(REPO_ROOT);
      replaceSnapshot('skill', skills);

      logMutation(CONSOLE_ROOT, { path: REPO_ROOT, action: 'revert', result: 'ok', detail: revertSha });

      return NextResponse.json({ ok: true, revertSha });
    });
  } catch (error) {
    if (error instanceof PublishLockedError) {
      logMutation(CONSOLE_ROOT, { path: '(lock)', action: 'revert-blocked', result: 'error', detail: error.message });
      return NextResponse.json({ ok: false, reason: error.message });
    }
    const reason = error instanceof Error ? error.message : 'Unknown error during rollback.';
    logMutation(CONSOLE_ROOT, { path: REPO_ROOT, action: 'revert', result: 'error', detail: reason });
    return NextResponse.json({ ok: false, reason });
  }
}
