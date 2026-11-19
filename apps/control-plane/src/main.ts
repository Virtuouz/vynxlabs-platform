import { Database } from "@volvel/db";
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
  maxConnections: config.limits.databasePoolSize,
  dataConnections: config.limits.dataPoolSize,
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
// A database taking no writes, such as one whose disk is full, still lets the instance
// start: it serves what reads alone can, and starts the rest once writes come back.
const readOnlyAtStart = await database.readOnly().catch(() => false);
if (!readOnlyAtStart) await database.queue.start();
const app = await buildApp({ database, storage, version, config, logLevel: config.logLevel });
let background: ReturnType<typeof startBackground> | undefined;
/** Whether what needs writes is running: the queue, the background loop, managed workers. */
let writing = false;
/** A change between writing and not, in progress. */
let changing: Promise<void> | undefined;

async function startWriting(options: { atBoot?: boolean } = {}) {
  await database.queue.start();
  // At boot these ran already, before the sign-in for row requests was set up.
  if (!options.atBoot) {
    await bootstrapAdmin(app.kernel, app.log);
    // During a rotation, what the other key sealed is sealed again before anything else uses it.
    await rekeyIfRotating(app.kernel);
  }
  // A clone that was running an hour ago, when this process was not, did not survive.
  await failInterruptedClones(app.kernel, new Date(Date.now() - 60 * 60 * 1000));
  background = startBackground(
    app.kernel,
    config.managedWorkers === "process"
      ? new WorkerSupervisor(app.kernel, {
          url: `http://127.0.0.1:${config.port}`,
          user: config.managedWorkerUser,
          ...(config.limits.runSlots ? { runSlots: config.limits.runSlots } : {}),
          ...(config.limits.runMemoryFloorMb !== undefined
            ? { memoryFloorMb: config.limits.runMemoryFloorMb }
            : {}),
          ...(config.limits.managedWorkersMax
            ? { maxWorkers: config.limits.managedWorkersMax }
            : {}),
        })
      : undefined,
  );
  writing = true;
}

async function stopWriting() {
  writing = false;
  await background?.stop();
  background = undefined;
}

/** Every 10 seconds: has the database started or stopped taking writes? */
const WRITABLE_CHECK_MS = 10_000;
const writableWatch = setInterval(() => {
  if (changing || stopping) return;
  changing = database
    .readOnly()
    .then(async (readOnly) => {
      if (!readOnly && !writing) {
        app.log.warn("the database takes writes again: starting the queue and background work");
        await startWriting();
      } else if (readOnly && writing) {
        app.log.error(
          "the database takes no writes: its disk may be full. Background work stops; " +
            "reads go on, and changes are answered 503 until writes come back",
        );
        await stopWriting();
      }
    })
    .catch((error) =>
      app.log.warn({ err: error }, "could not tell whether the database takes writes"),
    )
    .finally(() => {
      changing = undefined;
    });
}, WRITABLE_CHECK_MS);
writableWatch.unref();

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
  clearInterval(writableWatch);
  await changing;
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
  // In host mode a worker host of its own starts managed workers; this process starts none.
  if (config.managedWorkers === "host") setWorkerUserMode("host");
  if (readOnlyAtStart) {
    // The sign-in for row requests was set up when the database last took writes.
    await app.kernel.data.platform({ setUp: false });
    await app.listen({ host: config.host, port: config.port });
    app.log.error(
      "the database takes no writes: its disk may be full. Serving reads only; the queue " +
        "and background work start when writes come back",
    );
  } else {
    await bootstrapAdmin(app.kernel, app.log);
    // During a rotation, what the other key sealed is sealed again before anything else uses it.
    await rekeyIfRotating(app.kernel);
    // Sets up the sign-in for row requests. Done now, not by the first request that needs it.
    await app.kernel.data.platform();
    await app.listen({ host: config.host, port: config.port });
    await startWriting({ atBoot: true });
  }
  app.log.info({ version, managedWorkers: config.managedWorkers }, "control plane started");
} catch (error) {
  app.log.fatal({ err: error }, "boot failed");
  await app.close().catch(() => {});
  process.exit(1);
}
