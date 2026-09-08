import { NextRequest, NextResponse } from 'next/server';

import { REPO_ROOT } from '@/lib/config';
import { KernelError, resolveTask, routePath, skillState } from '@/lib/kernel';

type EffectiveResult =
  | {
      ok: true;
      /** Where each part of the answer came from, so a surprising result can be traced to a file. */
      sources: Record<string, string>;
      routePath?: unknown;
      resolveTask?: unknown;
      skillState?: unknown;
    }
  | { ok: false; reason: string };

// GET /api/effective?path=<file>&prompt=<text>
//
// The effective configuration, answered by the kernel itself rather than by a
// second implementation living in this app. Two things follow, and both are the
// point:
//
//   - What this shows is what the runtime will do, because it is the same
//     resolver the hooks call. A TypeScript reimplementation would drift, and a
//     console that confidently shows the wrong answer is worse than one that
//     shows nothing.
//   - Suppressed skills appear as suppressed, with the reason. An operator
//     simulating a route before publishing sees that a skill was withheld and
//     why, instead of reading a short list and assuming it is complete.
export function GET(request: NextRequest): NextResponse<EffectiveResult> {
  const filePath = request.nextUrl.searchParams.get('path');
  const prompt = request.nextUrl.searchParams.get('prompt');

  if (!filePath && !prompt) {
    return NextResponse.json({ ok: false, reason: 'Provide ?path=<file> or ?prompt=<text> (or both).' });
  }

  try {
    const sources: Record<string, string> = {
      'domain, rules, agent, risk_floor': 'registries/routing.json',
      'intents, model_tier, commands, mcp': 'registries/intents.json',
      'gates, autonomy, hitl, backpressure': 'registries/policy.json',
      'skill enablement': 'skills/<id>/SKILL.md frontmatter (enabled)',
      resolver: 'scripts/kernel.sh — the same one the hooks call',
    };

    return NextResponse.json({
      ok: true,
      sources,
      ...(filePath ? { routePath: routePath(REPO_ROOT, filePath) } : {}),
      ...(prompt ? { resolveTask: resolveTask(REPO_ROOT, prompt) } : {}),
      skillState: skillState(REPO_ROOT),
    });
  } catch (error) {
    if (error instanceof KernelError) {
      return NextResponse.json({ ok: false, reason: error.message });
    }
    const reason = error instanceof Error ? error.message : 'Unknown error resolving effective configuration.';
    return NextResponse.json({ ok: false, reason });
  }
}
