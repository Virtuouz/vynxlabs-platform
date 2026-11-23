---
title: Install where there is no internet
description: "Build or pull the images on a machine that is online, carry them across, and start the instance without a build."
subjects: [install, upgrade]
---

## Install where there is no internet

By the end an instance runs on a machine that has no route to the internet. The instance asks nothing of the internet when it runs. Installing does: images are pulled or built, and a build fetches packages.

## Before you start

- A machine that is online, with Docker, to build and save the images.
- The machine without internet, with Docker and Compose, and a way to carry a file to it.
- The repository on both machines, or at least `deploy/compose/` on the second.

:::alert[This page was written from the code and the Compose file]{type=info}
The steps for the bundled images were run on one machine with the images present, including `docker save`, `docker load` and `up -d --wait --no-build`. A transfer to a second machine with no route to the internet was not run.
:::

## Install

:::steps
1. On the online machine, build the control plane's image and pull the others. `docker compose -f deploy/compose/compose.yaml build` builds `volvel/volvel:local`, or build as in [Build the image from source](build-the-image). `docker compose -f deploy/compose/compose.yaml --profile postgres --profile objectstore pull` pulls `postgres:18` and the object store's image. Skip the ones you do not use.
2. Save every image into one archive:

   ```bash
   docker save -o volvel-images.tar volvel/volvel:local postgres:18 chrislusf/seaweedfs:4.53
   ```

   Use the image name your `VOLVEL_IMAGE` names, if you set one.
3. Carry the archive to the other machine and load it: `docker load -i volvel-images.tar`.
4. Copy `deploy/compose/` there, with your `.env`, and start without a build:

   ```bash
   docker compose -f deploy/compose/compose.yaml up -d --wait --no-build
   ```
5. To upgrade, build and save on the online machine, load on the other and run `up -d --wait` again.
:::

## The result

The instance runs and asks the internet for nothing. See [What an instance reaches](../../explanation/running/egress-and-offline).

## If it does not work

- **Compose tries to pull or build.** The image names in `.env` do not match what you loaded. `docker images` lists what is there.
- **A tenant's connection needs a name that does not resolve.** An instance with no internet resolves only what your DNS answers.

Related: [Install an instance with Compose](install-with-compose), [Upgrade an instance](upgrade-an-instance).
