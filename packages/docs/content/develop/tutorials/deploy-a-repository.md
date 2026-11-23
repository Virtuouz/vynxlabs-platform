---
title: Deploy a repository
description: Take the higher-ed-devices example from a checkout to a running tenant with the command line, deploy it to dev, promote it to production, and follow a request through an approval.
subjects: [cli, deploy, repository]
---

You will have a tenant `higher-ed` that runs a device-lending repository: its tables, scripts, flow and apps deployed to a dev workspace, promoted to a production workspace, filled with sample data, and a student's request for a laptop approved by the Tech Desk. It takes about 60 minutes.

## Before you start

- You work in a checkout of this repository, built with `pnpm build`, on a machine with Node and pnpm. The `@volvel/*` packages are not on npm yet, so a repository such as this one runs from inside the checkout. The commands below write `volvel` for what you run as `node packages/cli/dist/bin.js` from the checkout's root.
- You can sign in to the console as an operator admin of the instance, who may make a tenant. The walk's password is yours: the commands below read it from a shell variable and never print it.
- The instance sends mail, or keeps it in a folder (`MAIL_CAPTURE_DIR`), so that the Tech Desk gets the approval link. Without mail, nobody on the Tech Desk is told.
- A browser at least as wide as a laptop screen. Command lines run in the folder `examples/higher-ed-devices`.

:::steps
1. **Make the tenant and its two workspaces.** On **Instance** press **Create tenant**, with **Name** `Lakeshore State University` and **Slug** `higher-ed`, leaving **Make me a member, as tenant admin** checked. In the tenant, press **Create one** and make a workspace with **Name** `Devices`, **Slug** `devices`, **Type** **Production**. Then **Create workspace** again: **Name** `Devices (dev)`, **Slug** `devices-dev`, **Type** **Dev**, **Promotes to** **Devices (production)**. The repository does not make these for you.

2. **Make a key for the command line.** Open your own **Account**, at `/account/api-keys`: "A key acts as you, with your permissions. Use one for the command line or a script." Press **Create API key**, type `tut-cli` in **Name**, choose **In 30 days** in **Expires**, press **Create API key**, copy the key (it is shown once), and press **Done**.

3. **Sign the command line in.** In the terminal, from the checkout:

   ```bash
   volvel login --url http://localhost:8091 --token "$KEY"
   volvel whoami
   volvel status
   ```

   `login` says "Signed in to http://localhost:8091 as admin@example.com." `whoami` lists the tenants you can use, among them `Lakeshore State University (higher-ed)`. `status` says "Version 0.5.0, migration level 99" and "Ready". `status` exits with 1 when the instance is not ready.

4. **Plan the tenant's access.** The repository has two files under `tenant/`: the group Tech Desk and the service account `helpdesk-assistant`. From `examples/higher-ed-devices`:

   ```bash
   volvel tenant plan --tenant higher-ed
   ```

   ```text
   Releasing would leave higher-ed with: 2 created, 0 updated, 0 deleted, 0 unchanged.
     created  group            tech-desk  (Tech Desk)
     created  service_account  helpdesk-assistant  (Helpdesk assistant)
   Nothing was changed. Run "volvel tenant release" to do it.
   ```

5. **Release the access.**

   ```bash
   volvel tenant release --tenant higher-ed
   ```

   It answers "Changed higher-ed's access as access change 1: 2 created, 0 updated, 0 deleted, 0 unchanged." and lists the same two lines.

6. **Preview the deploy.**

   ```bash
   volvel deploy --tenant higher-ed --workspace devices-dev --preview
   ```

   It builds the bundle and lists what it holds: roles, a variable, four tables (`devices`, `loans`, `requests`, `students`), a query, events, nine scripts, a schedule, the flow `requests/review`, a theme, two interfaces, a dashboard, two apps and the bindings. It ends "Deploying would leave devices-dev (dev) with: 43 created, 0 updated, 0 deleted, 0 unchanged." and "Nothing was changed. Run it again without --preview to deploy."

7. **Deploy.**

   ```bash
   volvel deploy --tenant higher-ed --workspace devices-dev --message "First deploy"
   ```

   It ends "Deployed version 1 to devices-dev (dev): 43 created, 0 updated, 0 deleted, 0 unchanged." with "Table devices created." and the same for `loans`, `requests` and `students`.

8. **Promote.** Preview first, then do it:

   ```bash
   volvel promote --tenant higher-ed --workspace devices-dev --preview
   volvel promote --tenant higher-ed --workspace devices-dev
   ```

   The preview says "Bundle 8a0025118d82, version 1 here, to devices (production)." and "Promoting would leave devices (production) with: 43 created, …". The second says "Promoted to devices (production) as version 1: 43 created, 0 updated, 0 deleted, 0 unchanged." The bundle's identifier is the same as in step 7: the same code runs in both.

9. **Fill production with sample data.** Put the operator's password in a variable without printing it, then:

   ```bash
   VOLVEL_URL=http://localhost:8091 VOLVEL_EMAIL=admin@example.com VOLVEL_PASSWORD="$PASSWORD" \
     node setup/setup.mjs --tenant higher-ed --workspace devices
   ```

   It says "Filling higher-ed/devices on http://localhost:8091", "40 students, 58 devices, 24 loans out, 18 returned", lists three students who can sign in (`maria.lopez@students.lakeshore.example`, `jamal.carter@…`, `diego.alvarez@…`, who "has a hold"), makes a key for the help-desk agent, and writes `.platform/devices.json`, which git ignores. The students' password is `lakeshore-demo-2026`.

10. **Add someone to the Tech Desk.** In the console, in the tenant, choose **Members & access**, press **Add member**, and fill in **Email** `tut.desk@example.com`, **Name** `Tut Desk` and **Initial password** `tut-desk-pass-2026`. Press **Add member**. Choose **Groups**, find **Tech Desk** (key `tech-desk`), press **Members**, search for `tut.desk`, choose the person and press **Add**. The dialog "Who is in Tech Desk" lists `tut.desk@example.com`.

11. **Ask for a laptop as a student.** In a private window open `/portal/higher-ed/sign-in` on the instance, and sign in as `maria.lopez@students.lakeshore.example` with the students' password. Open **Borrow a device**, or `/apps/higher-ed/devices/borrow/`. Press **Ask for a device**. In the form choose `laptop` for **What would you like to borrow**, type `Thesis writing` in **What it is for**, choose `tech-desk` for **Collect it from**, and press **Send request**. The message "Request sent. The Tech Desk will let you know when it is ready." appears, and **My requests** gains a row `REQ-…`, `laptop`, `pending`.

12. **Decide it as the Tech Desk.** The review flow asks the Tech Desk, and the person on it is mailed. In the mail, or the capture folder, find "Approval needed: Lend a device". It says "The flow requests/review in Devices (Lakeshore State University) waits for a decision" and gives `"kind": "laptop"` and the request number. Open its link, `/approve/…`. The page says "Lend a device", has a **Comment (needed to reject)**, **Approve** and **Reject**. Press **Approve**. It says "Approved. Thank you, Tut Desk." and "The flow carries on."

13. **See what ran.** In the terminal:

    ```bash
    volvel runs --tenant higher-ed --workspace devices
    ```

    The newest lines are a `requests/decide` run, then a `requests/review (flow)` run started by an event, then the `requests/submit` run the form started, all **succeeded**. In the student's window, reload **Borrow a device**: the request reads `ready`, with the device `LT-0010` and the note "Approved. LT-0010 is waiting at the Tech Desk."
:::

## What you built

- A tenant `higher-ed` with an access change (the Tech Desk group and the agent's service account), and a dev and a production workspace that run the same bundle.
- A repository deployed, previewed and promoted from the command line, and its tables filled.
- A request that went through a flow, waited for a person, and was decided from a mailed link.

The workspaces run version 1 of the same bundle. A change to the repository goes the same way: `volvel deploy --preview`, `volvel deploy`, `volvel promote`.
