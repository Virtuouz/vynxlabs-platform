---
title: Versions, support and license
description: "How versions are numbered, which versions get security fixes, what is published, and the license."
subjects: [upgrade, security]
---

What version an instance is, which versions are supported, and where the image and packages come from.

## The version an instance reports

`GET /api/v1/instance` answers the `coreVersion`, the `apiVersion` (`v1`) and the `migrationLevel`. At the time of this page the tree is at version 0.5.0 and migration level 99. The image reports the version it was released as: a release writes one version into the published packages, the control plane, the console, the worker, the SDK's constants and the command line's starter range.

## What a version number promises

Volvel is versioned 0.x until 1.0, its first stable release.

| Version | What it may change |
| --- | --- |
| A patch version (0.7.1) | Fixes and additions only. Nothing that worked stops working. |
| A minor version (0.7.0), before 1.0 | It may change the API, the manifest format and the worker protocol. Its release notes say what changed, and what an operator and a tenant developer need to do. |
| From 1.0 | Nothing is taken away or changes its meaning without notice: what is to be removed or changed is first announced as deprecated, in an earlier release than the one that removes it. |

Before 1.0, changes are said in the release notes, which are the changelog's entry for each version and the release's page on GitHub. Read them for each minor version you move to.

## Supported versions

The newest minor version gets fixes for security problems. Older ones do not: upgrade to the newest.

The first public release is 0.6.0. See [Report a vulnerability](security-reports).

## What is published

From 0.6.0, the first public release, the packages are on npm under the tag `latest` and the image is on Docker Hub: [`volvel/volvel`](https://hub.docker.com/r/volvel/volvel). A release is made by pushing a tag `v*`. The job `release.yml` then:

- stages the packages `@volvel/widgets`, `@volvel/widget-frame`, `@volvel/markup`, `@volvel/docs-engine`, `@volvel/docs-site`, `@volvel/docs`, `@volvel/ui`, `@volvel/app`, `@volvel/sdk` and `@volvel/cli` under `latest`, which the maintainer then approves on npm;
- pushes the image `volvel/volvel:<version>` and `volvel/volvel:latest`.

A push to `main` can stage `<base>-next.<commit>` under `next`, when the repository variable `PUBLISH_NEXT` is `true`. Nothing is published by the job unless the repository variable `RELEASE_ENABLED` is `true`. Until then the job builds, checks and rehearses the release on Postgres 18 and stops.

To run a release, pull it: `docker pull volvel/volvel:0.6.0` ([Install with Compose](../../how-to/running/install-with-compose)). To run other code, build an image: [Build the image from source](../../how-to/running/build-the-image).

## Upgrading between versions

Migrations run on start and move forward only. You can upgrade from any earlier version straight to the newest. There is no downgrade: go back by restoring a backup. A database that is newer than the image refuses to start with it.

| Rule | Value |
| --- | --- |
| Upgrading an instance | From any earlier version straight to the newest. |
| A bundle built with an older SDK | Keeps running on an instance at least three minor versions newer. Today an instance runs bundles built for cores back to 0.2.0, and refuses older ones with a message that says to rebuild. |
| Standalone workers | A worker keeps working with an instance up to three minor versions newer. Upgrade the instance first, then the workers. The Workers page marks a worker that needs an update. |
| A tenant import needs | An equal migration level on both instances. |

See [Upgrade an instance](../../how-to/running/upgrade-an-instance).

## License

The repository's `LICENSE` is the Apache License, Version 2.0. A check, `scripts/check-licenses.mjs`, fails when a dependency that ships in the image carries a license outside an allowlist of permissive ones (Apache-2.0, MIT, ISC, the BSD licenses and a few others).

Related: [Requirements](requirements).
