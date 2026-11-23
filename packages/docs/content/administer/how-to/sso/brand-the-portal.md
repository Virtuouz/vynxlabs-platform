---
title: Brand the portal
description: "Set the colors, corners, fonts and logo of the tenant's portal, sign-in pages and apps, see the contrast warnings before saving, and go back to the kit's values."
subjects: [branding, theme]
---

## Brand the portal

By the end the tenant's portal, sign-in pages and apps show your logo and colors, in light and dark, and you know which pairs of colors are hard to read.

## Before you start

- You hold `portal:write`. A tenant admin has it.
- A logo as a PNG, JPEG or WebP image of at most 512 KB. An SVG is not taken here.
- Colors as names, `#hex`, `rgb()` or `hsl()`, so that the contrast can be checked.

## Steps

:::steps
1. Open **Tenant**, then **Branding**. The portal's address is at the top.
2. In **Theme**, fill the tokens you want under **Light**. Leave the rest empty: an empty token keeps the kit's value, shown as the placeholder **kit default**. The preview beside updates as you type, saved or not.
3. Fill the same tokens under **Dark**, where a color is unset the kit's dark value stands. Lengths and fonts follow light.
4. Read under each preview. "Every pair checked is easy to read." means nothing is below its minimum. Otherwise each pair is listed, for example "ink-muted on canvas: 1.47, needs 4.5". Change a color until it is 4.5 for text, or 3 for the edge of a control. A value it cannot read is listed as "could not be checked".
5. Under **Logo**, choose **Upload a logo**. The logo is replaced at once, and the browser makes the tenant's icons from it.
6. Press **Save** in the bar. "Branding saved. The portal and apps show it from their next page."
:::

::screenshot{name=administer/sso-branding-theme alt="The Branding screen: the Portal panel, the light and dark token fields with their swatches, and the preview beside a list of pairs that are hard to read."}

## Let people create their own account

Under **Portal**, check **People may create their own account**. When it is off, only people invited under **End users** have an account. It is saved with the theme.

## Go back to the kit's values

Press **Clear back to the kit's values** and confirm "Go back to the kit's values?". Every field for light and dark is emptied, and nothing changes until you save.

## The result

The portal and the apps show the colors from their next page. The portal's address is shown at the top of the screen; open it to see. A stylesheet is kept by browsers for 60 seconds, and the logo for 300 seconds.

## If it does not work

| You see | Cause and fix |
| --- | --- |
| "<token> must be a plain color, length or font list" | A value has a character that is not allowed, or contains `url`, `image`, `expression`, `var(`, `env(` or `attr(`. See [theme tokens](../../reference/sso/theme-tokens). |
| "Choose a PNG, JPEG or WebP image." | The file is another type. |
| "That image is N. A logo can be 512 KB at most." | Make the image smaller. |
| A workspace shows other colors | A `theme` resource in the workspace's repository overrides the tenant's. The first by path wins. |

The screen has no field for a tenant name: the sign-in pages show the tenant's name.
