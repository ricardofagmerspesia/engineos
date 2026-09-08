// Port of the cache section of hooks/route-before-change.sh.
//
// A path's route is immutable until routing.json changes, so the compact answer
// is cached per session in the worktree git dir. The registry signature and an
// optional operator buster make invalidation explicit without touching project
// files, and the session id keeps one session's cache out of another's.

export interface RouteCachePaths {
  route: string;
  output: string;
}

// Null means "do not cache": no git dir, no relative path, or a path that is not
// normalized. A `..` or `.` segment is refused rather than resolved — a tool path
// the harness did not normalize must never escape the private cache tree.
export function routeCachePaths(
  gitDir: string,
  sid: string,
  routingSig: string,
  buster: string,
  rel: string,
): RouteCachePaths | null {
  if (gitDir === '' || rel === '') return null;
  if (/\/\.\.?\//.test(`/${rel}/`)) return null;
  const key = `${safeSid(sid)}-${routingSig}-${buster === '' ? '0' : buster}`;
  const route = `${gitDir}/engineos-route-cache/${key}/${rel}.route`;
  return { route, output: `${route}.output` };
}

// The session id reaches the hook from the harness and lands in a directory
// name; every character outside the slug class becomes an underscore, one for
// one, so two different ids can never collapse to the same key by length.
function safeSid(sid: string): string {
  return sid.replace(/[^A-Za-z0-9._-]/g, '_');
}
