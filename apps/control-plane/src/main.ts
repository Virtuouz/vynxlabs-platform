import { Database } from "@vynxlabs/db";
import { buildApp } from "./app.js";
import { ConfigError, loadConfig } from "./config.js";
import { bootstrapAdmin } from "./kernel/bootstrap.js";
import { startBackground } from "./kernel/execution/background.js";
import { WorkerSupervisor } from "./kernel/execution/supervisor.js";
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
  await app.listen({ host: config.host, port: config.port });
  background = startBackground(
    app.kernel,
    config.managedWorkers
      ? new WorkerSupervisor(app.kernel, { url: `http://127.0.0.1:${config.port}` })
      : undefined,
  );
  app.log.info({ version, managedWorkers: config.managedWorkers }, "control plane started");
} catch (error) {
  app.log.fatal({ err: error }, "boot failed");
  await app.close().catch(() => {});
  process.exit(1);
}
