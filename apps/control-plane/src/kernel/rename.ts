import { sql } from "@vynxlabs/db";
import type { Trx } from "./audit.js";
import { conflict } from "./errors.js";

/**
 * What a workspace keeps under a resource's path, apart from the resource: a
 * connection's credential, a variable's value, a trigger's pause. A rename
 * carries each of these to the new path, in the same transaction, so that the
 * resource at its new path is the one it was.
 *
 * These are rewritten and not keyed by the resource's ID, because most of them
 * have to be there before the resource is: production refuses a deploy whose
 * connections are not bound yet.
 *
 * `also` names the other columns of the table's key. When a row is already at
 * the new path, `clash` says which one stays:
 * - `keep both`: the one at the new path is used, and the old one is left where
 *   it is and reported. It may hold a credential, and a rename destroys nothing.
 * - `drop old`: the old one goes. It is a cache or a short-lived note.
 */
interface PathState {
  table: string;
  column: string;
  also: string[];
  clash: "keep both" | "drop old";
  /** What the row is, for the warning when both are kept. */
  what?: string;
}

export const PATH_STATE: PathState[] = [
  {
    table: "connection_binding",
    column: "path",
    also: [],
    clash: "keep both",
    what: "connection",
  },
  { table: "variable_value", column: "path", also: [], clash: "keep both", what: "value" },
  {
    table: "data_source_binding",
    column: "path",
    also: [],
    clash: "keep both",
    what: "data source",
  },
  {
    table: "connection_group_member",
    column: "group_path",
    also: ["key"],
    clash: "keep both",
    what: "connection group member",
  },
  { table: "trigger_pause", column: "path", also: ["node_id"], clash: "drop old" },
  { table: "webhook_refusal", column: "path", also: [], clash: "drop old" },
  { table: "health_check", column: "path", also: ["kind"], clash: "drop old" },
  { table: "connection_oauth_state", column: "path", also: [], clash: "drop old" },
  { table: "app_domain", column: "app_path", also: [], clash: "drop old" },
  {
    table: "member_recent_item",
    column: "ref",
    also: ["member_id", "tenant_id", "kind"],
    clash: "drop old",
  },
];

/**
 * Columns that hold a path and are left as they are by a rename, each with why.
 * A test fails when a workspace table has a path column that is neither here
 * nor in `PATH_STATE`, so a new one cannot be forgotten.
 */
export const PATH_EXEMPT: Record<string, string> = {
  "resource.path": "the rename itself",
  "resource_version.path": "history: the path each version had",
  "resource_alias.path": "written by the rename: the path it had",
  "resource_draft.path": "carried by key, below",
  "resource_draft_history.path": "carried by key, below",
  "run.script_path": "history: the path it ran under. Runs are found by resource_id",
  "flow_run.flow_path": "history: the path it ran under. Flow runs are found by resource_id",
  "trigger_state.target_path":
    "a reference to the script or flow a trigger starts. The trigger's hook writes it from the trigger's body",
};

/** A path no resource can have, for the middle of a swap. */
export const swapPath = (resourceId: string) => `~swap/${resourceId}`;
const isSwap = (path: string) => path.startsWith("~swap/");

/**
 * Carries everything kept under `from` to `to`. `data` is the transaction on
 * the tenant's tables, which may be another database. Returns what could not
 * be carried because the new path had its own, in words for whoever deploys.
 */
export async function renamePathState(
  trx: Trx,
  data: Trx,
  workspaceId: string,
  resource: { id: string; key: string; kind: string },
  from: string,
  to: string,
  /** The path the resource had before the swap began, when `from` is the middle of one. */
  was = from,
): Promise<string[]> {
  if (from === to) return [];
  const warnings: string[] = [];

  for (const state of PATH_STATE) {
    const table = sql.table(state.table);
    const column = sql.ref(state.column);
    const sameKey = sql.join(
      state.also.map((other) => sql`x.${sql.ref(other)} = t.${sql.ref(other)}`),
      sql` and `,
    );
    const taken = sql`exists (
      select 1 from ${table} x
      where x.workspace_id = t.workspace_id and x.${column} = ${to}
      ${state.also.length > 0 ? sql`and ${sameKey}` : sql``}
    )`;
    if (state.clash === "drop old") {
      await sql`delete from ${table} t where t.workspace_id = ${workspaceId} and t.${column} = ${from} and ${taken}`.execute(
        trx,
      );
    }
    await sql`update ${table} t set ${column} = ${to} where t.workspace_id = ${workspaceId} and t.${column} = ${from} and not ${taken}`.execute(
      trx,
    );
    if (state.clash === "keep both" && !isSwap(to)) {
      const left = await sql<{
        n: string;
      }>`select count(*) as n from ${table} t where t.workspace_id = ${workspaceId} and t.${column} = ${from}`.execute(
        trx,
      );
      if (Number(left.rows[0]?.n ?? 0) > 0) {
        warnings.push(
          `${to} already had its own ${state.what} in this workspace, which is kept. The one ${was} had is still there under ${was}.`,
        );
      }
    }
  }

  // A draft is of one resource: it follows it. A draft of something else at the new path is in the way.
  const blocking = await trx
    .selectFrom("resource_draft")
    .select("key")
    .where("workspace_id", "=", workspaceId)
    .where("path", "=", to)
    .where("key", "<>", resource.key)
    .executeTakeFirst();
  if (blocking && !isSwap(to)) {
    throw conflict(
      `There is a draft at ${to} in the console, of another resource. Deploy or set aside that draft, then rename.`,
    );
  }
  await trx
    .updateTable("resource_draft")
    .set({ path: to })
    .where("workspace_id", "=", workspaceId)
    .where("key", "=", resource.key)
    .where("path", "=", from)
    .execute();
  await trx
    .updateTable("resource_draft_history")
    .set({ path: to })
    .where("workspace_id", "=", workspaceId)
    .where("key", "=", resource.key)
    .where("path", "=", from)
    .execute();

  if (resource.kind === "table") {
    // The table keeps its rows and takes the new name. The name it had is remembered, as when
    // a table says what it was renamed from.
    await data
      .updateTable("data_table")
      .set({
        name: to,
        ...(isSwap(to)
          ? {}
          : {
              previous_names: sql<
                string[]
              >`array_append(array_remove(array_remove(previous_names, ${to}), ${was}), ${was})`,
            }),
      })
      .where("workspace_id", "=", workspaceId)
      .where("name", "=", from)
      .where("resource_id", "=", resource.id)
      .execute();
    await sql`
      update data_column c set reference_table = ${to}
      from data_table t
      where c.table_id = t.id and t.workspace_id = ${workspaceId} and c.reference_table = ${from}
    `.execute(data);
  }
  return warnings;
}
