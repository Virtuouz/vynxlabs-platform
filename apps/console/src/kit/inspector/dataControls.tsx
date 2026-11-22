/**
 * The controls that draw a widget's data input from its definition's `dataHints`, as the rows of
 * board 8: "Rows it uses" (where it reads from, the page filters it follows, "Only include",
 * "Sorted by" and how many), "What it shows" (the values) and the breakdown.
 *
 * Each writes one part of the input's visual query (`@volvel/manifest`, `VisualQuery`). A saved
 * query or SQL decides its own columns, so only the source is drawn for those. The pieces are in
 * `rowsItUses.tsx` and `measureControls.tsx`; a widget's own drawer places them where it likes.
 */
import type { Env } from "./controls.tsx";
import { BreakdownGroup, MeasureGroup } from "./measureControls.tsx";
import { type DataPart, dataParts } from "./model.ts";
import { RowsItUses, rowsPartsOf } from "./rowsItUses.tsx";

export { TEST_WORDS, typedValue } from "./conditionWords.ts";
export {
  BreakdownEditor,
  BreakdownRow,
  FormatRow,
  MeasureEditor,
  MeasureRow,
} from "./measureControls.tsx";
export { RowsItUses } from "./rowsItUses.tsx";

/** One data control of one input. */
export function DataControl({
  env,
  input,
  control,
  label,
  help,
  hide,
}: {
  env: Env;
  input: string;
  control: DataPart["control"];
  label: string;
  help?: string | undefined;
  /** Parts a section of the widget draws itself: they are left out of the group. */
  hide?: ReadonlySet<string> | undefined;
}) {
  const rows = rowsPartsOf(dataParts(env.definition), input);
  switch (control) {
    case "source":
      // Source, the filters followed, conditions, sort and limit are one group.
      {
        const show = {
          source: rows.source && !hide?.has("source"),
          conditions: rows.conditions && !hide?.has("conditions"),
          sort: rows.sort && !hide?.has("sort"),
          limit: rows.limit && !hide?.has("limit"),
        };
        return Object.values(show).some(Boolean) ? (
          <RowsItUses env={env} input={input} show={show} />
        ) : null;
      }
    case "conditions":
    case "sort":
    case "limit":
      // Drawn in the group of its source; alone only when the widget declares no source for it.
      return rows.source ? null : (
        <RowsItUses
          env={env}
          input={input}
          show={{ source: false, conditions: false, sort: false, limit: false, [control]: true }}
        />
      );
    case "measure":
      return <MeasureGroup env={env} input={input} label={label} help={help} />;
    case "breakdown":
      return <BreakdownGroup env={env} input={input} label={label} help={help} />;
    default:
      return null;
  }
}
