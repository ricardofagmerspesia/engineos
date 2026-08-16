import { NextRequest, NextResponse } from 'next/server';

import { getEntity, upsertEntity } from '@/lib/store';
import { validateSkill } from '@/lib/validate/skills';
import type { SkillEntity, ValidationIssue } from '@/lib/entities/types';

interface RouteContext {
  params: Promise<{ id: string }>;
}

type SkillPatch = Partial<Pick<SkillEntity, 'description' | 'enabled'>>;

function notFound(id: string): NextResponse<{ errors: ValidationIssue[] }> {
  return NextResponse.json(
    { errors: [{ entityId: id, level: 'error', message: 'Skill not found.' }] },
    { status: 404 },
  );
}

export async function GET(
  _request: NextRequest,
  { params }: RouteContext,
): Promise<NextResponse<SkillEntity | { errors: ValidationIssue[] }>> {
  const { id } = await params;
  const entity = getEntity<SkillEntity>(id);

  if (!entity || entity.kind !== 'skill') {
    return notFound(id);
  }

  return NextResponse.json(entity);
}

export async function PUT(
  request: NextRequest,
  { params }: RouteContext,
): Promise<NextResponse<SkillEntity | { errors: ValidationIssue[] }>> {
  const { id } = await params;
  const existing = getEntity<SkillEntity>(id);

  if (!existing || existing.kind !== 'skill') {
    return notFound(id);
  }

  const patch = (await request.json()) as SkillPatch;
  const nextEnabled = patch.enabled !== undefined ? patch.enabled : existing.enabled;
  const candidate: SkillEntity = {
    ...existing,
    ...(patch.description !== undefined ? { description: patch.description } : {}),
    enabled: nextEnabled,
    // A parse error is a fact about the file on disk, not the draft edit —
    // an operator patching description/enabled on a broken file doesn't fix
    // the parse error, so 'error' status is preserved rather than overwritten.
    status: existing.status === 'error' ? 'error' : nextEnabled ? 'active' : 'disabled',
    updatedAt: new Date().toISOString(),
  };

  const issues = validateSkill(candidate);
  if (issues.some((issue) => issue.level === 'error')) {
    return NextResponse.json({ errors: issues }, { status: 422 });
  }

  upsertEntity(candidate);
  return NextResponse.json(candidate);
}
