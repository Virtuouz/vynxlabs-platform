/**
 * Icons for apps, from Lucide: `import { Calendar, PawPrint } from "@volvel/ui/icons"`.
 * Each icon is a component that takes `size`, `strokeWidth` and `className`, and
 * draws in the current text color. Only the icons an app imports are built into it.
 * Give an icon that stands alone a label (`aria-label`), and mark one beside its
 * own text `aria-hidden`.
 *
 * Three sizes and one stroke keep icons one texture (07, P4-3): `ICON.sm` (14)
 * beside small text and in controls, `ICON.md` (16) beside body text, `ICON.lg`
 * (20) alone. `PageShell` draws them all at `STROKE`.
 */
export * from "lucide-react";

/** The three icon sizes, in px. */
export const ICON = { sm: 14, md: 16, lg: 20 } as const;
/** The one stroke width. */
export const STROKE = 1.75;
