---
title: Branding
topic: tenant-branding
description: "Every control, state and permission of the Branding screen: the portal's sign-up switch, the theme tokens in light and dark with a preview and a contrast check, and the logo."
subjects: [branding, theme]
moved_from:
  - tenant/branding
---

The **Branding** screen sets how the tenant's portal, sign-in pages and apps look to its end users, and whether people may create their own account there. It does not change the console, which keeps its own look. The instance's operators brand the console on [Console branding](../../../self-host/reference/console/branding).

A tenant has no display name to set here. The sign-in pages show the tenant's name.

The screen is under **Tenant**, in the group **Delivery**. F1 opens the help topic `tenant-branding`.

::screenshot{name=administer/sso-branding-theme alt="The Branding screen: the Portal panel, the light and dark token fields with their swatches, and the preview beside a list of pairs that are hard to read."}

## Portal

| Control | What it does |
| --- | --- |
| The portal link | The tenant's portal address, which opens in a new tab. |
| The mail note | "This instance sends mail, so invitations and password reset links are emailed to them." or "This instance sends no mail, so invitation and password reset links have to be passed on by hand. They are shown under End users when they are made." |
| **People may create their own account** | Off by default. "When this is off, only people invited under End users have an account." |

## Theme

The theme sets the colors, corners and fonts of the portal, sign-in pages and apps. Each **token** is a field named for the CSS variable `--vx-<name>`, under **Light** and under **Dark**. A field left empty keeps the component kit's value, which is the field's placeholder (**kit default**). A workspace can override the theme with a theme resource in its repository; see [theme tokens](../sso/theme-tokens).

| Control | What it does |
| --- | --- |
| A token field | Its label for a screen reader is the token and the scheme, for example "action, light". A color token shows a swatch of what it comes to. |
| **Clear back to the kit's values** | Asks "Go back to the kit's values?", then empties every field for light and dark. Nothing changes until the page is saved. |

The 27 tokens, and what each may hold, are in the [theme tokens reference](../sso/theme-tokens). A value the server refuses is shown under its field, as "<token> must be a plain color, length or font list", and above the buttons as "That is not a theme."

### Preview and contrast

**Preview** draws a few kit components, in light and in dark, under the values in the fields, saved or not. Under each preview, a contrast check compares the colors that are drawn on each other: 23 pairs, text against 4.5 and the edge of a field against 3. It warns and never blocks saving.

| Message | Means |
| --- | --- |
| "Every pair checked is easy to read." | No pair that has both colors set is below its minimum. |
| "N pairs are hard to read:" | Each pair is listed as "ink-muted on canvas: 1.47, needs 4.5". |
| "N pairs could not be checked. Use a color written as a name, #hex, rgb() or hsl() to have them checked:" | A token holds a value that is not a color the check reads, such as `notacolor`. It names the token and its value. |

A pair is checked only when both of its tokens are set in that scheme.

## Logo

| Control | What it does |
| --- | --- |
| The current logo | Shown when there is one. Otherwise "No logo yet." |
| **Upload a logo** / **Replace the logo** | A PNG, JPEG or WebP image of at most 512 KB. Choosing a file replaces the logo at once, outside the save bar. The browser also makes the tenant's icons from it. |
| **Remove logo** | Asks "Remove the logo? The sign-in pages show the tenant's name alone." Removes the logo and its icons. |

An image of another type is refused with "Choose a PNG, JPEG or WebP image." and one that is too large with "That image is N. A logo can be 512 KB at most."

## Saving

The portal switch and the theme are saved together, with the save bar. :kbd[Ctrl+S] or :kbd[⌘S] saves, **Discard** puts the fields back, and leaving with unsaved changes asks first. After saving: "Branding saved. The portal and apps show it from their next page."

## States

| State | What you see |
| --- | --- |
| Not loaded | The error state, with a retry. |
| Read only | "You can see this tenant's branding, not change it. It needs `portal:write`." The controls are disabled. |

## Permissions

| Action | Needs |
| --- | --- |
| See the portal's settings and branding | `portal:read` |
| Change them, upload or remove the logo | `portal:write` |

## Related

- [Brand the portal](../../how-to/sso/brand-the-portal)
- [Theme tokens](../sso/theme-tokens)
