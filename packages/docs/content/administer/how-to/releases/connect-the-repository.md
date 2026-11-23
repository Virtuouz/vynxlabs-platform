---
title: Connect the tenant's repository
description: "Connect a Git repository to the tenant, check the connection, set the release and access branches, and disconnect."
subjects: [repository, git-sync]
---

## Connect the tenant's repository

By the end the tenant has a repository, and dev workspaces can follow branches of it.

## Before you start

- You hold `git:write`. A tenant admin does. See the [permissions reference](../../reference/permissions).
- The repository exists, has a first commit on its default branch (a README will do), and has an HTTPS address.
- You have an access token that can read and write its contents: a fine-grained personal access token on GitHub, or a project access token on GitLab.
- If the repository is on an internal host, the operator of the instance has allowed the instance to reach it.

## Steps

:::steps
1. Open **Tenant**, then **Repository**.
2. In **Address**, type the HTTPS address, with no user name or token in it.
3. Leave **Default branch** as `main`, or type the repository's default branch. Changes reach it only by a pull request.
4. Leave **Folder** as `platform`, or type the folder where resources made in the console are to be written.
5. In **Release branch**, leave `release` or type another name. Each promotion to a production workspace commits what it runs to `<release branch>/<workspace slug>`. Empty turns it off.
6. In **Access branch**, type a name such as `volvel/access` if access changes are to be committed under `tenant/` for a developer to merge. Empty turns it off.
7. Paste the **Access token**.
8. Press **Connect**.
:::

Volvel reaches the repository with the token before saving. The page says "Connected. The repository was reached with the token."

## Check the connection later

Press **Check the connection**. The page says "The repository was reached with the stored token just now." or the reason it could not. Under the form, "The stored token last reached the repository … ago." tells when it last worked.

## Change the token or the address

Change the field and press **Save**. Leave the token empty to keep the stored one, unless you changed the host: then the page asks for the token again. Saving turns a paused sync back on.

## Disconnect

Press **Disconnect** and confirm. Workspaces stop following their branches. Nothing in the repository changes.

## The result

The form shows **Save**, **Check the connection** and **Disconnect**, and a dev workspace's **Git sync** offers **Follow this branch**. Next, [sync a workspace with Git](../../../console/how-to/releases/sync-a-workspace-with-git).

## If it does not work

- **"The repository refused the access token."** The token is wrong or expired.
- **"The access token may not do that."** It needs to read and write the repository's contents.
- **"The repository was not found at that address, or the access token cannot see it."** Check the address and the token's repositories.
- **"The repository is empty."** Make a first commit on the default branch.
- **"The repository has no branch called *name*."** Give one the repository has as **Default branch**.
- **"The repository could not be reached."** The instance could not reach the host. If it is an internal host, ask the operator.
- **Folder is read only.** `volvel.yaml` at the repository's root names `resources`, and it wins. Change it there. See [Repository](../../reference/screens/repository).
- **Nothing is written to the repository.** Push and pull happen on request in **Git sync**. Volvel does not receive webhooks from the repository and does not sync on a schedule.
