import type { InterfacePage, PageWidget, WidgetAction } from "@vynxlabs/manifest";
import type { TableInfo } from "@vynxlabs/screens";
import {
  Button,
  CheckboxField,
  ComboboxField,
  Notice,
  type Option,
  SelectField,
  TextAreaField,
  TextField,
} from "@vynxlabs/ui";
import { useLoad } from "../api.ts";

/** What the builder knows of an action's target. */
export interface TargetFacts {
  key: string;
  found: boolean;
  startable: boolean;
  description: string | null;
  inputSchema: Record<string, unknown> | null;
  /** The app's audiences that may not start it, and so would not see the action. */
  notFor: string[];
}

/** The values a page holds that an action can read, as choices. */
export function pathChoices(
  page: InterfacePage,
  tables: Record<string, TableInfo>,
  rowOf: PageWidget | undefined,
): Option[] {
  const columns = (table: string | undefined) =>
    (table ? tables[table]?.columns : undefined)?.map((column) => column.name) ?? [];
  return [
    ...(rowOf
      ? columns(rowOf.table).map((column) => ({
          value: `row.${column}`,
          label: `This row: ${column}`,
        }))
      : []),
    ...page.widgets
      .filter(
        (one) =>
          one.table !== undefined &&
          !one.summary &&
          ["table", "card", "cards"].includes(one.type) &&
          one.id !== rowOf?.id,
      )
      .flatMap((one) =>
        columns(one.table).map((column) => ({
          value: `selection.${one.id}.${column}`,
          label: `Chosen in ${one.title || one.id}: ${column}`,
        })),
      ),
    ...(page.filters ?? []).flatMap((filter) =>
      (filter.type === "date" ? ["from", "to"] : ["value"]).map((part) => ({
        value: `filters.${filter.id}.${part}`,
        label: `Filter ${filter.label}${filter.type === "date" ? ` (${part})` : ""}`,
      })),
    ),
  ];
}

/** A constant typed into the builder, as the target's field takes it. */
function constantOf(text: string, schema: Record<string, unknown> | undefined): unknown {
  const type = schema?.type;
  if (
    (type === "number" || type === "integer") &&
    text.trim() !== "" &&
    !Number.isNaN(Number(text))
  ) {
    return Number(text);
  }
  if (type === "boolean") return text === "true";
  return text;
}

/** One action's settings: what it starts, how its input is filled, and what it says. */
export function ActionSettings({
  root,
  action,
  page,
  tables,
  rowOf,
  facts,
  onChange,
}: {
  root: string;
  action: WidgetAction | undefined;
  page: InterfacePage;
  tables: Record<string, TableInfo>;
  /** For a row action: the table widget whose rows it is on. */
  rowOf?: PageWidget | undefined;
  facts: TargetFacts | undefined;
  onChange: (next: WidgetAction | undefined) => void;
}) {
  const scripts = useLoad<{ items: { path: string }[] }>(`${root}/scripts`);
  const flows = useLoad<{ items: { path: string; triggers: string[] }[] }>(`${root}/flows`);
  const targets: Option[] = [
    ...(scripts.data?.items ?? []).map((one) => ({
      value: `script:${one.path}`,
      label: one.path,
      hint: "Script",
    })),
    ...(flows.data?.items ?? [])
      .filter((one) => one.triggers.includes("manual"))
      .map((one) => ({ value: `flow:${one.path}`, label: one.path, hint: "Flow" })),
  ];
  const choices = pathChoices(page, tables, rowOf);
  const schema = facts?.inputSchema ?? undefined;
  const properties =
    (schema?.properties as Record<string, Record<string, unknown>> | undefined) ?? {};
  const required = new Set((schema?.required as string[] | undefined) ?? []);
  const label = action?.label ?? "";
  /** A change to the action. A field given as undefined is taken out. */
  type Patch = { [Key in keyof WidgetAction]?: WidgetAction[Key] | undefined };
  const set = (patch: Patch) => {
    if (!action && !patch.target) return;
    const base = action ?? {
      label: label || "Run",
      target: patch.target as WidgetAction["target"],
    };
    const next = { ...base, ...patch };
    for (const [key, value] of Object.entries(next)) {
      if (value === undefined || value === "") delete (next as Record<string, unknown>)[key];
    }
    onChange(next as WidgetAction);
  };

  return (
    <div className="flex flex-col gap-3">
      <TextField
        label="Button"
        name="action-label"
        value={label}
        maxLength={60}
        onChange={(text) => (action ? set({ label: text }) : undefined)}
        {...(action ? {} : { hint: "Choose what it starts first." })}
      />
      <ComboboxField
        label="What it starts"
        options={targets}
        value={action ? `${action.target.kind}:${action.target.path}` : undefined}
        empty="This workspace has no scripts, and no flows with a manual trigger."
        onChange={(value) => {
          if (!value) return;
          const [kind, ...rest] = value.split(":");
          const target = { kind: kind as "script" | "flow", path: rest.join(":") };
          // A new target takes new input.
          set({ target, label: label || `Run ${target.path.split("/").at(-1)}`, input: undefined });
        }}
      />
      {facts && !facts.found ? (
        <Notice tone="attention">It is not deployed in this workspace yet.</Notice>
      ) : facts && !facts.startable ? (
        <Notice tone="attention">This flow has no manual trigger to start it from.</Notice>
      ) : null}
      {facts && facts.notFor.length > 0 ? (
        <Notice tone="attention">
          {facts.notFor.join(", ")} cannot start {action?.target.path}, so they will not see this
          action.
        </Notice>
      ) : null}
      {action && Object.keys(properties).length > 0 ? (
        <fieldset className="m-0 flex flex-col gap-2 rounded-control border border-line p-2">
          <legend className="px-1 text-body-sm font-medium">Its input</legend>
          {Object.entries(properties).map(([name, property]) => {
            const mapped = action.input?.[name];
            const kind =
              mapped === undefined ? "" : typeof mapped === "string" ? mapped : "constant";
            return (
              <div key={name} className="flex flex-col gap-1">
                <SelectField
                  label={`${name}${required.has(name) ? " (required)" : ""}`}
                  name={`map-${name}`}
                  value={kind}
                  options={[
                    {
                      value: "",
                      label: required.has(name) ? "Asked for when pressed" : "Left out",
                    },
                    { value: "constant", label: "Always the same value" },
                    ...choices,
                  ]}
                  onChange={(value) => {
                    const input = { ...(action.input ?? {}) };
                    if (value === "") delete input[name];
                    else if (value === "constant")
                      input[name] = { value: constantOf("", property) };
                    else input[name] = value;
                    set({ input: Object.keys(input).length > 0 ? input : undefined });
                  }}
                />
                {mapped !== undefined && typeof mapped !== "string" ? (
                  <TextField
                    label={`${name}: the value`}
                    name={`value-${name}`}
                    value={String(mapped.value ?? "")}
                    onChange={(text) =>
                      set({
                        input: {
                          ...(action.input ?? {}),
                          [name]: { value: constantOf(text, property) },
                        },
                      })
                    }
                  />
                ) : null}
              </div>
            );
          })}
        </fieldset>
      ) : null}
      {action ? (
        <>
          <TextAreaField
            label="Ask first (optional)"
            name="confirm"
            rows={2}
            value={action.confirm ?? ""}
            hint="Shown before it starts. Put a value in with {{row.name}} or {{selection.orders.number}}."
            onChange={(text) => set({ confirm: text })}
          />
          {rowOf ? null : (
            <SelectField
              label="Can be pressed"
              name="enabled-when"
              value={action.enabledWhen ?? ""}
              options={[
                { value: "", label: "Always" },
                ...choices
                  .filter((choice) => choice.value.startsWith("selection."))
                  .map((choice) => ({
                    value: choice.value,
                    label: `When there is ${choice.label}`,
                  })),
              ]}
              onChange={(value) => set({ enabledWhen: value || undefined })}
            />
          )}
          <CheckboxField
            label="Show what it gives back"
            name="show-output"
            checked={action.result?.show === "output"}
            onChange={(on) =>
              set({ result: on ? { ...action.result, show: "output" } : undefined })
            }
          />
          <p className="m-0 text-body-sm text-ink-muted">
            It runs as whoever presses it, and the page reads its rows again once it is done.
          </p>
        </>
      ) : null}
    </div>
  );
}

/** A table's row actions: each offered on every row. */
export function RowActionsSettings({
  root,
  widget,
  page,
  tables,
  factsOf,
  onChange,
}: {
  root: string;
  widget: PageWidget;
  page: InterfacePage;
  tables: Record<string, TableInfo>;
  factsOf: (action: WidgetAction) => TargetFacts | undefined;
  onChange: (actions: WidgetAction[] | undefined) => void;
}) {
  const list = widget.actions ?? [];
  const replace = (index: number, next: WidgetAction | undefined) => {
    const updated = list.flatMap((one, at) => (at === index ? (next ? [next] : []) : [one]));
    onChange(updated.length > 0 ? updated : undefined);
  };
  return (
    <div className="flex flex-col gap-3">
      {list.map((action, index) => (
        <fieldset
          // biome-ignore lint/suspicious/noArrayIndexKey: actions are kept in order and have no id
          key={index}
          className="m-0 flex flex-col gap-2 rounded-control border border-line p-2"
        >
          <legend className="px-1 text-body-sm font-medium">{action.label}</legend>
          <ActionSettings
            root={root}
            action={action}
            page={page}
            tables={tables}
            rowOf={widget}
            facts={factsOf(action)}
            onChange={(next) => replace(index, next)}
          />
          <div>
            <Button size="small" variant="danger" onClick={() => replace(index, undefined)}>
              Remove this action
            </Button>
          </div>
        </fieldset>
      ))}
      {list.length < 5 ? (
        <AddRowAction root={root} onAdd={(action) => onChange([...list, action])} />
      ) : null}
    </div>
  );
}

/** Starts a new row action by choosing what it starts. */
function AddRowAction({ root, onAdd }: { root: string; onAdd: (action: WidgetAction) => void }) {
  const scripts = useLoad<{ items: { path: string }[] }>(`${root}/scripts`);
  const flows = useLoad<{ items: { path: string; triggers: string[] }[] }>(`${root}/flows`);
  return (
    <ComboboxField
      label="Add a row action"
      options={[
        ...(scripts.data?.items ?? []).map((one) => ({
          value: `script:${one.path}`,
          label: one.path,
          hint: "Script",
        })),
        ...(flows.data?.items ?? [])
          .filter((one) => one.triggers.includes("manual"))
          .map((one) => ({ value: `flow:${one.path}`, label: one.path, hint: "Flow" })),
      ]}
      value={undefined}
      placeholder="Choose what it starts"
      onChange={(value) => {
        if (!value) return;
        const [kind, ...rest] = value.split(":");
        const path = rest.join(":");
        onAdd({
          label: `Run ${path.split("/").at(-1)}`,
          target: { kind: kind as "script" | "flow", path },
        });
      }}
    />
  );
}
