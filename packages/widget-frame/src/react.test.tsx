// @vitest-environment happy-dom

import { act, cleanup, render } from "@testing-library/react";
import { FRAME_PROTOCOL } from "@volvel/widgets/frame";
import { afterEach, expect, test } from "vitest";
import { createFrame } from "./index.js";
import { useWidgetProps } from "./react.js";

afterEach(cleanup);

test("useWidgetProps draws nothing until the host gives props, then what it gives, then each change", () => {
  const parent = { postMessage: () => {} };
  const frame = createFrame<{ label: string }>({ events: [], parent });
  const View = () => {
    const props = useWidgetProps(frame);
    return <p>{props ? props.config.label : "waiting"}</p>;
  };
  const { container, unmount } = render(<View />);
  expect(container.textContent).toBe("waiting");
  const give = (label: string) =>
    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          source: parent as unknown as Window,
          data: {
            protocol: FRAME_PROTOCOL,
            from: "host",
            type: "props",
            props: {
              config: { label },
              data: {},
              state: { status: "ready" },
              size: { w: 1, h: 1, narrow: false },
              theme: { scheme: "light", tokens: {} },
            },
          },
        }),
      );
    });
  give("one");
  expect(container.textContent).toBe("one");
  give("two");
  expect(container.textContent).toBe("two");
  unmount();
  frame.close();
});
