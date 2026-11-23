---
title: Run the command line in CI
description: Check, preview, deploy and promote a repository from GitHub Actions with an API key kept as a secret and the commit's subject as each version's note.
subjects: [cli, ci, deploy]
---

## Run the command line in CI

By the end a pull request builds the repository and previews its deploy, and a merge to the main branch deploys to the dev workspace and, after someone approves, promotes to production.

The commands below were run as written from a shell with `CI`, `VOLVEL_URL` and `VOLVEL_TOKEN` set. The two GitHub Actions files themselves were not run on GitHub.

## Before you start

- A service account for the pipeline, and an API key for it. A key made under **Account** acts as you; a key of a service account acts as that account. Make it on the tenant's **Service accounts** page: **Create service account**, then **Create API key** on its **Keys** tab. That needs `service_account:write`. See the [service accounts reference](../../../administer/reference/screens/service-accounts).
- The service account holds, in the dev workspace, a role with `bundle:write`, `deployment:write` and the reads: the built-in `deployer` role holds `*:read`, `bundle:*` and `deployment:*`. To promote it also needs `promotion:write` in the production workspace. `deployer` does not hold that one, so give the account another role there. See the [permissions reference](../../../administer/reference/permissions).
- The CLI can be installed in the job. Nothing is published to npm yet: until it is, the job needs the tarballs from [Install the command line](install-the-cli) in a place it can reach. After a release, `npm install --global @volvel/cli` does it.
- The repository's secrets `VOLVEL_URL` and `VOLVEL_TOKEN`: the address of the instance, and the key.

## The pipeline

:::steps
1. Add the two secrets to the repository under **Settings**, **Secrets and variables**, **Actions**. The command reads `VOLVEL_URL` and `VOLVEL_TOKEN` from the environment, so no `volvel login` runs. The key is sent only to the address in `VOLVEL_URL`.
2. Check every pull request. This job builds the repository, which runs your code at the top level of the entry file, and previews the deploy to the dev workspace:

   ```yaml title=".github/workflows/volvel-check.yml"
   name: Volvel check
   on: pull_request
   jobs:
     check:
       runs-on: ubuntu-latest
       env:
         VOLVEL_URL: ${{ secrets.VOLVEL_URL }}
         VOLVEL_TOKEN: ${{ secrets.VOLVEL_TOKEN }}
       steps:
         - uses: actions/checkout@v4
         - uses: actions/setup-node@v4
           with:
             node-version: 24
         - run: npm install --global @volvel/cli
         - run: npm ci
         - run: volvel build
         - run: volvel deploy --tenant fernhill --workspace sandbox --preview
   ```

   `volvel deploy --preview` exits 1 with `It cannot be deployed.` and the reasons when the instance would refuse the bundle, which fails the job. If the repository has a `tenant/` folder of access files, `volvel tenant plan --tenant fernhill` prints what changing the tenant's access to match them would do.
3. Deploy when the change is merged, and promote after approval. The `production` environment, set up in the repository's settings with required reviewers, holds the second job until someone approves:

   ```yaml title=".github/workflows/volvel-deploy.yml"
   name: Volvel deploy
   on:
     push:
       branches: [main]
   jobs:
     dev:
       runs-on: ubuntu-latest
       env:
         VOLVEL_URL: ${{ secrets.VOLVEL_URL }}
         VOLVEL_TOKEN: ${{ secrets.VOLVEL_TOKEN }}
       steps:
         - uses: actions/checkout@v4
         - uses: actions/setup-node@v4
           with:
             node-version: 24
         - run: npm install --global @volvel/cli
         - run: npm ci
         - run: volvel deploy --tenant fernhill --workspace sandbox --json
     production:
       needs: dev
       runs-on: ubuntu-latest
       environment: production
       env:
         VOLVEL_URL: ${{ secrets.VOLVEL_URL }}
         VOLVEL_TOKEN: ${{ secrets.VOLVEL_TOKEN }}
       steps:
         - uses: actions/checkout@v4
         - uses: actions/setup-node@v4
           with:
             node-version: 24
         - run: npm install --global @volvel/cli
         - run: volvel promote --tenant fernhill --workspace sandbox --preview
         - run: volvel promote --tenant fernhill --workspace sandbox
   ```

   The job's commit subject becomes each version's note: GitHub sets `CI=true`, and a deploy, promotion or rollback without `--message` then uses the subject of the last commit of the checkout. A `--message` of your own wins. `volvel promote` takes `--dir` for the folder to read the commit from, and `volvel rollback` reads the current directory.
4. Read the preview's exit code. `volvel promote --preview` exits 4, and says on standard error `Promoting would be refused: it changes a name that something outside calls.`, when the target is a production workspace and the promotion has breaking changes that nobody confirmed. In the job above that stops it before the promotion. To promote anyway after reading the changes, run the promotion with `--confirm-breaking`, from a job that a person starts and approves.
:::

## The result

Each pull request shows a build and a preview. Each merge adds a version to the dev workspace, with the commit's subject beside it, and a version to production once approved. `--json` on a command makes its one answer a JSON document on standard output, so a job can read the version: see [JSON output](../../reference/command-line/json-output).

## If it does not work

- **`Not signed in. Run: volvel login --url <url> --token <api key>`.** One of the two secrets is empty in the job.
- **`The API key was not accepted.`** The key was revoked or has expired. Make another and replace the secret.
- **A refusal that names a permission.** The service account lacks it in that workspace. See **Before you start**.
- **`This deploy would delete N resources made in the console`.** The repository has a file for some console resources and not for others. Pull them first: [Bring console changes into the repository](pull-console-changes). A job can name them with `--allow-delete <path>`.
- **A promotion that the instance refuses.** The production workspace lacks a connection or secret that the bundle needs. Set it up there first.
