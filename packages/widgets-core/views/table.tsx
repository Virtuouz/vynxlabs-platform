import { Button, Toggletip } from "@volvel/ui";
import type { RowsData, WidgetViewProps } from "@volvel/widgets";
import {
  type ColumnSpec,
  cellOf,
  columnsToShow,
  headingOf,
  isNumeric,
  largest,
  rowId,
} from "./cells.tsx";
import {
  listensTo,
  PRESSABLE,
  press,
  type RowAction,
  RowActionButtons,
  type WithSelected,
} from "./press.tsx";

interface TableConfig {
  columns?: ColumnSpec[];
  pageSize?: number;
  rowActions?: RowAction[];
}

/** "Show more", for a view whose rows come a page at a time. */
export function ShowMore({ data }: { data: RowsData }) {
  if (!data.more) return null;
  return (
    <div className="mt-2 flex justify-center">
      <Button size="small" onClick={() => data.more?.()}>
        Show more
      </Button>
    </div>
  );
}

/**
 * A table's rows as cards: what a table is on a phone, and what a list is.
 * The first column is the heading and the rest are said under it.
 */
export function RowCards({
  data,
  specs,
  onRow,
  pressable = false,
  selected,
  actions = [],
  view,
}: {
  data: RowsData;
  specs: ColumnSpec[] | undefined;
  onRow: (id: string) => void;
  /** Something listens for a row being pressed: it is drawn so. */
  pressable?: boolean;
  /** The row whose sheet is open. */
  selected?: string | undefined;
  actions?: readonly RowAction[];
  view?: Pick<WidgetViewProps, "act" | "can" | "building">;
}) {
  const shown = columnsToShow(specs, data);
  const [head, ...rest] = shown;
  if (!head) return null;
  return (
    <ul className="m-0 flex list-none flex-col gap-2 p-0">
      {data.rows.map((row, at) => (
        <li
          key={rowId(row, at)}
          className={`rounded-control border border-line bg-surface p-3 ${
            pressable ? `${PRESSABLE} data-[selected]:border-action` : ""
          }`}
          // biome-ignore lint/a11y/useKeyWithClickEvents: only a row something listens to is pressed, and that one takes Enter
          {...press(pressable, () => onRow(rowId(row, at)), selected === rowId(row, at))}
        >
          <strong className="block truncate">
            {cellOf(head.spec, head.info, row[head.spec.column], data)}
          </strong>
          {rest.map(({ spec, info }) => (
            <span key={spec.column} className="mt-1 flex items-baseline gap-2 text-body-sm">
              <span className="text-ink-muted">{headingOf(spec, data)}</span>
              <span className="min-w-0 break-words">
                {cellOf(spec, info, row[spec.column], data, largest(data.rows, spec.column))}
              </span>
            </span>
          ))}
          {view && actions.length > 0 ? (
            <span className="mt-2 flex justify-end">
              <RowActionButtons
                actions={actions}
                row={row}
                record={rowId(row, at)}
                props={view}
                always
              />
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function TableView(props: WithSelected<TableConfig>) {
  const { config, data, size, emit, building, selectedRecord } = props;
  const rows = data.rows;
  if (rows?.shape !== "rows") return null;
  const shown = columnsToShow(config.columns, rows);
  const pressable = listensTo(props, "rowClick");
  const actions = config.rowActions ?? [];
  // On a phone a table is drawn as a list: the definition says so.
  if (size.narrow) {
    return (
      <>
        <RowCards
          data={rows}
          specs={config.columns}
          onRow={(record) => emit("rowClick", { record })}
          pressable={pressable}
          selected={selectedRecord}
          actions={actions}
          view={props}
        />
        <ShowMore data={rows} />
      </>
    );
  }
  const most = new Map(shown.map(({ spec }) => [spec.column, largest(rows.rows, spec.column)]));
  return (
    <>
      {/* table-allowed: a widget's rows are drawn by its view, which the page owns; the kit's grid is for editing data */}
      <table className="w-full border-collapse text-left text-body">
        <thead>
          <tr>
            {shown.map(({ spec, info }) => {
              const text = headingOf(spec, rows);
              return (
                <th
                  key={spec.column}
                  scope="col"
                  className={`sticky top-0 border-b border-line bg-surface px-3 py-2 text-body-sm font-medium whitespace-nowrap text-ink-muted ${
                    isNumeric(info) ? "text-right" : ""
                  }`}
                >
                  {building ? (
                    <button
                      type="button"
                      title="Change this column"
                      className="rounded-inner font-medium text-inherit hover:text-ink"
                      onClick={(event) => {
                        event.stopPropagation();
                        emit("column", { group: { column: spec.column } });
                      }}
                    >
                      {text}
                    </button>
                  ) : (
                    <>
                      {text}
                      {info?.description ? (
                        // What the column holds, as its table's definition says: the kit's grid does the same.
                        <span className="ml-1 inline-flex align-middle font-normal normal-case">
                          <Toggletip label={`About ${text}`} title={text}>
                            {info.description}
                          </Toggletip>
                        </span>
                      ) : null}
                    </>
                  )}
                </th>
              );
            })}
            {actions.length > 0 ? (
              <th scope="col" className="sticky top-0 border-b border-line bg-surface px-3 py-2">
                <span className="sr-only">Actions</span>
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {rows.rows.map((row, at) => (
            <tr
              key={rowId(row, at)}
              className={`group/row border-b border-line last:border-b-0 ${pressable ? PRESSABLE : ""}`}
              // biome-ignore lint/a11y/useKeyWithClickEvents: only a row something listens to is pressed, and that one takes Enter
              {...press(
                pressable,
                () => emit("rowClick", { record: rowId(row, at) }),
                selectedRecord === rowId(row, at),
              )}
            >
              {shown.map(({ spec, info }) => (
                <td
                  key={spec.column}
                  className={`px-3 py-2 align-middle ${isNumeric(info) ? "text-right" : ""}`}
                >
                  {cellOf(spec, info, row[spec.column], rows, most.get(spec.column))}
                </td>
              ))}
              {actions.length > 0 ? (
                <td className="px-3 py-2 text-right align-middle whitespace-nowrap">
                  <RowActionButtons
                    actions={actions}
                    row={row}
                    record={rowId(row, at)}
                    props={props}
                    always={false}
                  />
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
      <ShowMore data={rows} />
    </>
  );
}
