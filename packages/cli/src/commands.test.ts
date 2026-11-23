import { expect, test } from "vitest";
import { COMMAND_NOTES } from "./commands.js";

test("CLI-16 the note on --dir names every command that reads a repository from it", () => {
  const note = COMMAND_NOTES[0];
  // `schemas` and `tenant plan` / `tenant release` take --dir as the others do (cli.ts, access.ts).
  for (const name of ["build", "schemas", "run", "dev", "deploy", "pull", "tenant plan"]) {
    expect(note, name).toContain(name);
  }
});
