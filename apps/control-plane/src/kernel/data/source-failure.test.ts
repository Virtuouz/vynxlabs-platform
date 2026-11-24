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

test("a source asked to encrypt that cannot says so, as the source's refusal and not a 500", () => {
  const driver = new Error("The server does not support SSL connections");
  const said = sourceFailure("erp", driver) as HttpError;
  expect(said).toBeInstanceOf(HttpError);
  expect(said.statusCode).toBe(502);
  expect(said.message).toBe(
    'The data source "erp" does not accept encrypted connections. Turn Encrypt off for it, or turn SSL on at the server.',
  );
});
