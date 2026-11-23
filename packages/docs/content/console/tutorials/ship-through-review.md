---
title: Ship a change through review
description: Deploy a script to a dev workspace, promote it to production, ask for a second promotion as someone who may not promote, approve it as an admin, and roll production back.
subjects: [deploy, promotion, versions]
---

You will have a dev workspace and a production workspace linked to it, a script that went from one to the other twice (once by you, once on a request from a colleague), and a production workspace rolled back to its first version. It takes about 40 minutes. You use your own tenant, not Fernhill, so that a rollback does not touch an example people share.

## Before you start

- You can sign in to the console as an operator admin of the instance, who may make a tenant. The tenant's own admin, which you become by leaving **Make me a member, as tenant admin** checked, holds `deployment:write` and `promotion:write`. See [your first script](../../start/tutorials/your-first-script) for making a tenant.
- The instance has a worker, as in that tutorial.
- A browser at least as wide as a laptop screen, and a second browser window.

:::steps
1. **Make the tenant and the two workspaces.** On **Instance**, press **Create tenant**. Name it `Tut Ship` with the slug `tut-ship`, leave **Make me a member, as tenant admin** checked, and press **Create tenant**. In the tenant press **Create one** beside "No workspaces yet". Make a workspace with **Name** `Live`, **Slug** `live` and **Type** **Production**. Then press **Create workspace** again and make one with **Name** `Dev`, **Slug** `dev`, **Type** **Dev** and **Promotes to** **Live (production)**. The list reads `Dev`, **DEV**, **Live**, and `Live`, **PRODUCTION**.

2. **Add a colleague who may deploy and not promote.** Choose **Members & access** in the menu on the left, and press **Add member**. Fill in **Email** `tut.dev@example.com`, **Name** `Tut Dev`, **Initial password** `tut-dev-pass-2026`, and under **Roles** choose `developer` in **Role**. Press **Add member**. The list shows **Tut Dev** with "1 given directly".

3. **Write a script in Dev.** Open the workspace **Dev**. Press **Build**, then **Scripts**, then **New script**. Press **Greet someone**. In **Path** type `tut-greet`. Press **Save draft**. The address becomes `…/scripts/edit/tut-greet`.

4. **Deploy it to Dev.** Press **Operate**, then choose **Deploy** in the menu beside it. The steps are **01 Review draft**, "1 change"; **02 Deploy to dev**; and **03 Promote**, with the name of the workspace it goes to, **Live**. In **What changed** type `First greeting`. Press **Deploy 1 change**. The step reads "0 changes", and **VERSIONS OF DEV** shows a version with "First greeting".

5. **Look before you promote.** Press **03 Promote**. The page says **FROM** Dev, **TO** Live **PRODUCTION**, and "Gets the same bundle, by its digest. Nothing is rebuilt." **WHAT CHANGES IN LIVE** says "Creates 1, changes 0 and removes 0", and lists `tut-greet` as **CREATED**. Under **BEFORE IT GOES**, **Tried here** says "0 runs, 0 failed". **HOW DEV DIFFERS FROM LIVE** says "Dev runs v2, Live runs v–. 1 of 1 resources differ.", with `tut-greet` **Only in Dev**.

6. **Promote.** Press **Promote to production**. The dialog says "Promote to Live? Live starts running version 2 at once. Runs in progress there finish on the version they started with." Press **Promote to production**. The page now says "Live now runs version 1", and the drift view says "Dev and Live run the same resources." Production numbers its own versions: dev's version 2 is Live's version 1.

7. **See production's side.** Open the workspace **Live**, press **Operate** and choose **Versions**. This is the screen that is **Deploy** in a dev workspace: "What runs here, and what ran before." **VERSIONS OF LIVE** lists `v1`, **Promoted**, by you.

8. **Change the script.** Back in **Dev**, open `tut-greet`. Press **Settings**, and in **What it does** type `Greets a person by name.` Press **Save draft**. Open **Operate**, **Deploy**. Type `Describe the script` in **What changed**, and press **Deploy 1 change**.

9. **See the drift.** Press **03 Promote**. **HOW DEV DIFFERS FROM LIVE** now says "Dev runs v3, Live runs v1. 1 of 1 resources differ.", with `tut-greet` **Changed in Dev**, and the line "Changes what it says it does." Do not promote yet.

10. **Ask as the colleague.** In a second window sign in as `tut.dev@example.com`. The page lists **Tenants**: choose **Tut Ship**, then **Dev** in its workspace list, press **Operate**, choose **Deploy**, and press **03 Promote**. Under **PROMOTING TO LIVE** the page says "You may not promote to Live yourself. Ask, and those who may are shown your request on the tenant's overview, with what it would change." In **A note for whoever decides (optional)** type `Reviewed in dev.` and press **Request promotion of v3**. The page says "Waiting", "Asked just now by Tut Dev for v3.", and offers **Withdraw the request**.

11. **Decide it as the admin.** In your own window open the tenant's overview. Under **NEEDS ATTENTION**, **PROMOTION REQUESTS** reads "Tut Dev asks to promote v3 from Dev to Live", with the note. Press **Review**. The dialog "Promote v3 to Live?" says "Asked by Tut Dev … from Dev.", shows the note and what it changes, and has **Decline…** and **Promote**. Press **Promote**. A second dialog says "Live starts running it at once. Runs in progress there finish on the version they started with." Press **Promote**. The overview says "Nothing needs you", and **Live** reads "Running v2".

12. **Roll back.** Open **Live**, then **Operate**, **Versions**. **VERSIONS OF LIVE** lists `v2`, **Promoted**, and below it `v1`, **Promoted**, with the button **Roll back to this version**. Press it on `v1`. The dialog "Roll back Live to version 1?" says "Live stops running what it runs now and starts running version 1 at once. Runs in progress there finish on the version they started with." Press **Roll back in production**. `v1` moves to the top of the list, once, marked **RUNNING IN LIVE**, with "deployed 2 times", and `v2` below it now has **Deploy this version**.
:::

## What you built

- A tenant `tut-ship` with a production workspace `live` and a dev workspace `dev` that promotes to it.
- A script `tut-greet` that reached production two ways: promoted by someone who may, and promoted on a request from someone who may not.
- A production workspace that runs its first version again. Nothing is lost: `v2` stays in the list. To run `v2` again press **Deploy this version** on it.
