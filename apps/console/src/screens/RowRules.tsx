import { Button, ComboboxField, Notice, SelectField, TextField } from "@vynxlabs/ui";
import { useState } from "react";
import { useLoad } from "../api.ts";

type Condition =
  | { everyone: true }
  | { column: string; is: "principal" }
  | { column: string; in: "groups" }
  | { column: string; equals: { attribute: string } };
export interface Rule {
  allow: "read" | "write" | "all";
  when: Condition;
}
export type Policy =
  | { type: "open" }
  | { type: "owner"; column: string }
  | { type: "rules"; rules: Rule[] };

type Kind = "everyone" | "principal" | "groups" | "attribute";
const kindOf = (when: Condition): Kind =>
  "everyone" in when
    ? "everyone"
    : "is" in when
      ? "principal"
      : "in" in when
        ? "groups"
        : "attribute";

/** What a policy means, in a sentence, for the list of tables and the top of this section. */
export function policyText(policy: { type: string; column?: string; rules?: Rule[] }): string {
  if (policy.type === "owner") return `Each person sees their own rows (${policy.column})`;
  if (policy.type === "rules") {
    const count = policy.rules?.length ?? 0;
    return `By ${count} ${count === 1 ? "rule" : "rules"}`;
  }
  return "Everyone with access";
}

/** One rule in words: "People in the group named in team may read". */
export function ruleText(rule: Rule): string {
  const when = rule.when;
  const who =
    "everyone" in when
      ? "Everyone with access"
      : "is" in when
        ? `The person named in ${when.column}`
        : "in" in when
          ? `People in the group named in ${when.column}`
          : `People whose ${when.equals.attribute} is in ${when.column}`;
  return `${who} may ${rule.allow === "read" ? "read" : "read and change"} the row.`;
}

/**
 * Chooses who sees and changes a table's rows: everyone with access, each
 * person their own, or rules that compare a column with the person. Nothing
 * is saved until Save is pressed, so a half-written rule never applies.
 */
export function RowRulesEditor({
  policy,
  columns,
  onSave,
}: {
  policy: Policy;
  /** The table's active columns. */
  columns: { name: string; type: string }[];
  onSave: (policy: Policy) => Promise<unknown>;
}) {
  const [mode, setMode] = useState(policy.type);
  const [owner, setOwner] = useState(policy.type === "owner" ? policy.column : "");
  const [rules, setRules] = useState<Rule[]>(
    policy.type === "rules" ? policy.rules : [{ allow: "read", when: { everyone: true } }],
  );
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  // What can hold a person's or a group's ID or name, and what can hold an attribute's value.
  const identifying = columns.filter((column) => ["uuid", "text"].includes(column.type));
  const comparable = columns.filter((column) => ["uuid", "text", "integer"].includes(column.type));
  const options = (from: typeof columns) =>
    from.map((column) => ({ value: column.name, label: column.name }));
  const edit = (index: number, next: Rule) => {
    setRules((before) => before.map((rule, each) => (each === index ? next : rule)));
    setSaved(false);
  };
  const first = identifying[0]?.name ?? "";

  const wanted: Policy | undefined =
    mode === "open"
      ? { type: "open" }
      : mode === "owner"
        ? owner
          ? { type: "owner", column: owner }
          : undefined
        : rules.length > 0 &&
            rules.every(
              (rule) =>
                "everyone" in rule.when ||
                (rule.when.column !== "" &&
                  (!("equals" in rule.when) || rule.when.equals.attribute !== "")),
            )
          ? { type: "rules", rules }
          : undefined;

  return (
    <div className="flex max-w-3xl flex-col gap-3">
      <div className="max-w-sm">
        <SelectField
          name="mode"
          label="Who sees rows"
          value={mode}
          options={[
            { value: "open", label: "Everyone with access sees every row" },
            { value: "owner", label: "Each person sees their own rows" },
            { value: "rules", label: "Rules decide" },
          ]}
          onChange={(value) => {
            setMode(value as Policy["type"]);
            setSaved(false);
          }}
        />
      </div>
      {mode === "owner" ? (
        <div className="max-w-sm">
          <SelectField
            name="owner"
            label="The column that holds each row's owner"
            value={owner}
            options={[{ value: "", label: "Choose a column" }, ...options(identifying)]}
            hint="It holds the person's ID. A row added with none is given to whoever added it."
            onChange={(value) => {
              setOwner(value);
              setSaved(false);
            }}
          />
        </div>
      ) : null}
      {mode === "rules" ? (
        <>
          <p className="m-0 text-ink-muted">
            A person sees a row when any rule lets them, and changes it when a rule that says "read
            and change" does. People who hold the "all rows" permission see every row.
          </p>
          {rules.map((rule, index) => {
            const kind = kindOf(rule.when);
            const column = "column" in rule.when ? rule.when.column : "";
            return (
              // biome-ignore lint/suspicious/noArrayIndexKey: a rule has no identity but its place while it is being written
              <fieldset key={index} className="m-0 rounded-control border border-line p-3">
                <legend className="px-1 text-[12.5px] text-ink-muted">{ruleText(rule)}</legend>
                <div className="grid items-end gap-2 md:grid-cols-[2fr_1fr_1fr_1fr_auto]">
                  <SelectField
                    name={`who-${index}`}
                    label="Who"
                    value={kind}
                    options={[
                      { value: "everyone", label: "Everyone with access" },
                      { value: "principal", label: "The person named in a column" },
                      { value: "groups", label: "A group named in a column" },
                      { value: "attribute", label: "People with a matching attribute" },
                    ]}
                    onChange={(value) =>
                      edit(index, {
                        allow: rule.allow,
                        when:
                          value === "everyone"
                            ? { everyone: true }
                            : value === "principal"
                              ? { column: column || first, is: "principal" }
                              : value === "groups"
                                ? { column: column || first, in: "groups" }
                                : { column: column || first, equals: { attribute: "" } },
                      })
                    }
                  />
                  {kind === "everyone" ? (
                    <span />
                  ) : (
                    <SelectField
                      name={`column-${index}`}
                      label="Column"
                      value={column}
                      options={[
                        { value: "", label: "Choose" },
                        ...options(kind === "attribute" ? comparable : identifying),
                      ]}
                      onChange={(value) =>
                        edit(index, { ...rule, when: { ...rule.when, column: value } as Condition })
                      }
                    />
                  )}
                  {"equals" in rule.when ? (
                    <TextField
                      name={`attribute-${index}`}
                      label="Attribute"
                      value={rule.when.equals.attribute}
                      placeholder="customer_id"
                      onChange={(attribute) =>
                        edit(index, { ...rule, when: { column, equals: { attribute } } })
                      }
                    />
                  ) : (
                    <span />
                  )}
                  <SelectField
                    name={`allow-${index}`}
                    label="May"
                    value={rule.allow === "read" ? "read" : "all"}
                    options={[
                      { value: "read", label: "Read" },
                      { value: "all", label: "Read and change" },
                    ]}
                    onChange={(value) => edit(index, { ...rule, allow: value as Rule["allow"] })}
                  />
                  <Button
                    variant="quiet"
                    aria-label={`Remove rule ${index + 1}`}
                    disabled={rules.length === 1}
                    onClick={() => {
                      setRules((before) => before.filter((_, each) => each !== index));
                      setSaved(false);
                    }}
                  >
                    Remove
                  </Button>
                </div>
              </fieldset>
            );
          })}
          <div>
            <Button
              size="small"
              onClick={() => {
                setRules((before) => [
                  ...before,
                  { allow: "read", when: { column: first, in: "groups" } },
                ]);
                setSaved(false);
              }}
            >
              Add a rule
            </Button>
          </div>
        </>
      ) : null}
      <div className="flex items-center gap-3">
        <Button
          variant="primary"
          disabled={busy || wanted === undefined}
          onClick={async () => {
            if (!wanted) return;
            setBusy(true);
            try {
              await onSave(wanted);
              setSaved(true);
            } catch {
              // The screen around this shows why.
            } finally {
              setBusy(false);
            }
          }}
        >
          Save who sees rows
        </Button>
        {saved ? (
          <span className="text-success">Saved. It applies from the next request.</span>
        ) : null}
      </div>
    </div>
  );
}

/** Shows which rows of a table one end user would be given, to check a policy before trusting it. */
export function SeeItAs({
  root,
  table,
  usersPath,
}: {
  root: string;
  table: string;
  usersPath: string;
}) {
  const users = useLoad<{ items: { id: string; email: string; groups: string[] }[] }>(usersPath);
  const [as, setAs] = useState<string>();
  const rows = useLoad<{ items: Record<string, unknown>[] }>(
    as ? `${root}/rows/${table}?limit=20&as=${as}` : null,
  );
  const shown = rows.data?.items ?? [];
  const names = Object.keys(shown[0] ?? {}).filter(
    (name) => !["id", "created_at", "updated_at"].includes(name),
  );
  return (
    <div className="flex max-w-3xl flex-col gap-2">
      <div className="max-w-sm">
        <ComboboxField
          label="See it as"
          options={(users.data?.items ?? []).map((user) => ({
            value: user.id,
            label: user.email,
            ...(user.groups.length > 0 ? { hint: `In ${user.groups.join(", ")}` } : {}),
          }))}
          value={as}
          placeholder="Choose an end user"
          hint="The rows this person would be given, by what is saved now."
          onChange={setAs}
        />
      </div>
      {rows.error ? <Notice tone="danger">{rows.error.message}</Notice> : null}
      {as && rows.data ? (
        shown.length === 0 ? (
          <p className="m-0 text-ink-muted">This person would see no rows.</p>
        ) : (
          <div className="overflow-x-auto rounded-control border border-line">
            <table className="w-full border-collapse text-left text-[13px]">
              <thead>
                <tr className="text-ink-muted">
                  {names.map((name) => (
                    <th key={name} scope="col" className="px-3 py-1.5 font-medium">
                      {name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map((row) => (
                  <tr key={String(row.id)} className="border-line border-t">
                    {names.map((name) => (
                      <td key={name} className="px-3 py-1.5">
                        {row[name] === null || row[name] === undefined ? "" : String(row[name])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {shown.length === 20 ? (
              <p className="m-0 px-3 py-1.5 text-[12.5px] text-ink-muted">The first 20 rows.</p>
            ) : null}
          </div>
        )
      ) : null}
    </div>
  );
}
