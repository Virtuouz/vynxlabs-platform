---
title: Invite a pet owner to see their own rows
description: Invite an end user to Fernhill's portal, give them the attribute that ties them to a client, and watch the app show them only their own pets and invoices.
subjects: [access, apps, tables]
---

You will have a pet owner who signed in to Fernhill's portal on a phone-sized screen, a first look at an app that shows them nothing, and then the same app showing only their pets and their invoices, and different ones when you change one fact about them. It takes about 20 minutes.

## Before you start

- You can sign in to the console as Maya Brooks, `maya.brooks@fernhill.example`, a tenant admin of Fernhill. The seeded password is `fernhill-demo-2026`. Inviting an end user and giving one attributes are tenant admin acts.
- Fernhill is set up. Its app **My Fernhill account** is published in the Sandbox and in Clinics, and open to every end user, and the tables it reads, including `invoices`, have rules that match an end user's `client_id`. See the [rules a table keeps](../../console/explanation/how-tables-work) for what a rule is. See [Set up the Fernhill example](../../start/how-to/example/set-up-the-fernhill-example).
- A browser, and a second window. The steps use a narrow window, 390 pixels wide, as a phone is. The console needs no mail server for this: the invitation link is shown on screen.

:::steps
1. **Open End users.** Sign in as Maya. In the narrow bar on the left press **Tenant**, then choose **End users**. The page says "The people who sign in to this tenant's portal and apps: the client's own customers. They belong to this tenant alone, separate from members, and never see the console." The list has **Email**, **Name**, **Status**, **Groups** and **Last signed in**.

2. **Invite someone.** Press **Invite an end user**. Fill in **Email** `tut.owner@example.com` and **Name** `Tut Owner`. Leave **On which address** at **This instance's own address**. Press **Invite an end user**.

3. **Copy the link.** The dialog **Invitation link** says "Whoever opens it chooses the password for tut.owner@example.com." and shows an address that begins `/portal/fernhill/set-password?token=`. It says it works once, until a date a week away, and is not shown again. If the instance sends mail, it says "It was also emailed to them." Press **Copy link**, then **Done**. The new person is in the list, **Active**, with no **Groups**.

4. **Choose a password as the owner.** Open a second window, 390 pixels wide, and paste the link. The page says "Welcome", "Choose a password for tut.owner@example.com." Type `tut-owner-pass-2026` and press **Save and sign in**. You land on the portal's home, **Apps**, with **My Fernhill account** and "Your pets, your invoices, and asking for a visit." and "Signed in as tut.owner@example.com."

5. **Open the app.** Press **My Fernhill account**. The portal opens the app's copy in the production workspace Clinics, at `/apps/fernhill/clinics/my-account/`. This tutorial follows the Sandbox's copy, which has other rows: in the address bar open `/apps/fernhill/sandbox/my-account/`. The app's menu has **My details**, **My pets** and **My invoices**. **My details** says "Your details" and "There is nothing here for you yet." The owner is signed in and may open the app, and no row is theirs yet.

6. **Say who this person is.** As Maya, in **End users**, search for `tut.owner` and open the row. The panel shows **Groups** "None" and **ATTRIBUTES** "None. A table's rules can match facts such as which customer they belong to." Press **Attributes**. In **Name** type `client_id` and in **Value** type `C-1001`. Press **Save**. The panel now reads **ATTRIBUTES** `client_id` `C-1001`.

7. **Look again as the owner.** In the owner's window reload `/apps/fernhill/sandbox/my-account/` and press **My pets**. It lists Pepper, Shadow and Willow, each with **Request an appointment**, and "Visits you have asked for" says "There is nothing here yet." (Clinics' copy keeps its own rows: it lists only Willow, a Dachshund.) Press **My invoices**. It lists invoices of that client, each with its number, clinic, date, amount and **Paid** or **Unpaid**.

8. **Read the rule.** As Maya, press **Data**, then **Tables**, and open `invoices`. Choose **Definition**. Under **Who sees rows** it says "By 2 rules.", and one of them is "People whose client_id is in client_code may read the row." The rule matches the person's `client_id` to the row's `client_code`: that is why step 6 changed what they see.

9. **Change who they are.** In **End users**, open the owner again, press **Attributes** and change the value to `C-1005`. Press **Save**. In the owner's window reload and open **My pets**: it lists Kiwi and Rosie now, and **My invoices** lists other invoices. Nothing in the app changed. Only the person did.
:::

## What you built

- An end user `tut.owner@example.com`, who signs in at `/portal/fernhill/sign-in` and sees no console.
- An attribute `client_id` on that person. It is the one fact the table's rule reads.
- The proof that a row rule, not the app, decides what a person receives: the app is the same for every end user.

An invitation link works once. To give the same person another, open them in **End users** and press **Password reset link**.
