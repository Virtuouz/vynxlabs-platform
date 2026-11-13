// Fails when a dependency carries a license outside the allowlist.
// See CONTRIBUTING.md for the policy.
import { execFileSync } from "node:child_process";

/** Apache-compatible licenses. Everything that ships in the image must be on this list. */
const SHIPPED = new Set([
  "Apache-2.0",
  "MIT",
  "MIT-0",
  "ISC",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "0BSD",
  "BlueOak-1.0.0",
  "CC0-1.0",
  "Unlicense",
  "Python-2.0",
  // Permissive: keep the notice, and mark altered copies as altered. The port of zlib
  // that the git library depends on carries it. Added by the owner in phase 7.
  "Zlib",
]);

/**
 * Development tools are never distributed, so two more are accepted there:
 * file-level copyleft (MPL-2.0), and the attribution licence on the browser
 * support data that the console's build tooling reads (CC-BY-4.0).
 */
const TOOLING = new Set([...SHIPPED, "MPL-2.0", "CC-BY-4.0"]);

/** Evaluates an SPDX expression: every AND term must be allowed, any OR term may be. */
export function isAllowed(expression, allowed = SHIPPED) {
  const text = expression.trim().replace(/^\((.*)\)$/, "$1");
  if (/\sOR\s/.test(text)) return text.split(/\s+OR\s+/).some((part) => isAllowed(part, allowed));
  if (/\sAND\s/.test(text))
    return text.split(/\s+AND\s+/).every((part) => isAllowed(part, allowed));
  return allowed.has(text);
}

function audit(label, flag, allowed) {
  const output = execFileSync("pnpm", ["licenses", "list", "--json", flag], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["ignore", "pipe", "ignore"],
  });
  const rejected = [];
  let count = 0;
  for (const [license, packages] of Object.entries(JSON.parse(output))) {
    count += packages.length;
    if (!isAllowed(license, allowed)) {
      for (const pkg of packages) rejected.push(`${pkg.name} (${license})`);
    }
  }
  if (rejected.length > 0) {
    console.error(`${label} dependencies outside the allowlist:\n  ${rejected.join("\n  ")}`);
    return false;
  }
  console.log(`${label}: all ${count} dependencies carry an allowed license.`);
  return true;
}

if (import.meta.main) {
  const shipped = audit("Shipped", "--prod", SHIPPED);
  const tooling = audit("Development", "--dev", TOOLING);
  if (!shipped || !tooling) process.exit(1);
}
