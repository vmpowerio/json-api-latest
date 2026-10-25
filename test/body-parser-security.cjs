// Real Express middleware and Node HTTP streams, without opening a listener.
// The child boundary makes the pre-patch uncaught decompressor error observable.
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { IncomingMessage, ServerResponse } = require('node:http');
const { PassThrough } = require('node:stream');
const { gzipSync, deflateSync } = require('node:zlib');

if (process.argv[2] === 'probe') {
  assert.equal(process.argv.length, 4, 'Probe accepts only the fixed installed dependency');
  const scenario = process.argv[3];
  const bodyParser = require('body-parser');
  const express = require('express');
  const socket = new PassThrough();
  const req = new IncomingMessage(socket);
  const res = new ServerResponse(req);
  const app = express();
  const trailing = scenario.startsWith('trailing-');
  const encoding = scenario.includes('gzip') ? 'gzip' :
    scenario.includes('deflate') ? 'deflate' : 'identity';
  let source = Buffer.from('{"value":42}');
  let options = {};
  let parser = 'json';
  let contentType = 'application/json';
  if (scenario === 'malformed') source = Buffer.from('{');
  if (scenario === 'oversize') options.limit = 2;
  if (scenario === 'inflate-disabled-gzip') options.inflate = false;
  if (scenario === 'verify-rejected-gzip') options.verify = () => { throw new Error('rejected'); };
  if (scenario === 'raw-gzip') { parser = 'raw'; contentType = 'application/octet-stream'; }
  if (scenario === 'urlencoded') {
    parser = 'urlencoded'; options.extended = true;
    contentType = 'application/x-www-form-urlencoded';
    source = Buffer.from('value=42&nested[key]=ok');
  }
  let payload = encoding === 'gzip' ? gzipSync(source) :
    encoding === 'deflate' ? deflateSync(source) : source;
  // A zero after the frame lets zlib finish before the HTTP message ends.
  if (trailing) payload = Buffer.concat([payload, Buffer.from([0])]);
  const tail = Buffer.alloc(1024, 0x61);
  req.method = 'POST'; req.url = '/';
  req.headers = { 'content-type': contentType, 'content-encoding': encoding,
    'content-length': String(payload.length + (trailing ? tail.length : 0)) };
  let consumed = 0;
  let ended = false;
  let callbacks = 0;
  const observer = new PassThrough();
  observer.on('data', chunk => { consumed += chunk.length; });
  req.pipe(observer);
  req.on('end', () => { ended = true; });
  const timeout = setTimeout(() => {
    console.error('PROBE_TIMEOUT'); process.exitCode = 2; socket.destroy(); req.destroy();
  }, 2000);
  app.use(bodyParser[parser](options));
  app.use((request, response, next) => { callbacks++; next(); });
  app.handle(req, res, error => {
    if (trailing) setImmediate(() => { req.push(tail); req.push(null); });
    setTimeout(() => {
      clearTimeout(timeout);
      console.log(JSON.stringify({ scenario, version: require('body-parser/package.json').version,
        status: error ? error.status : 200, type: error && error.type,
        body: Buffer.isBuffer(req.body) ? req.body.toString() : req.body,
        callbacks, ended, consumed, expectedBytes: payload.length + (trailing ? tail.length : 0) }));
      socket.destroy(); req.destroy(); observer.destroy();
    }, 60);
  });
  req.push(payload);
  if (!trailing) req.push(null);
} else {
  const { test } = require('node:test');
  const scenarios = [
    ['json', 200], ['json-gzip', 200], ['json-deflate', 200],
    ['raw-gzip', 200], ['urlencoded', 200],
    ['malformed', 400, 'entity.parse.failed'], ['oversize', 413, 'entity.too.large'],
    ['inflate-disabled-gzip', 415, 'encoding.unsupported'],
    ['verify-rejected-gzip', 403, 'entity.verify.failed'],
    ['trailing-gzip', 200], ['trailing-deflate', 200]
  ];
  for (const [scenario, status, type] of scenarios) {
    test('Express/body-parser stream contract: ' + scenario, () => {
      const child = spawnSync(process.execPath, [__filename, 'probe', scenario],
        { encoding: 'utf8', timeout: 4000 });
      assert.equal(child.error, undefined);
      assert.equal(child.status, 0, child.stderr || child.stdout);
      const result = JSON.parse(child.stdout);
      assert.equal(result.status, status);
      assert.equal(result.type, type);
      assert.equal(result.callbacks, status === 200 ? 1 : 0);
      assert.equal(result.ended, true, 'the HTTP request must drain');
      if (status === 200) {
        assert.equal(result.consumed, result.expectedBytes, 'independent piped consumer must remain attached');
        if (scenario === 'raw-gzip') assert.equal(result.body, '{"value":42}');
        else if (scenario === 'urlencoded') assert.deepEqual(result.body, { value: '42', nested: { key: 'ok' } });
        else assert.deepEqual(result.body, { value: 42 });
      }
    });
  }
}
