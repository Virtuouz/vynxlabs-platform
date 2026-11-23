#!/usr/bin/env node
import { createInterface } from "node:readline/promises";
import { run } from "./cli.js";

/** A question is put to whoever is at the terminal; with no terminal, nobody can answer it. */
const confirm = process.stdin.isTTY
  ? async (question: string) => {
      const lines = createInterface({ input: process.stdin, output: process.stderr });
      const answer = await lines.question(`${question} [y/N] `);
      lines.close();
      return /^y(es)?$/i.test(answer.trim());
    }
  : undefined;

process.exitCode = await run(process.argv.slice(2), {
  out: (line) => console.log(line),
  err: (line) => console.error(line),
  env: process.env,
  ...(confirm ? { confirm } : {}),
});
