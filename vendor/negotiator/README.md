This is an internal, MIT-licensed runtime, not a renamed registry package.
It preserves the detailed media-type extension required by this library and the
original charset, encoding and language APIs. The five JavaScript files come
from the exact custom fork `ethanresnick/negotiator` commit
`e2fe4abc56271b9851132f3e508e7323415c8aea`, with one runtime-line backport:

- Advisory: https://github.com/advisories/GHSA-7mc5-chhp-fmc3
- Official fix: https://github.com/jshttp/negotiator/commit/26a05ec15cf7d1fa56000d66ebe9c9a1a62cb75c
- Fixed upstream release: 0.6.1, commit `751c381c32707f238143cd65d78520e16f4ef9e5`.
- Local reviewed fork successor: `90952f6bb84ef3fe7130c996f9ab9e7a984acd31`.

Only the language-parser regex differs from the pinned custom fork. LICENSE and
copyright notices are retained. This does not claim full upstream 0.6.1 identity
or comprehensive security clearance of the remaining source.

Source callers import this directory directly. The existing build copies it to
`build/vendor/negotiator`, preserving the compiled callers' relative imports.
Both copies and their declarations are included in the package allowlist.
No install hook, external Git checkout or patch to a consumer's node_modules is
required. The library package version is unchanged pending release policy.

`npm run test:vendor` retains the original 250 fork tests and adds a bounded
old-source-sensitive language regression. `npm run test:package` packs the real
library and installs it into an isolated consumer offline; set
`JSON_API_PUBLIC_CACHE` to a temporary public-only npm cache previously populated
by installation of the reviewed lock. It verifies compiled runtime and declaration
delivery without a checkout fallback. Local or hosted checks do not by themselves
publish this source or clear the current provider alert.
