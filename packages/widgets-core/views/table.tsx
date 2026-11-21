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

interface TableConfig {
  columns?: ColumnSpec[];
  pageSize?: number;
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
}: {
  data: RowsData;
  specs: ColumnSpec[] | undefined;
  onRow: (id: string) => void;
}) {
  const shown = columnsToShow(specs, data);
  const [head, ...rest] = shown;
  if (!head) return null;
  return (
    <ul className="m-0 flex list-none flex-col gap-2 p-0">
      {data.rows.map((row, at) => (
        // biome-ignore lint/a11y/useKeyWithClickEvents: nothing handles a click until phase 26, so the card does not look pressable and takes no key
        <li
          key={rowId(row, at)}
          className="rounded-control border border-line bg-surface p-3"
          onClick={() => onRow(rowId(row, at))}
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
        </li>
      ))}
    </ul>
  );
}

export function TableView({ config, data, size, emit, building }: WidgetViewProps<TableConfig>) {
  const rows = data.rows;
  if (rows?.shape !== "rows") return null;
  const shown = columnsToShow(config.columns, rows);
  // On a phone a table is drawn as a list: the definition says so.
  if (size.narrow) {
    return (
      <>
        <RowCards
          data={rows}
          specs={config.columns}
          onRow={(record) => emit("rowClick", { record })}
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
          </tr>
        </thead>
        <tbody>
          {rows.rows.map((row, at) => (
            <tr
              key={rowId(row, at)}
              className="border-b border-line last:border-b-0"
              onClick={() => emit("rowClick", { record: rowId(row, at) })}
            >
              {shown.map(({ spec, info }) => (
                <td
                  key={spec.column}
                  className={`px-3 py-2 align-middle ${isNumeric(info) ? "text-right" : ""}`}
                >
                  {cellOf(spec, info, row[spec.column], rows, most.get(spec.column))}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <ShowMore data={rows} />
    </>
  );
}
