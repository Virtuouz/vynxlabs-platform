/**
 * Whether only the plain text box is wanted, never Monaco: the console's unit tests ask for it
 * (`apps/console/src/vitest.setup.ts`). Monaco takes seconds to load, more when the machine is
 * busy, and arriving in the middle of a test it replaced the text box the test was typing in.
 */
export const plainEditorOnly = (): boolean =>
  (globalThis as { __VOLVEL_PLAIN_EDITOR__?: boolean }).__VOLVEL_PLAIN_EDITOR__ === true;
