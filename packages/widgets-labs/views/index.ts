/**
 * The labs pack's views: for tests of the contract, and shipped nowhere. Written against
 * `@volvel/widgets`, `@volvel/ui` and `react` only.
 */
import type { WidgetPack as SdkWidgetPack, WidgetViewProps } from "@volvel/widgets";
import type { ComponentType } from "react";
import { LABS_WIDGETS } from "../src/index.ts";
import { ProbeView } from "./probe.tsx";

/** A pack as the page renderer takes it: its definitions and a view for each. */
// biome-ignore lint/suspicious/noExplicitAny: each view is typed by its own configuration
export type WidgetPack = SdkWidgetPack<ComponentType<WidgetViewProps<any>>>;

export const labsPack: WidgetPack = {
  definitions: LABS_WIDGETS,
  views: { "labs/probe": ProbeView },
};
