// Bundles src/cli.ts into the single committed runtime file. Syntax is lowered to
// node16 so the version guard in cli.ts can run on an old node and re-exec a newer
// one; APIs used elsewhere still require node 18 (package.json engines).
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';

// import attributes (`with { type: 'json' }`) need Node >= 20.10; the spec floor is 18.
const version = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

await build({
  entryPoints: ['src/cli.ts'],
  bundle: true,
  platform: 'node',
  target: 'node16',
  format: 'cjs',
  outfile: 'dist/engineos.cjs',
  banner: { js: '#!/usr/bin/env node' },
  define: { ENGINEOS_VERSION: JSON.stringify(version) },
  legalComments: 'none',
  minify: false,
  sourcemap: false,
  logLevel: 'error',
});
