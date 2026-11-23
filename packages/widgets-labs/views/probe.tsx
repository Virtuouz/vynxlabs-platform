import type { WidgetViewProps } from "@volvel/widgets";

/** What the Probe's configuration holds. */
export interface ProbeConfig {
  words?: string;
}

export function ProbeView({ config }: WidgetViewProps<ProbeConfig>) {
  return <p>{config.words ?? "Probe"}</p>;
}
