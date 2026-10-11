import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BreakerConfigError, createFileBreakerStore, TELEMETRY_DIR_NAME } from './breaker';

const STATE_FILE = 'engineos-judge-breaker.json';

function withGitDir(run: (gitDir: string) => void): void {
  const gitDir = mkdtempSync(join(tmpdir(), 'engineos-judge-breaker-'));
  try {
    run(gitDir);
  } finally {
    rmSync(gitDir, { recursive: true, force: true });
  }
}

function storeIn(gitDir: string, failureThreshold = 3): ReturnType<typeof createFileBreakerStore> {
  return createFileBreakerStore({ gitDir, stateFile: STATE_FILE, failureThreshold });
}

function writeRaw(gitDir: string, text: string): void {
  mkdirSync(join(gitDir, TELEMETRY_DIR_NAME), { recursive: true });
  writeFileSync(join(gitDir, TELEMETRY_DIR_NAME, STATE_FILE), text);
}

test('a missing state file reads as closed', () => {
  withGitDir((gitDir) => {
    assert.deepEqual(storeIn(gitDir).read(), { failures: 0, opened_at: null });
  });
});

test('failures below the threshold count without opening the breaker', () => {
  withGitDir((gitDir) => {
    const store = storeIn(gitDir);

    store.recordFailure(1_000);
    store.recordFailure(2_000);

    assert.deepEqual(store.read(), { failures: 2, opened_at: null });
  });
});

test('the failure that reaches the threshold opens the breaker at that time, and later failures re-stamp it', () => {
  withGitDir((gitDir) => {
    const store = storeIn(gitDir);

    store.recordFailure(1_000);
    store.recordFailure(2_000);
    store.recordFailure(3_000);
    assert.deepEqual(store.read(), { failures: 3, opened_at: 3_000 });

    store.recordFailure(9_000);
    assert.deepEqual(store.read(), { failures: 4, opened_at: 9_000 });
  });
});

test('a success closes the breaker and resets the count', () => {
  withGitDir((gitDir) => {
    const store = storeIn(gitDir, 1);
    store.recordFailure(5_000);

    store.recordSuccess();

    assert.deepEqual(store.read(), { failures: 0, opened_at: null });
  });
});

test('state persists in the telemetry directory across store instances', () => {
  withGitDir((gitDir) => {
    storeIn(gitDir, 1).recordFailure(7_000);

    assert.deepEqual(storeIn(gitDir, 1).read(), { failures: 1, opened_at: 7_000 });
    const raw: unknown = JSON.parse(readFileSync(join(gitDir, TELEMETRY_DIR_NAME, STATE_FILE), 'utf8'));
    assert.deepEqual(raw, { failures: 1, opened_at: 7_000 });
  });
});

test('a malformed or out-of-range state file reads as closed rather than failing the hook', () => {
  const malformed = [
    'not json',
    '[]',
    '{"failures":-1,"opened_at":null}',
    '{"failures":1.5,"opened_at":null}',
    '{"failures":"2","opened_at":null}',
    '{"failures":2,"opened_at":-5}',
    '{"failures":2,"opened_at":"soon"}',
  ];
  for (const text of malformed) {
    withGitDir((gitDir) => {
      writeRaw(gitDir, text);

      assert.deepEqual(storeIn(gitDir).read(), { failures: 0, opened_at: null }, text);
    });
  }
});

test('an unwritable telemetry location drops the write silently', () => {
  withGitDir((gitDir) => {
    // A file where the telemetry directory should be makes every write fail.
    writeFileSync(join(gitDir, TELEMETRY_DIR_NAME), 'not a directory');
    const store = storeIn(gitDir, 1);

    assert.doesNotThrow(() => store.recordFailure(1_000));
    assert.deepEqual(store.read(), { failures: 0, opened_at: null });
  });
});

test('a state file name that could leave the telemetry directory is refused', () => {
  for (const stateFile of ['../escape.json', 'nested/file.json', '.hidden', '', 'a..b']) {
    assert.throws(
      () => createFileBreakerStore({ gitDir: '/nonexistent', stateFile, failureThreshold: 3 }),
      BreakerConfigError,
      stateFile,
    );
  }
});

test('a threshold that is not a positive integer is refused', () => {
  for (const failureThreshold of [0, -1, 1.5, Number.NaN]) {
    assert.throws(
      () => createFileBreakerStore({ gitDir: '/nonexistent', stateFile: STATE_FILE, failureThreshold }),
      BreakerConfigError,
      String(failureThreshold),
    );
  }
});
