'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const Negotiator = require('../vendor/negotiator');

test('preserves regional language preference and quality exclusions', () => {
  const n = new Negotiator({ headers: { 'accept-language': 'en-US,en;q=0.8,fr;q=0' } });
  assert.deepEqual(n.languages(), ['en-US', 'en']);
  assert.equal(n.language(['fr', 'en']), 'en');
});

test('rejects bounded adversarial language input without excessive backtracking', () => {
  // An isolated process bounds both vulnerable-baseline work and regression failure.
  // This is synthetic parser input, never a network request or application probe.
  const child = spawnSync(process.execPath, ['-e',
    "const assert=require('node:assert/strict');const language=require('./lib/language');" +
    "assert.deepEqual(language('a-'.repeat(30000)+'x y'),[]);process.stdout.write('PASS');"
  ], {
    cwd: path.join(__dirname, '../vendor/negotiator'), timeout: 1000, killSignal: 'SIGKILL',
    encoding: 'utf8', env: { PATH: process.env.PATH }
  });
  assert.ifError(child.error);
  assert.equal(child.status, 0);
  assert.equal(child.stdout, 'PASS');
});

test('retains custom detailed media types required by JSON API', () => {
  const n = new Negotiator({ headers: { accept: 'application/vnd.api+json;ext=example;q=0.8,application/json' } });
  assert.deepEqual(n.mediaTypes(undefined, { detailed: true }), [
    { type: 'application/json', parameters: Object.create(null), q: 1 },
    { type: 'application/vnd.api+json', parameters: Object.assign(Object.create(null), { ext: 'example' }), q: 0.8 }
  ]);
  assert.equal(n.mediaType(['application/vnd.api+json', 'application/json']), 'application/json');
});
