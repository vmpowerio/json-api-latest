'use strict';

// This installation qualifies the frozen security candidate, not a new graph.
// A dependency change needs a fresh age/provenance review and updated hashes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const lockHash = 'fed4df803f8eddce823bca0310a8227166272531baccd41d850227aede1f4d03';
const manifestHash = 'ad05ea374fd514879a01d79153b146aadc40dc5063224057e74bf4fe1eec95d1';
const approvedIntegrity = 'sha512-FISIQxV5u91Y9gvuFq3q/tA/qTqLJn3AhRcEvyozyhJTh5OBFFtv827AdHU7Rbyct4r+Ba1/99oFa1Y3yuFsdw==';
const patchFiles = {
  'LICENSE': [1172, '23d466b1b134b415b66fa50c6526b4cf3e7b9258554da88d3abb371721e7ce68'],
  'index.js': [2681, '9c6c900e7e85fb599c62d9b9e4dfd2ea2f61d119dce5ed69ac3a8da828819241'],
  'lib/types/json.js': [5384, '3b19e93395f011b99a31e5c16086eeaa9e52acdc6a680191c1ceaeab31b15fc4'],
  'lib/types/raw.js': [2021, '14548e46265ba5d67d6ce727fbe6f2ede1c1706b73a541502fc309b13d4fa5c1'],
  'lib/read.js': [4960, '8a23bb191305aedf03694f007fd07db2a4d004054233f4487bf113834adde238'],
  'lib/types/text.js': [2422, '578ba8915fbbebb4c3deced3c545d3277014d2d08911a91ae540f60ad61f2bd4'],
  'lib/types/urlencoded.js': [6389, '9716e562cb2e944bcce9748fd095ab920849df4fb94f1cf03316c91f1850e916'],
  'package.json': [1461, 'b08d6a1bdf0ac224323051934f5979935c711a1fa7422795a61a39cbbe74711f'],
  'HISTORY.md': [15910, 'bae890839383e54782d5dc30b932ea4de1245a3801921047fe84e9063f5eeea9'],
  'README.md': [19184, 'b0373ee977b3a62e6045d28c9d9f5f1c33a059ce18a41c94241dbc9626595260']
};
const sha = data => createHash('sha256').update(data).digest('hex');

function verifyLock(lock) {
  let publicPackages = 0;
  const parserPaths = [];
  for (const [name, value] of Object.entries(lock.packages)) {
    if (!name) continue;
    if (name === 'node_modules/body-parser' || name.endsWith('/node_modules/body-parser')) {
      assert.equal(value.version, '1.20.9', 'Only the exact approved age exception is allowed');
      assert.equal(value.integrity, approvedIntegrity);
      parserPaths.push(name);
    }
    {
      const url = new URL(value.resolved);
      assert.equal(url.origin, 'https://registry.npmjs.org');
      assert.equal(url.username + url.password + url.search + url.hash, '');
      publicPackages++;
    }
  }
  assert.equal(publicPackages, 532);
  assert.deepEqual(parserPaths, ['node_modules/body-parser']);
}

function readCheckedFile(file, size, hash) {
  assert(Number.isSafeInteger(size) && size > 0 && size <= 1024 * 1024);
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    const info = fs.fstatSync(fd);
    assert(info.isFile(), 'Patch input must be a regular file');
    assert.equal(info.size, size, 'Unexpected patch file size');
    // Check and read the same descriptor, never re-open the checked pathname.
    // One extra byte detects growth without an unbounded read/allocation.
    const buffer = Buffer.alloc(size + 1);
    let count = 0;
    while (count < buffer.length) {
      const read = fs.readSync(fd, buffer, count, buffer.length - count, null);
      if (read === 0) break;
      count += read;
    }
    assert.equal(count, size, 'Patch file changed while reading');
    assert.equal(fs.fstatSync(fd).size, size, 'Patch file changed while reading');
    const content = buffer.subarray(0, count);
    assert.equal(sha(content), hash, 'Installed patch bytes differ');
    return content;
  } finally {
    fs.closeSync(fd);
  }
}

function verifyInstalled(root) {
  for (const [name, [size, hash]] of Object.entries(patchFiles)) {
    readCheckedFile(path.join(root, 'node_modules/body-parser', name), size, hash);
  }
}

function verifySource(root) {
  const raw = fs.readFileSync(path.join(root, 'package-lock.json'));
  assert.equal(sha(raw), lockHash, 'Dependency lock needs a new qualification review');
  assert.equal(sha(fs.readFileSync(path.join(root, 'package.json'))), manifestHash);
  verifyLock(JSON.parse(raw));
}

function install() {
  const root = process.cwd();
  verifySource(root);
  assert.equal(process.versions.node, '24.22.1');
  const npmRoot = path.resolve(path.dirname(fs.realpathSync(process.execPath)), '../lib/node_modules/npm');
  assert.equal(JSON.parse(fs.readFileSync(path.join(npmRoot, 'package.json'))).version, '11.19.1');
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'json-api-ci-npm-'));
  try {
    fs.writeFileSync(path.join(temporary, 'npmrc'), [
      'registry=https://registry.npmjs.org', 'audit=false', 'fund=false',
      'ignore-scripts=true', 'min-release-age=7',
      // Exact body-parser 1.20.9 exception; verifyLock rejects any other version.
      'min-release-age-exclude[]=body-parser', ''
    ].join('\n'), { mode: 0o600 });
    fs.writeFileSync(path.join(temporary, 'global-npmrc'), '', { mode: 0o600 });
    const env = {
      PATH: process.env.PATH, HOME: temporary,
      npm_config_userconfig: path.join(temporary, 'npmrc'),
      npm_config_globalconfig: path.join(temporary, 'global-npmrc'),
      // Job-local public cache is reused only by the offline packed-consumer test.
      // GitHub removes RUNNER_TEMP with the disposable job; nothing is uploaded.
      npm_config_cache: process.env.RUNNER_TEMP
        ? path.join(process.env.RUNNER_TEMP, 'json-api-public-cache')
        : path.join(temporary, 'cache')
    };
    const child = spawnSync(process.execPath, [path.join(npmRoot, 'bin/npm-cli.js'), 'ci'],
      { cwd: root, env, stdio: 'inherit', timeout: 240000 });
    assert.ifError(child.error);
    assert.equal(child.status, 0, 'Frozen public install failed');
    verifySource(root);
    verifyInstalled(root);
    console.log('FROZEN_PUBLIC_INSTALL_AND_APPROVED_PATCH_BYTES_PASS');
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

module.exports = { verifyLock, verifySource, verifyInstalled, readCheckedFile };
if (require.main === module) install();
