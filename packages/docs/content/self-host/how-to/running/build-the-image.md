---
title: Build the image from source
description: "Build the Volvel image from a copy of the repository, name it, and use it for Compose, a standalone worker or a transfer to another machine."
subjects: [install]
---

## Build the image from source

By the end you will have a local image, `volvel/volvel:docs` or a name you choose, that every Compose file of the repository can run. No image or package is published yet, so building is how you get one.

## Before you start

- Docker with Compose, and a machine that can reach the internet for this step only: the build pulls `node:24-slim` and fetches packages with `pnpm install`.
- A copy of the repository at the version you want. A clean copy keeps files you changed or added out of the image: `git archive HEAD | tar -x -C <folder>` makes one from a checkout.

## Build

:::steps
1. Open a terminal in the root of the copy, where the `Dockerfile` is.
2. Build and name the image:

   ```bash
   docker build -t volvel/volvel:docs .
   ```

   The build compiles the services, builds the console's static files and the app that draws interfaces, then makes a self-contained copy of the control plane with production dependencies only. It took about 5 minutes in the run for this page.
3. Check that the image is there: `docker images volvel/volvel`. It is about 900 MB on disk.
4. Tell Compose to use it. In `deploy/compose/.env` set:

   ```bash
   VOLVEL_IMAGE=volvel/volvel:docs
   ```
:::

## The result

The image holds the control plane, the worker host and the standalone worker. See [How an instance is put together](../../explanation/running/architecture). Without `VOLVEL_IMAGE`, `docker compose up` builds the image itself and names it `volvel/volvel:local`, from the repository above the Compose folder.

## If it does not work

- **The build stops at `pnpm install`.** The machine cannot reach the package registry. Build on one that can, and carry the image across: [Install where there is no internet](install-offline).
- **The build is short of memory.** Free memory, or build on a larger machine, and move the image.

Related: [Install with Compose](install-with-compose).
