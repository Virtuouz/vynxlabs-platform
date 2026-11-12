import type { ThemeValues } from "@vynxlabs/db";
import { isThemeValue, THEME_TOKENS } from "@vynxlabs/manifest";
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
    canvas: "#eef1f4",
    surface: "#ffffff",
    sunken: "#e3e8ed",
    line: "#d3dae2",
    ink: "#16202e",
    "ink-muted": "#5b6777",
    action: "#0e5f7a",
    "action-ink": "#ffffff",
    "action-soft": "#dcedf3",
    attention: "#b45309",
    "attention-soft": "#fdf0dc",
    danger: "#b3261e",
    "danger-soft": "#fbe9e7",
    success: "#1f7a4d",
    "success-soft": "#e1f3e9",
    "radius-control": "6px",
    "radius-panel": "10px",
    font: 'ui-sans-serif, system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    "font-code": 'ui-monospace, "SF Mono", "Cascadia Mono", Menlo, Consolas, monospace',
  },
  dark: {
    canvas: "#10161f",
    surface: "#18212d",
    sunken: "#0c1118",
    line: "#2b3746",
    ink: "#e6ebf1",
    "ink-muted": "#9aa7b6",
    action: "#5cb8d6",
    "action-ink": "#06222c",
    "action-soft": "#17323d",
    attention: "#f0a94b",
    "attention-soft": "#3a2a12",
    danger: "#f2857d",
    "danger-soft": "#3d1b18",
    success: "#6fcf9a",
    "success-soft": "#153326",
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
            message: "must be a plain colour, length or font list",
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
    `@media (prefers-color-scheme: dark) {\n:root {\n${block(theme.dark)}  color-scheme: dark;\n}\n}\n`
  );
}
