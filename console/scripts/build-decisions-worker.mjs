import { build } from 'esbuild';
import { copyFile, mkdir } from 'node:fs/promises';

await mkdir('.decision-build', { recursive: true });
await build({
  entryPoints: ['scripts/decisions-worker.ts'],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  outfile: '.decision-build/worker.cjs',
  external: ['better-sqlite3', 'zod'],
  logLevel: 'error',
});
await copyFile('src/lib/store/migrations/0001_decisions.sql', '.decision-build/0001_decisions.sql');
