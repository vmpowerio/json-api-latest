const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createRequire } = require('node:module');
const { mkdtempSync, readFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { runInNewContext } = require('node:vm');
const { ProcessInfo } = require('istanbul-lib-processinfo');
const { BufferedWorkerPool } = require('mocha/lib/nodejs/buffered-worker-pool');

test('Mocha serializes real worker options without invoking ignored functions', () => {
  const options = { grep: /fixture/i, timeout: 1234, filename: 'fixture.js', unused() { throw new Error('must not run'); } };
  const serialized = BufferedWorkerPool.serializeOptions(options);
  const parsed = runInNewContext('(' + serialized + ')');
  assert.equal(parsed.grep.source, 'fixture');
  assert.equal(parsed.grep.flags, 'i');
  assert.equal(parsed.timeout, 1234);
  assert.equal(parsed.filename, 'fixture.js');
  assert.equal(parsed.unused, undefined);
});

test('NYC process metadata creates valid distinct UUIDs and persists exact identity', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'json-api-processinfo-'));
  try {
    const first = new ProcessInfo({ argv: ['synthetic'], cwd: directory });
    const second = new ProcessInfo({ argv: ['synthetic'], cwd: directory });
    assert.match(first.uuid, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.notEqual(first.uuid, second.uuid);
    first.directory = directory;
    await first.save();
    assert.equal(JSON.parse(readFileSync(join(directory, first.uuid + '.json'))).uuid, first.uuid);
    const existing = new ProcessInfo({ uuid: first.uuid });
    assert.equal(existing.uuid, first.uuid);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('the scoped callers resolve the qualified patched dependency majors', () => {
  const mochaRequire = createRequire(require.resolve('mocha/package.json'));
  const coverageRequire = createRequire(require.resolve('istanbul-lib-processinfo/package.json'));
  assert.equal(mochaRequire('serialize-javascript/package.json').version, '7.0.3');
  assert.equal(coverageRequire('uuid/package.json').version, '11.1.1');
});
