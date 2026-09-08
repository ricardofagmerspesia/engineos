// Wiring for `engineos settings-merge` — the jq-free replacement for install.sh
// lines 287-333 and their install.ps1 mirror. The merge rules themselves live in
// ./settings-merge, which is pure; this arm owns argument parsing, reading, the
// two warnings and the atomic write.
//
// Silent on stdout for a normal run: the installer prints its own green line, and
// two success messages for one step is one too many. --dry-run is the exception
// and prints the MergeResult, nothing else.
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import type { Command } from '../dispatch';
import { writeJson, type Io } from '../io';
import { readJsonFile } from '../lib/json';
import { SETTINGS_NOT_OBJECT, SettingsMergeError, mergeSettings, pluginFile, type MergeResult } from './settings-merge';

const EXIT_OK = 0;
// One code for every refusal: the installer only ever branches on zero/non-zero,
// and a usage slip and an unreadable hooks.json are equally fatal to the step.
const EXIT_FAILURE = 1;

const USAGE = 'usage: engineos settings-merge --settings <path> --plugin-root <path> [--dry-run]';

interface Options { settings: string; pluginRoot: string; dryRun: boolean }
type Parsed = { ok: true; options: Options } | { ok: false; message: string };
type Read = { ok: true; value: unknown } | { ok: false; message: string };

export const runSettingsMerge: Command = (argv: string[], io: Io): number => {
  const parsed = parseArgs(argv);
  if (!parsed.ok) return fail(io, parsed.message);
  const { settings: settingsPath, pluginRoot, dryRun } = parsed.options;

  const hooksJsonPath = pluginFile(pluginRoot, 'hooks/hooks.json');
  const hooksJson = readJson(hooksJsonPath);
  if (!hooksJson.ok) return fail(io, hooksJson.message);

  const settings = readSettings(settingsPath);
  if (!settings.ok) return fail(io, settings.message);

  // A missing template skips the allowlist merge and leaves the hooks merged —
  // the same degradation the bash `if [ -f "$PERMS" ]` branch chose.
  const templatePath = pluginFile(pluginRoot, 'templates/permissions.template.json');
  let template: unknown = null;
  if (existsSync(templatePath)) {
    const read = readJson(templatePath);
    if (!read.ok) return fail(io, read.message);
    template = read.value;
  } else {
    io.err(`permissions template missing (${templatePath}) — skipped allowlist merge.\n`);
  }

  let merged: { settings: unknown; result: MergeResult };
  try {
    merged = mergeSettings(settings.value, hooksJson.value, pluginRoot, template);
  } catch (error) {
    if (error instanceof SettingsMergeError) {
      io.err(`${error.message}\n`);
      if (error.detail !== undefined) io.err(`${error.detail}\n`);
      return EXIT_FAILURE;
    }
    throw error;
  }

  if (dryRun) {
    writeJson(io, merged.result);
    return EXIT_OK;
  }

  return writeAtomically(io, settingsPath, `${JSON.stringify(merged.settings, null, 2)}\n`);
};

// -------------------------------------------------------------------- helpers

function parseArgs(argv: string[]): Parsed {
  let settings: string | undefined;
  let pluginRoot: string | undefined;
  let dryRun = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dry-run') { dryRun = true; continue; }
    if (arg === '--settings' || arg === '--plugin-root') {
      const value = argv[index + 1];
      if (value === undefined || value === '') return { ok: false, message: `${arg} needs a path` };
      if (arg === '--settings') settings = value; else pluginRoot = value;
      index += 1;
      continue;
    }
    return { ok: false, message: USAGE };
  }

  if (settings === undefined) return { ok: false, message: USAGE };
  if (pluginRoot === undefined) return { ok: false, message: USAGE };
  return { ok: true, options: { settings, pluginRoot, dryRun } };
}

function readJson(path: string): Read {
  try {
    return { ok: true, value: readJsonFile(path) };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : `cannot read ${path}` };
  }
}

// A settings.json that is absent, or empty because a previous write was cut
// short, is the same nothing the bash `[ -f "$SETTINGS" ] || echo '{}'` created.
// Anything present but unparseable answers with the shape refusal, not a parser
// message, so the installer surfaces one sentence for one broken file.
function readSettings(path: string): Read {
  if (!existsSync(path)) return { ok: true, value: {} };
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return { ok: false, message: `cannot read ${path}` };
  }
  if (text.trim() === '') return { ok: true, value: {} };
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, message: SETTINGS_NOT_OBJECT };
  }
}

function writeAtomically(io: Io, path: string, contents: string): number {
  const temporary = `${path}.tmp`;
  try {
    writeFileSync(temporary, contents);
    renameSync(temporary, path);
  } catch (error) {
    discard(temporary);
    return fail(io, `cannot write ${path}: ${error instanceof Error ? error.message : 'unknown error'}`);
  }
  return EXIT_OK;
}

// Best effort: the caller is already reporting the real failure, and a partial
// .tmp left behind would be read by nothing — but it would look like state.
function discard(path: string): void {
  try {
    rmSync(path, { force: true });
  } catch {
    return;
  }
}

function fail(io: Io, message: string): number {
  io.err(`${message}\n`);
  return EXIT_FAILURE;
}
