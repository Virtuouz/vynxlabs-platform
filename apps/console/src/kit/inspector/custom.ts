/**
 * The drawer's extension points: where one widget type adds to, or replaces, what the drawer
 * draws from its definition. The drawer knows no widget by name; a widget's own pieces (the
 * chart's three questions, the table's column list, the list's sample row) are registered here,
 * by the file that draws them, and the drawer places them.
 *
 * ```ts
 * registerDrawer("core/chart", {
 *   tab: "data",
 *   group: "What to chart",       // a group of that tab; made if the tab has none of that name
 *   order: 10,                    // among the group's other rows and groups, lower first
 *   hides: ["mark"],              // config settings this replaces, so they are not drawn twice
 *   render: (env) => <DrawerRow label="Measure" … />,   // rows: DrawerRow, DrawerBlock, ToggleRow…
 *   dot: (env) => env.widget.data?.rows !== undefined,  // optional: this tab has something set
 * });
 * ```
 *
 * - `render` draws the rows that go inside the group's bordered list. Return `DrawerRow`s,
 *   `ToggleRow`s or a `DrawerBlock` of free content. It is given the `Env` every control gets.
 * - A group takes its place among the others by the lowest `order` of what is in it, a
 *   contribution's or a setting's hint (`order`, 1000 when left out).
 * - `when` hides the contribution (and its group, if it leaves it empty) while it returns false.
 * - `note` is drawn under the group's list; `aside` right of its heading.
 * - `tilePreview(type, setting, fn)` draws what a `tiles` setting's tile shows (a button in its
 *   style) in place of an icon; `fn(value, env)` returns the node for one choice.
 * - `registerSettingControl(type, setting, render)` draws one setting your own way, inline.
 * - `registerTabLabel` renames a tab for one type (`core/text` calls Display "Content").
 *
 * Registration is a module side effect; the registry is read on every render.
 */
import type { Tab } from "@volvel/widgets";
import type { ReactNode } from "react";
import type { Env } from "./controls.tsx";

export interface DrawerContribution {
  tab: Tab;
  group: string;
  order?: number;
  render: (env: Env) => ReactNode;
  /** Config properties this draws in its own way: the generic row of each is left out. */
  hides?: readonly string[];
  when?: (env: Env) => boolean;
  note?: ReactNode | ((env: Env) => ReactNode);
  aside?: ReactNode | ((env: Env) => ReactNode);
  /** The tab has something set because of this (a dot on the tab). */
  dot?: (env: Env) => boolean;
}

const contributions = new Map<string, DrawerContribution[]>();

/** Adds a piece to a widget type's drawer. Returns a function that takes it away again. */
export function registerDrawer(type: string, contribution: DrawerContribution): () => void {
  const list = contributions.get(type) ?? [];
  list.push(contribution);
  contributions.set(type, list);
  return () => {
    const now = contributions.get(type) ?? [];
    contributions.set(
      type,
      now.filter((one) => one !== contribution),
    );
  };
}

/** What a type has registered for a tab. */
export function drawersFor(type: string, tab: Tab): DrawerContribution[] {
  return (contributions.get(type) ?? []).filter((one) => one.tab === tab);
}

/** Every config property a type's registered pieces draw themselves. */
export function hiddenSettings(type: string, tab: Tab): Set<string> {
  return new Set(drawersFor(type, tab).flatMap((one) => [...(one.hides ?? [])]));
}

// ---------------------------------------------------------------------------
// What a tile shows

export type TilePreview = (value: string, env: Env) => ReactNode;
const previews = new Map<string, TilePreview>();

/** The thing a tile draws for each choice of a `tiles` setting: a button in its style, a callout. */
export function registerTilePreview(type: string, setting: string, preview: TilePreview) {
  previews.set(`${type}:${setting}`, preview);
}

export const tilePreviewFor = (type: string, setting: string): TilePreview | undefined =>
  previews.get(`${type}:${setting}`);

// ---------------------------------------------------------------------------
// A setting drawn by a control of its own

export type SettingRenderer = (env: Env) => ReactNode;
const renderers = new Map<string, SettingRenderer>();

/**
 * Draws one config setting of a type in a way of its own, in place of the generic control its
 * hint names. It is drawn inline in the group (not as a row that opens an editor), so draw the
 * whole of it: label included. The List's sample-row editor is `registerSettingControl("core/list", "places", …)`.
 */
export function registerSettingControl(type: string, setting: string, render: SettingRenderer) {
  renderers.set(`${type}:${setting}`, render);
}

export const settingControlFor = (type: string, setting: string): SettingRenderer | undefined =>
  renderers.get(`${type}:${setting}`);

// ---------------------------------------------------------------------------
// Tab names

const labels = new Map<string, Partial<Record<Tab, string>>>([
  ["core/text", { display: "Content" }],
]);

/** A tab's name for a type, when it is not the usual one. */
export function registerTabLabel(type: string, tab: Tab, label: string) {
  labels.set(type, { ...(labels.get(type) ?? {}), [tab]: label });
}

export const tabLabelFor = (type: string, tab: Tab): string | undefined => labels.get(type)?.[tab];
