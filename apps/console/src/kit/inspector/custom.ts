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
 * });
 * ```
 *
 * - Without a `group`, a piece is a whole section: `section` is a component drawing its own
 *   `DrawerGroup`s (hooks allowed), placed by `order`. `hidesData` names the data parts it draws
 *   itself ("source", "conditions", "sort", "limit", "measure", "breakdown"); `hides` applies to
 *   the setting in every tab. `ownHeading` says it places `HeadingGroup` itself; `headingLast`
 *   sends the shell's Heading group after everything else in the tab.
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
import type { ComponentType, ReactNode } from "react";
import type { Env } from "./controls.tsx";

/** The data parts of a widget's Data tab that a section may draw itself. */
export type DataPartName = "source" | "conditions" | "sort" | "limit" | "measure" | "breakdown";

interface PieceBase {
  tab: Tab;
  order?: number;
  /** Settings this draws in its own way, in any tab: the generic row of each is left out. */
  hides?: readonly string[];
  /** Data parts (of the Data tab) this draws itself, so the shell does not draw them too. */
  hidesData?: readonly DataPartName[];
  when?: (env: Env) => boolean;
  /** The piece places the shell's Heading group itself (`HeadingGroup`): the shell does not. */
  ownHeading?: boolean;
  /** The Heading group is drawn as two fields written in place (the chart's, board 11), not as rows. */
  headingFields?: boolean;
  /** The shell's Heading group goes after everything else in the tab, not before. */
  headingLast?: boolean;
}

/** A piece with a `group`: its rows go into that group of the tab. */
export interface GroupPiece extends PieceBase {
  group: string;
  render: (env: Env) => ReactNode;
  note?: ReactNode | ((env: Env) => ReactNode);
  aside?: ReactNode | ((env: Env) => ReactNode);
}

/**
 * A piece without a group is a whole section: a component that draws its own `DrawerGroup`s
 * (hooks allowed), placed among the tab's groups by `order`.
 */
export interface SectionPiece extends PieceBase {
  group?: undefined;
  section: ComponentType<{ env: Env }>;
}

export type DrawerContribution = GroupPiece | SectionPiece;

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

/** How a type's pieces place the Heading group in a tab. */
export function headingPlace(type: string, tab: Tab): "first" | "last" | "own" {
  const mine = drawersFor(type, tab);
  if (mine.some((one) => one.ownHeading)) return "own";
  return mine.some((one) => one.headingLast) ? "last" : "first";
}

/** Whether a type's Heading group is written in place, as fields, in a tab. */
export const headingIsFields = (type: string, tab: Tab): boolean =>
  drawersFor(type, tab).some((one) => one.headingFields === true);

/** Every config property a type's registered pieces draw themselves (in any tab: a setting is drawn once). */
export function hiddenSettings(type: string): Set<string> {
  return new Set((contributions.get(type) ?? []).flatMap((one) => [...(one.hides ?? [])]));
}

/** The data parts of a type's Data tab that its pieces draw themselves. */
export function hiddenData(type: string): Set<DataPartName> {
  return new Set((contributions.get(type) ?? []).flatMap((one) => [...(one.hidesData ?? [])]));
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
