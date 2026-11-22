import type { ColumnInfo, RowsData } from "@volvel/widgets";
import type { ReactNode } from "react";
import { cellOf, defaultColumns, rowId } from "./cells.tsx";
import { GroupHeading, type GroupRows, groupsOf, underItsDay } from "./groups.tsx";
import {
  listensTo,
  PRESSABLE,
  press,
  type RowAction,
  RowActionButtons,
  type WithSelected,
} from "./press.tsx";
import { RowsBox } from "./rowsBox.tsx";
import { ShowMore } from "./table.tsx";

/** The places of a row, each filled with a column; a place left out takes no space. */
interface ListConfig {
  title?: string;
  subtitle?: string;
  right?: string;
  badge?: string;
  picture?: string;
  /** `list` is one row under another; `cards` are boxes side by side. */
  look?: "list" | "cards";
  rowActions?: RowAction[];
  /** A heading over the rows of each day, or of each value of a column. */
  groupRows?: GroupRows;
}

const filled = (value: unknown) => value !== null && value !== undefined && value !== "";

/** One row's places, drawn: shared by the list and the cards. */
function placesOf(
  row: Record<string, unknown>,
  config: ListConfig,
  rows: RowsData,
  title: string | undefined,
): Record<"picture" | "title" | "subtitle" | "right" | "badge", ReactNode> {
  const info = (name: string | undefined): ColumnInfo | undefined =>
    rows.columns.find((column) => column.name === name);
  const draw = (name: string, value: unknown, as?: "badge") =>
    underItsDay(config.groupRows, rows, name, value) ??
    cellOf({ column: name, ...(as ? { as } : {}) }, info(name), value, rows);
  const picture = config.picture ? row[config.picture] : undefined;
  return {
    picture:
      typeof picture === "string" && picture !== "" ? (
        <img
          src={picture}
          alt=""
          className="size-10 shrink-0 rounded-control bg-sunken object-cover"
        />
      ) : null,
    title: title && filled(row[title]) ? draw(title, row[title]) : null,
    subtitle:
      config.subtitle && filled(row[config.subtitle])
        ? draw(config.subtitle, row[config.subtitle])
        : null,
    right: config.right && filled(row[config.right]) ? draw(config.right, row[config.right]) : null,
    badge:
      config.badge && filled(row[config.badge])
        ? draw(config.badge, row[config.badge], "badge")
        : null,
  };
}

/**
 * Records as rows (a picture, a title with a line under it, a figure and a badge at the right)
 * or as cards, by `look`. Each place is a column the maker chose.
 */
export function ListView(props: WithSelected<ListConfig>) {
  const { config, data, emit, selectedRecord } = props;
  const rows = data.rows;
  if (rows?.shape !== "rows") return null;
  const first = defaultColumns(rows.columns)[0]?.name;
  const title = config.title ?? first;
  const pressable = listensTo(props, "rowClick");
  const actions = config.rowActions ?? [];
  const cards = config.look === "cards";
  const groups = groupsOf(rows, config.groupRows);
  const listOf = (items: readonly { row: Readonly<Record<string, unknown>>; id: string }[]) => (
    <ul
      className={
        cards
          ? `m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-3 p-0 ${groups ? "pt-3 pb-1" : ""}`
          : "m-0 flex list-none flex-col p-0"
      }
    >
      {items.map(({ row, id }) => {
        const places = placesOf(row, config, rows, title);
        return (
          <li
            key={id}
            data-box-row=""
            className={`group/row flex min-w-0 items-center gap-3 ${
              cards
                ? "rounded-control border border-line bg-surface p-3"
                : "border-b border-line px-1 py-3 last:border-b-0"
            } ${pressable ? `${PRESSABLE} ${cards ? "data-[selected]:border-action" : ""}` : ""}`}
            // biome-ignore lint/a11y/useKeyWithClickEvents: only a record something listens to is pressed, and that one takes Enter
            {...press(pressable, () => emit("rowClick", { record: id }), selectedRecord === id, id)}
          >
            {places.picture}
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              {places.title ? (
                <strong className="block truncate font-medium">{places.title}</strong>
              ) : null}
              {places.subtitle ? (
                <span className="truncate text-body-sm text-ink-muted">{places.subtitle}</span>
              ) : null}
              {actions.length > 0 ? (
                <span className="mt-1 flex">
                  <RowActionButtons
                    actions={actions}
                    row={row}
                    record={id}
                    props={props}
                    always={props.size.narrow}
                  />
                </span>
              ) : null}
            </span>
            {places.right || places.badge ? (
              <span className="flex shrink-0 flex-col items-end gap-1">
                {places.right ? <span className="font-medium">{places.right}</span> : null}
                {places.badge}
              </span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
  return (
    <>
      <RowsBox label={`${props.title ?? "Rows"} rows`}>
        {groups
          ? groups.map((group) => (
              <section key={group.id} aria-label={group.name} data-row-group={group.id}>
                <h3 className="m-0 border-b border-line px-1 pt-3 pb-1.5 text-meta font-semibold text-ink-muted">
                  <GroupHeading group={group} />
                </h3>
                {listOf(group.rows)}
              </section>
            ))
          : listOf(rows.rows.map((row, at) => ({ row, id: rowId(row, at) })))}
      </RowsBox>
      <ShowMore data={rows} />
    </>
  );
}
