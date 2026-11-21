import type { WidgetViewProps } from "@volvel/widgets";
import { cellOf, rowId, SYSTEM_COLUMNS } from "./cells.tsx";
import { labelOf } from "./format.ts";
import { ShowMore } from "./table.tsx";

interface ListConfig {
  primary?: string;
  secondary?: string;
  meta?: string[];
  status?: string;
}

/** Records as rows of cards: a heading, a line under it, a few more values, and a status chip. */
export function ListView({ config, data, emit }: WidgetViewProps<ListConfig>) {
  const rows = data.rows;
  if (rows?.shape !== "rows") return null;
  const first = rows.columns.find((column) => !SYSTEM_COLUMNS.has(column.name))?.name;
  const primary = config.primary ?? first;
  const info = (name: string | undefined) => rows.columns.find((column) => column.name === name);
  const draw = (name: string, value: unknown) => cellOf({ column: name }, info(name), value, rows);
  return (
    <>
      <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-3 p-0">
        {rows.rows.map((row, at) => (
          // biome-ignore lint/a11y/useKeyWithClickEvents: nothing handles a click until phase 26, so the card does not look pressable and takes no key
          <li
            key={rowId(row, at)}
            className="flex flex-col gap-1 rounded-control border border-line bg-surface p-3"
            onClick={() => emit("rowClick", { record: rowId(row, at) })}
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
          </li>
        ))}
      </ul>
      <ShowMore data={rows} />
    </>
  );
}
