import {
  type ActingUser,
  type Action,
  type ActionValue,
  conditionsHold,
  conditionWords,
  type PageWidget,
  type RecordRef,
  runsOnServer,
  type Step,
  widgetRegistry,
} from "@volvel/manifest";
import type { WidgetRegistry } from "@volvel/widgets";
import { announceRows } from "../../routes/data.js";
import { writeAudit } from "../audit.js";
import {
  deleteRowKeepingFiles,
  insertRowsKeepingFiles,
  updateRowKeepingFiles,
} from "../data/files.js";
import {
  type DataScope,
  describeTable,
  getRow,
  type Row,
  type RowTarget,
  scopeFor,
  withData,
} from "../data/rows.js";
import { badRequest, HttpError, notFound } from "../errors.js";
import { checkRunStart, startRun } from "../execution/runs.js";
import { checkFlowStart, kickFlow, startFlowRun } from "../flows/engine.js";
import type { RequestContext } from "../http.js";
import type { Kernel } from "../kernel.js";
import { resolveResource } from "../resolve.js";
import { workspaceWidgets } from "../widgets.js";
import { dayIn, startOfDayIn } from "../zones.js";
import { type LocatedPage, locatePage, type PageRequest } from "./locate.js";
import { checkRunBy, principalEmail } from "./who.js";

/** The most records one action is run on at once. */
export const MAX_RECORDS = 200;

/** What the browser sends to run an action (phase 26, decision 0004). */
export interface ActRequest extends PageRequest {
  /** The reader's time zone: their day is what `today` is (D21). UTC when left out. */
  zone?: string | undefined;
  widget: string;
  at: string;
  records?:
    | {
        this?: string | undefined;
        event?: string | undefined;
        /** Several rows chosen in a table: the action runs once per row, all in one transaction. */
        events?: string[] | undefined;
      }
    | undefined;
  inputs?: Record<string, unknown> | undefined;
}

export interface ActResult {
  client: Record<string, unknown>[];
  made?: { table: string; id: string };
  message?: string;
  /** How many records the action ran on: with `records.events`, how many changed. */
  changed?: number;
}

type Issue = { path: string; message: string };

/** The kinds of widget property that hold an action, and the control that says so. */
const ACTION_CONTROL = "action";
const ACTIONS_CONTROL = "actions";

/**
 * Finds the action a widget holds at a place: `on/<event>`, `config/<property>` for a property
 * drawn with the `action` control, or `config/<property>/<index>/action` for one drawn with
 * `actions`. Nothing else names an action, so a made-up place is not found.
 */
export function findAction(
  widget: PageWidget,
  at: string,
  registry: WidgetRegistry = widgetRegistry(),
): Action | undefined {
  const parts = at.split("/");
  let found: unknown;
  if (parts[0] === "on" && parts.length === 2) {
    found = widget.on?.[parts[1] as string];
  } else if (parts[0] === "config" && (parts.length === 2 || parts.length === 4)) {
    const property = parts[1] as string;
    const definition = registry.get(widget.type, widget.version);
    const control = definition?.config.properties[property]?.["x-volvel"]?.control;
    const held = widget.config?.[property];
    if (parts.length === 2 && control === ACTION_CONTROL) {
      found = held;
    } else if (
      parts.length === 4 &&
      control === ACTIONS_CONTROL &&
      parts[3] === "action" &&
      /^\d{1,2}$/.test(parts[2] as string) &&
      Array.isArray(held)
    ) {
      found = (held[Number(parts[2])] as { action?: unknown } | undefined)?.action;
    }
  }
  const action = found as Action | undefined;
  if (!action || typeof action !== "object" || !Array.isArray(action.steps)) return undefined;
  return action;
}

/** The table a widget's rows come from: what an event of the widget gives a record of. */
function tableOfWidget(
  widget: PageWidget,
  pageTable: string | undefined,
  widgets: readonly PageWidget[] = [],
): string | undefined {
  for (const input of Object.values(widget.data ?? {})) {
    const source = input.source;
    if ("visual" in source) return source.visual.table;
    if ("record" in source) return pageTable;
    if ("own" in source) return source.own.table;
    if ("selected" in source) {
      // The table of the table or list the row was chosen in.
      const from = widgets.find((one) => one.id === source.selected);
      return from ? tableOfWidget(from, pageTable, []) : undefined;
    }
  }
  return undefined;
}

/** The columns a Record detail shows: those of its fields not hidden, or every one when it lists none. */
function shownColumns(widget: PageWidget, all: readonly string[]): string[] {
  const listed = widget.config?.fields as { column: string; hidden?: boolean }[] | undefined;
  if (!listed || listed.length === 0) return all.filter((name) => name !== "id");
  return listed.filter((field) => field.hidden !== true).map((field) => field.column);
}

/** The edit in place of a Record detail (`config/edit`): an update of the columns it shows. */
const EDIT_AT = "config/edit";

const humanize = (name: string) => {
  const text = name.replace(/[._]+/g, " ").trim();
  return text === "" ? name : text[0]?.toUpperCase() + text.slice(1);
};

const EMPTY = (value: unknown) => value === null || value === undefined || value === "";

/** Who is acting, for `{ user }` values and for conditions on groups. */
async function actingUser(
  kernel: Kernel,
  ctx: RequestContext,
  tenantId: string,
  scope: DataScope,
): Promise<ActingUser & { id: string }> {
  const { principal } = ctx;
  let email = principal.email;
  let name = principal.name;
  if (principal.id && (email === undefined || name === undefined)) {
    if (principal.type === "end_user") {
      const row = await kernel.db
        .selectFrom("end_user")
        .select(["email", "name"])
        .where("id", "=", principal.id)
        .where("tenant_id", "=", tenantId)
        .executeTakeFirst();
      email ??= row?.email;
      name ??= row?.name ?? undefined;
    } else if (principal.type === "member") {
      const row = await kernel.db
        .selectFrom("member")
        .select(["email", "name"])
        .where("id", "=", principal.id)
        .executeTakeFirst();
      email ??= row?.email;
      name ??= row?.name ?? undefined;
    }
  }
  return {
    id: principal.id ?? "",
    ...(email !== undefined ? { email } : {}),
    ...(name !== undefined ? { name } : {}),
    groups: scope.groups ?? [],
  };
}

/** What an `asked` field of a confirmation may hold. */
function checkAsked(
  field: { type: string; choices?: string[] | undefined },
  value: unknown,
): string | undefined {
  switch (field.type) {
    case "text":
    case "long_text":
      return typeof value === "string" && value.length <= 10_000 ? undefined : "must be text";
    case "number":
      return typeof value === "number" && Number.isFinite(value) ? undefined : "must be a number";
    case "date":
      return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
        ? undefined
        : "must be a date, like 2026-01-31";
    case "choice":
      return typeof value === "string" && (field.choices ?? []).includes(value)
        ? undefined
        : `must be one of ${(field.choices ?? []).join(", ")}`;
    default:
      return "is not a kind of answer that is asked for";
  }
}

/**
 * Runs one action of a page on the server (decision 0004, owner decision 1 of phase 26). The
 * deployed action is its own grant: whoever may open the app may run it. It reads the records it
 * works on as the caller, under each table's row policy, and writes only the fields it names, to
 * the values it names, as the grant.
 */
export async function runAction(
  kernel: Kernel,
  ctx: RequestContext,
  params: { t: string; w: string },
  request: ActRequest,
): Promise<ActResult> {
  const located = await locatePage(kernel, ctx, params, request);
  const widget = located.widgets.find((one) => one.id === request.widget);
  if (!widget) throw notFound("The widget");
  const editing = request.at === EDIT_AT;
  const inputs = request.inputs ?? {};
  if (editing) {
    if (widget.type !== "core/detail" || widget.config?.edit !== true) {
      throw notFound("The action");
    }
    if (typeof inputs !== "object" || inputs === null || Array.isArray(inputs)) {
      throw badRequest("The inputs must be an object.", [
        { path: "/inputs", message: "must be an object" },
      ]);
    }
    if (located.surface !== "app") throw badRequest("A dashboard only reads.");
    if (
      request.records?.this === undefined ||
      request.records.event !== undefined ||
      request.records.events !== undefined
    ) {
      throw badRequest("Say which record is edited, as `records.this`.");
    }
    if (Object.keys(inputs).length === 0) throw badRequest("Say what is changed, as `inputs`.");
  }
  const editedTable = editing
    ? tableOfWidget(widget, located.page?.record?.table, located.widgets)
    : undefined;
  if (editing && !editedTable) throw notFound("The record");
  /** The action an edit in place is: an update of the columns it was given, nothing else. */
  const action: Action | undefined = editing
    ? {
        ...(widget.config?.editBy ? { runBy: widget.config.editBy as { groups: string[] } } : {}),
        steps: [
          {
            do: "update",
            record: "this",
            set: Object.fromEntries(
              Object.keys(inputs).map((column) => [column, { asked: column }] as const),
            ),
          },
        ],
      }
    : findAction(widget, request.at, await workspaceWidgets(kernel, located.at.workspaceId));
  if (!action) throw notFound("The action");
  // ---- Who can run it: checked before anything is read or run.
  await checkRunBy(kernel, ctx, located.at.tenantId, action);

  const serverSteps = action.steps.filter(runsOnServer);
  if (located.surface === "dashboard" && serverSteps.length > 0) {
    throw badRequest("A dashboard only reads: it can't change data or start work.");
  }

  const { tenantId, workspaceId } = located.at;
  const pageTable = located.page?.record?.table;
  const eventTable = tableOfWidget(widget, pageTable, located.widgets);
  const thisTable = editedTable ?? pageTable;

  // ---- The tables the action touches, as the workspace defines them.
  const targets = new Map<string, RowTarget>();
  const target = async (name: string) => {
    let found = targets.get(name);
    if (!found) {
      found = await describeTable(kernel.db, workspaceId, name);
      targets.set(name, found);
    }
    return found;
  };
  const given = request.records ?? {};
  const events = given.events;
  if (events !== undefined) {
    if (given.event !== undefined)
      throw badRequest("Name one row as `event`, or several as `events`.");
    if (events.length < 1 || events.length > MAX_RECORDS) {
      throw badRequest(`Choose between 1 and ${MAX_RECORDS} rows.`);
    }
    if (new Set(events).size !== events.length) throw badRequest("A row is named twice.");
    if (events.length > 1) {
      const bad = action.steps.find((step) => step.do === "rows" || step.do === "narrow");
      if (bad)
        throw badRequest(
          "Showing rows or narrowing the page can't be done for several rows at once.",
        );
    }
  }
  const tableOf: Record<RecordRef, string | undefined> = { this: thisTable, event: eventTable };
  for (const ref of ["this", "event"] as const) {
    if (given[ref] !== undefined || (ref === "event" && events !== undefined)) {
      const table = tableOf[ref];
      if (!table) {
        throw badRequest(
          ref === "this" ? "This page opens on no record." : "This event gives no record.",
        );
      }
      await target(table);
    }
  }
  for (const step of action.steps) {
    if (step.do === "create") await target(step.table);
    if ((step.do === "update" || step.do === "delete") && !tableOf[step.record]) {
      throw badRequest(
        step.record === "this" ? "This page opens on no record." : "This event gives no record.",
      );
    }
    if (step.do === "update" || step.do === "delete") {
      await target(tableOf[step.record] as string);
    }
  }

  // ---- What was asked: only what the action asks for, each checked against its kind.
  const issues: Issue[] = [];
  if (typeof inputs !== "object" || inputs === null || Array.isArray(inputs)) {
    throw badRequest("The inputs must be an object.", [
      { path: "/inputs", message: "must be an object" },
    ]);
  }
  const form = widget.type === "core/form";
  const formTable = form
    ? (tableOfWidget(widget, pageTable, located.widgets) ?? pageTable)
    : undefined;
  const formFields = form
    ? ((widget.config?.fields as { column: string; required?: boolean }[] | undefined) ?? [])
    : [];
  const formMeta = formTable ? await target(formTable) : undefined;
  const asks = new Map((action.confirm?.ask ?? []).map((field) => [field.name, field] as const));
  const editable = editing
    ? shownColumns(
        widget,
        (await target(editedTable as string)).columns.map((column) => column.name),
      )
    : [];
  const allowedNames = new Set([
    ...asks.keys(),
    ...formFields.map((field) => field.column),
    ...editable,
  ]);
  for (const name of Object.keys(inputs)) {
    if (!allowedNames.has(name)) {
      issues.push({ path: `/inputs/${name}`, message: "is not asked for" });
    }
  }
  for (const field of asks.values()) {
    const value = inputs[field.name];
    if (EMPTY(value)) {
      if (field.required) issues.push({ path: `/inputs/${field.name}`, message: "is required" });
      continue;
    }
    const wrong = checkAsked(field, value);
    if (wrong) issues.push({ path: `/inputs/${field.name}`, message: wrong });
  }
  for (const field of formFields) {
    // A field the confirmation asks for as well is checked there.
    if (asks.has(field.column)) continue;
    const meta = formMeta?.columns.find((one) => one.name === field.column);
    if (!meta) {
      issues.push({ path: `/inputs/${field.column}`, message: "is not a column of the table" });
      continue;
    }
    const needed = field.required === true || (meta.required && !meta.hasDefault);
    // An edit sends only what changed: a field left out stays as it is, and only one sent
    // empty is refused. Making a record, every field it needs is given.
    const editing = widget.config?.mode === "edit";
    const given = Object.hasOwn(inputs, field.column);
    if (needed && (editing ? given : true) && EMPTY(inputs[field.column])) {
      issues.push({ path: `/inputs/${field.column}`, message: "is required" });
    }
  }
  if (issues.length > 0) throw badRequest("Some of what was typed needs another look.", issues);

  // ---- A flow or a script the action starts must be there before anything changes.
  for (const step of action.steps) {
    if (step.do === "flow" || step.do === "script") {
      const found = await resolveResource(kernel.db, workspaceId, step.path, { kind: step.do });
      if (!found) throw notFound(`The ${step.do} ${step.path}`);
    }
  }

  const scopes = new Map<string, DataScope>();
  const callerScope = async (table: RowTarget) => {
    let scope = scopes.get(table.name);
    if (!scope) {
      scope = await scopeFor(
        kernel,
        tenantId,
        ctx.principal,
        await ctx.allowed("data_all:read", {
          ...located.at,
          resourceId: table.resourceId ?? undefined,
        }),
      );
      scopes.set(table.name, scope);
    }
    return scope;
  };
  const base = await scopeFor(kernel, tenantId, ctx.principal, false);
  const user = await actingUser(kernel, ctx, tenantId, base);
  const origin = {
    app: located.app,
    interface: located.surface === "app" ? located.path : null,
    dashboard: located.surface === "dashboard" ? located.path : null,
    page: located.page?.id ?? null,
    widget: widget.id,
    action: request.at,
  };

  const changes: {
    action: "create" | "update" | "delete";
    table: string;
    id: string;
    fields: string[];
  }[] = [];
  const starts: { do: "flow" | "script"; path: string; input: Record<string, unknown> }[] = [];
  let made: { table: string; id: string } | undefined;
  let ids: Partial<Record<RecordRef, string>> = {};

  // One round for each record the action runs on (a table's chosen rows), in one transaction.
  const rounds: { this?: string; event?: string }[] = (events ?? [undefined]).map((event) => ({
    ...(given.this !== undefined ? { this: given.this } : {}),
    ...(event !== undefined ? { event } : given.event !== undefined ? { event: given.event } : {}),
  }));

  await withData(kernel, tenantId, base, async (trx, actAs) => {
    for (const round of rounds) {
      const roundIds: Partial<Record<RecordRef, string>> = {};
      // ---- Read the records as the caller: a row the policy hides is not there.
      const records: Partial<Record<RecordRef, Row>> = {};
      for (const ref of ["this", "event"] as const) {
        const id = round[ref];
        if (id === undefined) continue;
        const table = targets.get(tableOf[ref] as string) as RowTarget;
        const mayRead = await ctx.allowed("data:read", {
          ...located.at,
          resourceId: table.resourceId ?? undefined,
        });
        if (!mayRead) throw notFound("The record");
        await actAs(await callerScope(table));
        try {
          records[ref] = await getRow(trx, table, id);
        } catch (error) {
          if (error instanceof HttpError && error.statusCode === 404) throw notFound("The record");
          throw error;
        }
        roundIds[ref] = id;
      }
      ids = rounds.length === 1 ? roundIds : {};
      // What a widget of the user's own record runs on is theirs alone: an edit in place, and
      // every action of the widget, on the record it shows (`this` for an edit, else `event`).
      const owning = Object.values(widget.data ?? {})[0]?.source;
      if (owning && "own" in owning) {
        const shown = records[editing ? "this" : "event"];
        if (shown) {
          const email = await principalEmail(kernel, tenantId, ctx.principal);
          const mine = shown[owning.own.by];
          if (!email || typeof mine !== "string" || mine.toLowerCase() !== email.toLowerCase()) {
            throw notFound("The record");
          }
        }
      }

      // ---- Its conditions, against the records as they are now.
      const label = (field: string) => humanize(field);
      const failing = (action.when ?? []).filter((one) => !conditionsHold([one], records, user));
      if (failing.length > 0) {
        throw new HttpError(
          403,
          "forbidden",
          `It can't be done now: ${failing.map((one) => conditionWords(one, label)).join(", ")}.`,
        );
      }

      const resolve = (value: ActionValue): unknown => {
        if ("value" in value) return value.value;
        if ("today" in value) return dayIn(request.zone);
        if ("now" in value) return new Date().toISOString();
        if ("user" in value) return value.user === "id" ? user.id : (user[value.user] ?? null);
        if ("record" in value) return records[value.of ?? "this"]?.[value.record];
        return inputs[value.asked];
      };
      /** The values a step sets: what an answer left out is left alone, not emptied. */
      const resolveAll = (
        set: Record<string, ActionValue>,
        columns?: { name: string; type: string }[],
      ) => {
        const out: Record<string, unknown> = {};
        for (const [name, value] of Object.entries(set)) {
          let resolved = resolve(value);
          // A day given for a moment means the start of that day in the reader's zone, kept with its zone (D21).
          if (
            typeof resolved === "string" &&
            /^\d{4}-\d{2}-\d{2}$/.test(resolved) &&
            columns?.find((column) => column.name === name)?.type === "timestamp"
          ) {
            resolved = startOfDayIn(resolved, request.zone);
          }
          if (resolved !== undefined) out[name] = resolved;
        }
        return out;
      };
      /** A bad value is said in the terms of what was asked, when it came from there. */
      const remap = (set: Record<string, ActionValue>, error: unknown): never => {
        if (error instanceof HttpError && error.issues) {
          throw badRequest(
            "Some of what was typed needs another look.",
            error.issues.map((issue) => {
              const column = issue.path.replace(/^\//, "");
              const how = set[column];
              return {
                path:
                  how && "asked" in how
                    ? `/inputs/${how.asked}`
                    : formFields.some((field) => field.column === column)
                      ? `/inputs/${column}`
                      : `/set/${column}`,
                message: issue.message,
              };
            }),
          );
        }
        throw error;
      };

      // ---- The data steps: one transaction, as the action's own grant.
      for (const step of action.steps) {
        if (step.do === "update" || step.do === "delete" || step.do === "create") {
          const table =
            step.do === "create"
              ? await target(step.table)
              : await target(tableOf[step.record] as string);
          const grant: DataScope = { ...(await callerScope(table)), all: true };
          await actAs(grant);
          if (step.do === "create") {
            const set = resolveAll(step.set, table.columns);
            try {
              const [row] = await insertRowsKeepingFiles(
                kernel,
                trx,
                { tenantId, id: workspaceId },
                table,
                [set],
                grant,
                ctx,
              );
              if (row) {
                made = { table: table.name, id: String(row.id) };
                changes.push({
                  action: "create",
                  table: table.name,
                  id: String(row.id),
                  fields: Object.keys(set),
                });
              }
            } catch (error) {
              remap(step.set, error);
            }
          } else if (step.do === "update") {
            const id = roundIds[step.record] as string;
            const set = resolveAll(step.set, table.columns);
            try {
              records[step.record] = await updateRowKeepingFiles(
                kernel,
                trx,
                { tenantId, id: workspaceId },
                ctx.principal,
                table,
                id,
                set,
                ctx,
              );
            } catch (error) {
              remap(step.set, error);
            }
            changes.push({ action: "update", table: table.name, id, fields: Object.keys(set) });
          } else {
            const id = roundIds[step.record] as string;
            await deleteRowKeepingFiles(
              kernel,
              trx,
              { tenantId, id: workspaceId },
              ctx.principal,
              table,
              id,
            );
            delete records[step.record];
            changes.push({ action: "delete", table: table.name, id, fields: [] });
          }
        } else if (step.do === "flow" || step.do === "script") {
          starts.push({ do: step.do, path: step.path, input: resolveAll(step.input ?? {}) });
        }
      }
    }
    // ---- What a start would refuse is found out here, in the order of the steps and before the
    // data is saved: the throw ends the transaction, and nothing it changed is kept.
    for (const start of starts) {
      const asked = {
        tenantId,
        workspaceId,
        input: start.input,
        trigger: { type: "manual" },
        startedBy: { type: ctx.principal.type, id: ctx.principal.id },
      };
      if (start.do === "flow")
        await checkFlowStart(kernel, kernel.db, { ...asked, flow: start.path });
      else await checkRunStart(kernel, kernel.db, { ...asked, script: start.path });
    }
    // ---- Each change is audited, with where it came from, in the same transaction.
    for (const change of changes) {
      await writeAudit(kernel.db, ctx.actor, {
        action: `page_action.${change.action}`,
        targetType: "row",
        targetId: change.id,
        tenantId,
        workspaceId,
        details: { table: change.table, fields: change.fields, ...origin },
      });
    }
    if (changes.length > 0) ctx.mutated = true;
    return undefined;
  });

  // ---- After the commit: tell subscribers, and start what the action starts, as the caller.
  for (const change of changes) {
    const said = { create: "inserted", update: "updated", delete: "deleted" }[change.action];
    await announceRows(kernel, tenantId, workspaceId, change.table, said ?? change.action, [
      change.id,
    ]);
  }
  // What still fails now (the queue, the database) is answered as saved, and said: the data is kept.
  const notStarted: { do: "flow" | "script"; path: string }[] = [];
  for (const start of starts) {
    try {
      const trigger = { type: "manual", detail: { origin } };
      const startedBy = { type: ctx.principal.type, id: ctx.principal.id };
      if (start.do === "flow") {
        const result = await ctx.mutate(async (trx, audit) => {
          const started = await startFlowRun(kernel, trx, {
            tenantId,
            workspaceId,
            flow: start.path,
            input: start.input,
            trigger,
            startedBy,
          });
          await audit({
            action: "flow_run.started",
            targetType: "flow_run",
            targetId: started.flowRun.id,
            tenantId,
            workspaceId,
            details: { flow: start.path, via: "page_action", ...origin },
          });
          return started;
        });
        kickFlow(kernel, result.flowRun.id);
      } else {
        await ctx.mutate(async (trx, audit) => {
          const started = await startRun(kernel, trx, {
            tenantId,
            workspaceId,
            script: start.path,
            input: start.input,
            trigger,
            startedBy,
          });
          await audit({
            action: "run.started",
            targetType: "run",
            targetId: started.run.id,
            tenantId,
            workspaceId,
            details: { script: start.path, via: "page_action", ...origin },
          });
          return started;
        });
      }
    } catch {
      notStarted.push({ do: start.do, path: start.path });
    }
  }

  // ---- What the browser does next, in the order written, with each record named by its ID.
  const client: Record<string, unknown>[] = [];
  for (const step of action.steps as Step[]) {
    if (runsOnServer(step)) continue;
    if (step.do === "open") {
      const id = step.record ? ids[step.record] : undefined;
      client.push({ do: "open", page: step.page, ...(id ? { record: id } : {}) });
    } else {
      client.push({ ...step });
    }
  }
  // An action of steps that only move the reader changes nothing, and is no audit entry of its
  // own; the write path's rule that a POST changes something is told so.
  ctx.mutated = true;
  const said = client.some((step) => step.do === "message");
  return {
    client,
    ...(events ? { changed: changes.length === 0 ? 0 : rounds.length } : {}),
    ...(made ? { made } : {}),
    ...(starts.length - notStarted.length > 0
      ? { started: starts.length - notStarted.length }
      : {}),
    ...(notStarted.length > 0 ? { notStarted } : {}),
    ...(!said && action.done ? { message: action.done } : {}),
  };
}

export type { LocatedPage };
