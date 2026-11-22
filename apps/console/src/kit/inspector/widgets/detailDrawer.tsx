/**
 * Record detail's drawer (board 16): Data is one choice, where the record comes from; Display
 * is the fields in sections and how they are laid out. Actions and Rules are the shared tabs.
 */

import type { DataInput, WidgetSource } from "@volvel/manifest";
import { DrawerBlock, RadioCards, SegmentedControl, SelectField, ToggleRow } from "@volvel/ui";
import { SettingRow } from "../controls.tsx";
import { configSettings, heading, withInput } from "../model.ts";
import { FieldsList } from "./fieldsList.tsx";
import { type Env, Group, LabelledBlock, setConfig } from "./recordShared.tsx";

type Where = "this" | "selected" | "own";

/** Where the record comes from, as the data input says it. */
export function whereOf(source: WidgetSource | undefined): Where | undefined {
  if (!source) return undefined;
  if ("record" in source) return "this";
  if ("selected" in source) return "selected";
  if ("own" in source) return "own";
  return undefined;
}

/** A page that opens on a record: a record page, a side sheet or a modal with its table. */
export const opensOnRecord = (env: Env): boolean =>
  Boolean(env.page?.record) && (env.page?.kind ?? "page") !== "page";

/** The widgets of the page a record can be selected in. */
export const selectable = (env: Env) =>
  env.widgets.filter((one) => one.type === "core/table" || one.type === "core/list");

const EMAIL_WORDS = /mail/;

export function DetailDataSection({ env }: { env: Env }) {
  const input: DataInput | undefined = env.widget.data?.record;
  const where = whereOf(input?.source);
  const tables = selectable(env);
  const own = input && "own" in input.source ? input.source.own : undefined;
  const records = env.page?.record?.table;
  const set = (source: WidgetSource) =>
    env.write(withInput(env.widget, "record", { source }), "changing where the record comes from");

  const pick = (next: Where) => {
    if (next === "this") set({ record: "this" });
    else if (next === "selected") {
      const first = tables[0];
      if (first) set({ selected: first.id });
    } else {
      const table = env.catalog.tables[0];
      const columns = table?.columns ?? [];
      const by =
        columns.find((one) => EMAIL_WORDS.test(one.name))?.name ??
        columns.find((one) => one.type === "text")?.name ??
        "email";
      if (table) set({ own: { table: table.name, by } });
    }
  };

  const ownTable = own ? env.catalog.tables.find((one) => one.name === own.table) : undefined;
  return (
    <Group label="Shows" note="No record IDs to wire up: pick where the record comes from.">
      <DrawerBlock>
        <RadioCards<Where>
          label="Where the record comes from"
          value={where}
          onChange={pick}
          options={[
            {
              value: "this",
              title: "The record this page was opened with",
              line: opensOnRecord(env)
                ? `${heading(records ?? "record")}, passed in by the table that opens it`
                : "Only on a record page, a side sheet or a modal",
              disabled: !opensOnRecord(env),
            },
            {
              value: "selected",
              title: "The row selected in a table",
              line:
                tables.length > 0
                  ? "Follows a table on this page"
                  : "Needs a table or a list on this page",
              disabled: tables.length === 0,
            },
            {
              value: "own",
              title: "The current user’s own record",
              line: own
                ? `From ${heading(own.table)}, matched by ${own.by.replace(/_/g, " ")}`
                : "From a table, matched by email",
              disabled: env.catalog.tables.length === 0,
            },
          ]}
        />
        {where === "selected" && input && "selected" in input.source && tables.length > 1 ? (
          <SelectField
            name={`${env.widget.id}-selected`}
            label="Follows"
            value={input.source.selected}
            options={tables.map((one) => ({ value: one.id, label: one.title ?? one.id }))}
            onChange={(selected) => set({ selected })}
          />
        ) : null}
        {where === "own" && own ? (
          <div className="grid grid-cols-2 gap-2">
            <SelectField
              name={`${env.widget.id}-own-table`}
              label="Table"
              value={own.table}
              options={env.catalog.tables.map((one) => ({
                value: one.name,
                label: heading(one.name),
              }))}
              onChange={(table) => {
                const columns = env.catalog.tables.find((one) => one.name === table)?.columns ?? [];
                const by =
                  columns.find((one) => EMAIL_WORDS.test(one.name))?.name ?? columns[0]?.name ?? "";
                set({ own: { table, by } });
              }}
            />
            <SelectField
              name={`${env.widget.id}-own-by`}
              label="Email column"
              value={own.by}
              options={(ownTable?.columns ?? []).map((one) => ({
                value: one.name,
                label: heading(one.name),
              }))}
              onChange={(by) => set({ own: { table: own.table, by } })}
            />
          </div>
        ) : null}
      </DrawerBlock>
    </Group>
  );
}

export function DetailDisplaySection({ env }: { env: Env }) {
  const across = typeof env.config.across === "number" ? env.config.across : 2;
  // Which column names the record, and which is its status: two rows of their own.
  const named = configSettings(env.definition, "display").filter(
    (one) => one.name === "heading" || one.name === "status",
  );
  return (
    <>
      <FieldsList env={env} kind="detail" />
      {named.length > 0 ? (
        <Group
          label="Record header"
          note="The column that names the record, and the one drawn as its status."
        >
          {named.map((setting) => (
            <SettingRow key={setting.name} env={env} setting={setting} />
          ))}
        </Group>
      ) : null}
      <Group label="Look">
        <LabelledBlock label="Fields across">
          <SegmentedControl<"1" | "2" | "3">
            label="Fields across"
            value={String(across) as "1" | "2" | "3"}
            options={[
              { value: "1", label: "1" },
              { value: "2", label: "2" },
              { value: "3", label: "3" },
            ]}
            onChange={(next) => setConfig(env, "across", Number(next), "fields across")}
          />
        </LabelledBlock>
        <ToggleRow
          label="Let people edit fields in place"
          help="Otherwise editing goes through the Edit button."
          checked={env.config.edit === true}
          onChange={(next) => setConfig(env, "edit", next ? true : undefined, "editing in place")}
        />
      </Group>
    </>
  );
}
