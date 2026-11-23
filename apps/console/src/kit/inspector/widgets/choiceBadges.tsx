/**
 * The colors of a record detail's choices (WID-M4): a field drawn as a badge, and the status chip
 * beside the heading. Both list the values of the column as the table's own badge colors do, and
 * both use the same list of tones.
 */
import { SegmentedControl } from "@volvel/ui";
import { useColumnValues } from "../catalog.ts";
import { heading, tableOfInput } from "../model.ts";
import { BadgeColors } from "./ColumnEditor.tsx";
import { type ColumnFacts, factsOf, type Tone, withListedChoices } from "./columnModel.ts";
import { FullSegments } from "./FullSegments.tsx";
import type { Env } from "./recordShared.tsx";

/** What the record's table says about one column: its type, and the values it can hold. */
export function useChoiceFacts(env: Env, column: string | undefined): ColumnFacts | undefined {
  const table = tableOfInput(env.widget.data?.record, env.page, env.widgets);
  const own = column ? factsOf([column], env.catalog, table)[0] : undefined;
  const listedByCatalog =
    env.catalog.tables.find((one) => one.name === table)?.columns.find((one) => one.name === column)
      ?.values ?? [];
  const counted = useColumnValues(env.catalog.root, table, own);
  if (!own) return undefined;
  const withCatalog =
    listedByCatalog.length > 0
      ? {
          ...own,
          choices: [...new Set([...own.choices, ...listedByCatalog.map((one) => one.value)])],
        }
      : own;
  return withListedChoices(withCatalog, counted);
}

/** The colors of a column's values, as a list of badges that each open a menu of tones. */
export function ChoiceColors({
  env,
  column,
  badges,
  onChange,
}: {
  env: Env;
  column: string;
  badges: Record<string, Tone> | undefined;
  onChange: (badges: Record<string, Tone>) => void;
}) {
  const facts = useChoiceFacts(env, column);
  const values = [...new Set([...(facts?.choices ?? []), ...Object.keys(badges ?? {})])];
  return (
    <BadgeColors
      values={values}
      badges={badges}
      words={(value) => facts?.labels?.[value] ?? heading(value)}
      onChange={onChange}
    />
  );
}

/** "Shown as" Text or Badge for a field that is a choice, and the colors once it is a badge. */
export function FieldAsBadge({
  env,
  column,
  as,
  badges,
  onChange,
}: {
  env: Env;
  column: string;
  as: unknown;
  badges: Record<string, Tone> | undefined;
  onChange: (patch: { as?: "text" | "badge"; badges?: Record<string, Tone> }) => void;
}) {
  const facts = useChoiceFacts(env, column);
  const choice = facts !== undefined && (facts.type === "enum" || facts.choices.length > 0);
  if (!choice) return null;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <span className="text-body-sm text-ink-muted">Shown as</span>
        <FullSegments>
          <SegmentedControl
            label="Shown as"
            value={as === "badge" ? "badge" : "text"}
            options={[
              { value: "text", label: "Text" },
              { value: "badge", label: "Badge" },
            ]}
            onChange={(next) => onChange({ as: next === "badge" ? "badge" : "text" })}
          />
        </FullSegments>
      </div>
      {as === "badge" ? (
        <ChoiceColors
          env={env}
          column={column}
          badges={badges}
          onChange={(next) => onChange({ badges: next })}
        />
      ) : null}
    </div>
  );
}
