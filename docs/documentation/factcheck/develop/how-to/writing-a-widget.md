# Fact-check record: develop/how-to/writing-a-widget

Lines are current at commit `aabf96af` (branch p34-b6) plus the docs of this lane, 2026-11-24. Written by the writer (B6); "Checked by" is for the second agent. Lane b4r reviews the frame host and the widget route at the same time: re-check the rows marked (b4r) after it merges. Run log: `docs/documentation/runs/develop/how-to/writing-a-widget.md`.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| `volvel widget new <name>` writes widget.ts, view.tsx, fixture.json, adds an export to the entry, prints the two lines quoted. | `packages/cli/src/widget.ts:169-171`; run | writer, run 2026-11-24 | holds as run |
| A name is small letters, digits and "-", starting with a letter, up to 41 characters. | `packages/cli/src/widget.ts:7` (`^[a-z][a-z0-9-]{0,40}$`) | writer | holds |
| The scaffold: data input `value` (summary), dataHints, setting `label` in Display with a default, event `clicked`, 4x3, version 0.1.0. | `packages/cli/src/widget.ts:28-60`; `packages/cli/src/widget.test.ts` | writer, run | holds |
| `volvel build` lists `widget     x/<name>`. | run | writer, run | holds as run |
| The build refuses a view that does not compile, imports from http(s), calls import(), or is over 512 KB. | `packages/cli/src/widget-build.ts:8,54`; `packages/cli/src/build.test.ts` ("a widget in a repository") | writer | holds |
| `volvel dev --widgets` prints "N widgets previewed at <address>/_dev/widgets", needs no instance; controls: size presets 1440/768/390, width, height, theme, state (ready, loading, empty, failed, forbidden), config fields, data JSON, event log; passed/dropped. | `packages/cli/src/dev-widgets.ts`; `packages/screens/runtime/dev-widget-host.ts`; run | writer, run | holds as run |
| Pressing the preview's button logs "clicked passed the host's checks". | run (`.entry` text) | writer, run | holds as run |
| Deploy: `Deployed version N to sandbox (dev): …` and `created  widget     x/waiting-room`. | run | writer, run | holds as run |
| Same version, other files: "x/waiting-room 0.1.0 is already deployed with other files. A version's files never change, because pages are placed with it: raise the widget's version." | `apps/control-plane/src/kernel/widgets.ts:103`; run | writer, run | holds as run |
| Dashboard flow: **New dashboard**, **Name**, **Make the dashboard**, **Add to page**, tile "Waiting room" with "Your widget", **Source** "Not set", **Appointments**, **Only include** **Condition**, Status, **is**, **Checked in**, **Add**, **Done**. | `apps/console/src/screens/builder` (labels read in the run); run | writer, run | holds as run |
| A needed permission: `dashboard:write` to make a dashboard; `deployment:write` to deploy and to remove a version. | `apps/control-plane/src/routes/dashboards.ts:286`; `routes/widgets.ts:108`; `routes/authoring.ts:537` | writer | holds |
| A page keeps the version it was placed with; notice "Version 0.2.0 is deployed. This page uses 0.1.0." and "Adds Big type."; **Update to v0.2.0** writes nothing until pressed. | `apps/console/src/kit/inspector/Inspector.tsx:335-339`; `apps/console/src/tenant-widgets.test.tsx`; run | writer, run | holds as run |
| `version` is a field of a placed widget in a page's file. | `packages/widget-sdk/src/page.ts:227` | writer | holds |
| Removal while placed: "Could not deploy to sandbox. A page still places this widget. Move each to another version or take the widget off it, then remove it." and the line naming the dashboard. | `apps/control-plane/src/kernel/widgets.ts:226`; run | writer, run | holds as run |
| Deleting a widget's last placement and deploying removes the widget and its versions. | run (versions list empty after the deploy) | writer, run | holds as run |
| `DELETE …/widgets/<name>/versions/<version>` needs `deployment:write`; refused for a placed version ("widget_in_use") and the current one ("…is the version of x/<name> that the repository defines now. Deploy a newer version first."). | `routes/widgets.ts:108`; run | writer, run | holds as run |
| "This deploy would delete 8 resources made in the console, because this repository has no file for them." and `volvel pull` / `--allow-delete`. | `packages/cli/src/cli.ts:471`; run | writer, run | holds as run |
| Frame messages: "did not load" after 10 s; "was stopped" after over 20 a second for 2 s. | `packages/screens/src/TenantWidgetHost.tsx:47,178,182`; `frameChannel.ts:12-18` (b4r) | writer | holds |
| The widget's page checks an event's name and payload; a name starts with a small letter, letters and digits, up to 41. | `packages/widget-sdk/src/index.ts:306`; `packages/manifest/src/widget.ts` | writer | holds |
| Add to page lists a tenant widget in its category with "Your widget". | `apps/console/src/screens/builder/registry.ts`; run | writer, run | holds as run |
