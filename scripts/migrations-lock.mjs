// Guards the rule that a shipped migration is never edited.
//
//   node scripts/migrations-lock.mjs                 check files against the lock
//   node scripts/migrations-lock.mjs --update        record new migrations
//   node scripts/migrations-lock.mjs --base <ref>    also require that every
//                                                    migration locked at <ref>
//                                                    is unchanged here
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const dir = join(root, "packages/db/migrations");
const lockRelative = "packages/db/migrations.lock.json";
const lockPath = join(root, lockRelative);

const args = process.argv.slice(2);
const update = args.includes("--update");
const baseIndex = args.indexOf("--base");
const base = baseIndex === -1 ? null : args[baseIndex + 1];

function readLock() {
  try {
    return JSON.parse(readFileSync(lockPath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
}

const current = Object.fromEntries(
  readdirSync(dir)
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .map((file) => [
      file,
      createHash("sha256")
        .update(readFileSync(join(dir, file)))
        .digest("hex"),
    ]),
);
const lock = readLock();
const problems = [];

for (const [file, sum] of Object.entries(lock)) {
  if (!(file in current)) problems.push(`${file} is locked but the file is gone.`);
  else if (current[file] !== sum) problems.push(`${file} was edited after it was locked.`);
}

const unlocked = Object.keys(current).filter((file) => !(file in lock));
if (update) {
  if (problems.length === 0 && unlocked.length > 0) {
    writeFileSync(lockPath, `${JSON.stringify(current, null, 2)}\n`);
    console.log(`Locked ${unlocked.join(", ")}.`);
  }
} else {
  for (const file of unlocked) {
    problems.push(`${file} is not locked. Run "pnpm lock:migrations".`);
  }
}

if (base) {
  let baseLock = {};
  try {
    baseLock = JSON.parse(
      execFileSync("git", ["show", `${base}:${lockRelative}`], {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }),
    );
  } catch {
    // The base has no lock file yet, so nothing has shipped.
  }
  for (const [file, sum] of Object.entries(baseLock)) {
    if (current[file] !== sum) {
      problems.push(`${file} already shipped on ${base} and must not change. Add a new migration.`);
    }
  }
}

if (problems.length > 0) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`Migrations match the lock (${Object.keys(current).length} files).`);
