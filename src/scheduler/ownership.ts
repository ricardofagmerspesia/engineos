import { KernelError } from '../lib/json';

export function validateScope(scope: string): void {
  if (scope.length > 512 || !/^[A-Za-z0-9_.*?/-]+$/.test(scope) || scope.startsWith('/') || scope.split('/').some(part => part === '' || part === '.' || part === '..')) {
    throw new KernelError('scheduler requires canonical repository-relative file scopes');
  }
}

// Glob prefixes deliberately over-serialize: an ambiguous overlap cannot grant ownership.
export function scopesOverlap(left: string[], right: string[]): boolean {
  return left.some(a => right.some(b => {
    const aPrefix = a.split(/[?*]/)[0] ?? '';
    const bPrefix = b.split(/[?*]/)[0] ?? '';
    if (a.includes('*') || a.includes('?') || b.includes('*') || b.includes('?')) {
      return aPrefix.startsWith(bPrefix) || bPrefix.startsWith(aPrefix);
    }
    return a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
  }));
}
