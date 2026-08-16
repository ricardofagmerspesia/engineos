import { NextResponse } from 'next/server';

import { getStore } from '@/lib/store';

interface HistoryEntry {
  id: string;
  commitSha: string;
  createdAt: string;
  summary: string;
  diff_json: string;
}

// GET /api/history — not in the original frozen contract; the /history screen
// (Unit D) needs a list endpoint for publish_history rows. Reshapes the
// store's PublishHistoryRecord (numeric id, parsed `diff`) into the
// `HistoryEntry` wire shape Unit D's client already expects (string id,
// serialized `diff_json`) rather than asking that unit to adapt to the store's
// internal representation.
export function GET(): NextResponse<HistoryEntry[]> {
  const rows = getStore()
    .listHistory()
    .map(
      (row): HistoryEntry => ({
        id: String(row.id),
        commitSha: row.commitSha,
        createdAt: row.createdAt,
        summary: row.summary,
        diff_json: JSON.stringify(row.diff),
      }),
    );

  return NextResponse.json(rows);
}
