// The one filesystem fact this family reads that ctx cannot answer: a file's
// executable bit.
//
// `[ -x <path> ]` in the bash families. The port reads the mode bit itself
// rather than asking whether THIS process is allowed to execute the file: a
// suite running as root would answer yes for a 644 hook, and the mode bit is
// precisely the load-bearing signal C30 exists to hold install.sh to.
import { statSync } from 'node:fs';
import { join } from 'node:path';

export function isExecutable(root: string, relativePath: string): boolean {
  try {
    return (statSync(join(root, relativePath)).mode & 0o111) !== 0;
  } catch {
    // A missing or unreadable file is not executable; the Check that asked owns
    // the finding about its absence.
    return false;
  }
}
