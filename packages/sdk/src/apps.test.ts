import { describe, expect, test } from "vitest";
import { defineApp } from "./index.js";

describe("an app that serves documentation", () => {
  test("can keep its readers' answers in a table", () => {
    const help = defineApp({
      path: "help",
      title: "Handbook",
      docs: "handbook",
      feedback: { table: "help-feedback" },
    });
    expect(help.toManifest("help").body).toEqual({
      title: "Handbook",
      docs: "handbook",
      feedback: { table: "help-feedback" },
    });
  });

  test("only documentation asks its readers", () => {
    expect(() =>
      defineApp({ path: "site", title: "Site", source: "apps/site", feedback: { table: "votes" } }),
    ).toThrow("only an app that serves docs can");
  });
});
