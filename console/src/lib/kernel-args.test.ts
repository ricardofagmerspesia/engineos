// The bound on what reaches `scripts/kernel.sh` as an operand. The argv is an
// array, so none of this is about shell quoting — it is about what the CLI
// itself does with a value the operator typed into a query string.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  KernelArgumentError,
  MAX_PATH_ARG_CHARS,
  MAX_PROMPT_ARG_CHARS,
  assertKernelArgument,
} from './kernel.js';

// Written as code points rather than escape literals so the file itself carries
// no control character: NUL, TAB, LF, CR, ESC, the top of the C0 range, and DEL.
const CONTROL_CODE_POINTS = [0x00, 0x09, 0x0a, 0x0d, 0x1b, 0x1f, 0x7f];

test('an ordinary path is returned unchanged', () => {
  assert.equal(assertKernelArgument('path', 'src/lib/kernel.ts'), 'src/lib/kernel.ts');
});

test('an ordinary prompt is returned unchanged', () => {
  const prompt = 'add pagination to the orders endpoint';
  assert.equal(assertKernelArgument('prompt', prompt), prompt);
});

test('a path at the cap passes and one character past it is refused', () => {
  const atCap = 'a'.repeat(MAX_PATH_ARG_CHARS);
  assert.equal(assertKernelArgument('path', atCap), atCap);
  assert.throws(() => assertKernelArgument('path', `${atCap}a`), KernelArgumentError);
});

test('a prompt at the cap passes and one character past it is refused', () => {
  const atCap = 'a'.repeat(MAX_PROMPT_ARG_CHARS);
  assert.equal(assertKernelArgument('prompt', atCap), atCap);
  assert.throws(() => assertKernelArgument('prompt', `${atCap}a`), KernelArgumentError);
});

test('the two kinds carry different caps', () => {
  const overPathCap = 'a'.repeat(MAX_PATH_ARG_CHARS + 1);
  assert.throws(() => assertKernelArgument('path', overPathCap), KernelArgumentError);
  assert.equal(assertKernelArgument('prompt', overPathCap), overPathCap);
});

test('a leading dash is refused — the CLI would read it as an option', () => {
  assert.throws(() => assertKernelArgument('path', '--help'), KernelArgumentError);
  assert.throws(() => assertKernelArgument('path', '-rules/base.md'), KernelArgumentError);
  assert.throws(() => assertKernelArgument('prompt', '--json'), KernelArgumentError);
});

test('a dash anywhere but the first character is fine', () => {
  assert.equal(assertKernelArgument('path', 'rules/risk-autonomy.md'), 'rules/risk-autonomy.md');
});

test('every control character is refused, NUL and DEL included', () => {
  for (const codePoint of CONTROL_CODE_POINTS) {
    const value = `route ${String.fromCharCode(codePoint)} this`;
    assert.throws(
      () => assertKernelArgument('prompt', value),
      KernelArgumentError,
      `expected code point ${codePoint} to be refused`,
    );
  }
});

test('the printable characters bounding the control range are not refused', () => {
  const space = String.fromCharCode(0x20);
  const tilde = String.fromCharCode(0x7e);
  assert.equal(assertKernelArgument('prompt', `a${space}b`), `a${space}b`);
  assert.equal(assertKernelArgument('prompt', `a${tilde}b`), `a${tilde}b`);
});

test('the refusal names the kind and the reason', () => {
  try {
    assertKernelArgument('path', '-x');
    assert.fail('expected a KernelArgumentError');
  } catch (error) {
    assert.ok(error instanceof KernelArgumentError);
    assert.equal(error.kind, 'path');
    assert.match(error.message, /kernel path argument rejected/);
  }
});
