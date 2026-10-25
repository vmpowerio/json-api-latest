const assert = require('node:assert/strict');
const { test } = require('node:test');
const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { spawnSync } = require('node:child_process');

const shim = resolve(__dirname, '../scripts/tslint-compat.cjs');
const cli = require.resolve('tslint/bin/tslint');
function run(directory, preload = true) {
  return spawnSync(process.execPath, [
    ...(preload ? ['--require', shim] : []), cli,
    '--project', join(directory, 'tsconfig.json'), '--config', join(directory, 'tslint.json')
  ], { cwd: directory, encoding: 'utf8', timeout: 20000, env: { PATH: process.env.PATH } });
}
function fixture(callback) {
  const directory = mkdtempSync(join(tmpdir(), 'json-api-lint-'));
  try {
    writeFileSync(join(directory, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'es2015' }, files: ['fixture.ts'] }));
    callback(directory);
  } finally { rmSync(directory, { recursive: true, force: true }); }
}

test('the original frozen lint policy remains selected', () => {
  assert.equal(require('@ethanresnick/tslint-config/package.json').version, '5.9.1');
});

test('real deprecation lint accepts clean source and rejects TS4 JSDoc references', () => fixture(directory => {
  writeFileSync(join(directory, 'tslint.json'), JSON.stringify({ rules: { deprecation: true } }));
  writeFileSync(join(directory, 'fixture.ts'), 'const current = () => 1; current();');
  const clean = run(directory);
  assert.equal(clean.status, 0, clean.stderr + clean.stdout);
  writeFileSync(join(directory, 'fixture.ts'), '/** @deprecated Use the current function. */\nfunction old() { return 1; }\nold();');
  const deprecated = run(directory);
  assert.equal(deprecated.status, 2, deprecated.stderr + deprecated.stdout);
  assert.match(deprecated.stdout, /old is deprecated.*current function/);
}));

test('an actual rule crash cannot silently qualify a file', () => fixture(directory => {
  const rules = join(directory, 'rules'); mkdirSync(rules);
  writeFileSync(join(rules, 'crashRule.js'), `const Lint = require(${JSON.stringify(require.resolve('tslint'))}); exports.Rule = class extends Lint.Rules.AbstractRule { apply() { throw new Error('synthetic rule fault'); } };`);
  writeFileSync(join(directory, 'tslint.json'), JSON.stringify({ rulesDirectory: [rules], rules: { crash: true } }));
  writeFileSync(join(directory, 'fixture.ts'), 'const value = 1;');
  const unsafeBaseline = run(directory, false);
  assert.equal(unsafeBaseline.status, 0, unsafeBaseline.stderr + unsafeBaseline.stdout);
  assert.match(unsafeBaseline.stderr, /synthetic rule fault/);
  const guarded = run(directory);
  assert.equal(guarded.status, 1, guarded.stderr + guarded.stdout);
  assert.match(guarded.stderr, /qualification is incomplete/);
}));
