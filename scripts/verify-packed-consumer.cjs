'use strict';

// Local/offline package delivery proof. The cache must contain only the reviewed
// public lock's packages; no credentials, registry requests or install scripts.
// Packing runs this repository's existing prepare build, as publication would.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const cache = process.env.JSON_API_PUBLIC_CACHE;
assert(cache && path.isAbsolute(cache), 'Set JSON_API_PUBLIC_CACHE to the reviewed temporary public cache');
const npm = path.resolve(path.dirname(fs.realpathSync(process.execPath)), '../lib/node_modules/npm/bin/npm-cli.js');
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json')));
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json')));
const reviewed = new Set(Object.entries(lock.packages).filter(([location]) => location).map(([location, item]) =>
  (item.name || location.split('node_modules/').pop()) + '@' + item.version));
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'json-api-packed-consumer-'));
try {
  const userconfig = path.join(temporary, 'npmrc');
  fs.writeFileSync(userconfig, 'registry=https://registry.npmjs.org\naudit=false\nfund=false\nignore-scripts=true\noffline=true\nmin-release-age=7\nmin-release-age-exclude[]=body-parser\n');
  const env = { PATH: process.env.PATH, HOME: temporary, npm_config_userconfig: userconfig,
    npm_config_globalconfig: '/dev/null', npm_config_cache: cache };
  function run(args, cwd) {
    const child = spawnSync(process.execPath, args, { cwd, env, encoding: 'utf8', timeout: 120000 });
    assert.ifError(child.error);
    assert.equal(child.status, 0, (child.stdout + child.stderr).slice(-4000));
    return child.stdout;
  }
  const packed = JSON.parse(run([npm, 'pack', '--ignore-scripts=false', '--foreground-scripts=false', '--json', '--pack-destination', temporary], root))[0];
  const files = new Set(packed.files.map(file => file.path));
  for (const name of ['index.js', 'index.d.ts', 'lib/language.js', 'lib/mediaType.js', 'LICENSE']) {
    assert(files.has('vendor/negotiator/' + name));
    assert(files.has('build/vendor/negotiator/' + name));
  }
  assert(files.has('build/src/index.js') && files.has('build/src/index.d.ts'));
  assert(files.has('src/steps/http/content-negotiation/negotiate-content-type.ts'));
  assert(![...files].some(name => name.startsWith('node_modules/') || name.startsWith('.github/')));
  const consumer = path.join(temporary, 'consumer'); fs.mkdirSync(consumer);
  const tarball = path.join(temporary, packed.filename);
  const consumerManifest = { name: 'isolated-public-consumer', version: '1.0.0', private: true,
    dependencies: { 'json-api': 'file:' + tarball, express: lock.packages['node_modules/express'].version,
      mongoose: lock.packages['node_modules/mongoose'].version } };
  fs.writeFileSync(path.join(consumer, 'package.json'), JSON.stringify(consumerManifest));
  // A clean downstream install uses a lock, just as a real reproducible consumer
  // should. Project only its reachable nodes from the reviewed library lock.
  // npm ci's cache contains exact tarballs, not registry version-selection data.
  const packages = { '': consumerManifest, 'node_modules/json-api': {
    version: manifest.version, resolved: 'file:' + tarball, integrity: packed.integrity,
    dependencies: manifest.dependencies, peerDependencies: manifest.peerDependencies,
    engines: manifest.engines
  } };
  function resolve(name, from) {
    let current = from;
    while (true) {
      const location = (current ? current + '/' : '') + 'node_modules/' + name;
      if (lock.packages[location]) return location;
      if (!current) return undefined;
      const parent = path.posix.dirname(current);
      current = parent === '.' ? '' : parent;
    }
  }
  const queue = Object.keys(manifest.dependencies).concat(['express', 'mongoose']).map(name => resolve(name, ''));
  while (queue.length) {
    const location = queue.shift(); assert(location, 'Missing reviewed dependency');
    if (packages[location]) continue;
    const item = { ...lock.packages[location] }; delete item.dev; delete item.devOptional;
    packages[location] = item;
    for (const name of Object.keys({ ...item.dependencies, ...item.optionalDependencies, ...item.peerDependencies })) {
      const next = resolve(name, location);
      if (next) queue.push(next);
      else assert(item.optionalDependencies?.[name] || item.peerDependenciesMeta?.[name]?.optional, 'Missing reviewed transitive dependency: ' + name);
    }
  }
  fs.writeFileSync(path.join(consumer, 'package-lock.json'), JSON.stringify({ name: consumerManifest.name,
    version: consumerManifest.version, lockfileVersion: 3, requires: true, packages }));
  run([npm, 'ci', '--offline', '--ignore-scripts', '--legacy-peer-deps', '--no-audit', '--no-fund'], consumer);
  const installed = JSON.parse(fs.readFileSync(path.join(consumer, 'package-lock.json')));
  for (const [location, item] of Object.entries(installed.packages)) {
    if (!location || location === 'node_modules/json-api') continue;
    const name = item.name || location.split('node_modules/').pop();
    assert(reviewed.has(name + '@' + item.version), 'Unreviewed downstream resolution: ' + name);
    assert.equal(new URL(item.resolved).origin, 'https://registry.npmjs.org');
    if (name === 'body-parser') assert.equal(item.version, '1.20.9');
  }
  const packageRoot = path.join(consumer, 'node_modules/json-api');
  assert(!JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'))).dependencies.negotiator);
  for (const name of ['index.js', 'lib/charset.js', 'lib/encoding.js', 'lib/language.js', 'lib/mediaType.js']) {
    const original = fs.readFileSync(path.join(root, 'vendor/negotiator', name));
    assert.deepEqual(fs.readFileSync(path.join(packageRoot, 'vendor/negotiator', name)), original);
    assert.deepEqual(fs.readFileSync(path.join(packageRoot, 'build/vendor/negotiator', name)), original);
  }
  const smoke = `
    const assert=require('node:assert/strict');
    const api=require('json-api');
    const N=require('json-api/build/vendor/negotiator');
    const sourceN=require('json-api/vendor/negotiator');
    const negotiate=require('json-api/build/src/steps/http/content-negotiation/negotiate-content-type').default;
    assert.equal(typeof api.APIController,'function');
    for(const Constructor of [N,sourceN]){
      assert.deepEqual(new Constructor({headers:{'accept-language':'en-US,en;q=0.8'}}).languages(),['en-US','en']);
      const rows=new Constructor({headers:{accept:'application/vnd.api+json;ext=example,application/json;q=0.8'}}).mediaTypes(undefined,{detailed:true});
      assert.equal(rows[0].type,'application/vnd.api+json');assert.equal(rows[0].parameters.ext,'example');
      assert.equal(Object.getPrototypeOf(rows[0].parameters),null);
    }
    (async()=>{
      assert.equal(await negotiate('application/vnd.api+json',['application/vnd.api+json']),'application/vnd.api+json');
      await assert.rejects(negotiate('application/vnd.api+json;ext=x,application/json',['application/vnd.api+json']),e=>e.status==='406');
      assert.equal(await negotiate('application/vnd.api+json;ext=x,application/vnd.api+json',['application/vnd.api+json']),'application/vnd.api+json');
      const prefix=process.cwd()+require('node:path').sep+'node_modules'+require('node:path').sep;
      assert(Object.keys(require.cache).every(file=>file.startsWith(prefix)),'Checkout fallback loaded');
      console.log('PACKED_PUBLIC_ENTRY_MEDIA_LANGUAGE_PASS');
    })().catch(e=>{console.error(e);process.exitCode=1;});`;
  assert(run(['-e', smoke], consumer).includes('PACKED_PUBLIC_ENTRY_MEDIA_LANGUAGE_PASS'));
  const child = spawnSync(process.execPath, ['-e', "const a=require('node:assert/strict'),N=require('json-api/build/vendor/negotiator');a.deepEqual(new N({headers:{'accept-language':'a-'.repeat(30000)+'x y'}}).languages(),[]);"],
    { cwd: consumer, env, timeout: 1000, killSignal: 'SIGKILL' });
  assert.ifError(child.error); assert.equal(child.status, 0);
  fs.writeFileSync(path.join(consumer, 'consumer.ts'), 'import N = require("json-api/build/vendor/negotiator");\nconst rows: N.DetailedMediaType[] = new N({headers:{accept:"application/json"}}).mediaTypes(undefined,{detailed:true});\nconst languages: string[] = new N({headers:{}}).languages();\nconsole.log(rows,languages);\n');
  run([path.join(root, 'node_modules/typescript/bin/tsc'), '--noEmit', '--strict', '--skipLibCheck', '--target', 'es2018', '--module', 'commonjs', '--moduleResolution', 'node', 'consumer.ts'], consumer);
  console.log(JSON.stringify({ state: 'PACKED_ISOLATED_OFFLINE_CONSUMER_PASS', files: files.size,
    packageIntegrity: packed.integrity, installedNodes: Object.keys(installed.packages).length - 1,
    checkoutFallback: false, sourceAndCompiledVendorBytesMatch: true, declarationsPass: true,
    libraryVersion: packed.version, dependencyVersionsRestrictedToReviewedLock: true }));
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
