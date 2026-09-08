import { NextResponse } from 'next/server';

import { REPO_ROOT } from '@/lib/config';
import { parseAgents } from '@/lib/entities/agents';
import type { AgentEntity } from '@/lib/entities/types';

// GET /api/agents — read-only, so unlike skills there is no draft store to seed
// or overlay: what the files say is the whole answer.
export function GET(): NextResponse<AgentEntity[]> {
  return NextResponse.json(parseAgents(REPO_ROOT));
}
