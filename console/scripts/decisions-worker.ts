import { ensureDecisionRuntime } from '../src/lib/decisions/runtime';
import { getDecisionRuntime } from '../src/lib/decisions/backend';
import { runWorker } from '../src/lib/decisions/backend/worker';

async function main(): Promise<void> {
  ensureDecisionRuntime();
  const runtime = getDecisionRuntime();
  if (!runtime.config.enabled) throw new Error('Set DECISIONS_ENABLED=true before operating the decision worker.');
  const controller = new AbortController();
  process.once('SIGINT', () => controller.abort());
  process.once('SIGTERM', () => controller.abort());
  await runWorker(runtime, { signal: controller.signal, pollMs: runtime.config.pollMs });
}

main().catch(() => {
  console.error(JSON.stringify({ event: 'decision_worker_stopped', level: 'error', message: 'Worker failed. Check configuration, database availability and redacted application logs.' }));
  process.exitCode = 1;
});
