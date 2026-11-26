import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

/**
 * Phase 35, the red team's first finding. `node-cp` is the copy of node that may switch users.
 * While anyone in the image could run it, a tenant's script started it by its path and became
 * root in its container. Proved on the built image: as the worker's user, running it is now
 * refused, and the control plane still starts on it. This holds the Dockerfile to that.
 */
test("the copy of node that may switch users is run by root and the control plane's group alone", () => {
  const dockerfile = readFileSync(new URL("../../../Dockerfile", import.meta.url), "utf8");
  const owner = dockerfile.indexOf("chown root:node /usr/local/bin/node-cp");
  const mode = dockerfile.indexOf("chmod 0750 /usr/local/bin/node-cp");
  const capabilities = dockerfile.indexOf("setcap cap_setuid,cap_setgid+ep /usr/local/bin/node-cp");
  expect(owner).toBeGreaterThan(-1);
  expect(mode).toBeGreaterThan(-1);
  // A change of owner removes a file's capabilities, so they are given last.
  expect(capabilities).toBeGreaterThan(owner);
  expect(capabilities).toBeGreaterThan(mode);
  // Nothing after it opens the file up again, and no other file is given capabilities.
  expect(dockerfile.slice(capabilities)).not.toMatch(/ch(mod|own)[^\n]*node-cp/);
  expect(dockerfile.match(/setcap /g)).toHaveLength(1);
});
