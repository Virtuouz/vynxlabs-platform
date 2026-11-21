import { cellOf, rowId, SYSTEM_COLUMNS } from "./cells.tsx";
import { labelOf } from "./format.ts";
import {
  listensTo,
  PRESSABLE,
  press,
  type RowAction,
  RowActionButtons,
  type WithSelected,
} from "./press.tsx";
import { ShowMore } from "./table.tsx";

interface ListConfig {
  primary?: string;
  secondary?: string;
  meta?: string[];
  status?: string;
  rowActions?: RowAction[];
}

/** Records as rows of cards: a heading, a line under it, a few more values, and a status chip. */
export function ListView(props: WithSelected<ListConfig>) {
  const { config, data, emit, selectedRecord } = props;
  const rows = data.rows;
  if (rows?.shape !== "rows") return null;
  const first = rows.columns.find((column) => !SYSTEM_COLUMNS.has(column.name))?.name;
  const primary = config.primary ?? first;
  const pressable = listensTo(props, "rowClick");
  const actions = config.rowActions ?? [];
  const info = (name: string | undefined) => rows.columns.find((column) => column.name === name);
  const draw = (name: string, value: unknown) => cellOf({ column: name }, info(name), value, rows);
  return (
    <>
      <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-3 p-0">
        {rows.rows.map((row, at) => (
          <li
            key={rowId(row, at)}
            className={`group/row flex flex-col gap-1 rounded-control border border-line bg-surface p-3 ${
              pressable ? `${PRESSABLE} data-[selected]:border-action` : ""
            }`}
            // biome-ignore lint/a11y/useKeyWithClickEvents: only a record something listens to is pressed, and that one takes Enter
            {...press(
              pressable,
              () => emit("rowClick", { record: rowId(row, at) }),
              selectedRecord === rowId(row, at),
              rowId(row, at),
            )}
          >
            <span className="flex items-start justify-between gap-2">
              <strong className="min-w-0 truncate">
                {primary ? draw(primary, row[primary]) : null}
              </strong>
              {config.status ? (
                <span className="shrink-0">{draw(config.status, row[config.status])}</span>
              ) : null}
            </span>
            {config.secondary ? (
              <span className="truncate text-body-sm text-ink-muted">
                {draw(config.secondary, row[config.secondary])}
              </span>
            ) : null}
            {(config.meta ?? []).map((name) => (
              <span key={name} className="flex items-baseline gap-2 text-body-sm">
                <span className="text-ink-muted">{labelOf(rows.columns, name)}</span>
                <span className="min-w-0 break-words">{draw(name, row[name])}</span>
              </span>
            ))}
            {actions.length > 0 ? (
              <span className="mt-1 flex justify-end">
                <RowActionButtons
                  actions={actions}
                  row={row}
                  record={rowId(row, at)}
                  props={props}
                  always={props.size.narrow}
                />
              </span>
            ) : null}
          </li>
        ))}
      </ul>
      <ShowMore data={rows} />
    </>
  );
}
