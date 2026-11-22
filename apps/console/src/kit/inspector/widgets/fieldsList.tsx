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
import { Layers } from "lucide-react";
import { useState } from "react";
import { columnOptions } from "../controls.tsx";
import { heading, visualOf } from "../model.ts";
import { BackHead, dashedFace, type Env, Group, setConfig } from "./recordShared.tsx";

export interface FieldRow {
  column: string;
  label?: string;
  help?: string;
  section?: string;
  required?: boolean;
  hidden?: boolean;
  format?: unknown;
  [more: string]: unknown;
}

export type FieldsKind = "detail" | "form";

const SECTION = "section:";
const FIELD = "field:";

/** What a column is, in a word: "Picker", "Date", "Long text". */
export function kindOfColumn(env: Env, column: string): string {
  const table = visualOf(env.widget.data?.record)?.table;
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
    case "integer":
      return "Number";
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

/** The fields as set, or every column of the table when none are set yet. */
export function fieldRows(env: Env): FieldRow[] {
  const value = env.config.fields;
  if (Array.isArray(value) && value.length > 0) return value as FieldRow[];
  return columnOptions(env, "record")
    .filter((one) => !["id", "created_at", "updated_at"].includes(one.value))
    .map((one) => ({ column: one.value }));
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
      kind === "form" && row.required ? "Required" : undefined,
      row.hidden ? "Hidden" : undefined,
      today ? "Today by default" : undefined,
    ].filter(Boolean);
    const what = kindOfColumn(env, row.column);
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

  const all = columnOptions(env, "record").filter(
    (one) => !["id", "created_at", "updated_at"].includes(one.value),
  );
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
          for (const key of ["required", "hidden"] as const) if (!merged[key]) delete merged[key];
          return merged;
        }),
      );
    const type = kindOfColumn(env, open.column);
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
          {type === "Number" ? (
            <NumberFormatRow
              label="Format"
              value={open.format as Parameters<typeof NumberFormatRow>[0]["value"]}
              onChange={(format) => patch({ format })}
            />
          ) : null}
          <DrawerBlock>
            {kind === "form" ? (
              <CheckboxField
                name={`${env.widget.id}-field-required`}
                label="Must be filled in"
                checked={open.required === true}
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
            <TextField
              name={`${env.widget.id}-section-name`}
              label="Name"
              required={false}
              value={sectionOpen}
              maxLength={60}
              onChange={(to) => {
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
            ? `${hidden} more columns are hidden. Drag fields between sections.`
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
