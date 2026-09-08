// The one filesystem fact this family reads that ctx cannot answer: a file's
// executable bit.
//
// `[ -x <path> ]` in the bash families. The port reads the mode bit itself
// rather than asking whether THIS process is allowed to execute the file: a
// suite running as root would answer yes for a 644 hook, and the mode bit is
// precisely the load-bearing signal C30 exists to hold install.sh to.
import { statSync } from 'node:fs';
import { join } from 'node:path';

// `null` is the third answer: the platform cannot represent the fact at all.
export type ExecutableBit = boolean | null;

export function executableBit(root: string, relativePath: string, platform: NodeJS.Platform = process.platform): ExecutableBit {
  // NTFS carries no POSIX mode and libuv reports none for regular files, so on
  // Windows neither "executable" nor "not executable" is a fact about the file.
  // The modes are asserted from the commit by scripts/package-release.sh and by
  // this validator on POSIX runners; here the honest answer is "unknown".
  if (platform === 'win32') return null;
  try {
    return (statSync(join(root, relativePath)).mode & 0o111) !== 0;
  } catch {
    // A missing or unreadable file is not executable; the Check that asked owns
    // the finding about its absence.
    return false;
  }
}
