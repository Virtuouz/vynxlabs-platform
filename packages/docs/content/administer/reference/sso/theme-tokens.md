---
title: Theme tokens
description: "The 27 tokens a tenant's portal, sign-in pages and apps, or the console of an instance, can set: what each colors, its value in the component kit in light and dark, and what a value may hold."
subjects: [branding, theme]
---

A theme is a set of tokens. Each is a CSS variable `--vx-<name>` that the component kit uses. A tenant sets them on [Branding](../screens/branding), and an instance sets its console's on [Console branding](../../../self-host/reference/console/branding). A workspace may override a tenant's with a `theme` resource in its repository: where both set a token, the workspace wins, and the first `theme` resource by path is used.

A value left empty is the kit's. In **Dark**, a token that is not set takes the kit's dark value, and the lengths and fonts (`radius-control`, `radius-panel`, `font`, `font-code`) follow light. A color set for light only is not carried into dark.

## What a value may hold

A value is 1 to 200 characters from letters, digits and `# ( ) , . % " ' -` and a space. It is refused when it contains `url`, `image`, `expression`, `var(`, `env(` or `attr(`, in any capitals. The server's reason is "must be a plain color, length or font list". A word such as `notacolor` passes this test; the contrast check on the screen says it cannot read it.

## The tokens

| Token | What it is for | Kit, light | Kit, dark |
| --- | --- | --- | --- |
| `canvas` | The color behind everything: the page's background. | `#f3f5f8` | `#0e1218` |
| `surface` | The color of cards, panels and the body of a page. | `#ffffff` | `#11161d` |
| `sunken` | The color of what is set into a surface, such as a well or a field's background. | `#eef1f5` | `#0f141a` |
| `line` | The hairlines between things: dividers and the edges of a card. | `#dde3ea` | `#1f2731` |
| `ink` | The color of text. | `#0f1720` | `#e7eaee` |
| `ink-muted` | The color of secondary text, such as a description under a heading. | `#4b5666` | `#9aa5b4` |
| `action` | The color of the main button, of links and of what is chosen. | `#0b6b88` | `#5cc2e6` |
| `action-ink` | The color of text on the `action` color. | `#ffffff` | `#071016` |
| `action-soft` | A pale tint of `action`, for a background that points at something chosen. | `#dcf0f7` | `#14252e` |
| `attention` | The color that asks to be noticed without being an error, such as a warning. | `#9a4707` | `#f0a541` |
| `attention-soft` | A pale tint of `attention`, for the background of a warning. | `#fdf0dc` | `#2a2318` |
| `danger` | The color of an error and of what cannot be undone. | `#b3261e` | `#ff8a8d` |
| `danger-soft` | A pale tint of `danger`, for the background of an error. | `#fbe9e7` | `#2e1a1e` |
| `success` | The color of what went well. | `#1b6e45` | `#4fd1a5` |
| `success-soft` | A pale tint of `success`, for the background of a good result. | `#e1f3e9` | `#16292a` |
| `structure` | The color that gives a page its frame, such as the track behind a progress bar. | `#eaeef3` | `#0b0f14` |
| `raised` | The color of what lies above the page, such as a menu or a dialog. | `#ffffff` | `#192029` |
| `selected` | The background of a row or an item that is chosen. | `#e0f0f6` | `#13212a` |
| `line-strong` | A stronger line, where an edge must be seen, such as under a heading. | `#c6cfd9` | `#2a3542` |
| `line-control` | The edge of a control such as an input, which must be seen against what is around it. | `#748090` | `#5e6d81` |
| `ink-subtle` | The color of the faintest text that is still read, such as a hint. | `#586474` | `#8290a1` |
| `code-bg` | The background of code. | `#f5f7f9` | `#0b0f14` |
| `focus` | The ring drawn around what the keyboard is on. | `#0b6b88` | `#5cc2e6` |
| `radius-control` | How round the corners of a button or a field are, as a length. | `8px` | same as light |
| `radius-panel` | How round the corners of a card or a panel are, as a length. | `12px` | same as light |
| `font` | The typeface of text, as a list of fonts to try in order. | `"Geist", ui-sans-serif, system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif` | same as light |
| `font-code` | The typeface of code, as a list of fonts to try in order. | `"Geist Mono", ui-monospace, "SF Mono", "Cascadia Mono", Menlo, Consolas, monospace` | same as light |
## The contrast check

The screen compares 23 pairs of these tokens, in the scheme being edited, and says which fall below the minimum. Text needs 4.5 and the edge of a control needs 3.

| On | Tokens drawn on it |
| --- | --- |
| `canvas`, `surface`, `sunken`, `structure` | `ink`, `ink-muted` and `ink-subtle`, as text |
| `surface` | `action`, `attention`, `success`, `danger` as text; `line-control` as an edge |
| `canvas` | `action` as text; `line-control` as an edge |
| `action` | `action-ink` as text |
| `attention-soft`, `success-soft`, `danger-soft` | `attention`, `success`, `danger` as text |

A pair is checked only when both tokens are set. A color is read when it is a name, `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, `rgb()`, `rgba()`, `hsl()`, `hsla()` or `transparent`. Any other value is listed as "could not be checked".
