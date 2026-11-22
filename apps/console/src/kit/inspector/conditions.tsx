/**
 * The conditions editor (boards 8 and 9): sentences as chips, never code. "Status is Unpaid ×",
 * "Current user is in Billing ×", "+ And". Pressing a chip opens the drawer kit's condition editor
 * beside it, with the operators in the column's own words and, for a choice column, its values as
 * a checked list. It writes the `Condition` list an action's `when` and a widget's `rules.showWhen`
 * hold (decision 0004, S9). Several values chosen are an array: "any of" for `is`, "none of" for
 * `is not`.
 */
import { listWords } from "@volvel/manifest";
import {
  AddChip,
  ChipSet,
  type ConditionChoice,
  type ConditionColumn,
  ConditionEditor,
  type ConditionValue,
  DrawerEditor,
  SelectField,
} from "@volvel/ui";
import { X } from "lucide-react";
import { type ReactNode, useState } from "react";
import {
  type ActionContext,
  type Condition,
  conditionFromKey,
  conditionKey,
  conditionValueWords,
  firstCondition,
  refsOf,
  refWords,
  tableOfRef,
} from "./actionModel.ts";
import { heading } from "./model.ts";
import { type GroupChoice, groupKey, operatorsFor } from "./timelineModel.ts";

type ChoiceValues = { value: string; label?: string }[] | undefined;

/** The columns of the records an action or a widget can read, as the editor lists them. */
function columnsOf(ctx: ActionContext): (ConditionColumn & { values?: ChoiceValues })[] {
  const refs = refsOf(ctx);
  return refs.flatMap((ref) =>
    ctx.columnsOf(tableOfRef(ctx, ref)).map((column) => {
      const values = (column as { values?: ChoiceValues }).values;
      return {
        id: `${ref}:${column.name}`,
        label:
          refs.length > 1
            ? `${heading(column.name)} of ${refWords(ctx, ref)}`
            : heading(column.name),
        type: column.type === "enum" ? "choice" : column.type,
        ...(values ? { values } : {}),
      };
    }),
  );
}

const WORDS: Record<string, string> = {
  is: "is",
  is_not: "is not",
  gt: "is more than",
  gte: "is at least",
  lt: "is less than",
  lte: "is at most",
  contains: "contains",
  is_empty: "is empty",
  is_not_empty: "is not empty",
};

/** A condition as its chip reads: the value in bold. */
function Face({ one, ctx }: { one: Condition; ctx: ActionContext }): ReactNode {
  if ("user" in one) {
    return (
      <>
        Current user is in <strong className="font-semibold">{one.group || "a group"}</strong>
      </>
    );
  }
  if ("record" in one) {
    return one.record === "exists" ? "A record is chosen" : "No record is chosen";
  }
  const refs = refsOf(ctx);
  const name =
    heading(one.field) + (refs.length > 1 && one.of === "event" ? " of the clicked record" : "");
  const test = WORDS[one.test] ?? one.test;
  if (one.test === "is_empty" || one.test === "is_not_empty") return `${name} ${test}`;
  const value = conditionValueWords(one, ctx);
  return (
    <>
      {name} {test} {value ? <strong className="font-semibold">{value}</strong> : null}
    </>
  );
}

const KINDS = [
  { value: "field", label: "A field of a record" },
  { value: "user", label: "The current user is in a group" },
  { value: "record:exists", label: "A record is chosen" },
  { value: "record:missing", label: "No record is chosen" },
];

export function ConditionsEditor({
  id,
  noun = "condition",
  conditions,
  ctx,
  groups,
  onChange,
  addLabel,
}: {
  id: string;
  /** What one is called to a screen reader: "condition 1", "rule 1". */
  noun?: string;
  conditions: readonly Condition[] | undefined;
  ctx: ActionContext;
  /** The groups the current user can be in: a condition holds the key, the person reads the name. */
  groups: readonly GroupChoice[];
  /** The list as it should now be, or nothing when none are left. */
  onChange: (next: Condition[] | undefined, key?: string) => void;
  /** The dashed chip's words. "And" after the first. */
  addLabel?: string;
}) {
  const list = conditions ?? [];
  const groupKeys = groups.map((group) => groupKey(group.path));
  const [editing, setEditing] = useState<number | undefined>(undefined);
  const columns = columnsOf(ctx);
  const put = (next: Condition[], key?: string) => onChange(next.length ? next : undefined, key);
  const set = (at: number, one: Condition, key?: string) =>
    put(
      list.map((was, index) => (index === at ? one : was)),
      key,
    );

  const choices = (field: string): readonly ConditionChoice[] | undefined => {
    const values = columns.find((one) => one.id === field)?.values;
    return values?.map((one) => ({ value: one.value, ...(one.label ? { label: one.label } : {}) }));
  };

  const body = (one: Condition, at: number) => {
    const n = at + 1;
    const kind = "user" in one ? "user" : "record" in one ? conditionKey(one) : "field";
    return (
      <div className="flex flex-col gap-3">
        <SelectField
          name={`${id}-${noun}-${n}-what`}
          label={`What ${noun} ${n} is about`}
          labelHidden
          value={kind}
          options={columns.length > 0 ? KINDS : KINDS.filter((option) => option.value !== "field")}
          onChange={(next) => {
            if (next === "field") {
              const first = columns[0];
              if (first) set(at, conditionFromKey(`field:${first.id}`, undefined, groupKeys));
            } else set(at, conditionFromKey(next, one, groupKeys));
          }}
        />
        {"field" in one ? (
          <ConditionEditor
            columns={columns}
            operators={operatorsFor}
            choices={choices}
            value={{
              field: `${one.of ?? "this"}:${one.field}`,
              test: one.test,
              ...(one.value === undefined ? {} : { value: one.value }),
            }}
            onChange={(next: ConditionValue) => {
              const [ref, ...rest] = next.field.split(":");
              const field = rest.join(":");
              set(
                at,
                {
                  field,
                  ...(ref === "event" ? { of: "event" as const } : {}),
                  test: next.test as Extract<Condition, { field: string }>["test"],
                  ...(next.value === undefined || next.value === "" ? {} : { value: next.value }),
                },
                `${id}:${noun}:${at}`,
              );
            }}
            note={
              columns.some((one) => one.type === "choice" && one.values)
                ? "A choice column offers its values."
                : "Type the value the column should have."
            }
          />
        ) : "user" in one ? (
          <SelectField
            name={`${id}-${noun}-${n}-group`}
            label={`Group of ${noun} ${n}`}
            value={one.group}
            options={[
              ...(groups.some((group) => groupKey(group.path) === one.group)
                ? []
                : [{ value: one.group, label: one.group || "Choose a group" }]),
              ...groups.map((group) => ({ value: groupKey(group.path), label: group.name })),
            ]}
            onChange={(group) => set(at, { user: "in", group })}
          />
        ) : null}
      </div>
    );
  };

  const first = list.length === 0;
  return (
    <ChipSet label={`${noun}s`}>
      {list.map((one, at) => {
        const n = at + 1;
        return (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: a sentence has no identity but its place in the list
            key={`${conditionKey(one)}-${at}`}
            className="inline-flex h-7 max-w-full items-center rounded-control border border-line-strong bg-sunken text-body-sm text-ink"
          >
            <DrawerEditor
              title={heading(noun)}
              open={editing === at}
              onOpenChange={(open) => setEditing(open ? at : undefined)}
              trigger={
                <button
                  type="button"
                  aria-label={`Edit ${noun} ${n}`}
                  className="h-full min-w-0 cursor-pointer truncate rounded-l-control pr-1 pl-3 outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus"
                >
                  <Face one={one} ctx={ctx} />
                </button>
              }
            >
              {body(one, at)}
            </DrawerEditor>
            <button
              type="button"
              aria-label={`Remove ${noun} ${n}`}
              onClick={() => {
                setEditing(undefined);
                put(list.filter((_, index) => index !== at));
              }}
              className="grid h-full w-6 shrink-0 cursor-pointer place-items-center rounded-r-control text-ink-muted outline-offset-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-focus"
            >
              <X aria-hidden="true" size={14} />
            </button>
          </span>
        );
      })}
      {list.length < 10 ? (
        <AddChip
          aria-label={`Add a ${noun}`}
          onClick={() => {
            put([...list, firstCondition(ctx, groupKeys)]);
            setEditing(list.length);
          }}
        >
          {addLabel ?? (first ? "Condition" : "And")}
        </AddChip>
      ) : null}
    </ChipSet>
  );
}
