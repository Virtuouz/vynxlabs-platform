import { Type } from "typebox";
import type { Db, Trx } from "./audit.js";

/** What a response says about a stored credential: when it was set, and by whom. Never its value. */
export const CredentialSet = {
  credentialSetAt: Type.Union([Type.String({ format: "date-time" }), Type.Null()], {
    description: "When the credential was last set. Null when none is stored.",
  }),
  credentialSetBy: Type.Union([Type.String(), Type.Null()], {
    description: "Who set it: a member's email, or a service account's name.",
  }),
};

interface Stamped {
  credential_set_at: Date | null;
  credential_set_by_type: string | null;
  credential_set_by_id: string | null;
}

/**
 * Reads who set each of `rows`' credentials, in one query a kind, and gives a
 * function that says it for a row as the API does.
 */
export async function credentialSetters(db: Db | Trx, rows: (Stamped | undefined)[]) {
  const ids = (type: string) => [
    ...new Set(
      rows
        .filter((row) => row?.credential_set_by_type === type && row.credential_set_by_id)
        .map((row) => row?.credential_set_by_id as string),
    ),
  ];
  const members = ids("member");
  const accounts = ids("service_account");
  const names = new Map<string, string>();
  if (members.length > 0) {
    for (const one of await db
      .selectFrom("member")
      .select(["id", "email", "name"])
      .where("id", "in", members)
      .execute()) {
      names.set(`member:${one.id}`, one.email);
    }
  }
  if (accounts.length > 0) {
    for (const one of await db
      .selectFrom("service_account")
      .select(["id", "name"])
      .where("id", "in", accounts)
      .execute()) {
      names.set(`service_account:${one.id}`, one.name);
    }
  }
  return (row: Stamped | undefined) => ({
    credentialSetAt: row?.credential_set_at ? row.credential_set_at.toISOString() : null,
    credentialSetBy:
      row?.credential_set_by_type && row.credential_set_by_id
        ? (names.get(`${row.credential_set_by_type}:${row.credential_set_by_id}`) ?? null)
        : row?.credential_set_by_type === "system"
          ? "Volvel"
          : null,
  });
}
