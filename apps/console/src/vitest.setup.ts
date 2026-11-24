// The console's tests run against the plain text box that CodeEditor shows wherever Monaco is not
// there. Monaco takes seconds to import, and more when the suite is busy: a test that had found the
// text box then saw it replaced by the editor in the middle of the test, and what it typed went
// nowhere. The editor reads this and never loads Monaco (apps/console/src/editor/plain.ts).
(globalThis as { __VOLVEL_PLAIN_EDITOR__?: boolean }).__VOLVEL_PLAIN_EDITOR__ = true;
