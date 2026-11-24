import { vi } from "vitest";

// The console's tests run against the plain text box that CodeEditor shows wherever Monaco
// cannot load. Monaco itself takes seconds to import, and more when the suite is busy: a test that
// had found the text box then saw it replaced by the editor in the middle of the test, and what it
// typed went nowhere. Rejecting the import at once makes the text box the only editor, in every file.
vi.mock("./editor/monaco.ts", () => {
  throw new Error("Monaco is not loaded in tests.");
});
