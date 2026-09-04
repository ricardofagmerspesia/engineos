// Bundles src/cli.ts into the single committed runtime file. Syntax is lowered to
// node16 so the version guard in cli.ts can run on an old node and re-exec a newer
// one; APIs used elsewhere still require node 18 (package.json engines).
import { build } from 'esbuild';

await build({
  entryPoints: ['src/cli.ts'],
  bundle: true,
  platform: 'node',
  target: 'node16',
  format: 'cjs',
  outfile: 'dist/engineos.cjs',
  banner: { js: '#!/usr/bin/env node' },
  legalComments: 'none',
  minify: false,
  sourcemap: false,
  logLevel: 'error',
});
