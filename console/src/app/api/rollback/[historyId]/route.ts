import { NextRequest, NextResponse } from 'next/server';

import { CONSOLE_ROOT, REPO_ROOT } from '@/lib/config';
import { parseSkills } from '@/lib/entities/skills';
import { revertCommit } from '@/lib/git';
import { logMutation } from '@/lib/logs';
import { listHistory, replaceSnapshot } from '@/lib/store';

interface RouteContext {
  params: Promise<{ historyId: string }>;
}

type RollbackResult = { ok: true; revertSha: string } | { ok: false; reason: string };

// POST /api/rollback/:historyId — design §6.5. Reverts via `git revert`
// (never rewrites history), then resyncs the snapshot from what's on disk
// afterward. The draft table is intentionally left untouched — only the
// snapshot resyncs, per the ticket brief.
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
    const revertSha = revertCommit(REPO_ROOT, row.commitSha);

    const skills = parseSkills(REPO_ROOT);
    replaceSnapshot('skill', skills);

    logMutation(CONSOLE_ROOT, { path: REPO_ROOT, action: 'revert', result: 'ok', detail: revertSha });

    return NextResponse.json({ ok: true, revertSha });
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown error during rollback.';
    logMutation(CONSOLE_ROOT, { path: REPO_ROOT, action: 'revert', result: 'error', detail: reason });
    return NextResponse.json({ ok: false, reason });
  }
}
