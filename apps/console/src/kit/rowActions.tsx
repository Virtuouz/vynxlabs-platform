import type { ReactNode } from "react";
import type { DataColumn } from "./DataTable.tsx";
import { useWide } from "./layout.tsx";

/**
 * The column of actions every list with row actions has (ListCollection and ListScreen both draw
 * it from here, so they cannot drift apart).
 *
 * On a phone a row keeps what says what it is, and its actions sit under that, where they are
 * seen at first view; a column of them past the right edge would be reached only by a sideways
 * scroll nobody is told about. The first column then keeps room for the buttons beside it (it is
 * `wide`) and the buttons wrap, starting at the left, inside it. From a tablet up the actions are
 * the last column. It is of the first tier: it keeps room for two buttons side by side and is
 * never the column that is dropped. A column of the second or third tier is, when the room the
 * table has is too small for it, and the buttons wrap inside it, never past the table.
 */
export function useRowActionColumns<Row>(
  columns: DataColumn<Row>[],
  rowActions: ((row: Row, reload: () => void) => ReactNode) | undefined,
  { can, reload }: { can: boolean; reload: () => void },
): DataColumn<Row>[] {
  const roomy = useWide(640);
  const [first, ...rest] = columns;
  if (!rowActions || !first) return columns;
  const actionsOf = (one: Row) => (
    // Pressing an action is not choosing the row.
    // biome-ignore lint/a11y/noStaticElementInteractions: only stops the click reaching the row
    // biome-ignore lint/a11y/useKeyWithClickEvents: the buttons inside take the keyboard
    <span
      data-row-actions
      className={`flex flex-wrap items-center gap-2 ${roomy ? "justify-end" : "justify-start"}`}
      onClick={(event) => event.stopPropagation()}
    >
      <fieldset disabled={!can} className="contents">
        {rowActions(one, reload)}
      </fieldset>
    </span>
  );
  if (!roomy) {
    // No column of actions at all: the table is not made wider for one, and nothing is left for a
    // sideways scroll to find.
    return [
      {
        ...first,
        // The buttons wrap under the name, so this is the column that takes the room.
        wide: true,
        cell: (one) => (
          <>
            {first.cell(one)}
            <div className="mt-2">{actionsOf(one)}</div>
          </>
        ),
      },
      ...rest,
    ];
  }
  return [
    first,
    ...rest,
    {
      header: "Actions",
      align: "end",
      // Always shown: the other columns give way to it (they are measured against the room the
      // table has), never it to them. Room for two buttons side by side; past that they wrap
      // inside the cell, never past the table.
      wide: true,
      cell: actionsOf,
    },
  ];
}
