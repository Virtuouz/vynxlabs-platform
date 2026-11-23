---
title: Console branding
topic: instance-branding
description: "Every control, state and permission of the Console branding screen: the product name, the logo, the colors, corners and fonts for light and dark, the preview, and what it does not change."
subjects: [instance, branding]
moved_from:
  - instance/branding
---

The **Console branding** screen sets how the console looks to everyone who signs in to this instance: its name, its mark and its colors. It is set once for the instance. It does not follow a tenant: a tenant brands its own apps and portal from its [Branding](../../../administer/reference/screens/branding) screen, and that never changes the console. The screen is in the **Instance** area. F1 (**Help for this page**) opens the help topic `instance-branding`.

The instance's name, logo and theme are public, because the sign-in screen needs them before anyone has signed in.

::screenshot{name=self-host/instance-branding alt="The Console branding screen: the product name field and the logo, then the Light and Dark columns of color, corner and font tokens, and a preview of each."}

The title is **Console branding**. The description reads "How this console looks to everyone who signs in to it: its name, its mark and its colors. Tenants brand their own apps and portal; that never changes the console. Changes are saved together, from the bar that appears below."

## Controls

### Name and mark

| Control | What it does |
| --- | --- |
| **Product name** | Optional, at most 60 characters. "Shown in the rail, on the sign-in screen and as the window's title. Empty uses the default." The default is Volvel. |
| The mark | Shows the logo, or the name's initials when there is no logo ("No logo: the mark is the name's initials."). |
| **Upload a logo** / **Replace the logo** | A file chooser: "PNG, JPEG, WebP or SVG, up to 512 KB. Square works best. Choosing one replaces the logo at once." It does not wait for the save bar. The console draws the icons for the browser tab and the home screen from it, in the browser; if that fails it says "The icons could not be made from the logo, so the tab keeps the icon it had." A wrong type is refused with "Choose a PNG, JPEG, WebP or SVG image." and a larger file with "That image is SIZE. A logo can be 512 KB at most." |
| **Remove logo** | Shown when there is a logo. Asks "Remove the logo? The console shows the name's initials instead." Removes the logo and its icons. |

### Colors, corners and fonts

Two columns, **Light** and **Dark**, each with the same 27 tokens, one text box per token. A box left empty keeps the console's own value, shown as its placeholder ("kit default", and for the corners and fonts of the dark column "same as light"). A color token also shows a swatch.

| Group | Tokens |
| --- | --- |
| Surfaces | `canvas`, `surface`, `sunken`, `structure`, `raised`, `selected` |
| Lines | `line`, `line-strong`, `line-control` |
| Text | `ink`, `ink-muted`, `ink-subtle`, `code-bg` |
| Action | `action`, `action-ink`, `action-soft` |
| State | `attention`, `attention-soft`, `danger`, `danger-soft`, `success`, `success-soft`, `focus` |
| Corners | `radius-control`, `radius-panel` |
| Fonts | `font`, `font-code` |

A value is a plain color, length or font list: letters, digits and `# ( ) , . % " '`, a space and a hyphen, 1 to 200 characters. A value with `url`, `image`, `expression`, `var(`, `env(` or `attr(` is refused. A refused value is shown under its box with the token's name.

Production is always marked in the attention color. The screen says so: "Production is always marked in the attention color, so keep it clearly amber."

| Control | What it does |
| --- | --- |
| **Clear back to the console's values** | Asks "Go back to the console's own values?": "Every value set here is cleared, for light and for dark. Nothing changes until the page is saved." Press **Clear them**. |
| The **Light** and **Dark** previews | A few components drawn under the values typed: badges, a field, a notice, buttons. Under each, a contrast check says "Every pair checked is easy to read.", or lists the pairs that are hard to read with their ratio and the ratio they need, and the values it could not read as colors. It warns; saving is still allowed. |

### The save bar

When anything differs from what is saved, a save bar appears below with the usual **Save** and **Discard**. The name and the colors are saved together. When it works the console says "The console's branding is saved. Everyone sees it on their next page." The logo is not part of the bar. The change is audited as `instance.branding_updated`; the logo as `instance.logo_set` and `instance.logo_removed`.

## States

| State | What you see |
| --- | --- |
| Loading | The screen's loading state. |
| Not loaded | The error state with a retry. |
| Read only for you | A line says "You can see how this instance's console looks, not change it. It needs `instance:write`. Ask an operator of this instance to give you access." Every control is disabled. |
| A value is refused | The token's box is marked and the server's reason is shown under it, and in a notice below the columns. |
| Read only instance | The strip "The instance is read only." is on every screen; the save bar is disabled with the reason. |

## Permissions

| Action | Needs |
| --- | --- |
| See the screen | The branding is public to read. The screen is in the Instance area for operators. |
| Save, upload or remove the logo | `instance:write` at the instance. |

## Related

- [Component kit](component-kit): every part of the console, drawn with the branding in force.
- [Console branding](../../../administer/reference/screens/branding): a tenant's own branding, which is for its apps and portal.
