# Fact-check record: self-host/reference/console/component-kit

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs), 2026-11-23. Paths are under `apps/console/src` unless they start with `apps/control-plane` or `packages`. `Au` = `screens/Authoring.tsx`, `CS` = `screens/CodeSettings.tsx`. Written by the writer; "Checked by" is for the second agent. `KS` = `screens/KitSheet.tsx`.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Route /instance/kit; help topic instance-kit; nav label Component kit. | `nav.ts:289-296`; `App.tsx:214` | writer, run | holds as run |
| /instance/* is for operators; non-operators see For operators with text and link. | `App.tsx:200-204`; `screens/NotFound.tsx:27-40` | writer | holds |
| Eyebrow, title, description. | `KS:143-148` | writer, run | holds as run |
| Sections in order with their labels. | `KS:153-823`; run (headings read on the instance) | writer, run | holds as run |
| 19 swatches. | `KS:60-80` (SWATCHES) | writer | holds |
| Type roles and sizes. | `KS:168-186` | writer | holds |
| Corner boxes. | `KS:190-205` | writer | holds |
| Button variants and sizes, note on promote. | `KS:277-300` | writer | holds |
| Drawer groups. | run: headings Rows it uses, What it shows, Chart type, When a row is clicked, Style, Place in its cell, Columns, Steps; `screens/KitDrawer.tsx` | writer, run | holds as run |
| Dialog and Side sheet buttons. | `KS:780-782` | writer | holds |
| Console-only parts imported from ../kit. | `KS:28-50` | writer | holds |
| Samples read nothing and save nothing. | `KS` has no api import | writer | holds |

Checked by: second agent, 2026-11-23. On the instance (1440 light, 390 dark): the 22 sections in order (`KitSheet.tsx:153-825`, the Drawer from `KitDrawer.tsx:111`), 19 swatches (`KitSheet.tsx:60-80`), type roles and corners texts, no horizontal scroll at 390, keyboard Tab order reaches the sample controls. Corrected: the **Color theme** control is the shell's (`Shell.tsx:581-596`; choices Match the system, Light, Dark), not part of the page; `Facts` and `Panel` exist in `@volvel/ui` (the sheet draws `KeyValues`).
