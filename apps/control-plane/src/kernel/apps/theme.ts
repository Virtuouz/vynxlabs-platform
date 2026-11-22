import type { ThemeValues } from "@volvel/db";
import { isThemeValue, THEME_TOKENS } from "@volvel/manifest";
import type { Db, Trx } from "../audit.js";
import { badRequest } from "../errors.js";

type Tokens = Record<string, string>;

/**
 * The component kit's own values. They are written here as well as in the kit's
 * stylesheet because the platform's own pages, such as sign-in, are served
 * without the kit. A test holds the two to each other.
 */
export const DEFAULT_THEME: { tokens: Tokens; dark: Tokens } = {
  tokens: {
    canvas: "#f3f5f8",
    surface: "#ffffff",
    sunken: "#eef1f5",
    line: "#dde3ea",
    ink: "#0f1720",
    "ink-muted": "#4b5666",
    action: "#0b6b88",
    "action-ink": "#ffffff",
    "action-soft": "#dcf0f7",
    attention: "#9a4707",
    "attention-soft": "#fdf0dc",
    danger: "#b3261e",
    "danger-soft": "#fbe9e7",
    success: "#1b6e45",
    "success-soft": "#e1f3e9",
    structure: "#eaeef3",
    raised: "#ffffff",
    selected: "#e0f0f6",
    "line-strong": "#c6cfd9",
    "line-control": "#748090",
    "ink-subtle": "#586474",
    "code-bg": "#f5f7f9",
    focus: "#0b6b88",
    "radius-control": "8px",
    "radius-panel": "12px",
    font: '"Geist", ui-sans-serif, system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    "font-code":
      '"Geist Mono", ui-monospace, "SF Mono", "Cascadia Mono", Menlo, Consolas, monospace',
  },
  dark: {
    canvas: "#0e1218",
    surface: "#11161d",
    sunken: "#0f141a",
    line: "#1f2731",
    ink: "#e7eaee",
    "ink-muted": "#9aa5b4",
    action: "#5cc2e6",
    "action-ink": "#071016",
    "action-soft": "#14252e",
    attention: "#f0a541",
    "attention-soft": "#2a2318",
    danger: "#ff8a8d",
    "danger-soft": "#2e1a1e",
    success: "#4fd1a5",
    "success-soft": "#16292a",
    structure: "#0b0f14",
    raised: "#192029",
    selected: "#13212a",
    "line-strong": "#2a3542",
    "line-control": "#5e6d81",
    "ink-subtle": "#8290a1",
    "code-bg": "#0b0f14",
    focus: "#5cc2e6",
  },
};

const KNOWN = new Set<string>(THEME_TOKENS);

/** Checks token overrides someone sent, and returns them with nothing else in. */
export function cleanTheme(input: ThemeValues): ThemeValues {
  const clean = (values: Record<string, string> | undefined, where: string) => {
    const kept: Tokens = {};
    for (const [token, value] of Object.entries(values ?? {})) {
      if (!KNOWN.has(token)) {
        throw badRequest("That is not a theme.", [
          { path: `/${where}/${token}`, message: "is not a theme token" },
        ]);
      }
      if (!isThemeValue(value)) {
        throw badRequest("That is not a theme.", [
          {
            path: `/${where}/${token}`,
            message: "must be a plain color, length or font list",
          },
        ]);
      }
      kept[token] = value;
    }
    return kept;
  };
  return { tokens: clean(input.tokens, "tokens"), dark: clean(input.dark, "dark") };
}

// Values are checked when they are stored. They are checked again when written
// out, so that nothing reaches a stylesheet unchecked whatever path stored it.
const safe = (values: Record<string, unknown> | undefined): Tokens =>
  Object.fromEntries(
    Object.entries(values ?? {}).filter(
      (pair): pair is [string, string] => KNOWN.has(pair[0]) && isThemeValue(pair[1]),
    ),
  );

/** The tokens in force for a tenant, or for one of its workspaces: the kit's, then the tenant's, then the workspace's. */
export async function resolveTheme(
  db: Db | Trx,
  tenantId: string,
  workspaceId?: string,
): Promise<{ tokens: Tokens; dark: Tokens }> {
  const portal = await db
    .selectFrom("tenant_portal")
    .select("theme")
    .where("tenant_id", "=", tenantId)
    .executeTakeFirst();
  const workspace = workspaceId
    ? await db
        .selectFrom("resource")
        .select("body")
        .where("workspace_id", "=", workspaceId)
        .where("tenant_id", "=", tenantId)
        .where("kind", "=", "theme")
        .orderBy("path")
        .executeTakeFirst()
    : undefined;
  const ofWorkspace = (workspace?.body ?? {}) as ThemeValues;
  const light = { ...safe(portal?.theme.tokens), ...safe(ofWorkspace.tokens) };
  return {
    tokens: { ...DEFAULT_THEME.tokens, ...light },
    // A value set for light only is not carried into dark: there the kit's dark value stands.
    dark: { ...DEFAULT_THEME.dark, ...safe(portal?.theme.dark), ...safe(ofWorkspace.dark) },
  };
}

const block = (values: Tokens) =>
  Object.entries(values)
    .map(([token, value]) => `  --vx-${token}: ${value};\n`)
    .join("");

/** The tokens as a stylesheet. Loaded after the kit's own, it replaces the kit's values. */
export function themeCss(theme: { tokens: Tokens; dark: Tokens }): string {
  return (
    `:root {\n${block(theme.tokens)}  color-scheme: light;\n}\n` +
    // Dark follows the system unless the page's root element carries a choice in `data-theme`.
    `@media (prefers-color-scheme: dark) {\n:root:not([data-theme="light"]) {\n${block(theme.dark)}  color-scheme: dark;\n}\n}\n` +
    `:root[data-theme="dark"] {\n${block(theme.dark)}  color-scheme: dark;\n}\n`
  );
}
