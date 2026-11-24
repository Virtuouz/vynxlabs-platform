---
title: Invite end users
description: "Invite someone who uses your apps, give them a way to set a password, put them in a group and give them access."
subjects: [access]
---

## Invite end users

You invite a person who uses your apps and does not run the tenant. They choose a password from a link and sign in at the portal.

### Before you start

You need `end_user:write`. Inviting gives no access by itself: you also give access, under step 4.

:::steps
1. Open **End users** and press **Invite an end user**.
2. Type the **Email** and optionally the **Name**. If the tenant has hostnames of its own that are enabled, choose **On which address** the link should open.
3. Press **Invite an end user**. The dialog **Invitation link** shows the link once, with **Copy link** and the time it works until. Where the instance sends mail it says "It was also emailed to them."; where it does not, "This instance sends no mail, so pass the link on yourself."
4. Give access: put them in a group of end users under the **Groups** tab (**People**, **Add an end user**) and give the group a role under **Access**, or open an app to them.
5. For a table that shows each customer their own rows, select the person, press **Attributes** and add the attribute the table's rules use, such as `customer_id`.
:::

### The result

The person is listed with the status **Invited**. When they open the link and choose a password (12 to 200 characters), the status becomes **Active** and **Last signed in** is filled.

### Links, disabling and deleting

- An invitation link works once and runs out after 7 days. A password reset link for someone who has signed in runs out after 2 hours. A new link replaces the older one.
- Someone a provider signs in gets no link.
- **Disable** signs them out of every app at once and keeps what they were given. **Enable** lets them in again.
- **Delete** removes the person and the access given to them. Their rows in tables are kept.

### Let people make their own account

Sign-up is off by default. The switch **People may create their own account** is on the [Branding](../../reference/screens/branding) screen. With it on, the sign-in page offers **Create an account**.

### If it does not work

- The link says it was used or has run out: select the person and press **New invitation link** or **Password reset link** again.
- An attribute name must be lowercase letters, digits and underscores, starting with a letter. A name that is not, or is given twice, is refused at the field, and **Save** sends nothing: "<name> cannot be a name. Use lowercase letters, digits and underscores, starting with a letter, up to 63 characters." or "<name> is given twice. Each name takes one value."

## Related

- [End users](../../reference/screens/end-users), every control on the screen.
- [Rule rows by group or attribute](rule-rows-by-group-or-attribute).
