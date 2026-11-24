import { spawnSync } from "node:child_process";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

/**
 * The worker host's start script writes the firewall rules a worker's user is held to
 * (HOST-06, D20). It is run here with stand-ins for `iptables`, `getent` and `node`
 * that write down what they were asked.
 */
const script = fileURLToPath(new URL("../../../deploy/image/volvel-worker-host", import.meta.url));
let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "firewall-"));
  const stub = async (name: string, body: string) => {
    await writeFile(join(dir, name), `#!/bin/sh\n${body}\n`);
    await chmod(join(dir, name), 0o755);
  };
  for (const tool of ["iptables", "ip6tables"]) {
    await stub(tool, `[ "$1" = "-n" ] && exit 0\necho "${tool} $*" >> "${dir}/rules"`);
  }
  await stub(
    "getent",
    `case "$1 $2" in
  "ahostsv6 app.internal") echo "fdaa:0:1::5 STREAM app.internal" ;;
  "ahostsv4 control-plane") echo "172.20.0.2 STREAM control-plane" ;;
  "ahostsv4 api.corp") echo "192.168.9.9 STREAM api.corp" ;;
esac`,
  );
  await stub("node", `echo "node $*" >> "${dir}/rules"`);
  await writeFile(join(dir, "resolv.conf"), "nameserver 127.0.0.11\nnameserver fdaa::3\n");
});
afterEach(() => rm(dir, { recursive: true, force: true }));

async function run(args: string[], env: Record<string, string>): Promise<string[]> {
  const result = spawnSync("sh", [script, ...args], {
    env: {
      PATH: `${dir}:/usr/bin:/bin`,
      VOLVEL_RESOLV_CONF: join(dir, "resolv.conf"),
      ...env,
    },
    encoding: "utf8",
  });
  expect(result.status).toBe(0);
  return (await readFile(join(dir, "rules"), "utf8")).trim().split("\n");
}
const accepts = (rules: string[]) => rules.filter((rule) => rule.endsWith("-j ACCEPT"));

describe("the worker host's firewall rules", () => {
  test("a control plane given with --url, with an IPv6-only name, and an IPv6 name server are accepted (HOST-06)", async () => {
    const rules = await run(["--url", "http://app.internal:8080"], {});
    const list = accepts(rules).map((rule) => rule.replace(/ -m owner --uid-owner \S+/, ""));
    expect(list).toContain("ip6tables -A OUTPUT -d fdaa:0:1::5 -j ACCEPT");
    expect(list).toContain("ip6tables -A OUTPUT -d fdaa::3 -j ACCEPT");
    expect(list).toContain("iptables -A OUTPUT -d 127.0.0.11 -j ACCEPT");
    // Accepted before the private ranges are refused, or the refusal wins.
    const firstReject = rules.findIndex((rule) => rule.includes("-j REJECT"));
    const lastAccept = rules.map((rule) => rule.endsWith("ACCEPT")).lastIndexOf(true);
    expect(lastAccept).toBeLessThan(firstReject);
    expect(rules.some((rule) => rule.includes("fc00::/7 -j REJECT"))).toBe(true);
    expect(rules.at(-1)).toMatch(/^node .*host-bin\.js --url http:\/\/app\.internal:8080$/);
  });

  test("VOLVEL_URL still names the control plane, and nothing else is opened by default (D20)", async () => {
    const rules = await run([], { VOLVEL_URL: "http://control-plane:8080" });
    const list = accepts(rules).map((rule) => rule.replace(/ -m owner --uid-owner \S+/, ""));
    expect(list).toContain("iptables -A OUTPUT -d 172.20.0.2 -j ACCEPT");
    expect(list).toHaveLength(3);
  });

  test("WORKER_EGRESS_ALLOW opens what it lists for workers, and EGRESS_ALLOW does not (D20)", async () => {
    const rules = await run([], {
      VOLVEL_URL: "http://control-plane:8080",
      EGRESS_ALLOW: "10.99.0.0/16",
      WORKER_EGRESS_ALLOW: "10.1.0.0/16, api.corp,fd12::/48",
    });
    const list = accepts(rules).map((rule) => rule.replace(/ -m owner --uid-owner \S+/, ""));
    expect(list).toContain("iptables -A OUTPUT -d 10.1.0.0/16 -j ACCEPT");
    expect(list).toContain("iptables -A OUTPUT -d 192.168.9.9 -j ACCEPT");
    expect(list).toContain("ip6tables -A OUTPUT -d fd12::/48 -j ACCEPT");
    expect(list.join("\n")).not.toContain("10.99.0.0");
  });
});
