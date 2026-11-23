import {
  CheckboxField,
  DrawerBlock,
  MoneyField,
  NumberField,
  SelectField,
  TextField,
} from "@volvel/ui";
import { tableOfInput } from "../model.ts";
import type { FieldRow } from "./fieldsList.tsx";
import type { Env } from "./recordShared.tsx";

type Initial = NonNullable<FieldRow["initial"]> & {
  kind: "today" | "me" | "value";
  as?: "email" | "name" | "id";
  value?: unknown;
};

/** What a field may start as, by what its column holds. Empty when nothing can be offered. */
export function startsAsOptions(
  type: string | undefined,
  references: boolean,
): { value: string; label: string }[] {
  if (references || type === undefined) return [];
  const none = { value: "none", label: "Nothing" };
  switch (type) {
    case "date":
      return [none, { value: "today", label: "Today" }];
    case "timestamp":
      return [none, { value: "today", label: "Now" }];
    case "text":
    case "uuid":
      return [
        none,
        { value: "me", label: "The person filling it in" },
        { value: "value", label: "A value" },
      ];
    case "number":
    case "integer":
    case "boolean":
    case "enum":
      return [none, { value: "value", label: "A value" }];
    default:
      return [];
  }
}

/**
 * "Starts as" of a form field: what a new record's field holds before anyone types: nothing,
 * today, the person filling it in, or a value. Money is typed in the currency and kept the way the
 * column keeps it (cents), like the Format row beside it.
 */
export function StartsAs({
  env,
  row,
  money,
  onChange,
}: {
  env: Env;
  row: FieldRow;
  /** How the field's money is kept, when it is money. */
  money: { currency: string; minorUnits: boolean } | undefined;
  onChange: (initial: Initial | undefined) => void;
}) {
  const table = tableOfInput(env.widget.data?.record, env.page, env.widgets);
  const column = env.catalog.tables
    .find((one) => one.name === table)
    ?.columns.find((one) => one.name === row.column);
  const options = startsAsOptions(column?.type, Boolean(column?.references));
  if (options.length === 0) return null;
  const initial = row.initial as Initial | undefined;
  const id = `${env.widget.id}-field-start`;
  const kind = initial?.kind ?? "none";
  const set = (value: unknown) => onChange({ kind: "value", value });
  return (
    <DrawerBlock>
      <SelectField
        name={id}
        label="Starts as"
        hint="What a new record has in this field before anyone types."
        options={options}
        value={kind}
        onChange={(next) => {
          if (next === "none") onChange(undefined);
          else if (next === "today") onChange({ kind: "today" });
          else if (next === "me") onChange({ kind: "me", as: "email" });
          else onChange({ kind: "value" });
        }}
      />
      {kind === "me" ? (
        <SelectField
          name={`${id}-as`}
          label="Their"
          options={[
            { value: "email", label: "Email" },
            { value: "name", label: "Name" },
            { value: "id", label: "Id" },
          ]}
          value={initial?.as ?? "email"}
          onChange={(as) => onChange({ kind: "me", as: as as "email" | "name" | "id" })}
        />
      ) : null}
      {kind === "value" ? (
        column?.type === "boolean" ? (
          <CheckboxField
            name={`${id}-value`}
            label="Yes"
            checked={initial?.value === true}
            onChange={(next) => set(next)}
          />
        ) : column?.type === "enum" ? (
          <SelectField
            name={`${id}-value`}
            label="Value"
            options={[
              { value: "", label: "Choose one" },
              ...(column.values ?? []).map((one) => ({
                value: one.value,
                label: one.label ?? one.value,
              })),
            ]}
            value={typeof initial?.value === "string" ? initial.value : ""}
            onChange={(next) => set(next === "" ? undefined : next)}
          />
        ) : money ? (
          <MoneyField
            name={`${id}-value`}
            label="Value"
            required={false}
            currency={money.currency}
            minorUnits={money.minorUnits}
            value={typeof initial?.value === "number" ? initial.value : undefined}
            onChange={(next, problem) => {
              if (problem === undefined) set(next);
            }}
          />
        ) : column?.type === "number" || column?.type === "integer" ? (
          <NumberField
            name={`${id}-value`}
            label="Value"
            required={false}
            value={typeof initial?.value === "number" ? initial.value : undefined}
            onChange={(next) => set(next)}
          />
        ) : (
          <TextField
            name={`${id}-value`}
            label="Value"
            required={false}
            value={typeof initial?.value === "string" ? initial.value : ""}
            onChange={(next) => set(next === "" ? undefined : next)}
          />
        )
      ) : null}
    </DrawerBlock>
  );
}
