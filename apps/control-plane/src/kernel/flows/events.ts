import { newId } from "@vynxlabs/db";
import { PLATFORM_EVENT_PREFIX, validateJson } from "@vynxlabs/manifest";
import type { Trx } from "../audit.js";
import { badRequest, HttpError, notFound } from "../errors.js";
import { kickStarted, startTarget } from "../execution/triggers.js";
import type { Kernel } from "../kernel.js";
import { ExpressionError } from "./expressions.js";

/** Past this many events in a chain of causes, an event is stored but starts nothing. */
export const MAX_EVENT_DEPTH = 10;

export interface PublishEvent {
  tenantId: string;
  workspaceId: string;
  name: string;
  payload: Record<string, unknown>;
  source: { type: "script" | "api" | "platform"; id?: string | null };
  /** How many events led to this one. */
  depth?: number;
}

/**
 * Stores an event and starts a run for every subscriber, in the caller's
 * transaction. Either all of it happens or none of it, and a subscriber gets
 * exactly one run per event however often the publish is retried.
 *
 * After the transaction commits, pass `started` to `kickStarted` so that flow
 * runs take their first step at once.
 */
export async function publishEvent(kernel: Kernel, trx: Trx, event: PublishEvent) {
  const depth = event.depth ?? 0;
  if (!event.name.startsWith(PLATFORM_EVENT_PREFIX)) {
    const definition = await trx
      .selectFrom("resource")
      .select("body")
      .where("workspace_id", "=", event.workspaceId)
      .where("kind", "=", "event")
      .where("path", "=", event.name)
      .executeTakeFirst();
    if (!definition) throw notFound(`The event ${event.name}`);
    const issues = validateJson(
      (definition.body as { payload: object }).payload,
      event.payload,
      "/payload",
    );
    if (issues.length > 0)
      throw badRequest("The payload does not match the event's schema.", issues);
  }

  const id = newId();
  const stored = await trx
    .insertInto("event")
    .values({
      id,
      tenant_id: event.tenantId,
      workspace_id: event.workspaceId,
      name: event.name,
      payload: JSON.stringify(event.payload),
      source_type: event.source.type,
      source_id: event.source.id ?? null,
      depth,
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  if (depth >= MAX_EVENT_DEPTH) {
    kernel.log.warn(
      { event: event.name, depth, workspaceId: event.workspaceId },
      "an event is too deep in a chain of events caused by events, so it starts nothing",
    );
    return { event: stored, started: [] as { kind: string; id: string }[] };
  }

  // In a paused workspace the event is kept, and starts nothing.
  const paused = await trx
    .selectFrom("workspace")
    .select("triggers_paused")
    .where("id", "=", event.workspaceId)
    .executeTakeFirst();
  const subscribers = paused?.triggers_paused
    ? []
    : await trx
        .selectFrom("trigger_state")
        .selectAll()
        .where("workspace_id", "=", event.workspaceId)
        .where("type", "=", "event")
        .where("event_name", "=", event.name)
        .where("enabled", "=", true)
        .orderBy("resource_id")
        .orderBy("node_id")
        .execute();
  const started: { kind: string; id: string }[] = [];
  for (const subscriber of subscribers) {
    if (subscriber.filter) {
      try {
        const wanted = await kernel.expressions.evaluate(subscriber.filter, {
          event: { name: event.name, payload: event.payload },
        });
        if (wanted !== true) continue;
      } catch (error) {
        if (!(error instanceof ExpressionError)) throw error;
        kernel.log.warn(
          { event: event.name, target: subscriber.target_path, reason: error.message },
          "an event filter could not be evaluated, so its subscriber was not started",
        );
        continue;
      }
    }
    try {
      started.push(
        await startTarget(kernel, trx, subscriber, {
          input: event.payload,
          trigger: { type: "event", detail: { event: event.name, eventId: id, depth: depth + 1 } },
          idempotencyKey: `event:${id}:${subscriber.resource_id}:${subscriber.node_id}`,
        }),
      );
    } catch (error) {
      // A payload the subscriber's script does not accept must not undo the publish.
      if (!(error instanceof HttpError)) throw error;
      kernel.log.warn(
        { event: event.name, target: subscriber.target_path, reason: error.message },
        "an event's subscriber could not be started",
      );
    }
  }
  return { event: stored, started };
}

/**
 * Publishes one of the platform's own events. It is stored only when
 * something in the workspace subscribes to it: subscriptions are deployed
 * resources, so nothing can be missed, and unheard events cost nothing.
 */
export async function publishPlatformEvent(
  kernel: Kernel,
  event: {
    tenantId: string;
    workspaceId: string;
    name: string;
    payload: Record<string, unknown>;
    sourceId: string;
    depth: number;
  },
): Promise<void> {
  const heard = await kernel.db
    .selectFrom("trigger_state")
    .innerJoin("workspace", "workspace.id", "trigger_state.workspace_id")
    .select("trigger_state.resource_id")
    .where("trigger_state.workspace_id", "=", event.workspaceId)
    .where("trigger_state.type", "=", "event")
    .where("trigger_state.event_name", "=", event.name)
    .where("trigger_state.enabled", "=", true)
    .where("workspace.triggers_paused", "=", false)
    .limit(1)
    .executeTakeFirst();
  if (!heard) return;
  const published = await kernel.db.transaction().execute((trx) =>
    publishEvent(kernel, trx, {
      tenantId: event.tenantId,
      workspaceId: event.workspaceId,
      name: event.name,
      payload: event.payload,
      source: { type: "platform", id: event.sourceId },
      depth: event.depth,
    }),
  );
  await kickStarted(kernel, published.started);
}
