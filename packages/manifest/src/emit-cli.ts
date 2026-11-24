import { fileURLToPath } from "node:url";
import { staleKindTypes, staleSchemas, writeKindTypes, writeSchemas } from "./emit.js";

const dir = fileURLToPath(new URL("../../../schemas", import.meta.url));
// The SDK's `define*` take the body of each kind as these types say it.
const typesDir = fileURLToPath(new URL("../../sdk/src/generated", import.meta.url));

if (process.argv.includes("--check")) {
  const stale = await staleSchemas(dir);
  if (stale.length > 0) {
    console.error(`Out of date in schemas/: ${stale.join(", ")}. Run "pnpm emit:schemas".`);
    process.exit(1);
  }
  if (await staleKindTypes(typesDir)) {
    console.error('Out of date: packages/sdk/src/generated/kinds.ts. Run "pnpm emit:schemas".');
    process.exit(1);
  }
  console.log("schemas/ and the SDK's generated types match the code.");
} else {
  await writeSchemas(dir);
  await writeKindTypes(typesDir);
  console.log("Wrote schemas/ and packages/sdk/src/generated/.");
}
