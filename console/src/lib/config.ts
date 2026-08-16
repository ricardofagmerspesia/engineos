import path from 'node:path';

// The console app runs from `console/`, one directory below the real EngineOS
// plugin source (skills/, rules/, agents/, hooks/...) that publish actually
// writes to. This is the ONLY place `process.cwd()` may appear — every other
// module in this app takes basePath/cwd as a parameter (rules/architecture.md).
export const CONSOLE_ROOT = process.cwd();
export const REPO_ROOT = path.resolve(CONSOLE_ROOT, '..');
