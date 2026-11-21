/**
 * The conditions editor: sentences, never code. "Status is Unpaid", "the current
 * user is in Managers", "a record is chosen". It writes the `Condition` list an
 * action's `when` and a widget's `rules.showWhen` hold (decision 0004, S9).
 */
import { Button, SelectField, TextField } from "@volvel/ui";
import { Plus, X } from "lucide-react";
import {
  type ActionContext,
  type Condition,
  conditionFromKey,
  conditionKey,
  NO_VALUE_TESTS,
  refsOf,
  refWords,
  TEST_LABELS,
  TESTS,
  tableOfRef,
  typedConstant,
} from "./actionModel.ts";
import { heading } from "./model.ts";

/** What the first menu of a sentence holds: the fields of the records, then the two other kinds. */
function whatOptions(ctx: ActionContext) {
  const refs = refsOf(ctx);
  const options: { value: string; label: string }[] = [];
  for (const ref of refs) {
    for (const column of ctx.columnsOf(tableOfRef(ctx, ref))) {
      options.push({
        value: `field:${ref}:${column.name}`,
        label:
          refs.length > 1
            ? `${heading(column.name)} of ${refWords(ctx, ref)}`
            : heading(column.name),
      });
    }
  }
  options.push(
    { value: "user", label: "The current user is in a group" },
    { value: "record:exists", label: "A record is chosen" },
    { value: "record:missing", label: "No record is chosen" },
  );
  return options;
}

export function ConditionsEditor({
  id,
  noun = "condition",
  conditions,
  ctx,
  groups,
  onChange,
}: {
  id: string;
  /** What one is called to a screen reader: "condition 1", "rule 1". */
  noun?: string;
  conditions: readonly Condition[] | undefined;
  ctx: ActionContext;
  groups: readonly string[];
  /** The list as it should now be, or nothing when none are left. */
  onChange: (next: Condition[] | undefined, key?: string) => void;
}) {
  const list = conditions ?? [];
  const options = whatOptions(ctx);
  const put = (next: Condition[], key?: string) => onChange(next.length ? next : undefined, key);
  const set = (at: number, one: Condition, key?: string) =>
    put(
      list.map((was, index) => (index === at ? one : was)),
      key,
    );
  const first = options[0];
  return (
    <div className="flex flex-col gap-2">
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {list.map((one, at) => {
          const n = at + 1;
          const key = conditionKey(one);
          return (
            <li
              // biome-ignore lint/suspicious/noArrayIndexKey: a sentence has no identity but its place in the list
              key={`${key}-${at}`}
              className="flex flex-col gap-2 rounded-control border border-line p-2"
            >
              <div className="flex flex-wrap items-center gap-2">
                <div className="min-w-0 flex-1 basis-40">
                  <SelectField
                    name={`${id}-${noun}-${n}-what`}
                    label={`What ${noun} ${n} is about`}
                    labelHidden
                    value={key}
                    options={
                      options.some((option) => option.value === key)
                        ? options
                        : [{ value: key, label: heading(key.split(":").pop() ?? key) }, ...options]
                    }
                    onChange={(next) => set(at, conditionFromKey(next, one, groups))}
                  />
                </div>
                <Button
                  size="small"
                  variant="quiet"
                  aria-label={`Remove ${noun} ${n}`}
                  onClick={() => put(list.filter((_, index) => index !== at))}
                >
                  <X aria-hidden="true" size={14} />
                </Button>
              </div>
              {"field" in one ? (
                <div className="flex flex-wrap items-center gap-2">
                  <div className="w-36 max-w-full">
                    <SelectField
                      name={`${id}-${noun}-${n}-test`}
                      label={`Test of ${noun} ${n}`}
                      labelHidden
                      value={one.test}
                      options={TESTS.map((test) => ({
                        value: test,
                        label: TEST_LABELS[test] ?? test,
                      }))}
                      onChange={(test) => {
                        const { value, ...rest } = one;
                        set(at, {
                          ...rest,
                          test: test as typeof one.test,
                          ...(NO_VALUE_TESTS.has(test) || value === undefined ? {} : { value }),
                        });
                      }}
                    />
                  </div>
                  {NO_VALUE_TESTS.has(one.test) ? null : (
                    <div className="min-w-0 flex-1 basis-28">
                      <TextField
                        name={`${id}-${noun}-${n}-value`}
                        label={`Value of ${noun} ${n}`}
                        labelHidden
                        placeholder="Value"
                        required={false}
                        value={
                          one.value === undefined || one.value === null ? "" : String(one.value)
                        }
                        onChange={(text) =>
                          set(at, { ...one, value: typedConstant(text) }, `${id}:${noun}:${at}`)
                        }
                      />
                    </div>
                  )}
                </div>
              ) : "user" in one ? (
                groups.length > 0 ? (
                  <SelectField
                    name={`${id}-${noun}-${n}-group`}
                    label={`Group of ${noun} ${n}`}
                    labelHidden
                    value={one.group}
                    options={[
                      ...(groups.includes(one.group)
                        ? []
                        : [{ value: one.group, label: one.group || "Choose a group" }]),
                      ...groups.map((name) => ({ value: name, label: name })),
                    ]}
                    onChange={(group) => set(at, { user: "in", group })}
                  />
                ) : (
                  <TextField
                    name={`${id}-${noun}-${n}-group`}
                    label={`Group of ${noun} ${n}`}
                    labelHidden
                    placeholder="Name of the group"
                    required={false}
                    value={one.group}
                    onChange={(group) => set(at, { user: "in", group }, `${id}:${noun}:${at}`)}
                  />
                )
              ) : null}
            </li>
          );
        })}
      </ul>
      {list.length < 10 ? (
        <div>
          <Button
            size="small"
            variant="quiet"
            disabled={!first}
            onClick={() =>
              first && put([...list, conditionFromKey(first.value, undefined, groups)])
            }
          >
            <Plus aria-hidden="true" size={14} /> Add a {noun}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
