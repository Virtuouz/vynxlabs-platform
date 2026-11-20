// Fails when a dependency carries a license outside the allowlist.
// See CONTRIBUTING.md for the policy.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

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
 * file-level copyleft (MPL-2.0), and the attribution license on the browser
 * support data that the console's build tooling reads (CC-BY-4.0).
 */
const TOOLING = new Set([...SHIPPED, "MPL-2.0", "CC-BY-4.0"]);

/**
 * Packages whose `package.json` names no license, by name and version, with the
 * license their own license file grants. Each is read again on every check: a
 * new version, or a file that no longer says so, is refused as unknown.
 */
const UNDECLARED = {
  // Mermaid's colours. Its file is the MIT License; its package.json leaves it out.
  "khroma@2.1.0": { license: "MIT", says: "The MIT License (MIT)" },
};

/** The license an undeclared package's own file grants, when it is one recorded above. */
function undeclared(pkg) {
  const versions = pkg.versions ?? [];
  if (versions.length === 0) return undefined;
  const found = versions.map((version) => UNDECLARED[`${pkg.name}@${version}`]);
  if (found.some((one) => one === undefined)) return undefined;
  for (const path of pkg.paths ?? []) {
    const file = ["license", "LICENSE", "license.md", "LICENSE.md"]
      .map((name) => join(path, name))
      .find((candidate) => existsSync(candidate));
    if (!file || !found.every((one) => readFileSync(file, "utf8").includes(one.says)))
      return undefined;
  }
  return found[0]?.license;
}

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
      for (const pkg of packages) {
        const granted = license === "Unknown" ? undeclared(pkg) : undefined;
        if (granted === undefined || !isAllowed(granted, allowed)) {
          rejected.push(`${pkg.name} (${license})`);
        }
      }
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
