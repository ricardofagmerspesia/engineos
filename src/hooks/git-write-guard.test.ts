import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { memoryIo } from '../io';
import { resolveRoot } from '../registry/paths';
import { envelope, fixtureRepo, tempRoot } from '../testing/harness';
import { readEnvelope, type HookEnvelope } from './envelope';
import { gitCalls, gitWriteGuard, gitWriteSetting, isWrite, READ_ONLY_GIT, run, type GitCall } from './git-write-guard';
import { ask, silent, type HookContext, type HookDecision } from './output';

const root = resolveRoot({}, __dirname);

// The machine-wide bypass flag is pointed at nothing so the operator's own
// ~/.claude/engineos.bypass never decides a case — and, for this hook, so a
// bypass that IS on can be shown to change nothing.
const ISOLATED: NodeJS.ProcessEnv = { ENGINEOS_BYPASS_FLAG: '/nonexistent/engineos.bypass' };

function ctxWith(env: NodeJS.ProcessEnv = {}): HookContext {
  return { io: memoryIo({ env: { ...ISOLATED, ...env } }), root, now: () => 1000, spawn: spawnSync };
}

function bash(command: string, opts: { cwd?: string; tool?: string } = {}): HookEnvelope {
  const decoded = readEnvelope(
    memoryIo({
      stdin: envelope({ event: 'PreToolUse', cwd: opts.cwd ?? '', sid: 'S1', tool: { name: opts.tool ?? 'Bash', input: { command } } }),
    }),
  );
  assert.notEqual(decoded, null);
  if (decoded === null) throw new Error('unreachable');
  return decoded;
}

function decide(command: string, env: NodeJS.ProcessEnv = {}): HookDecision {
  return gitWriteGuard(bash(command), ctxWith(env));
}

function asks(decision: HookDecision, label: string): void {
  assert.deepEqual(decision, ask(`[engineos] git write: ${label} — ENGINEOS_GIT_WRITES=ask (set auto in settings.local.json to disable)`));
}

const UNPARSABLE = ask('[engineos] git write: unparsable command containing git/gh — ENGINEOS_GIT_WRITES=ask');

function call(tool: 'git' | 'gh', subcommand: string, ...args: string[]): GitCall {
  return { tool, subcommand, args };
}

function hasGit(): boolean {
  return spawnSync('git', ['--version'], { encoding: 'utf8' }).status === 0;
}

// ------------------------------------------------------------------ setting

test('the setting defaults to ask and only the exact word auto switches it off', () => {
  assert.equal(gitWriteSetting({}), 'ask');
  assert.equal(gitWriteSetting({ ENGINEOS_GIT_WRITES: '' }), 'ask');
  assert.equal(gitWriteSetting({ ENGINEOS_GIT_WRITES: 'auto' }), 'auto');
  assert.equal(gitWriteSetting({ ENGINEOS_GIT_WRITES: 'AUTO' }), 'ask');
  assert.equal(gitWriteSetting({ ENGINEOS_GIT_WRITES: 'yes' }), 'ask');
  assert.equal(gitWriteSetting({ ENGINEOS_GIT_WRITES: ' auto' }), 'ask');
});

// ------------------------------------------------------------------ tokenizer

test('gitCalls reads the subcommand after the global options', () => {
  assert.deepEqual(gitCalls('git -C /repo -c user.name=x --no-pager commit -m "hello world"'), [call('git', 'commit', '-m', 'hello world')]);
  assert.deepEqual(gitCalls('git --git-dir=/x/.git --work-tree=/x status'), [call('git', 'status')]);
  assert.deepEqual(gitCalls('git --git-dir /x/.git -p log'), [call('git', 'log')]);
});

test('gitCalls segments on every shell operator', () => {
  assert.deepEqual(gitCalls('git status && git commit -m x'), [call('git', 'status'), call('git', 'commit', '-m', 'x')]);
  assert.deepEqual(gitCalls('git fetch || git pull; git push'), [call('git', 'fetch'), call('git', 'pull'), call('git', 'push')]);
  assert.deepEqual(gitCalls('git log | head'), [call('git', 'log')]);
  assert.deepEqual(gitCalls('git status\ngit add .'), [call('git', 'status'), call('git', 'add', '.')]);
  assert.deepEqual(gitCalls('echo "$(git rev-parse HEAD)"'), [call('git', 'rev-parse', 'HEAD')]);
  assert.deepEqual(gitCalls('x=$(git rev-parse --short HEAD) && git tag "v-$x"'), [call('git', 'rev-parse', '--short', 'HEAD'), call('git', 'tag', 'v-$x')]);
  assert.deepEqual(gitCalls('(git add . && git commit -m x) &'), [call('git', 'add', '.'), call('git', 'commit', '-m', 'x')]);
  assert.deepEqual(gitCalls('echo `git status`'), [call('git', 'status')]);
});

test('gitCalls skips leading assignments, cd, wrappers and paths to the binary', () => {
  assert.deepEqual(gitCalls('GIT_AUTHOR_NAME=x GIT_EDITOR=true git commit --amend'), [call('git', 'commit', '--amend')]);
  assert.deepEqual(gitCalls('cd /repo && git status'), [call('git', 'status')]);
  assert.deepEqual(gitCalls('env FOO=1 git push'), [call('git', 'push')]);
  assert.deepEqual(gitCalls('git ls-files | xargs -0 git add'), [call('git', 'ls-files'), call('git', 'add')]);
  assert.deepEqual(gitCalls('/usr/bin/git status'), [call('git', 'status')]);
  assert.deepEqual(gitCalls('if git diff --quiet; then echo clean; fi'), [call('git', 'diff', '--quiet')]);
});

test('gitCalls keeps quoted text as one argument and drops comments and redirect targets', () => {
  assert.deepEqual(gitCalls("git commit -m 'a && b; git push'"), [call('git', 'commit', '-m', 'a && b; git push')]);
  assert.deepEqual(gitCalls('git commit -m "say \\"hi\\""'), [call('git', 'commit', '-m', 'say "hi"')]);
  assert.deepEqual(gitCalls('git log # git push'), [call('git', 'log')]);
  assert.deepEqual(gitCalls('git branch > branches.txt 2>&1'), [call('git', 'branch')]);
  assert.deepEqual(gitCalls('git tag < /dev/null'), [call('git', 'tag')]);
  assert.deepEqual(gitCalls('git commit -F - <<< "msg"'), [call('git', 'commit', '-F', '-')]);
});

test('gitCalls is null on an unbalanced quote or a heredoc, and empty when nothing is git', () => {
  assert.equal(gitCalls('git commit -m "unterminated'), null);
  assert.equal(gitCalls("git commit -m 'unterminated"), null);
  assert.equal(gitCalls('git commit -F - <<EOF\nmsg\nEOF'), null);
  assert.deepEqual(gitCalls('npm test && ls -la'), []);
  assert.deepEqual(gitCalls('echo "git commit is a word here"'), []);
  assert.deepEqual(gitCalls(''), []);
});

// ------------------------------------------------------------------ classifier

test('every READ_ONLY_GIT entry is design §C2, and each is read in its bare form', () => {
  assert.deepEqual(
    [...READ_ONLY_GIT].sort(),
    ['blame', 'branch', 'cat-file', 'check-ignore', 'config', 'describe', 'diff', 'log', 'ls-files', 'merge-base', 'remote', 'rev-parse', 'shortlog', 'show', 'stash', 'status', 'tag'].sort(),
  );
  for (const subcommand of READ_ONLY_GIT) {
    // `stash` bare is `stash push`: the one starred entry whose bare form writes.
    const expected = subcommand === 'stash';
    assert.equal(isWrite(call('git', subcommand)), expected, `git ${subcommand}`);
    if (!expected) assert.deepEqual(decide(`git ${subcommand}`), silent, `hook: git ${subcommand}`);
  }
});

test('the plain read-only forms are silent', () => {
  for (const command of [
    'git status --porcelain',
    'git log --oneline -5',
    'git diff HEAD~1 -- src/',
    'git show HEAD:package.json',
    'git blame src/x.ts',
    'git rev-parse --show-toplevel',
    'git ls-files',
    'git check-ignore -q node_modules',
    'git describe --tags',
    'git shortlog -sn',
    'git cat-file -p HEAD',
    'git merge-base main HEAD',
    'git -C /repo status',
    'git --no-pager log',
    'git',
    'git --version',
  ]) {
    assert.deepEqual(decide(command), silent, command);
  }
});

test('each write subcommand asks with its name', () => {
  for (const subcommand of [
    'add',
    'fetch',
    'checkout',
    'switch',
    'commit',
    'push',
    'pull',
    'merge',
    'rebase',
    'reset',
    'restore',
    'cherry-pick',
    'revert',
    'worktree',
    'submodule',
    'clone',
    'init',
    'rm',
    'mv',
    'am',
    'apply',
    'clean',
    'gc',
    'notes',
    'reflog',
    'co',
  ]) {
    asks(decide(`git ${subcommand} whatever`), `git ${subcommand}`);
  }
});

test('branch inspects its arguments', () => {
  for (const command of ['git branch', 'git branch --list', 'git branch -a', 'git branch -r', 'git branch --show-current', 'git branch --contains HEAD', 'git branch -vv', "git branch --list 'feat/*'", 'git branch --merged main']) {
    assert.deepEqual(decide(command), silent, command);
  }
  for (const command of ['git branch feat/x', 'git branch -d feat/x', 'git branch -D feat/x', 'git branch -m old new', 'git branch --set-upstream-to=origin/main', 'git branch -f main HEAD~1']) {
    asks(decide(command), 'git branch');
  }
});

test('tag inspects its arguments', () => {
  for (const command of ['git tag', 'git tag -l', 'git tag --list', "git tag -l 'v1.*'", 'git tag --contains HEAD', 'git tag -n', 'git tag --sort=-creatordate']) {
    assert.deepEqual(decide(command), silent, command);
  }
  for (const command of ['git tag v1.0.0', 'git tag -a v1 -m msg', 'git tag -d v1', 'git tag -f v1', 'git tag -s v1']) {
    asks(decide(command), 'git tag');
  }
});

test('stash list is the only read on stash', () => {
  assert.deepEqual(decide('git stash list'), silent);
  for (const command of ['git stash', 'git stash push -m wip', 'git stash pop', 'git stash apply', 'git stash drop', 'git stash clear', 'git stash show -p']) {
    asks(decide(command), 'git stash');
  }
});

test('remote -v and remote show are reads; anything else on remote asks', () => {
  for (const command of ['git remote', 'git remote -v', 'git remote --verbose', 'git remote show origin', 'git remote get-url origin']) {
    assert.deepEqual(decide(command), silent, command);
  }
  for (const command of ['git remote add origin x', 'git remote remove origin', 'git remote set-url origin x', 'git remote rename a b', 'git remote prune origin']) {
    asks(decide(command), 'git remote');
  }
});

test('config --get / --list / -l read; config writes ask', () => {
  for (const command of ['git config --get user.name', 'git config --list', 'git config -l', 'git config --global --get core.editor', 'git config user.name', 'git config --get-regexp remote', 'git config get user.name', 'git config list']) {
    assert.deepEqual(decide(command), silent, command);
  }
  for (const command of ['git config user.name x', 'git config --global user.email a@b', 'git config --unset user.name', 'git config --add x y', 'git config --edit', 'git config set user.name x', 'git config --global --add safe.directory /x']) {
    asks(decide(command), 'git config');
  }
});

test('the forge writes ask; other gh subcommands are read', () => {
  for (const command of [
    'gh pr create --fill',
    'gh pr merge 12 --squash',
    'gh pr close 12',
    'gh pr edit 12 --title x',
    'gh pr comment 12 -b hi',
    'gh pr review 12 --approve',
    'gh pr checkout 12',
    'gh release create v1',
    'gh release list',
    'gh repo clone a/b',
    'gh repo view',
    'gh api -X POST repos/a/b/issues',
    'gh api --method DELETE repos/a/b',
    'gh api --method=patch repos/a/b',
    'gh api repos/a/b/issues -f title=x',
    'gh api repos/a/b/issues --input body.json',
    'gh issue create -t x',
    'gh issue close 3',
    'gh issue edit 3 --title y',
    'gh issue comment 3 -b z',
    'gh secret set TOKEN',
    'gh secret list',
    'gh variable set X',
  ]) {
    assert.notDeepEqual(decide(command), silent, command);
  }
  asks(decide('gh pr create --fill'), 'gh pr create');
  asks(decide('gh -R a/b pr merge 12'), 'gh pr merge');
  asks(decide('gh release create v1'), 'gh release create');
  asks(decide('gh api -X POST repos/a/b/issues'), 'gh api');
  for (const command of ['gh pr view 12', 'gh pr list', 'gh pr status', 'gh pr diff 12', 'gh pr checks 12', 'gh api repos/a/b', 'gh api -X GET repos/a/b', 'gh issue view 3', 'gh issue list', 'gh run list', 'gh run view 1', 'gh auth status', 'gh --version', 'gh']) {
    assert.deepEqual(decide(command), silent, command);
  }
});

// ------------------------------------------------------------------ hook body

test('a compound command asks when any segment writes, and names that segment', () => {
  asks(decide('git status && git commit -m x'), 'git commit');
  asks(decide('git -C /repo -c user.name=x commit -m x'), 'git commit');
  asks(decide('echo x | git commit -F -'), 'git commit');
  asks(decide('git add . && git commit -m x && git push'), 'git add');
  asks(decide('cd /repo && git checkout -b feat/x'), 'git checkout');
  asks(decide('git log --oneline | head -3 ; git push origin main'), 'git push');
});

test('read-only compounds and pipes are silent', () => {
  for (const command of ['git log | head', 'git -C /repo status', 'git status && git diff --stat', 'cd /repo && git log -1', 'echo "$(git rev-parse HEAD)"', 'git status; git branch -a; git tag -l']) {
    assert.deepEqual(decide(command), silent, command);
  }
});

test('an unparsable command that mentions git or gh asks; one that does not is silent', () => {
  assert.deepEqual(decide('git commit -m "unterminated'), UNPARSABLE);
  assert.deepEqual(decide("gh pr create -b 'unterminated"), UNPARSABLE);
  assert.deepEqual(decide('cat <<EOF > notes.txt\nrun git push later\nEOF'), UNPARSABLE);
  assert.deepEqual(decide('echo "unterminated'), silent);
  assert.deepEqual(decide('cat <<EOF\nno version control here\nEOF'), silent);
  // The mention needs the word followed by whitespace: `digit ` or `gh` alone
  // in a longer token is not a call.
  assert.deepEqual(decide('echo "legit" && echo "unterminated'), silent);
});

test('a Bash command with no git in it is silent', () => {
  for (const command of ['npm test', 'ls -la && cat README.md', 'echo git', 'echo "git commit -m x"', 'grep -r "gh pr create" docs/', 'digit status']) {
    assert.deepEqual(decide(command), silent, command);
  }
});

test('a non-Bash tool is silent even when its input carries a git write', () => {
  const envelopeOf = (tool: string): HookEnvelope => bash('git push --force', { tool });
  assert.deepEqual(gitWriteGuard(envelopeOf('Edit'), ctxWith()), silent);
  assert.deepEqual(gitWriteGuard(envelopeOf('Task'), ctxWith()), silent);
  assert.deepEqual(gitWriteGuard(envelopeOf(''), ctxWith()), silent);
});

test('a Bash payload without a string command is silent', () => {
  const decoded = readEnvelope(memoryIo({ stdin: JSON.stringify({ tool_name: 'Bash', tool_input: { command: 42 }, cwd: '', session_id: 'S1' }) }));
  assert.notEqual(decoded, null);
  if (decoded === null) return;
  assert.deepEqual(gitWriteGuard(decoded, ctxWith()), silent);
  const noInput = readEnvelope(memoryIo({ stdin: JSON.stringify({ tool_name: 'Bash', cwd: '', session_id: 'S1' }) }));
  assert.notEqual(noInput, null);
  if (noInput === null) return;
  assert.deepEqual(gitWriteGuard(noInput, ctxWith()), silent);
});

test('ENGINEOS_GIT_WRITES=auto is silent for everything, including the unparsable', () => {
  const auto: NodeJS.ProcessEnv = { ENGINEOS_GIT_WRITES: 'auto' };
  for (const command of ['git commit -m x', 'git push --force', 'gh pr create', 'git status && git commit -m x', 'git commit -m "unterminated', 'git commit -F - <<EOF\nx\nEOF']) {
    assert.deepEqual(decide(command, auto), silent, command);
  }
});

test('the bypass switch does not turn the guard off', (t) => {
  // Process-scoped switch, the one every other hook honours first.
  asks(decide('git commit -m x', { ENGINEOS_BYPASS: '1' }), 'git commit');
  // Machine-wide flag: point ENGINEOS_BYPASS_FLAG at a file that exists.
  const dir = tempRoot(t);
  const flag = join(dir, 'engineos.bypass');
  writeFileSync(flag, '');
  asks(decide('git push', { ENGINEOS_BYPASS_FLAG: flag }), 'git push');
  if (!hasGit()) {
    t.skip('git is not installed: the per-repo marker case needs a git dir');
    return;
  }
  // Per-repo marker in the git dir, the /engineos:bypass form.
  const repo = fixtureRepo(dir);
  writeFileSync(join(repo, '.git', 'ENGINEOS_BYPASS'), '');
  asks(gitWriteGuard(bash('git commit -m x', { cwd: repo }), ctxWith()), 'git commit');
});

test('run is the registered entry and never throws', () => {
  assert.equal(run, gitWriteGuard);
  // A raw payload the command reader cannot type still yields a decision.
  const hostile = { ...bash('git status'), raw: null };
  assert.deepEqual(run(hostile, ctxWith()), silent);
});
