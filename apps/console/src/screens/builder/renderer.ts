/**
 * The page renderer and the platform's packs, as the console's editor uses them.
 * One place, so the editor names them the same everywhere.
 */

export type {
  Box,
  CarryRequest,
  FilterValues,
  PageDataClient,
  PageViewProps,
  ViewRegistry,
  WidgetPack,
  WireData,
} from "@volvel/screens";
export {
  automaticAt,
  changedByHand,
  fitContainers,
  PageView,
  placed,
  viewRegistry,
} from "@volvel/screens";
export { corePack } from "@volvel/widgets-core/views";
export { labsPack } from "@volvel/widgets-labs/views";
