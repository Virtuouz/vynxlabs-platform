import { useEffect, useState } from "react";
import type { FrameProps, WidgetFrame } from "./index.js";

/**
 * What the host last gave the view, as React state: nothing until the first message arrives,
 * then every change. `const props = useWidgetProps(frame); if (!props) return null;`.
 */
export function useWidgetProps<Config = Record<string, unknown>>(
  frame: WidgetFrame<Config>,
): FrameProps<Config> | undefined {
  const [props, setProps] = useState(() => frame.props());
  useEffect(() => frame.onProps(setProps), [frame]);
  return props;
}
