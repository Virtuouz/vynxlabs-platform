/**
 * The one place the console builds its widget registry: the core pack and the
 * packs the platform ships beside it (decision 0005). The editor's "Add to
 * page" and inspector read the definitions; the page's renderer is given the
 * view registry made from the same packs, so what can be added is what can be
 * drawn.
 *
 * INTEGRATOR: `corePack` and `labsPack` come through `stand-in.tsx` until
 * streams B and D land. When they do, import them here directly:
 *
 *   import { corePack } from "@volvel/widgets-core/views";
 *   import { labsPack } from "@volvel/widgets-labs/views";
 *   import { viewRegistry, type WidgetPack } from "@volvel/screens";
 */
import type { Surface, WidgetDefinition } from "@volvel/widgets";
import {
  corePack,
  labsPack,
  type ViewRegistry,
  viewRegistry,
  type WidgetPack,
} from "./stand-in.tsx";

/** Every pack this console draws, the platform's own first. */
export const PACKS: readonly WidgetPack[] = [corePack, labsPack];

/** The registry the page's renderer draws from. */
export const views: ViewRegistry = viewRegistry(...PACKS);

/** Every definition, in the order "Add to page" lists them within a category. */
export const DEFINITIONS: readonly WidgetDefinition[] = PACKS.flatMap((pack) => pack.definitions);

export function definitionOf(type: string): WidgetDefinition | undefined {
  return DEFINITIONS.find((definition) => definition.type === type);
}

/** What can be added to a page of this kind. */
export function offeredOn(surface: Surface): WidgetDefinition[] {
  return DEFINITIONS.filter((definition) => definition.surfaces.includes(surface));
}
