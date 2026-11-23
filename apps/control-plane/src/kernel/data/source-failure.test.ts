import { expect, test } from "vitest";
import { HttpError } from "../errors.js";
import { sourceFailure } from "./sources.js";

test("WLK-07: a source with no password says so, not the driver's own words", () => {
  const driver = new Error("SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a string");
  const said = sourceFailure("erp", driver) as HttpError;
  expect(said).toBeInstanceOf(HttpError);
  expect(said.message).toMatch(/No password is set/);
  expect(said.message).not.toMatch(/SASL|SCRAM/);
});
