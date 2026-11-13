import { createHmac } from "node:crypto";
import { resolveTxt } from "node:dns/promises";
import type { Kernel } from "../kernel.js";

/** How DNS is asked. A test puts its own answer here. */
export const dns = { resolveTxt: (name: string): Promise<string[][]> => resolveTxt(name) };

/**
 * The record a name's owner publishes in DNS to show they agree to a tenant
 * using it: as a hostname for an app, or as an email domain for single sign-on.
 * One record does for both.
 */
export function challengeOf(kernel: Kernel, tenantId: string, name: string) {
  return {
    name: `_vx-challenge.${name}`,
    value: `vx-domain=${createHmac("sha256", kernel.config.authSecret)
      .update(`domain:${tenantId}:${name}`)
      .digest("hex")
      .slice(0, 40)}`,
  };
}

/** Whether the record is there now. */
export async function challengeMet(kernel: Kernel, tenantId: string, name: string) {
  const challenge = challengeOf(kernel, tenantId, name);
  const records = await dns.resolveTxt(challenge.name).catch(() => [] as string[][]);
  return records.some((parts) => parts.join("") === challenge.value);
}
