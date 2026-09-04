// bash `case` pattern semantics, which scripts/kernel.sh route-path relied on:
// `*` and `?` match any character including `/` (no globstar, no pathname mode).
const REGEX_LITERALS = /[.+^${}()|\\\]/]/g;

export function globToRegExp(glob: string): RegExp {
  let re = '^';
  for (let i = 0; i < glob.length; i += 1) {
    const c = glob.charAt(i);
    if (c === '*') {
      re += '.*';
    } else if (c === '?') {
      re += '.';
    } else if (c === '[') {
      const end = glob.indexOf(']', i + 1);
      if (end === -1) {
        re += '\\[';
      } else {
        let cls = glob.slice(i + 1, end);
        if (cls.startsWith('!')) cls = `^${cls.slice(1)}`;
        re += `[${cls.replace(/\\/g, '\\\\')}]`;
        i = end;
      }
    } else {
      re += c.replace(REGEX_LITERALS, '\\$&');
    }
  }
  return new RegExp(`${re}$`);
}

export function globMatch(glob: string, value: string): boolean {
  return globToRegExp(glob).test(value);
}
