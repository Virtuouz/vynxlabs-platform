import { Database } from "@vynxlabs/db";
import { buildApp } from "./app.js";
import { ConfigError, loadConfig } from "./config.js";
import { bootstrapAdmin } from "./kernel/bootstrap.js";
import { startBackground } from "./kernel/execution/background.js";
import { setWorkerUserMode } from "./kernel/execution/isolation.js";
import { WorkerSupervisor } from "./kernel/execution/supervisor.js";
import { rekey, rekeyIfRotating } from "./kernel/rekey.js";
import { failInterruptedClones } from "./kernel/tenancy/clone.js";
import { S3ObjectStore } from "./storage.js";
import { version } from "./version.js";

function loadConfigOrExit() {
  try {
    return loadConfig(process.env);
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }
}

const config = loadConfigOrExit();
const storage = new S3ObjectStore(config.s3);
const database = new Database({
  connectionString: config.databaseUrl,
  onConnectionError: (error) =>
    console.warn(`An idle database connection failed: ${error.message}`),
});
// Migrations run before anything else looks at the database.
const migrations = await database.migrate().catch(async (error) => {
  console.error(
    `Boot failed while migrating the database: ${error instanceof Error ? error.message : error}`,
  );
  await database.close();
  process.exit(1);
});
await database.queue.start();
const app = await buildApp({ database, storage, version, config, logLevel: config.logLevel });
let background: ReturnType<typeof startBackground> | undefined;

// `node dist/main.js rekey`: seals again with MASTER_KEY whatever is sealed with
// MASTER_KEY_SECONDARY, says what it did, and exits. 1 when a value opens with neither.
if (process.argv[2] === "rekey") {
  const result = await rekey(app.kernel).catch(async (error) => {
    console.error(`The rewrap failed: ${error instanceof Error ? error.message : error}`);
    await app.close();
    process.exit(1);
  });
  console.log(JSON.stringify({ masterKey: app.kernel.vault.fingerprints, ...result }, null, 2));
  await app.close();
  process.exit(result.unopened.length > 0 ? 1 : 0);
}

app.addHook("onClose", async () => {
  await background?.stop();
  await database.close();
  storage.close();
});

let stopping = false;
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    app.log.info({ signal }, "shutting down");
    app.close().then(
      () => process.exit(0),
      (error) => {
        app.log.error({ err: error }, "shutdown failed");
        process.exit(1);
      },
    );
  });
}

try {
  app.log.info(
    { applied: migrations.applied, migrationLevel: migrations.level },
    migrations.applied.length > 0 ? "migrations applied" : "database is up to date",
  );
  await storage.ensureBucket();
  app.log.info({ bucket: config.s3.bucket }, "object store is ready");
  await bootstrapAdmin(app.kernel, app.log);
  // During a rotation, what the other key sealed is sealed again before anything else uses it.
  await rekeyIfRotating(app.kernel);
  // Sets up the sign-in for row requests. Done now, not by the first request that needs it.
  await app.kernel.data.platform();
  await app.listen({ host: config.host, port: config.port });
  // A clone that was running an hour ago, when this process was not, did not survive.
  await failInterruptedClones(app.kernel, new Date(Date.now() - 60 * 60 * 1000));
  // In host mode a worker host of its own starts managed workers; this process starts none.
  if (config.managedWorkers === "host") setWorkerUserMode("host");
  background = startBackground(
    app.kernel,
    config.managedWorkers === "process"
      ? new WorkerSupervisor(app.kernel, {
          url: `http://127.0.0.1:${config.port}`,
          user: config.managedWorkerUser,
        })
      : undefined,
  );
  app.log.info({ version, managedWorkers: config.managedWorkers }, "control plane started");
} catch (error) {
  app.log.fatal({ err: error }, "boot failed");
  await app.close().catch(() => {});
  process.exit(1);
}
