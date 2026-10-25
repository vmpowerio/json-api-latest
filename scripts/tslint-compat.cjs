'use strict';

// Preserve the frozen lint policy while adapting TypeScript's JSDoc text shape.
// TSLint otherwise catches rule crashes and silently treats the file as clean.
const assert = require('node:assert/strict');
const ts = require('typescript');
const { Rule } = require('tslint/lib/rules/deprecationRule');
const errors = require('tslint/lib/error');
assert.equal(require('tslint/package.json').version, '6.1.3');
assert.equal(ts.version, '4.9.5');

const originalMessage = Rule.FAILURE_STRING;
Rule.FAILURE_STRING = (name, message) => {
  if (Array.isArray(message)) {
    assert(message.every(part => part && typeof part.text === 'string' && typeof part.kind === 'string'));
    message = ts.displayPartsToString(message);
  }
  assert.equal(typeof message, 'string');
  return originalMessage(name, message);
};
errors.showRuleCrashWarning = (_message, ruleName, fileName) => {
  throw new errors.FatalError(`Lint rule ${ruleName} crashed in ${fileName}; qualification is incomplete.`);
};
