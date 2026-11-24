/**
 * The one place the console builds its widget registry, one per workspace: the packs the
 * platform ships (the core pack and the labs pack, decision 0005) and the widgets the
 * workspace deployed (`x/...`, from `GET .../widgets`). The editor's "Add to page" and
 * inspector read the definitions; the page's renderer is given the view registry made from
 * the same, so what can be added is what can be drawn.
 *
 * A tenant widget has no React view in the platform: it is drawn by `TenantWidgetHost`.
 * The workspace's widgets are loaded by `useWorkspaceWidgets` where a screen opens a
 * workspace's pages; until they are, only the platform's are here. A page that names a
 * widget not here is drawn as one no pack declares.
 */

import type { PageWidget } from "@volvel/manifest";
import { workspaceViews } from "@volvel/screens";
import {
  compareVersions,
  type DeployedWidget,
  type Surface,
  updateNotes,
  type WidgetDefinition,
  WidgetRegistry,
  type WorkspaceWidgets,
} from "@volvel/widgets";
import { useEffect, useSyncExternalStore } from "react";
import { api } from "../../api.ts";
import {
  corePack,
  labsPack,
  type ViewRegistry,
  viewRegistry,
  type WidgetPack,
} from "./renderer.ts";

/** Every pack the platform ships, the platform's own first. */
export const PACKS: readonly WidgetPack[] = [corePack, labsPack];

const platformViews: ViewRegistry = viewRegistry(...PACKS);
const platformDefinitions = new WidgetRegistry(PACKS.flatMap((pack) => pack.definitions));

interface State {
  root: string | undefined;
  deployed: readonly DeployedWidget[];
  definitions: WidgetRegistry;
  views: ViewRegistry;
}
const platformOnly: State = {
  root: undefined,
  deployed: [],
  definitions: platformDefinitions,
  views: platformViews,
};
let state: State = platformOnly;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** Makes a workspace's widgets the ones this console offers and draws. */
export function setWorkspaceWidgets(root: string, deployed: readonly DeployedWidget[]): void {
  state = {
    root,
    deployed,
    definitions: platformDefinitions.withDeployed(deployed),
    views: workspaceViews(platformViews, deployed),
  };
  for (const listener of listeners) listener();
}

/** Back to the platform's packs alone. */
export function resetWorkspaceWidgets(): void {
  state = platformOnly;
  for (const listener of listeners) listener();
}

/**
 * Loads the workspace's widgets, and keeps the screen drawn from them. Called where a screen
 * opens a workspace's pages; a workspace that cannot say (not permitted, or no answer) has the
 * platform's packs alone. Returns whether they are loaded, for a screen that waits.
 */
export function useWorkspaceWidgets(root: string): boolean {
  useEffect(() => {
    if (state.root === root) return;
    let live = true;
    // Another workspace's widgets are not this one's while its own are on the way.
    if (state.root !== undefined) resetWorkspaceWidgets();
    api.get<WorkspaceWidgets>(`${root}/widgets`).then(
      (found) => {
        if (live) setWorkspaceWidgets(root, found.items);
      },
      () => {
        if (live) setWorkspaceWidgets(root, []);
      },
    );
    return () => {
      live = false;
    };
  }, [root]);
  useSyncExternalStore(subscribe, () => state);
  return state.root === root;
}

/** Draws again when the workspace's widgets change: for what reads them where no screen loads them. */
export const useRegistry = (): void => {
  useSyncExternalStore(subscribe, () => state);
};

/** The views the page's renderer draws with: the platform's and the workspace's. */
export function useViews(): ViewRegistry {
  return useSyncExternalStore(subscribe, () => state).views;
}

/** The views of now, for what is not a component. */
export const currentViews = (): ViewRegistry => state.views;

/** A definition: a tenant's widget at `version` when it is given, else its current one. */
export function definitionOf(type: string, version?: string): WidgetDefinition | undefined {
  return state.definitions.get(type, version);
}

/** What can be added to a page of this kind: every widget at its current version. */
export function offeredOn(surface: Surface): WidgetDefinition[] {
  return state.definitions.list(surface);
}

/** What a placed tenant widget is offered when a newer version of it is deployed. */
export interface Update {
  /** The version it moves to. */
  version: string;
  /** The settings the newer version adds and the older one had not, by name. */
  added: string[];
  removed: string[];
  /** Them in words, for the inspector: "Adds Loud. Removes old." */
  says: string;
}

const labelOf = (definition: WidgetDefinition, name: string) =>
  (definition.config.properties?.[name]?.["x-volvel"]?.label as string | undefined) ?? name;

/** The update a placed widget is offered, or nothing when it is a platform widget or is on the newest version. */
export function updateOf(widget: Pick<PageWidget, "type" | "version">): Update | undefined {
  if (widget.version === undefined) return undefined;
  const now = state.definitions.get(widget.type);
  const was = state.definitions.get(widget.type, widget.version);
  if (!now || !was || compareVersions(now.version, widget.version) <= 0) return undefined;
  const { added, removed } = updateNotes(was, now);
  const says = [
    added.length > 0 ? `Adds ${added.map((name) => labelOf(now, name)).join(", ")}.` : "",
    removed.length > 0 ? `Removes ${removed.map((name) => labelOf(was, name)).join(", ")}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
  return {
    version: now.version,
    added,
    removed,
    says: says || "Nothing in its settings changes.",
  };
}

/** The widget moved to the newest version: the settings it no longer has are dropped, and the rest kept. */
export function updated(widget: PageWidget): PageWidget {
  const update = updateOf(widget);
  if (!update) return widget;
  const config = Object.fromEntries(
    Object.entries(widget.config ?? {}).filter(([name]) => !update.removed.includes(name)),
  );
  return {
    ...widget,
    version: update.version,
    ...(widget.config ? { config } : {}),
  };
}
