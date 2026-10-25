'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const { verifyLock, verifySource, readCheckedFile } = require('./install-public.cjs');
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

const hash = value => createHash('sha256').update(value).digest('hex');
function fixture(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'json-api-file-guard-'));
  const file = path.join(root, 'approved');
  fs.writeFileSync(file, 'approved');
  try { run(root, file); }
  finally { fs.rmSync(root, { recursive: true, force: true }); }
}

test('reads exact approved bytes and rejects a wrong expected hash', () => fixture((_root, file) => {
  assert.equal(readCheckedFile(file, 8, hash('approved')).toString(), 'approved');
  assert.throws(() => readCheckedFile(file, 8, hash('modified')), /patch bytes differ/);
}));

test('rejects symlink, non-regular and oversized inputs', () => fixture((root, file) => {
  const link = path.join(root, 'link'); fs.symlinkSync(file, link);
  assert.throws(() => readCheckedFile(link, 8, hash('approved')), { code: 'ELOOP' });
  assert.throws(() => readCheckedFile(root, 8, hash('approved')), /regular file/);
  assert.throws(() => readCheckedFile(file, 7, hash('approved')), /file size/);
  assert.throws(() => readCheckedFile(file, 1024 * 1024 + 1, hash('approved')));
}));

test('pathname replacement after checking cannot redirect the descriptor read', () => fixture((root, file) => {
  const other = path.join(root, 'other'); fs.writeFileSync(other, 'untrusted');
  const stat = fs.fstatSync;
  let replaced = false;
  fs.fstatSync = fd => {
    const info = stat(fd);
    if (!replaced) {
      replaced = true;
      fs.renameSync(file, path.join(root, 'opened-original'));
      fs.symlinkSync(other, file);
    }
    return info;
  };
  try {
    assert.equal(readCheckedFile(file, 8, hash('approved')).toString(), 'approved');
    assert.equal(replaced, true);
  } finally { fs.fstatSync = stat; }
}));

test('growth after checking is bounded and rejected', () => fixture((_root, file) => {
  const stat = fs.fstatSync;
  let grew = false;
  fs.fstatSync = fd => {
    const info = stat(fd);
    if (!grew) { grew = true; fs.appendFileSync(file, 'extra'); }
    return info;
  };
  try { assert.throws(() => readCheckedFile(file, 8, hash('approved')), /changed while reading/); }
  finally { fs.fstatSync = stat; }
}));

test('a read failure still closes the owned descriptor', () => fixture((_root, file) => {
  const read = fs.readSync;
  let seenFd;
  fs.readSync = fd => { seenFd = fd; throw new Error('synthetic read failure'); };
  try {
    assert.throws(() => readCheckedFile(file, 8, hash('approved')), /synthetic read failure/);
    assert.throws(() => fs.fstatSync(seenFd), { code: 'EBADF' });
  } finally { fs.readSync = read; }
}));
