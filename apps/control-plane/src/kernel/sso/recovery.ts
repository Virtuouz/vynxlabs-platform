import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { newId } from "@vynxlabs/db";
import type { Db, Trx } from "../audit.js";

/** How many codes a member is given at once. */
export const RECOVERY_CODES = 10;
/** The header a sign-in carries a recovery code in. */
export const RECOVERY_HEADER = "x-recovery-code";

const hash = (code: string) =>
  createHash("sha256").update(code.replace(/[\s-]/g, "").toLowerCase()).digest("hex");

/** Ten words of five characters, easy to read out and type: "k3x9q-7mzt2". */
function newCode() {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(10);
  const chars = [...bytes].map((byte) => alphabet[byte % alphabet.length]).join("");
  return `${chars.slice(0, 5)}-${chars.slice(5)}`;
}

/** Makes a member's codes, putting away any they had. Returns them, the one time they are seen. */
export async function makeRecoveryCodes(trx: Trx, memberId: string): Promise<string[]> {
  await trx.deleteFrom("member_recovery_code").where("member_id", "=", memberId).execute();
  const codes = Array.from({ length: RECOVERY_CODES }, newCode);
  await trx
    .insertInto("member_recovery_code")
    .values(codes.map((code) => ({ id: newId(), member_id: memberId, code_hash: hash(code) })))
    .execute();
  return codes;
}

/** An unused code of the member with this email that matches, if there is one. */
export async function findRecoveryCode(
  db: Db | Trx,
  email: string,
  code: string,
): Promise<{ id: string; memberId: string } | undefined> {
  const wanted = Buffer.from(hash(code), "hex");
  const rows = await db
    .selectFrom("member_recovery_code")
    .innerJoin("member", "member.id", "member_recovery_code.member_id")
    .select(["member_recovery_code.id", "member_recovery_code.code_hash", "member.id as member_id"])
    .where("member.email", "=", email.trim().toLowerCase())
    .where("member_recovery_code.used_at", "is", null)
    .execute();
  const found = rows.find((row) => timingSafeEqual(Buffer.from(row.code_hash, "hex"), wanted));
  return found ? { id: found.id, memberId: found.member_id } : undefined;
}

/** Marks a code used, once: a second sign-in with it finds nothing. */
export async function useRecoveryCode(db: Db | Trx, id: string): Promise<boolean> {
  const used = await db
    .updateTable("member_recovery_code")
    .set({ used_at: new Date() })
    .where("id", "=", id)
    .where("used_at", "is", null)
    .executeTakeFirst();
  return Number(used.numUpdatedRows) === 1;
}

/** Whether a member owns a tenant: holds tenant_admin over one, directly. */
export async function ownsATenant(db: Db | Trx, memberId: string): Promise<boolean> {
  const found = await db
    .selectFrom("binding")
    .innerJoin("role", "role.id", "binding.role_id")
    .select("binding.id")
    .where("binding.scope_type", "=", "tenant")
    .where("binding.principal_type", "=", "member")
    .where("binding.principal_id", "=", memberId)
    .where("role.name", "=", "tenant_admin")
    .executeTakeFirst();
  return found !== undefined;
}
