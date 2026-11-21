/**
 * The page renderer and the platform's packs, as the console's editor uses them.
 * One place, so the editor names them the same everywhere.
 */
export { FilterBar, PageView, viewRegistry } from "@volvel/screens";
export type {
  FilterValues,
  PageDataClient,
  PageViewProps,
  ViewRegistry,
  WidgetPack,
  WireData,
} from "@volvel/screens";
export { corePack } from "@volvel/widgets-core/views";
export { labsPack } from "@volvel/widgets-labs/views";
