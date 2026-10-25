#!/usr/bin/env bash
set -euo pipefail

case "${1:-}" in
  full) expected_node=24.22.1 ;;
  compatibility) expected_node=18.20.8 ;;
  *) echo 'Expected full or compatibility qualification' >&2; exit 2 ;;
esac
test "$(node -p 'process.versions.node')" = "$expected_node"
export NODE_ENV=testing
export npm_config_audit=false npm_config_fund=false npm_config_ignore_scripts=true
unset NODE_OPTIONS NODE_PATH

timeout --kill-after=5s 180s npm run build
if [ "$1" = full ]; then
  timeout --kill-after=5s 120s npm run test:tooling
else
  timeout --kill-after=5s 120s node --test test/body-parser-security.cjs test/lint-compatibility.cjs
fi
timeout --kill-after=5s 180s npm run test:unit
timeout --kill-after=5s 180s node node_modules/mocha/bin/mocha.js \
  --recursive build/test/unit/ --full-trace --check-leaks
node -e 'const a=require("node:assert/strict"),p=require("./"); for(const k of ["Document","Resource","ResourceTypeRegistry","APIController"])a.equal(typeof p[k],"function"); a.equal(typeof p.httpStrategies.Express,"function"); a.equal(typeof p.dbAdapters.Mongoose,"function");'
