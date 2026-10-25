# Runtime and qualification boundaries

The library runtime minimum is Node 18.20.8. The former Node 6 declaration is
not supported by this dependency/compiler migration. Node 18.20.8 and 24.22.1
are the qualification targets. Emitted declarations require TypeScript 4.9 or
newer and the installed Node 18 type declarations. Treat this as a compatibility
migration when selecting a package release; do not publish it as an unchanged
Node 6 contract.

Use Node 24.22.1 for the complete development toolchain. The patched serializer
used by Mocha's parallel workers requires Node 20+ and Web Crypto. Serial library
unit tests, full compilation and lint also run on Node 18.20.8. No production
Web Crypto polyfill or Node flags are introduced for this development dependency.

`npm run build` runs source lint, test lint, and full TypeScript/declaration emit.
`npm run test:unit` runs the original unit selection and compatibility controls
without a database. `npm run test:tooling` exercises the real Mocha/coverage
callers and lint failure propagation. `npm test` retains fixture installation and
the complete database integration suite; it requires an explicitly authorized
test database and must not be substituted with unit results.

The original locked lint policy is pinned to `@ethanresnick/tslint-config` 5.9.1.
Its caret had pulled in 5.10.3 rules that conflict with the library's synchronous
throw contracts. No rule in the original policy is disabled. The small preload
adapts TypeScript 4.9 JSDoc text to TSLint 6.1.3's string expectation and makes
rule crashes fatal. Version checks and actual CLI adverse tests fail closed if
the compatibility assumption changes. A future ESLint migration must preserve
the effective policy and synchronous API behavior explicitly.

Mongoose numeric-cast compatibility records only error identities thrown by the
canonical built-in numeric caster in pinned Mongoose 6.13.11 for primitive inputs. Error names, stacks and
user coercion methods are not provenance. Custom global casters already present
at import are retained, later custom casters remain effective, and unrecognized
errors and unqualified Mongoose versions keep generic public messages. The tracker wraps the default numeric caster
using Mongoose's existing cast API; it does not connect to a database or change
successful cast values. Importing multiple isolated copies or creating validation
errors before this adapter loads may produce conservative generic errors.

Source findings, release-age exceptions, hosted validation, consumer acceptance
and publication are separate gates. Test success does not establish advisory
clearance or authorize package publication.
