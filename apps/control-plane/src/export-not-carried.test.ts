import { expect, test } from "vitest";
import { NOT_CARRIED, NOT_CARRIED_BY_TABLE } from "./kernel/tenancy/export.js";
import { OWNED_TABLES } from "./kernel/tenancy/tables.js";

test("every table a tenant export leaves out is named in what it says is not carried (GOV-30)", () => {
  const left = OWNED_TABLES.filter((one) => one.export === "never").map((one) => one.table);
  expect(left.length).toBeGreaterThan(0);
  // The tenant's key travels, wrapped under the passphrase: it is the one left out of the rows.
  const unnamed = left.filter((table) => table !== "tenant_key" && !NOT_CARRIED_BY_TABLE[table]);
  expect(unnamed).toEqual([]);
  for (const line of Object.values(NOT_CARRIED_BY_TABLE)) expect(NOT_CARRIED).toContain(line);
  // Only a table that is left out is named.
  for (const table of Object.keys(NOT_CARRIED_BY_TABLE)) expect(left).toContain(table);
});

test("what is not carried names the provisioning tokens, refused pushes, recovery codes and the audit cut (GOV-30)", () => {
  const said = NOT_CARRIED.join("\n");
  for (const word of [
    /provisioning tokens/i,
    /refused pushes/i,
    /webhook requests/i,
    /recovery codes/i,
    /saved views/i,
    /approval links/i,
    /audit log/i,
  ]) {
    expect(said).toMatch(word);
  }
  // Retention settings travel, so they are not listed as left out.
  expect(OWNED_TABLES.find((one) => one.table === "tenant_retention")?.export).toBe("always");
  expect(said).not.toMatch(/retention settings/i);
});
