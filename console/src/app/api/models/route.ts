import { NextResponse } from 'next/server';

import { REPO_ROOT } from '@/lib/config';
import { parseModels } from '@/lib/entities/models';
import type { ModelEntity } from '@/lib/entities/types';

// GET /api/models — read-only; see the note in entities/models.ts on why the
// tier table is not editable from here yet.
export function GET(): NextResponse<ModelEntity[]> {
  return NextResponse.json(parseModels(REPO_ROOT));
}
