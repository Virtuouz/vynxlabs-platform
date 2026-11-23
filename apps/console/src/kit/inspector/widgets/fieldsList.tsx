/**
 * The fields of a record detail or a form, as board 16 draws them: rows with a handle, the
 * field's name and what it is, and a chevron that opens the field's own editor. A section is a
 * header row in the same list, so a field is dragged from one section to another; the section
 * a field is in is the header above it.
 *
 * The widget stores each field's section as a name (`section`), so the list is flat and a
 * section is the run of fields that share a name. A new section starts on the last field.
 */
import {
  Button,
  CheckboxField,
  DrawerBlock,
  DrawerEditor,
  NumberFormatRow,
  type SortableItem,
  SortableRows,
  TextField,
} from "@volvel/ui";
import { mustGive } from "@volvel/widgets";
import { Layers } from "lucide-react";
import { useState } from "react";
import { columnOptions } from "../controls.tsx";
import { heading, tableOfInput } from "../model.ts";
import { FieldAsBadge } from "./choiceBadges.tsx";
import type { Tone } from "./columnModel.ts";
import { StartsAs } from "./fieldStart.tsx";
import { BackHead, dashedFace, type Env, Group, setConfig } from "./recordShared.tsx";

export interface FieldRow {
  column: string;
  label?: string;
  help?: string;
  section?: string;
  required?: boolean;
  hidden?: boolean;
  format?: unknown;
  /** What a form's new record starts with in this field. */
  initial?: unknown;
  [more: string]: unknown;
}

export type FieldsKind = "detail" | "form";

const SECTION = "section:";
const FIELD = "field:";

/** What a column is, in a word: "Picker", "Date", "Long text". */
export function kindOfColumn(env: Env, column: string, row?: FieldRow): string {
  // A detail on a record page has no table of its own: the page's record is its table.
  const table = tableOfInput(env.widget.data?.record, env.page, env.widgets);
  const found = env.catalog.tables
    .find((one) => one.name === table)
    ?.columns.find((one) => one.name === column);
  if (!found) return "Text";
  if (found.references) return "Picker";
  switch (found.type) {
    case "date":
      return "Date";
    case "timestamp":
      return "Date and time";
    case "number":
    case "integer": {
      // A number written as a currency is money, in a detail and in a form alike.
      const format = row?.format as { style?: string } | undefined;
      return format?.style === "currency" ? "Money" : "Number";
    }
    case "enum":
      return "Choice";
    case "boolean":
      return "Yes or no";
    case "text":
      return "Text";
    default:
      return heading(found.type);
  }
}

/**
 * Whether a form asks for the field: what was set, else the table's own rule (the one the form
 * and Add a form use): required and without a default.
 */
export function requiredOf(env: Env, row: FieldRow): boolean {
  if (typeof row.required === "boolean") return row.required;
  const table = tableOfInput(env.widget.data?.record, env.page, env.widgets);
  const found = env.catalog.tables
    .find((one) => one.name === table)
    ?.columns.find((one) => one.name === row.column);
  return found ? mustGive(found) : false;
}

/** The fields as set, or every column of the table when none are set yet. */
export function fieldRows(env: Env): FieldRow[] {
  const value = env.config.fields;
  if (Array.isArray(value) && value.length > 0) return value as FieldRow[];
  return recordColumns(env, true).map((one) => ({ column: one.value }));
}

/**
 * The columns of the record's table that a list of fields offers: not the system ones. A
 * list that starts on every column (`starting`) also leaves out JSON, which says nothing in a
 * field, as the page does; it is still there to add.
 */
export function recordColumns(env: Env, starting = false) {
  const named = tableOfInput(env.widget.data?.record, env.page, env.widgets);
  const own = env.catalog.tables.find((one) => one.name === named)?.columns ?? [];
  return columnOptions(env, "record").filter(
    (one) =>
      !["id", "created_at", "updated_at"].includes(one.value) &&
      !(starting && own.find((column) => column.name === one.value)?.type === "json"),
  );
}

/** The list as rows: a header row where a section starts, then its fields. */
export function itemsOf(env: Env, rows: readonly FieldRow[], kind: FieldsKind): SortableItem[] {
  const items: SortableItem[] = [];
  let current: string | undefined;
  for (const row of rows) {
    if (row.section && row.section !== current) {
      items.push({
        id: `${SECTION}${row.section}`,
        label: `SECTION · ${row.section.toUpperCase()}`,
      });
    }
    current = row.section;
    const today =
      kind === "form" &&
      typeof row.initial === "object" &&
      row.initial !== null &&
      (row.initial as { kind?: unknown }).kind === "today";
    const flags = [
      kind === "form" && requiredOf(env, row) ? "Required" : undefined,
      row.hidden ? "Hidden" : undefined,
      today ? "Today by default" : undefined,
    ].filter(Boolean);
    const what = kindOfColumn(env, row.column, row);
    items.push({
      id: `${FIELD}${row.column}`,
      label: row.label || heading(row.column),
      // "Required · picker", "Today by default" (a date says what it is by that), else the control alone.
      sub: [...flags, ...(today ? [] : [flags.length > 0 ? what.toLowerCase() : what])].join(" · "),
      ...(row.hidden ? { hidden: true } : {}),
    });
  }
  return items;
}

/** The fields in the order of `ids`, each in the section whose header is above it. */
export function rowsFromIds(rows: readonly FieldRow[], ids: readonly string[]): FieldRow[] {
  const byColumn = new Map(rows.map((row) => [row.column, row]));
  const out: FieldRow[] = [];
  let section: string | undefined;
  for (const id of ids) {
    if (id.startsWith(SECTION)) {
      section = id.slice(SECTION.length);
      continue;
    }
    const row = byColumn.get(id.slice(FIELD.length));
    if (!row) continue;
    const { section: _before, ...rest } = row;
    out.push(section ? { ...rest, section } : rest);
  }
  return out;
}

export function FieldsList({
  env,
  kind,
  note,
}: {
  env: Env;
  kind: FieldsKind;
  /** Under the list. */
  note?: (hiddenColumns: number) => string;
}) {
  const rows = fieldRows(env);
  const [editing, setEditing] = useState<string | undefined>();
  const [adding, setAdding] = useState(false);
  const [section, setSection] = useState("");
  const write = (next: FieldRow[]) => setConfig(env, "fields", next, "the fields");

  const all = recordColumns(env);
  const left = all.filter((one) => !rows.some((row) => row.column === one.value));
  const hidden = left.length + rows.filter((row) => row.hidden).length;

  const open = editing?.startsWith(FIELD)
    ? rows.find((row) => row.column === editing.slice(FIELD.length))
    : undefined;
  const sectionOpen = editing?.startsWith(SECTION) ? editing.slice(SECTION.length) : undefined;

  if (open) {
    const at = rows.indexOf(open);
    const patch = (change: Partial<FieldRow>) =>
      write(
        rows.map((row, index) => {
          if (index !== at) return row;
          const merged: FieldRow = { ...row, ...change };
          for (const key of ["label", "help"] as const) if (!merged[key]) delete merged[key];
          if (!merged.hidden) delete merged.hidden;
          if (merged.initial === undefined) delete merged.initial;
          // A field drawn as text, with no colors of its own, says nothing of either.
          if (merged.as === "text") delete merged.as;
          if (merged.as !== "badge") delete merged.badges;
          else if (merged.badges && Object.keys(merged.badges as object).length === 0)
            delete merged.badges;
          // Not asking for a field the table asks for is said, not left out: an unset one follows the table.
          if (!merged.required && !(kind === "form" && requiredOf(env, row)))
            delete merged.required;
          return merged;
        }),
      );
    const type = kindOfColumn(env, open.column, open);
    return (
      <div className="flex flex-col gap-4">
        <BackHead
          onBack={() => setEditing(undefined)}
          title={open.label || heading(open.column)}
          kind={`${kind === "form" ? "Form field" : "Field"} · ${type}`}
        />
        <Group label="Field">
          <DrawerBlock>
            <TextField
              name={`${env.widget.id}-field-label`}
              label="Label"
              placeholder={heading(open.column)}
              required={false}
              value={open.label ?? ""}
              maxLength={60}
              onChange={(label) => patch({ label })}
            />
            {kind === "form" ? (
              <TextField
                name={`${env.widget.id}-field-help`}
                label="Help under the field"
                required={false}
                value={open.help ?? ""}
                maxLength={200}
                onChange={(help) => patch({ help })}
              />
            ) : null}
          </DrawerBlock>
          {type === "Number" || type === "Money" ? (
            <NumberFormatRow
              label="Format"
              value={open.format as Parameters<typeof NumberFormatRow>[0]["value"]}
              onChange={(format) => patch({ format })}
            />
          ) : null}
          {kind === "detail" ? (
            <FieldAsBadge
              env={env}
              column={open.column}
              as={open.as}
              badges={open.badges as Record<string, Tone> | undefined}
              onChange={(change) => patch(change)}
            />
          ) : null}
          {kind === "form" ? (
            <StartsAs
              env={env}
              row={open}
              money={
                type === "Money"
                  ? {
                      currency:
                        (open.format as { currency?: string } | undefined)?.currency ?? "USD",
                      minorUnits:
                        (open.format as { minorUnits?: boolean } | undefined)?.minorUnits === true,
                    }
                  : undefined
              }
              onChange={(initial) => patch({ initial })}
            />
          ) : null}
          <DrawerBlock>
            {kind === "form" ? (
              <CheckboxField
                name={`${env.widget.id}-field-required`}
                label="Must be filled in"
                checked={requiredOf(env, open)}
                onChange={(required) => patch({ required })}
              />
            ) : (
              <CheckboxField
                name={`${env.widget.id}-field-hidden`}
                label="Hidden"
                checked={open.hidden === true}
                onChange={(next) => patch({ hidden: next })}
              />
            )}
          </DrawerBlock>
        </Group>
        <div>
          <Button
            size="small"
            variant="quiet"
            onClick={() => {
              write(rows.filter((_, index) => index !== at));
              setEditing(undefined);
            }}
          >
            Remove from the {kind === "form" ? "form" : "detail"}
          </Button>
        </div>
      </div>
    );
  }

  if (sectionOpen !== undefined) {
    const rename = (to: string) =>
      write(rows.map((row) => (row.section === sectionOpen ? swap(row, to) : row)));
    return (
      <div className="flex flex-col gap-4">
        <BackHead onBack={() => setEditing(undefined)} title={sectionOpen} kind="Section" />
        <Group label="Section">
          <DrawerBlock>
            <SectionName
              id={`${env.widget.id}-section-name`}
              name={sectionOpen}
              others={
                rows
                  .map((row) => row.section)
                  .filter((one) => one && one !== sectionOpen) as string[]
              }
              onRename={(to) => {
                rename(to);
                // The list is found again by the new name.
                setEditing(`${SECTION}${to}`);
              }}
            />
          </DrawerBlock>
        </Group>
        <div>
          <Button
            size="small"
            variant="quiet"
            onClick={() => {
              // The fields stay, with no section.
              rename("");
              setEditing(undefined);
            }}
          >
            Remove the section, keep its fields
          </Button>
        </div>
      </div>
    );
  }

  const addField = (column: string) => {
    // A field joins the last section: it is added at the end.
    const last = rows.at(-1);
    write([...rows, last?.section ? { column, section: last.section } : { column }]);
    setAdding(false);
  };
  const addSection = () => {
    const name = section.trim();
    if (!name || rows.length === 0) return;
    const last = rows.length - 1;
    write(rows.map((row, index) => (index === last ? { ...row, section: name } : row)));
    setSection("");
    setAdding(false);
  };

  return (
    <Group
      label="Fields"
      note={
        note
          ? note(hidden)
          : hidden > 0
            ? `${hidden} more ${hidden === 1 ? "column is" : "columns are"} hidden. Drag fields between sections.`
            : "Drag fields between sections."
      }
    >
      <SortableRows
        label="Fields"
        items={itemsOf(env, rows, kind)}
        onReorder={(ids) => write(rowsFromIds(rows, ids))}
        onOpen={setEditing}
      />
      <div className="px-3 py-2">
        <DrawerEditor
          title="Add a field or a section"
          footer={false}
          open={adding}
          onOpenChange={setAdding}
          trigger={
            <button type="button" className={dashedFace}>
              <span aria-hidden="true">+</span>
              Field or section
            </button>
          }
        >
          <div className="flex flex-col gap-3">
            {left.length > 0 ? (
              <ul aria-label="Columns to add" className="m-0 flex list-none flex-col p-0">
                {left.map((one) => (
                  <li key={one.value}>
                    <button
                      type="button"
                      onClick={() => addField(one.value)}
                      className="flex h-9 w-full cursor-pointer items-center justify-between rounded-control px-2 text-left text-body-sm text-ink hover:bg-selected"
                    >
                      <span>{one.label}</span>
                      <span className="text-meta text-ink-muted">
                        {kindOfColumn(env, one.value)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="m-0 text-body-sm text-ink-muted">Every column is already here.</p>
            )}
            <div className="flex items-end gap-2 border-t border-line pt-3">
              <div className="min-w-0 flex-1">
                <TextField
                  name={`${env.widget.id}-new-section`}
                  label="New section"
                  required={false}
                  value={section}
                  maxLength={60}
                  onChange={setSection}
                />
              </div>
              <Button
                size="small"
                variant="secondary"
                disabled={!section.trim()}
                onClick={addSection}
              >
                <Layers aria-hidden="true" size={14} /> Add
              </Button>
            </div>
            <p className="m-0 text-meta text-ink-muted">
              A new section starts at the last field. Drag fields into it.
            </p>
          </div>
        </DrawerEditor>
      </div>
    </Group>
  );
}

function swap(row: FieldRow, to: string): FieldRow {
  const { section: _before, ...rest } = row;
  return to ? { ...rest, section: to } : rest;
}

/**
 * A section's name, held here while it is typed: the section is renamed once what is typed is a
 * name no other section has. An emptied box, or a name another section holds, writes nothing, so
 * the fields never lose their section while it is retyped.
 */
function SectionName({
  id,
  name,
  others,
  onRename,
}: {
  id: string;
  name: string;
  others: readonly string[];
  onRename: (to: string) => void;
}) {
  const [draft, setDraft] = useState(name);
  const trimmed = draft.trim();
  const problem =
    trimmed === ""
      ? "A section needs a name."
      : others.includes(trimmed)
        ? `${trimmed} is another section's name.`
        : undefined;
  return (
    <TextField
      name={id}
      label="Name"
      required={false}
      value={draft}
      maxLength={60}
      {...(problem ? { error: problem } : {})}
      onChange={(to) => {
        setDraft(to);
        const next = to.trim();
        if (next !== "" && !others.includes(next) && next !== name) onRename(next);
      }}
    />
  );
}
