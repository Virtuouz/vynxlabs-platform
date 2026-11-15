/**
 * The egress guard (decision 0001, Rule 2). The control plane reaches a
 * destination a tenant chose only through here: a host whose address is
 * loopback, private, link-local (which includes cloud metadata), shared or
 * reserved is refused, unless the operator allowed it with `EGRESS_ALLOW`.
 *
 * The check is made inside the connection's own address lookup, so the address
 * checked is the address connected to: a name cannot pass the check and then
 * point somewhere else. Redirects are looked up, and checked, the same way.
 */
import { lookup as dnsLookup } from "node:dns";
import type { LookupFunction } from "node:net";
import { BlockList, isIP } from "node:net";
import { Agent, type RequestInit, type Response, fetch as undiciFetch } from "undici";

/** Why a destination was refused. Its message is for people, and names the address. */
export class EgressRefused extends Error {
  readonly host: string;
  readonly address: string;
  constructor(host: string, address: string) {
    super(
      `${host} is ${address === host ? "" : `at ${address}, `}a private or internal address, ` +
        "which the instance does not reach for a tenant. An operator can allow it with EGRESS_ALLOW.",
    );
    this.name = "EgressRefused";
    this.host = host;
    this.address = address;
  }
}

const internal = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  internal.addSubnet(network, prefix, "ipv4");
}
for (const [network, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
  ["2001:db8::", 32],
] as const) {
  internal.addSubnet(network, prefix, "ipv6");
}

/** What the operator allows despite the rules: networks and names. */
export interface EgressAllow {
  networks: string[];
  hosts: string[];
}

let allowedNetworks = new BlockList();
let allowedHosts = new Set<string>();

/** Sets what the operator allows. Called once, when the kernel is made. */
export function configureEgress(allow: EgressAllow) {
  allowedNetworks = new BlockList();
  for (const network of allow.networks) {
    const [address, bits] = network.split("/") as [string, string | undefined];
    const family = isIP(address) === 6 ? "ipv6" : "ipv4";
    allowedNetworks.addSubnet(address, Number(bits ?? (family === "ipv6" ? 128 : 32)), family);
  }
  allowedHosts = new Set(allow.hosts.map((host) => host.toLowerCase()));
}

/** Reads `EGRESS_ALLOW`: a comma-separated list of CIDRs and host names. */
export function parseEgressAllow(value: string | undefined): EgressAllow | string {
  const allow: EgressAllow = { networks: [], hosts: [] };
  for (const raw of (value ?? "").split(",")) {
    const entry = raw.trim();
    if (!entry) continue;
    const [address, bits] = entry.split("/") as [string, string | undefined];
    const family = isIP(address);
    if (family !== 0) {
      const max = family === 6 ? 128 : 32;
      const prefix = bits === undefined ? max : Number(bits);
      if (!Number.isInteger(prefix) || prefix < 0 || prefix > max) {
        return `EGRESS_ALLOW has an entry that is not a network: ${entry}.`;
      }
      allow.networks.push(`${address}/${prefix}`);
    } else if (bits === undefined && /^[a-z0-9.-]+$/i.test(entry)) {
      allow.hosts.push(entry.toLowerCase());
    } else {
      return `EGRESS_ALLOW has an entry that is neither a network nor a host name: ${entry}.`;
    }
  }
  return allow;
}

/** An IPv4 address carried in an IPv6 one (`::ffff:10.0.0.1`, NAT64), or none. */
function embeddedIpv4(address: string): string | undefined {
  const mapped =
    /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address) ??
    /^64:ff9b::(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  return mapped?.[1];
}

/** Whether the instance may reach `address` for `host`. */
export function addressAllowed(host: string, address: string): boolean {
  if (allowedHosts.has(host.toLowerCase())) return true;
  const family = isIP(address);
  if (family === 0) return false;
  const inner = family === 6 ? embeddedIpv4(address) : undefined;
  const [checked, kind] = inner
    ? [inner, "ipv4" as const]
    : [address, family === 6 ? ("ipv6" as const) : ("ipv4" as const)];
  if (allowedNetworks.check(checked, kind)) return true;
  return !internal.check(checked, kind);
}

/**
 * A DNS lookup that refuses internal addresses: given to a connection, it makes
 * the connection itself refuse them.
 */
export const guardedLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) return callback(error, "", 0);
    const list = addresses as { address: string; family: number }[];
    const refused = list.find((one) => !addressAllowed(hostname, one.address));
    if (refused || list.length === 0) {
      return callback(
        new EgressRefused(hostname, refused?.address ?? hostname) as NodeJS.ErrnoException,
        "",
        0,
      );
    }
    if ((options as { all?: boolean }).all) {
      return (callback as unknown as (e: null, a: typeof list) => void)(null, list);
    }
    const first = list[0] as { address: string; family: number };
    callback(null, first.address, first.family);
  });
};

/** Refuses a host named by its address before anything is sent, as a lookup would. */
function refuseLiteral(url: URL) {
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host) && !addressAllowed(host, host)) throw new EgressRefused(host, host);
}

const agent = new Agent({ connect: { lookup: guardedLookup }, connectTimeout: 10_000 });

/**
 * `fetch` for destinations a tenant chose. Internal addresses are refused,
 * redirects included, and every request has a time limit.
 */
export async function guardedFetch(
  input: string | URL,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const { timeoutMs, ...rest } = init;
  const signal = rest.signal ?? AbortSignal.timeout(timeoutMs ?? 10_000);
  // Redirects are followed here, one at a time: an address in a redirect is never looked
  // up, so each hop is checked before it is taken.
  const follow = (rest.redirect ?? "follow") === "follow";
  let url = new URL(input);
  let method = rest.method ?? "GET";
  let body = rest.body;
  for (let hop = 0; ; hop += 1) {
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new Error(`Only http and https addresses can be reached, not ${url.protocol}`);
    }
    refuseLiteral(url);
    let response: Response;
    try {
      response = await undiciFetch(url, {
        ...rest,
        method,
        body: body ?? null,
        redirect: follow ? "manual" : (rest.redirect as "manual" | "error"),
        dispatcher: agent,
        signal,
      });
    } catch (error) {
      // undici wraps what the lookup refused; the refusal is what a person needs to read.
      const cause = (error as { cause?: unknown }).cause;
      if (cause instanceof EgressRefused) throw cause;
      throw error;
    }
    const location = response.headers.get("location");
    if (!follow || response.status < 300 || response.status >= 400 || !location) return response;
    if (hop >= MAX_REDIRECTS)
      throw new Error(`More than ${MAX_REDIRECTS} redirects from ${input}.`);
    await response.body?.cancel();
    url = new URL(location, url);
    // As browsers do: after a 303, or a 301 or 302 to a POST, the next request is a GET.
    if (
      response.status === 303 ||
      ((response.status === 301 || response.status === 302) && method === "POST")
    ) {
      method = "GET";
      body = undefined;
    }
  }
}

/** Redirects a guarded request follows before it gives up. */
const MAX_REDIRECTS = 5;

/**
 * Checks a host before a connection that cannot take a lookup of its own is
 * made to it. Resolves to nothing, or throws `EgressRefused`.
 */
export function checkHost(host: string): Promise<void> {
  if (isIP(host)) {
    return addressAllowed(host, host)
      ? Promise.resolve()
      : Promise.reject(new EgressRefused(host, host));
  }
  return new Promise((resolve, reject) =>
    guardedLookup(host, { all: true }, (error) => (error ? reject(error) : resolve())),
  );
}
