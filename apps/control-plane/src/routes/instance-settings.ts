import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { Type } from "typebox";
import { access } from "../kernel/http.js";
import type { Kernel } from "../kernel/kernel.js";

const Whole = Type.Union([Type.Integer(), Type.Null()]);

/** The origin of an address, never a path, user or password that may be in it. */
function originOf(address: string | undefined): string | null {
  if (!address || !URL.canParse(address)) return null;
  return new URL(address).origin;
}

/** What the replica answering is set to, for the operators who run it. Secrets are never given. */
export function instanceSettingsRoutes(kernel: Kernel): FastifyPluginAsyncTypebox {
  return async (app) => {
    app.get(
      "/instance/settings",
      {
        config: { access: access.instance("instance:read") },
        schema: {
          summary: "What the replica answering is set to",
          description:
            "The settings of the process that answered, as it read them from its environment: " +
            "whether it starts workers, its run slots and memory floor, its database pools, how long " +
            "each kind of history is kept, whether mail is set up, where apps are served, and the " +
            "networks it may reach. Another replica may be set differently. A secret is never in it, " +
            "only whether it is set. A number that is `null` was not set: the instance works it out.",
          tags: ["instance"],
          response: {
            200: Type.Object({
              managedWorkers: Type.Union([
                Type.Literal("host"),
                Type.Literal("process"),
                Type.Null(),
              ]),
              runSlots: Whole,
              runMemoryFloorMb: Whole,
              managedWorkersMax: Whole,
              databasePoolSize: Type.Integer(),
              dataPoolSize: Type.Integer(),
              dataTenantConnections: Whole,
              dataStatementTimeoutMs: Type.Integer(),
              sqlStatementTimeoutMs: Type.Integer(),
              scheduleBacklogLimit: Type.Integer(),
              triggersPausedByEnvironment: Type.Boolean(),
              retention: Type.Object({
                runsDays: Type.Integer(),
                eventsDays: Type.Integer(),
                refusalsDays: Type.Integer(),
                auditDays: Type.Integer(),
              }),
              mail: Type.Union([
                Type.Object({ from: Type.String() }),
                Type.Object({ capturedToFiles: Type.Literal(true) }),
                Type.Null(),
              ]),
              publicUrl: Type.String(),
              appsAddress: Type.Union([
                Type.Literal("separate"),
                Type.Literal("console"),
                Type.Literal("none"),
              ]),
              appsUrl: Type.Union([Type.String(), Type.Null()]),
              egressAllow: Type.Object({
                networks: Type.Array(Type.String()),
                hosts: Type.Array(Type.String()),
              }),
              trustedProxies: Type.Union([Type.Integer(), Type.Array(Type.String())]),
              metricsToken: Type.Boolean(),
              metricsWorkspaceLabels: Type.Boolean(),
              telemetry: Type.Boolean(),
            }),
          },
        },
      },
      async () => {
        const config = kernel.config;
        const { limits } = config;
        return {
          managedWorkers: config.managedWorkers || null,
          runSlots: limits.runSlots ?? null,
          runMemoryFloorMb: limits.runMemoryFloorMb ?? null,
          managedWorkersMax: limits.managedWorkersMax ?? null,
          databasePoolSize: limits.databasePoolSize,
          dataPoolSize: limits.dataPoolSize,
          dataTenantConnections: limits.dataTenantConnections ?? null,
          dataStatementTimeoutMs: limits.dataStatementTimeoutMs,
          sqlStatementTimeoutMs: limits.sqlStatementTimeoutMs,
          scheduleBacklogLimit: limits.scheduleBacklogLimit,
          triggersPausedByEnvironment: limits.triggersPaused,
          retention: { ...config.retention },
          mail: config.mail
            ? { from: config.mail.from }
            : config.mailCaptureDir
              ? { capturedToFiles: true as const }
              : null,
          publicUrl: config.publicUrl,
          appsAddress: config.appsUrl
            ? ("separate" as const)
            : config.appsOnConsoleAddress
              ? ("console" as const)
              : ("none" as const),
          appsUrl: originOf(config.appsUrl),
          egressAllow: { ...config.egressAllow },
          trustedProxies: config.trustedProxies,
          metricsToken: config.metricsToken !== undefined,
          metricsWorkspaceLabels: config.metricsWorkspaceLabels,
          telemetry: config.telemetry.endpoint !== undefined,
        };
      },
    );
  };
}
