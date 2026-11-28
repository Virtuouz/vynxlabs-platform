// Writes THIRD_PARTY_NOTICES.md: every dependency that ships, with its license and the text of
// its license file. The release workflow and the image's build run it; it is never committed.
//
//   node scripts/third-party-notices.mjs [--out FILE]   write the notices (default: THIRD_PARTY_NOTICES.md)
//   node scripts/third-party-notices.mjs --check        fail when a shipped dependency has no license text
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BY_NAME, listLicenses } from "./check-licenses.mjs";

/** What each package accepted by name owes beyond its notice, in its license's own terms. */
const BY_NAME_NOTES = {
  elkjs:
    "Used under the Eclipse Public License 2.0 (EPL-2.0). It is unmodified. Its source is at https://github.com/kieler/elkjs, and the source of Eclipse ELK, which it is built from, is at https://github.com/eclipse-elk/elk.",
};

/**
 * Packages that ship no license file, with who holds the copyright, as their package.json or home
 * page names them. Their notice is the standard text of the license their package.json declares,
 * under that holder. Every other package without a license file fails the check, so a new one is
 * looked at by a person before it is added here.
 */
export const NO_LICENSE_FILE = {
  "@aws-sdk/credential-provider-http": "Amazon.com, Inc. or its affiliates",
  "@aws-sdk/credential-provider-login": "Amazon.com, Inc. or its affiliates",
  "@aws-sdk/nested-clients": "Amazon.com, Inc. or its affiliates",
  "@esbuild/linux-x64": "Evan Wallace",
  "abstract-logging": "James Sumners",
  "clean-git-ref": "Eli White",
  diff3: "Tyler Wanek",
  minimisted: "Yoshiya Hinosawa",
  "pg-types": "Brian M. Carlson",
  pgpass: "Hannes Hörl",
  "react-compiler-runtime": "Meta Platforms, Inc. and affiliates",
};

const MIT_TEXT = `Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.`;

/** The text standing in for a license file the package does not ship, or undefined if none may. */
export function standardNotice(name, license) {
  if (!Object.hasOwn(NO_LICENSE_FILE, name)) return undefined;
  const holder = NO_LICENSE_FILE[name];
  const why = `This package ships no license file. Its package.json declares ${license}; the copyright is held by ${holder}.`;
  if (license === "MIT") return `${why}\n\nCopyright (c) ${holder}\n\n${MIT_TEXT}`;
  if (license === "Apache-2.0") {
    return `${why}\n\nCopyright ${holder}\n\nLicensed under the Apache License, Version 2.0. The full text is at https://www.apache.org/licenses/LICENSE-2.0 and is the same text as in the other Apache-2.0 packages in this file.`;
  }
  return undefined;
}

/** The files in a package's folder that carry its license, or a notice that goes with it. */
const LICENSE_FILE = /^(licen[cs]e|copying)([-._].*)?$/i;
const NOTICE_FILE = /^notice([-._].*)?$/i;

/** Reads the license files and notice files of the package installed in `dir`, sorted by name. */
export function readLicenseTexts(dir) {
  if (!existsSync(dir)) return { licenses: [], notices: [] };
  const files = readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort();
  const read = (name) => ({ name, text: readFileSync(join(dir, name), "utf8").trim() });
  return {
    licenses: files.filter((name) => LICENSE_FILE.test(name)).map(read),
    notices: files.filter((name) => NOTICE_FILE.test(name)).map(read),
  };
}

/** Every shipped package as one entry per installed version, without Volvel's own packages. */
export function collectEntries(list, read = readLicenseTexts) {
  const seen = new Set();
  const entries = [];
  for (const [license, packages] of Object.entries(list)) {
    for (const pkg of packages) {
      if (pkg.name.startsWith("@volvel/")) continue;
      (pkg.paths ?? []).forEach((dir, index) => {
        const version = pkg.versions?.[index] ?? pkg.versions?.[0] ?? "unknown";
        const key = `${pkg.name}@${version}`;
        if (seen.has(key)) return;
        seen.add(key);
        entries.push({ name: pkg.name, version, license, homepage: pkg.homepage, ...read(dir) });
      });
    }
  }
  return entries.sort((a, b) => {
    if (a.name !== b.name) return a.name < b.name ? -1 : 1;
    return a.version < b.version ? -1 : a.version > b.version ? 1 : 0;
  });
}

/** One package's section: heading, license, what its license asks, and the texts. */
export function formatEntry(entry) {
  const lines = [`## ${entry.name} ${entry.version}`, "", `License: ${entry.license}`];
  if (entry.homepage) lines.push(`Home page: ${entry.homepage}`);
  if (Object.hasOwn(BY_NAME, entry.name) && BY_NAME_NOTES[entry.name]) {
    lines.push("", `Note: ${BY_NAME_NOTES[entry.name]}`);
  }
  const standard =
    entry.licenses.length === 0 ? standardNotice(entry.name, entry.license) : undefined;
  if (standard) lines.push("", "### License", "", "~~~~text", standard, "~~~~");
  for (const file of [...entry.licenses, ...entry.notices]) {
    lines.push("", `### ${file.name}`, "", "~~~~text", file.text, "~~~~");
  }
  return lines.join("\n");
}

/** The whole file. */
export function formatNotices(entries) {
  return `${[
    "# Third-party notices",
    `Volvel is licensed under the Apache License 2.0. It distributes the ${entries.length} packages below, each under its own license, and each license asks that its notice travel with the code. This file is generated by \`node scripts/third-party-notices.mjs\`.`,
    ...entries.map(formatEntry),
  ].join("\n\n")}\n`;
}

/** The packages that have no license file to copy a notice from. */
export function missingLicenseText(entries) {
  return entries
    .filter((one) => one.licenses.length === 0 && !standardNotice(one.name, one.license))
    .map((one) => `${one.name}@${one.version}`);
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const entries = collectEntries(listLicenses("--prod"));
  if (args.includes("--check")) {
    const missing = missingLicenseText(entries);
    if (missing.length > 0) {
      console.error(
        `These shipped dependencies have no license file to copy a notice from:\n  ${missing.join("\n  ")}\nDrop the dependency, or record who holds its copyright in NO_LICENSE_FILE in scripts/third-party-notices.mjs.`,
      );
      process.exit(1);
    }
    console.log(`Notices: all ${entries.length} shipped packages have a license text.`);
  } else {
    const at = args.indexOf("--out");
    const out = at >= 0 ? args[at + 1] : "THIRD_PARTY_NOTICES.md";
    writeFileSync(out, formatNotices(entries));
    console.log(`Wrote ${out}: ${entries.length} packages.`);
  }
}
