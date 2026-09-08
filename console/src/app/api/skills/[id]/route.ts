import { NextRequest, NextResponse } from 'next/server';

import { getEntity, upsertEntity } from '@/lib/store';
import { parseSkillPatch } from '@/lib/validate/skill-patch';
import { validateSkill } from '@/lib/validate/skills';
import type { SkillEntity, ValidationIssue } from '@/lib/entities/types';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// The patch body carries two optional fields and `validateSkill` caps
// `description` at 2000 characters, so anything past 16 KiB is not a patch.
// Refusing on the declared length keeps a large body out of memory instead of
// buffering it first and rejecting it after.
const MAX_BODY_BYTES = 16_384;

function badRequest(issues: ValidationIssue[]): NextResponse<{ errors: ValidationIssue[] }> {
  return NextResponse.json({ errors: issues }, { status: 400 });
}

function payloadTooLarge(id: string): NextResponse<{ errors: ValidationIssue[] }> {
  return NextResponse.json(
    {
      errors: [
        { entityId: id, level: 'error', message: `Request body exceeds ${MAX_BODY_BYTES} bytes.` },
      ],
    },
    { status: 413 },
  );
}

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

  // A declared length past the cap is refused before the body is read. A
  // chunked request declares no length and so skips this check — the parser's
  // own bounded issue list is what keeps that case from amplifying.
  const declaredBodyBytes = Number.parseInt(request.headers.get('content-length') ?? '', 10);
  if (Number.isFinite(declaredBodyBytes) && declaredBodyBytes > MAX_BODY_BYTES) {
    return payloadTooLarge(id);
  }

  // The body is `unknown` until the parser has seen it: a malformed payload
  // used to reach validateSkill and throw a 500, and unknown keys used to ride
  // the spread into the store.
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest([{ entityId: id, level: 'error', message: 'Request body is not valid JSON.' }]);
  }

  const parsed = parseSkillPatch(id, body);
  if (!parsed.ok) {
    return badRequest(parsed.issues);
  }

  const patch = parsed.patch;
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
