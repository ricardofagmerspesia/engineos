// Entry point. Everything above the guard must parse on node 16.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { processIo, writeJson } from './io';
import { currentMajor, findNewerNode, MIN_NODE_MAJOR } from './node-guard';
import { dispatch, type CommandTable } from './dispatch';

const io = processIo();
const argv = process.argv.slice(2);
const SILENT_HOOKS = new Set(['route-before-change', 'mark-unrecorded', 'record-verify', 'prompt-advisor']);

if (currentMajor() < MIN_NODE_MAJOR) {
  const newer = process.env['ENGINEOS_REEXEC'] === '1' ? null : findNewerNode(process.env, existsSync, readdirSync);
  if (newer !== null) {
    const r = spawnSync(newer, [__filename, ...argv], { stdio: 'inherit', env: { ...process.env, ENGINEOS_REEXEC: '1' } });
    process.exit(r.status ?? 1);
  }
  if (argv[0] === 'hook') {
    // The four hooks that already go silent without jq stay silent; the ones that
    // survive a missing jq today (the Stop gate among them) say why they did not run.
    if (SILENT_HOOKS.has(argv[1] ?? '')) process.exit(0);
    writeJson(io, { systemMessage: `[engineos] ${argv[1] ?? 'hook'} skipped: node >= ${MIN_NODE_MAJOR} required (found v${process.versions.node})` });
    process.exit(0);
  }
  writeJson(io, { error: `node >= ${MIN_NODE_MAJOR} required, found ${process.versions.node}` });
  process.exit(1);
}

const table: CommandTable = {};
process.exit(dispatch(table, argv, io));
