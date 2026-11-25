---
title: The widget frame
description: "The package a tenant's widget view is written with, the messages between the frame and the page, the theme variables a view is given, the limits, and what the page draws around a view."
subjects: [widgets, widget-frame]
---

A widget's view runs in an `<iframe>` on the page, and `@volvel/widget-frame` is the view's side of the conversation. The page posts in what the view is given. The view posts out an event, a height, or that it is ready. This page lists both sides, the limits and the theme variables. Every export with its types is in the generated [`@volvel/widget-frame`](../sdk/widget-frame) and [`@volvel/widget-frame/react`](../sdk/widget-frame-react) pages.

## The package

Install `@volvel/widget-frame`, and `react` and `react-dom` for a view in React. The package has one dependency, `@volvel/widgets`, and makes no network request. A repository builds the view with the CLI, which bundles the package into the view's script: `volvel build`, `volvel dev --widgets` and `volvel deploy` do it.

| Export | From | What it is |
| --- | --- | --- |
| `createFrame(options)` | `@volvel/widget-frame` | Connects the view to its page, says it is ready, and returns a `WidgetFrame`. Call it once, at the top of the view's module. `options.events` is the names of the events the definition declares. |
| `frame.props()` | | What the page last gave, or `undefined` before it has given any. |
| `frame.onProps(callback)` | | Calls back with what the page has given, now if it has, and each time it gives again. Returns a function that stops it. |
| `frame.emit(event, payload?)` | | Raises a declared event. The payload is `{}` when left out. Throws for an event that is not in `options.events`. |
| `frame.requestSize(height)` | | Asks for a height in pixels, rounded and kept between 0 and 4000. The page may give less. |
| `frame.close()` | | Stops listening. |
| `useWidgetProps(frame)` | `@volvel/widget-frame/react` | The props as React state: `undefined` until the first message, then every change. |
| `THEME_VARIABLE_PREFIX` | `@volvel/widget-frame` | `--volvel-`. |

`FrameProps<Config>` is what the page gives:

| Prop | What it is |
| --- | --- |
| `config` | The widget's settings, as the page holds them. |
| `data` | Each data input by name, read by the server for the viewer. See [What a widget view is given](what-a-view-is-given). |
| `state` | `ready`, `loading`, `empty` (with `message`), `failed` (with `message`) or `forbidden` (with `message`). |
| `size` | `w` and `h` in cells, and `narrow`, true when the page is a phone's width or so. |
| `theme` | `scheme` (`light` or `dark`) and `tokens`. |

The page posts the props when the frame says it is ready, and again whenever any of them changes. The package puts the theme on the view's page as CSS variables, sets `data-theme` and `color-scheme` on the root element, and removes a variable the next theme no longer has.

## Messages

Both sides use the protocol `volvel-widget/1`, which `@volvel/widgets/frame` exports with the guards `isHostMessage` and `isFrameMessage`. Every message has `protocol`, and `from` (`host` or `frame`).

| From | `type` | Carries | Checked by the page |
| --- | --- | --- | --- |
| Page | `props` | `props` | |
| View | `ready` | | |
| View | `event` | `event` (a name), `payload` | The name is one the definition declares, and the payload fits the event's schema. |
| View | `size` | `height` (0 to 4000) | A height over 4000 is read as 4000. |

The view posts with the target `*`, because a sandboxed frame has no origin that could be named. The page believes only a message whose source is its own frame's window. The view believes only a message from its parent.

## Limits

| What | Limit |
| --- | --- |
| A message | 64 KB as JSON. A larger one is dropped. |
| Messages | 20 a second. More are dropped. |
| A flood | A view that stays over the rate for 2 seconds is stopped: the frame is removed and the cell says "This widget was stopped: it sent too many messages". |
| A frame's height | What it asks for, up to 4000 px and up to its cell. |
| A frame's first answer | 10 seconds to say `ready`. After that the cell says "This widget did not load". |
| The view's script | 512 KB, checked when the repository is built. |
| Where the view may load from | Its own files and `data:` and `blob:` images. No network. See [How widgets are kept safe](../../explanation/widgets/how-widgets-are-kept-safe). |

An event's `payload` is a JSON Schema. The page reads `type`, `enum`, `const`, `properties`, `required`, `additionalProperties`, `items`, `minItems`, `maxItems`, `minLength`, `maxLength`, `pattern`, `minimum`, `maximum`, `exclusiveMinimum`, `exclusiveMaximum`, `anyOf`, `oneOf` and `allOf`, and the annotation keywords. A schema with another keyword admits nothing.

## What the page draws around a view

| When | The cell says |
| --- | --- |
| The frame has not said `ready` | "Loading" and the widget's title. |
| No frame address can be found | "This widget cannot be shown here." and "Its address could not be found. Reload the page to try again." |
| No `ready` in 10 seconds | "This widget did not load" and "Its page did not answer. Reload to try again." |
| A flood | "This widget was stopped: it sent too many messages" and "Reload the page to try again." |

The widget's own loading, empty, failed and forbidden states are in `state`, and the view draws them. The scaffold draws `Loading` and `Nothing to show`.

## Theme variables

The page gives a view its theme as `--volvel-<token>`. The tokens are the ones a [theme](../../how-to/extensions/theme-your-workspace) sets, with the same meaning, and the view is given the page's values in the page's current scheme. A token the page does not define is not sent. A name or a value that is not plain is dropped: a value may hold letters, digits and `# ( ) , . % " ' -` and spaces, at most 200 characters, and no `url`, `image`, `expression`, `var(`, `env(` or `attr(`.

| Variable | Variable | Variable |
| --- | --- | --- |
| `--volvel-canvas` | `--volvel-surface` | `--volvel-sunken` |
| `--volvel-raised` | `--volvel-structure` | `--volvel-selected` |
| `--volvel-line` | `--volvel-line-strong` | `--volvel-line-control` |
| `--volvel-ink` | `--volvel-ink-muted` | `--volvel-ink-subtle` |
| `--volvel-action` | `--volvel-action-ink` | `--volvel-action-soft` |
| `--volvel-attention` | `--volvel-attention-soft` | `--volvel-danger` |
| `--volvel-danger-soft` | `--volvel-success` | `--volvel-success-soft` |
| `--volvel-code-bg` | `--volvel-focus` | `--volvel-radius-control` |
| `--volvel-radius-panel` | `--volvel-font` | `--volvel-font-code` |

Use them with a fallback where a view may run before it has the first props: `color: var(--volvel-ink, #1a1a1a)`. In `volvel dev --widgets` the preview gives the platform's own values, in light and in dark.

## Related

- [Write a widget for your tenant](../../how-to/writing-a-widget)
- [Give a widget data and events](../../how-to/widget-data-and-events)
- [The widget kind](../kinds/widget)
- [How widgets are kept safe](../../explanation/widgets/how-widgets-are-kept-safe)
