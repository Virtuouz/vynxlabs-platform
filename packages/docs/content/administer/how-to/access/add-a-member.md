---
title: Add a member
description: "Add someone to the tenant with a role in one step, and give them a way to sign in."
subjects: [access, members]
---

## Add a member

You add a person to the tenant, with the role they need from the first request. At the end they are listed under **Members** and can sign in.

### Before you start

- You need `member:write`. To give a role in the same step you also need `binding:write` at the place you choose. A tenant admin has both.
- Know the person's email. For someone with no account on this instance, also choose a name and an initial password of at least 12 characters.

:::steps
1. Open **Members & access**, then the **Members** tab, and press **Add member**.
2. Type the **Email**. If the person already has an account on this instance, leave **Name** and **Initial password** empty.
3. For a new account, fill in **Name** and **Initial password**. Volvel sends no invitation: you tell them the password yourself.
4. Under **Role**, choose a role. It starts at **No access yet**. Under **Where they work**, choose **The whole tenant** or one workspace. For another role press **Add another role**; a member can be given up to 20 at once.
5. Press **Add member**.
:::

### The result

The notice says "<email> is a member, with <roles>." (or "They hold no role yet."). The person is in the list with the status **Active**, and **Roles** says how many are "given directly". Open them and press **View access** to see what they may do.

The roles are given at once, also when [approval by a second person](ask-for-a-second-person) is on: a role given straight to a member never waits. See [Second-person approval](../../explanation/access/second-person-approval).

### Let them choose their own password

An initial password you typed is known to you. To have the person choose theirs:

:::steps
1. Select the member in the list.
2. Press **Make a password reset link** and confirm with **Make the link**.
3. Where the instance sends mail, the link is emailed to them and you are not shown it. Where it does not, the dialog **Password reset link** shows the link once: copy it and pass it on.
:::

The link works once and runs out after 2 hours. Opening it ends the member's other sign-ins. A tenant admin can make the link for a member who belongs to this tenant and no other, and who holds no role at the instance. For an account that belongs to several tenants, an admin of any of them can make it only where it is emailed and nobody has yet proved the account is theirs; for anyone else an operator makes it.

### When the person's account was made by another tenant

An account is one for each email on the whole instance, so adding someone who already has an account adds that account. If another tenant's admin made it with a password they typed, and its owner never set their own through a mailed link or signed in through single sign-on, nobody has shown the account is theirs. Adding it to your tenant ends everything that could sign in as it until now: sessions, personal API keys, recovery codes and the password. The person then chooses a password with a reset link, which is emailed to them where the instance sends mail and which you can make for them from either tenant. The one exception is whoever typed that password: they may add the account to other tenants without it starting again, because they could already sign in as it. Anyone else adding it starts it again.

A person who has set their own password through a link, or signed in through single sign-on, keeps their sessions, keys, recovery codes and password when your tenant adds them. A password you type for a new account is never taken as proof, so give the person a reset link and let them choose their own.

### If it does not work

- "No member has that email. Send name and password to create one.": the email has no account. Fill in **Name** and **Initial password**.
- A password shorter than 12 characters is refused at the field.
- "<email> also belongs to another tenant or runs the instance, so only an operator can make a password link for them.": ask an operator.
- "<email> signs in with <provider>, and passwords are turned off for them. There is no password to reset.": they sign in through your identity provider.
- A disabled **Add member** or **Make a password reset link** says what it needs: `member:write`.

## Related

- [Members and access](../../reference/screens/members), every control on the screen.
- [Give access](give-access).
