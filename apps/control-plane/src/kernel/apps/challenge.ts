import { createHmac } from "node:crypto";
import { resolveTxt } from "node:dns/promises";
import type { Kernel } from "../kernel.js";

/** How DNS is asked. A test puts its own answer here. */
export const dns = { resolveTxt: (name: string): Promise<string[][]> => resolveTxt(name) };

/** Second-level labels that make a two-part public suffix with a country code (co.uk, com.au). */
const SECOND_LEVEL = new Set(["co", "com", "net", "org", "gov", "edu", "ac", "or", "ne", "go"]);

/**
 * The zone a name's DNS most likely lives in: its registrable domain. This instance does not know
 * the real zone and carries no public suffix list, so it is the last two labels, or three when the
 * name ends in a common two-part suffix such as co.uk or com.au.
 */
export function zoneOf(name: string): string {
  const labels = name.toLowerCase().replace(/\.$/, "").split(".");
  const last = labels[labels.length - 1] ?? "";
  const take =
    labels.length >= 3 && last.length === 2 && SECOND_LEVEL.has(labels[labels.length - 2] ?? "")
      ? 3
      : 2;
  return labels.slice(-take).join(".");
}

/**
 * The record a name's owner publishes in DNS to show they agree to a tenant
 * using it: as a hostname for an app, or as an email domain for single sign-on.
 * One record does for both. `host` is the name relative to `zone`, which is what most
 * DNS providers want in their Host field; `name` is the full name.
 */
export function challengeOf(kernel: Kernel, tenantId: string, name: string) {
  const full = `_vx-challenge.${name}`;
  const zone = zoneOf(name);
  return {
    name: full,
    host: full.endsWith(`.${zone}`) ? full.slice(0, -zone.length - 1) : full,
    zone,
    value: `vx-domain=${createHmac("sha256", kernel.config.authSecret)
      .update(`domain:${tenantId}:${name}`)
      .digest("hex")
      .slice(0, 40)}`,
  };
}

/** One lookup, bounded in time; a name that fails or is slow has no records. */
async function lookup(name: string, timeoutMs: number): Promise<string[]> {
  let timer: NodeJS.Timeout | undefined;
  const records = await Promise.race([
    dns.resolveTxt(name).catch(() => [] as string[][]),
    new Promise<string[][]>((resolve) => {
      timer = setTimeout(() => resolve([]), timeoutMs);
    }),
  ]);
  clearTimeout(timer);
  return records.map((parts) => parts.join(""));
}

/** Whether the record is there now. */
export async function challengeMet(kernel: Kernel, tenantId: string, name: string) {
  const challenge = challengeOf(kernel, tenantId, name);
  return (await lookup(challenge.name, 5000)).includes(challenge.value);
}

/**
 * Whether the record is there, and when it is not, what is wrong in words. A failed check asks
 * for at most two more names: the ones a provider makes by appending the zone, or the hostname,
 * to a host that was typed in full.
 */
export async function challengeProblem(
  kernel: Kernel,
  tenantId: string,
  name: string,
  timeoutMs = 5000,
): Promise<{ met: boolean; problem: string | null }> {
  const challenge = challengeOf(kernel, tenantId, name);
  const right = await lookup(challenge.name, timeoutMs);
  if (right.includes(challenge.value)) return { met: true, problem: null };
  if (right.length > 0) {
    return {
      met: false,
      problem: `A TXT record exists at ${challenge.name}, but its value differs. Found ${right.join(" and ")}; expected ${challenge.value}.`,
    };
  }
  const suffixes = [...new Set([challenge.zone, name])];
  const doubled = await Promise.all(
    suffixes.map(async (suffix) => {
      const at = `${challenge.name}.${suffix}`;
      return { at, suffix, found: await lookup(at, timeoutMs) };
    }),
  );
  const hit = doubled.find((d) => d.found.includes(challenge.value));
  if (hit) {
    return {
      met: false,
      problem: `Found the record at ${hit.at}: your DNS provider added ${hit.suffix} to the host. Set the host to ${challenge.host}.`,
    };
  }
  return {
    met: false,
    problem: `No TXT record ${challenge.name} with the value ${challenge.value} was found. Most DNS providers want the host as ${challenge.host}.`,
  };
}
