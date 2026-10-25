# Source qualification

The GitHub workflow runs on pull requests to `master` and pushes to `master`.
It uses two standard Ubuntu jobs, capped at 15 and 10 minutes. A new feature
branch push alone does not run this workflow. GitHub's configured default
CodeQL analysis remains separate; its dynamic timeout is not established here.

Node 24.22.1 runs full lint/build, tooling controls, source and compiled units,
the emitted public entry, fixture installation, and the complete existing unit
and integration selection. Node 18.20.8 runs lint/build, source and compiled
units, the public entry, body-parser and lint controls. Dependencies are installed
under the Node 24 distribution's npm 11.19.1 before switching the compatibility
job to Node 18. The jobs do not rewrite runtime source, manifests or the lock.
Both runtimes also run the original 250 internal Negotiator tests, bounded parser
regressions, and an actual offline packed-package consumer installation.

Installation uses an empty temporary credential route, disabled install scripts
and audit requests, the public npm registry, and a seven-day release-age guard.
The existing exact body-parser 1.20.9 exception is bounded by the frozen source
hashes, exact version/integrity, and all ten installed tarball file hashes.
All 532 external lock nodes use the public registry. The custom Negotiator runtime
is now internal source under `vendor/negotiator`, with MIT/provenance retained and
the exact upstream language-parser fix. External Git dependencies and their
HTTPS rewrite exception are removed. No SSH keys, global configuration, private
grants or private registries are used.
Dependency changes require a renewed source/age review and updated qualification
hashes. A successful workflow is not a fresh vulnerability scan.

The install retains only its public npm cache in the disposable job's
`RUNNER_TEMP`; no cache is uploaded or shared between jobs. The package test uses
that cache offline, with lifecycle scripts disabled, and rejects dependency
versions outside the reviewed lock. It packs the real library using its existing
prepare build, installs it with lifecycle scripts disabled in a
temporary downstream project, verifies source/compiled internal runtime bytes,
exercises the public entry and real media/language behavior, and compiles a
declaration consumer. Checkout fallback is rejected. Its isolated consumer is
removed on completion; GitHub removes the job cache with the disposable job.

The integration job uses only its disposable official Mongo 7.0.45 Jammy service,
pinned by digest and mapped to loopback port 27017. Existing tests hard-code
`mongodb://localhost/integration-test`; IPv4 resolution and the HTTP test host
are fixed locally. No production database URL or real credential is supplied.
Fixtures and the complete integration process have finite timeouts. Mocha exits
after the full test selection to close its listener and database handles; an
always-run check verifies the test listener stopped. GitHub destroys the service
container when the job ends. No local database or test listener is started by
preparing this workflow.

The obsolete CircleCI Node 8/10 definition and remote Codecov shell upload are
removed. Existing CircleCI application attachment and billing remain unverified;
an empty GitHub hook list is not proof that no GitHub App is attached. This change
does not alter provider settings or grants.

Provenance checked on 2026-10-25: official action tags `checkout@v7.0.1` and
`setup-node@v7.1.0` match the pinned SHAs. The official Docker library manifest
lists Mongo 7.0.45 Jammy; Docker Hub reports the pinned image digest and a
2026-10-17 publication. Mongoose 6.13.11's own compatibility documentation states
that Mongoose >=6.5 works with MongoDB 7, without all new server features:
https://mongoosejs.com/docs/6.x/docs/compatibility.html
https://github.com/docker-library/official-images/blob/master/library/mongo
https://hub.docker.com/_/mongo
https://docs.github.com/en/actions/tutorials/use-containerized-services/use-docker-service-containers

Hosted success, full database compatibility, source publication, package release,
and downstream consumer acceptance remain separate evidence. This workflow
qualifies only this repository's candidate.
