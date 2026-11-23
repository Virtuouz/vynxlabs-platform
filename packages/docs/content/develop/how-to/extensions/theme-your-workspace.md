---
title: Theme your workspace
description: Change the colors, corner radii and fonts of a workspace's apps with defineTheme, in light and in dark.
subjects: [theme, apps]
---

## Theme your workspace

By the end the apps a workspace serves will use your colors, your corner radii or your fonts, in a light scheme and in a dark one.

## Before you start

- A tenant repository with a workspace, and the CLI signed in to the instance. Fernhill's repository (`examples/fernhill/src/apps.ts`) has a theme you can copy.
- A theme changes how the workspace's apps look. It does not change the console, which has its own branding that an operator sets once for the instance. A tenant's own colors, logo and name are set under **Branding** on the tenant's page.
- A workspace has one theme. A second is refused when the bundle is checked: "a workspace can have one theme, and "<path>" is already one."

## Set the tokens

:::steps
1. Add a theme to a file of the repository. `tokens` replaces values for the light scheme, and `dark` replaces them for when the viewer prefers a dark one.
2. Set only what you want to change. Every token you leave out keeps the tenant's branding value, and the kit's value where the tenant has none.
3. Set the colors that must change in both `tokens` and `dark`. A color set in `tokens` is not carried into dark: in a dark scheme the kit's dark color stands unless `dark` sets one.
4. Run `volvel deploy`. The workspace's stylesheet carries the new values once the version is deployed.
:::

```ts title="src/apps.ts"
import { defineTheme } from "@volvel/sdk";

/** Fernhill's own colors, for its apps. */
export const theme = defineTheme({
  tokens: {
    action: "#1f6f5c",
    "action-ink": "#ffffff",
    "action-soft": "#e3f1ec",
    "radius-panel": "12px",
  },
  dark: { action: "#6fd1b4", "action-ink": "#062a20", "action-soft": "#173a31" },
});
```

A length or a font set in `tokens` applies in a dark scheme too, because `dark` has no value of its own for it. The path is `theme` unless you give `path`.

## The tokens

The SDK exports the list as `THEME_TOKENS`, and the type `ThemeToken` is made from it. A token that is not in the list is refused. Each one is the CSS variable `--vx-<name>`.

| Token | What it sets |
| --- | --- |
| `canvas` | The color behind everything: the page's background. |
| `surface` | The color of cards, panels and the body of a page. |
| `sunken` | What is set into a surface, such as a well or a field's background. |
| `raised` | What lies above the page, such as a menu or a dialog. |
| `structure` | The color that gives a page its frame, such as the track behind a progress bar. |
| `selected` | The background of a row or an item that is chosen. |
| `line` | Hairlines between things: dividers and the edges of a card. |
| `line-strong` | A stronger line, where an edge must be seen. |
| `line-control` | The edge of a control such as an input. |
| `ink` | The color of text. |
| `ink-muted` | Secondary text, such as a description under a heading. |
| `ink-subtle` | The faintest text that is still read, such as a hint. |
| `action` | The main button, links and what is chosen. |
| `action-ink` | Text on the `action` color. |
| `action-soft` | A pale tint of `action`, for a background that points at something chosen. |
| `attention`, `attention-soft` | A warning, and a pale tint of it for a background. |
| `danger`, `danger-soft` | An error and what cannot be undone, and a pale tint of it. |
| `success`, `success-soft` | What went well, and a pale tint of it. |
| `code-bg` | The background of code. |
| `focus` | The ring drawn around what the keyboard is on. |
| `radius-control` | How round a button or a field is, as a length. |
| `radius-panel` | How round a card or a panel is, as a length. |
| `font` | The typeface of text, as a list of fonts to try in order. |
| `font-code` | The typeface of code, as a list of fonts to try in order. |

There are 27 tokens. Some parts of the kit are worked out from them and cannot be set: a field's background, the hover tint, the focus ring's tint, the track, the scrim behind a dialog, shadows and the height of a control.

### What a value may be

A value is 1 to 200 characters of letters, digits and `# ( ) , . % " ' -` and spaces: a color such as `#1f6f5c` or `rgb(31, 111, 92)`, a length such as `12px`, or a font list such as `"Geist", system-ui, sans-serif`. A value that holds `url`, `image`, `expression`, `var(`, `env(` or `attr(` is refused. The check runs when the bundle is checked, and again when the stylesheet is written.

## The result

The workspace's apps use the new values. The stylesheet the workspace serves is at `/api/v1/tenants/<tenant id>/workspaces/<workspace id>/theme.css`. It has a block of `--vx-` variables for the light scheme, one inside `prefers-color-scheme: dark`, and one for `data-theme="dark"`. A page that sets `data-theme` to `light` or `dark` on its root element chooses a scheme; without it the viewer's system decides.

Open the stylesheet and look for your values: for Fernhill's Sandbox it holds `--vx-action: #1f6f5c;` in the light block and `--vx-action: #6fd1b4;` in the dark ones.

## If it does not work

- **The deploy is refused with "a workspace can have one theme".** Two `defineTheme` calls exist in the repository. The line starts with the path of the extra theme, such as `theme-two (theme):`, and the quoted path is the theme already there. Keep one.
- **The deploy is refused with `/body/tokens/<token> must be a plain color, length or font list.`** The value has a character or a word that is not allowed, such as `url(...)` or `var(--x)`. Write the color itself.
- **The deploy is refused with `/body/tokens must NOT have additional properties (shiny)`.** The name in the parentheses is not one of the 27 tokens. `THEME_TOKENS` lists them.
- **Dark looks unchanged.** You set the color in `tokens` only. Set it in `dark` too.
- **The console did not change.** A theme is for the workspace's apps. The console's look is set by the operator under **Console branding**.
