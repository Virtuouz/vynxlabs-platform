import { fileURLToPath } from "node:url";
import { staleSchemas, writeSchemas } from "./emit.js";

const dir = fileURLToPath(new URL("../../../schemas", import.meta.url));

if (process.argv.includes("--check")) {
  const stale = await staleSchemas(dir);
  if (stale.length > 0) {
    console.error(`Out of date in schemas/: ${stale.join(", ")}. Run "pnpm emit:schemas".`);
    process.exit(1);
  }
  console.log("schemas/ matches the code.");
} else {
  await writeSchemas(dir);
  console.log("Wrote schemas/.");
}
