# Fact-check record: develop/reference/tenant-widgets/the-widget-frame

Lines are current at commit `aabf96af` (branch p34-b6) plus the docs of this lane, 2026-11-24. Written by the writer (B6); "Checked by" is for the second agent. Lane b4r reviews the frame host and the widget route at the same time: re-check the rows marked (b4r) after it merges.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| `createFrame`, `frame.props/onProps/emit/requestSize/close`, `useWidgetProps`, `THEME_VARIABLE_PREFIX`. | `packages/widget-frame/src/index.ts:25-120`; `react.tsx` | writer | holds |
| `emit` throws for an undeclared event; payload default `{}`. | `packages/widget-frame/src/index.ts:80-90` | writer | holds |
| `requestSize` rounds and keeps 0 to 4000. | `packages/widget-frame/src/index.ts:99-110`; `packages/widget-sdk/src/frame.ts:22` | writer | holds |
| FrameProps: config, data, state, size, theme; theme has scheme and tokens. | `packages/widget-sdk/src/frame.ts:38-60` | writer | holds |
| The package applies the theme as CSS variables, `data-theme`, `color-scheme`, and removes variables the next theme lacks. | `packages/widget-frame/src/index.ts:58-68` | writer | holds |
| Protocol `volvel-widget/1`, messages props, ready, event, size; guards. | `packages/widget-sdk/src/frame.ts:19,62-96` | writer | holds |
| The view posts with target `*`; the page believes only the frame's own window; the view only its parent. | `packages/widget-frame/src/index.ts:56,72`; `TenantWidgetHost.tsx:101-117` (b4r) | writer | holds |
| 64 KB, 20 a second, flood after 2 s. | `packages/screens/src/frameChannel.ts:12-18` (b4r) | writer | holds |
| A height over 4000 is read as 4000. | `frameChannel.ts:96-104` | writer | holds |
| 10 seconds to say ready; the cell's four messages. | `TenantWidgetHost.tsx:47,172-183,209` (b4r) | writer | holds |
| 512 KB script limit. | `packages/cli/src/widget-build.ts:8` | writer | holds |
| Payload schema keywords. | `packages/widget-sdk/src/schema.ts:1-40` | writer | holds |
| 27 theme tokens; the variable names. | `packages/screens/src/frameTheme.ts:5-33` | writer, counted | holds |
| A variable's name and value are checked: pattern, 200 characters, forbidden words. | `packages/widget-sdk/src/frame.ts:98-113` | writer | holds |
| A token the page does not define is not sent. | `packages/screens/src/frameTheme.ts:48-52` | writer | holds |
| The preview gives the platform's own token values in light and dark. | `packages/cli/src/dev-widgets-css.ts` | writer | holds |
| On a page the host posts `state` as ready. | `TenantWidgetHost.tsx:96` (b4r) | writer | holds |
