// The console's tests run against the plain text box that CodeEditor shows wherever Monaco is not
// there. Monaco takes seconds to import, and more when the suite is busy: a test that had found the
// text box then saw it replaced by the editor in the middle of the test, and what it typed went
// nowhere. The editor reads this and never loads Monaco (apps/console/src/editor/plain.ts).
(globalThis as { __VOLVEL_PLAIN_EDITOR__?: boolean }).__VOLVEL_PLAIN_EDITOR__ = true;

// xyflow's minimap is drawn from what the browser measures, and the test page measures nothing: it
// divides zero by zero, and since xyflow 13 it redraws itself on that NaN until React stops it
// ("Maximum update depth exceeded"), which takes the flow editor with it once a step is added. No
// unit test reads the minimap; the browser tests draw the real one, at every width.
import { vi } from "vitest";

vi.mock("@xyflow/react", async (original) => ({
  ...(await original<typeof import("@xyflow/react")>()),
  MiniMap: () => null,
}));
