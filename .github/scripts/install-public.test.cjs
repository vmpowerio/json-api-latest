'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const { verifyLock, verifySource } = require('./install-public.cjs');
const fresh = () => JSON.parse(readFileSync('package-lock.json'));

test('accepts the exact reviewed public source graph', () => verifySource(process.cwd()));
test('rejects a different body-parser version despite the package-name age exclusion', () => {
  const lock = fresh(); lock.packages['node_modules/body-parser'].version = '1.20.10';
  assert.throws(() => verifyLock(lock), /exact approved age exception/);
});
test('rejects private or authenticated registry destinations before npm runs', () => {
  for (const url of ['https://npm.pkg.github.com/example', 'https://user:pass@registry.npmjs.org/example']) {
    const lock = fresh(); lock.packages['node_modules/body-parser'].resolved = url;
    assert.throws(() => verifyLock(lock));
  }
});
test('rejects changed Git source identity before npm runs', () => {
  const lock = fresh(); lock.packages['node_modules/negotiator'].resolved += '0';
  assert.throws(() => verifyLock(lock));
});
