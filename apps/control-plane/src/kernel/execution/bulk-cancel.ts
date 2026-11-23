import { isId, sql } from "@volvel/db";
import { HttpError } from "../errors.js";
import { cancelFlowRun } from "../flows/engine.js";
import type { Kernel } from "../kernel.js";
import { announceCanceled, cancelRun, takeCanceled } from "./runs.js";

/** Cancelled in one transaction at a time, so a long list never holds one open for long. */
const BATCH = 200;
/** The most one request cancels. A workspace with more says so, and is asked again. */
export const BULK_CANCEL_LIMIT = 10_000;

export interface BulkCancel {
  workspaceId: string;
  /** `queued`: only what has not started. `all`: what is going as well. */
  include: "queued" | "all";
  /** Only what was started at least this long ago. */
  olderThanSeconds?: number | undefined;
  /**
   * Only the runs a filtered runs list shows: never a flow's steps, which go with
   * their flow, and only those matching every filter given.
   */
  filters?: RunFilters | undefined;
}

/** The runs list's filters, as the activity route reads them. */
export interface RunFilters {
  target?: string | undefined;
  /** A path prefix, a tag, an ID, or text in the error. */
  q?: string | undefined;
  tags?: string[] | undefined;
  from?: Date | undefined;
  to?: Date | undefined;
}

export interface BulkCancelled {
  cancelled: number;
  /** More were left than one request cancels: ask again. */
  more: boolean;
}

/**
 * Cancels a workspace's runs in bulk: the way out of a backlog, such as one a
 * schedule built while its runs could not keep up. Each batch is its own
 * transaction, through the same cancel as one run, so a run that ends meanwhile
 * is simply passed over.
 */
export async function cancelRuns(kernel: Kernel, request: BulkCancel): Promise<BulkCancelled> {
  const statuses = request.include === "all" ? ["queued", "running"] : ["queued"];
  return inBatches(async (passed) => {
    let query = kernel.db
      .selectFrom("run")
      .select("id")
      .where("workspace_id", "=", request.workspaceId)
      .where("status", "in", statuses as ("queued" | "running")[]);
    if (passed.length > 0) query = query.where("id", "not in", passed);
    if (request.olderThanSeconds) {
      query = query.where("created_at", "<=", before(request.olderThanSeconds));
    }
    const filters = request.filters;
    if (filters) {
      query = query.where("flow_run_id", "is", null);
      if (filters.target) query = query.where("script_path", "=", filters.target);
      if (filters.from) query = query.where("created_at", ">=", filters.from);
      if (filters.to) query = query.where("created_at", "<", filters.to);
      for (const tag of filters.tags ?? []) {
        query = query.where(sql<boolean>`${tag} = any(tags)`);
      }
      if (filters.q) {
        const q = filters.q;
        const like = q.replace(/[\\%_]/g, "\\$&");
        query = query.where((eb) =>
          eb.or([
            eb("script_path", "like", `${like}%`),
            eb(sql<boolean>`${q} = any(tags)`, "=", true),
            eb("error_summary", "ilike", `%${like}%`),
            ...(isId(q) ? [eb("id", "=", q)] : []),
          ]),
        );
      }
    }
    const ids = (await query.orderBy("created_at").limit(BATCH).execute()).map((row) => row.id);
    if (ids.length === 0) return { ids, passed: [] };
    let ended: ReturnType<typeof takeCanceled> = [];
    const missed = await kernel.db.transaction().execute(async (trx) => {
      const left: string[] = [];
      for (const id of ids) {
        const ok = await cancelRun(kernel, trx, request.workspaceId, id).then(
          () => true,
          (error: unknown) => {
            // It ended, or was cancelled, since it was listed.
            if (error instanceof HttpError) return false;
            throw error;
          },
        );
        if (!ok) left.push(id);
      }
      ended = takeCanceled(trx);
      return left;
    });
    await announceCanceled(kernel, ended);
    return { ids, passed: missed };
  });
}

/** Cancels a workspace's flow runs in progress in bulk, with the steps they have going. */
export async function cancelFlowRuns(
  kernel: Kernel,
  request: Omit<BulkCancel, "include">,
): Promise<BulkCancelled> {
  return inBatches(async (passed) => {
    let query = kernel.db
      .selectFrom("flow_run")
      .select("id")
      .where("workspace_id", "=", request.workspaceId)
      .where("status", "=", "running")
      // A sub-flow goes with the flow that started it.
      .where("parent_flow_run_id", "is", null);
    if (passed.length > 0) query = query.where("id", "not in", passed);
    if (request.olderThanSeconds) {
      query = query.where("created_at", "<=", before(request.olderThanSeconds));
    }
    const ids = (await query.orderBy("created_at").limit(BATCH).execute()).map((row) => row.id);
    if (ids.length === 0) return { ids, passed: [] };
    const missed: string[] = [];
    // One flow run per transaction: each takes its flow run's lock, as a single cancel does.
    for (const id of ids) {
      let ended: ReturnType<typeof takeCanceled> = [];
      const ok = await kernel.db
        .transaction()
        .execute(async (trx) => {
          await cancelFlowRun(kernel, trx, request.workspaceId, id);
          ended = takeCanceled(trx);
        })
        .then(
          () => true,
          (error: unknown) => {
            if (error instanceof HttpError) return false;
            throw error;
          },
        );
      if (!ok) missed.push(id);
      await announceCanceled(kernel, ended);
    }
    return { ids, passed: missed };
  });
}

function before(seconds: number): Date {
  return new Date(Date.now() - seconds * 1000);
}

/**
 * Runs `batch` until nothing is left or the limit is reached. A cancelled one no
 * longer matches; one that could not be, because it ended meanwhile, is passed over.
 */
async function inBatches(
  batch: (passed: string[]) => Promise<{ ids: string[]; passed: string[] }>,
): Promise<BulkCancelled> {
  const passed: string[] = [];
  let looked = 0;
  let cancelled = 0;
  while (looked < BULK_CANCEL_LIMIT) {
    const found = await batch(passed);
    if (found.ids.length === 0) return { cancelled, more: false };
    looked += found.ids.length;
    cancelled += found.ids.length - found.passed.length;
    passed.push(...found.passed);
  }
  return { cancelled, more: true };
}
