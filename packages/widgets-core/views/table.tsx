import { Button, OnHeading, Toggletip } from "@volvel/ui";
import { ChevronDown, ChevronUp } from "@volvel/ui/icons";
import type { ColumnInfo, RowsData, WidgetViewProps } from "@volvel/widgets";
import { countText } from "@volvel/widgets";
import { type ReactNode, useState } from "react";
import {
  type ColumnSpec,
  cellOf,
  columnsToShow,
  headingOf,
  isNumeric,
  isRight,
  largest,
  rowId,
  sortableColumn,
  sortedBy,
  totalOf,
} from "./cells.tsx";
import { GroupHeading, type GroupRows, groupsOf, type RowGroup, underItsDay } from "./groups.tsx";
import {
  CANNOT_NOW,
  listensTo,
  PRESSABLE,
  press,
  type RowAction,
  RowActionButtons,
  useRunning,
  type WithSelected,
} from "./press.tsx";
import { RowsBox } from "./rowsBox.tsx";

/** A button on the table's heading line: the shape of an Action group's. */
interface TableButton {
  id: string;
  label: string;
  tone?: "primary" | "default" | "danger";
  action: unknown;
}

interface TableConfig {
  columns?: ColumnSpec[];
  pageSize?: number;
  rowActions?: RowAction[];
  buttons?: TableButton[];
  /** Checkboxes, so a row action runs on every row chosen. */
  select?: boolean;
  rowHeight?: "comfortable" | "compact";
  /** What the table says with no rows. The host draws it; see `PageView`. */
  empty?: string;
  stripes?: boolean;
  /** A heading over the rows of each day, or of each value of a column. */
  groupRows?: GroupRows;
}

/** "Show more", for a view whose rows come a page at a time. */
export function ShowMore({ data }: { data: RowsData }) {
  if (!data.more) return null;
  const left = data.total !== undefined ? data.total - data.rows.length : undefined;
  return (
    <div className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
      {data.total !== undefined ? (
        <span role="status" className="text-body-sm text-ink-muted tabular-nums">
          Showing {countText(data.rows.length)} of {countText(data.total)}
        </span>
      ) : null}
      <Button size="small" onClick={() => data.more?.()}>
        {left !== undefined && left > 0
          ? `Show ${countText(Math.min(left, data.rows.length))} more`
          : "Show more"}
      </Button>
    </div>
  );
}

/**
 * A long value is cut to two lines, whole in its tooltip (and in the record's detail), so that one
 * long value does not make a row twelve lines tall. A word with no break in it breaks anywhere.
 */
const LONG_VALUE = 40;
export const clamped = (value: unknown, node: ReactNode): ReactNode =>
  typeof value === "string" && value.length > LONG_VALUE ? (
    <span title={value} className="line-clamp-2 [overflow-wrap:anywhere]">
      {node}
    </span>
  ) : (
    node
  );

type Shown = { spec: ColumnSpec; info: ColumnInfo | undefined }[];

const VARIANT = { primary: "primary", default: "secondary", danger: "danger-solid" } as const;

/** The buttons above the table: each runs its action, grayed with its reason when it may not be pressed. */
function TableButtons({
  buttons,
  props,
}: {
  buttons: readonly TableButton[];
  props: Pick<WidgetViewProps, "act" | "can" | "why" | "building" | "viewing">;
}) {
  const { running, run } = useRunning();
  if (buttons.length === 0) return null;
  return (
    <OnHeading>
      {/* On the widget's heading row, beside its title; with no such row, above the table. */}
      <div
        data-table-buttons=""
        className="flex flex-wrap items-center justify-end gap-2 [:not([data-heading-controls])>&]:mb-2 [[data-heading-controls]>&]:my-0.5"
      >
        {buttons.map((one, at) => {
          const where = `config/buttons/${at}/action`;
          const inert = !props.viewing && (props.building || !props.act);
          const allowed = inert ? false : (props.can?.(where) ?? true);
          return (
            <Button
              key={one.id}
              size="small"
              variant={VARIANT[one.tone ?? (at === 0 ? "primary" : "default")]}
              disabled={!allowed || running !== undefined}
              loading={running === one.id}
              tooltip={
                !allowed && (!props.building || props.viewing)
                  ? (props.why?.(where) ?? CANNOT_NOW)
                  : undefined
              }
              onClick={() => void run(one.id, () => props.act?.(where))}
            >
              {one.label}
            </Button>
          );
        })}
      </div>
    </OnHeading>
  );
}

/**
 * The bar that appears with rows chosen: how many, the row actions that may be run on every one
 * of them, and Clear. An action that may not be run on one of them is not offered.
 */
/** The most rows an action is run on at once: what the server takes. */
export const MAX_CHOSEN = 200;

/** Whether an action's steps show rows or narrow the page, which the server does for one row only. */
const forOneRow = (action: unknown): boolean =>
  Array.isArray((action as { steps?: unknown } | undefined)?.steps) &&
  (action as { steps: { do?: string }[] }).steps.some(
    (step) => step.do === "rows" || step.do === "narrow",
  );

function ChosenBar({
  count,
  note,
  rows,
  actions,
  props,
  onClear,
  onDone,
}: {
  count: number;
  /** Said after the count: that only the rows shown can be chosen, when more are waiting. */
  note?: string | undefined;
  rows: readonly Readonly<Record<string, unknown>>[];
  actions: readonly RowAction[];
  props: Pick<WidgetViewProps, "act" | "can" | "why" | "building" | "viewing">;
  onClear: () => void;
  onDone: () => void;
}) {
  const { running, run } = useRunning();
  const offered = actions
    .map((item, at) => ({ item, where: `config/rowActions/${at}/action` }))
    .filter(
      ({ item, where }) =>
        !props.building &&
        props.act &&
        // Showing rows or narrowing the page is for one row: the server refuses it for several.
        (rows.length < 2 || !forOneRow(item.action)) &&
        rows.every((row) => props.can?.(where, row) ?? true),
    );
  return (
    <section
      aria-label="Rows chosen"
      className="mb-2 flex flex-wrap items-center gap-2 rounded-control border border-action bg-action-soft px-3 py-1.5 text-body-sm"
    >
      <strong className="font-medium">{count} chosen</strong>
      {note ? <span className="text-ink-muted">{note}</span> : null}
      {count >= MAX_CHOSEN ? <span className="text-ink-muted">{MAX_CHOSEN} at most.</span> : null}
      {offered.map(({ item, where }) => (
        <Button
          key={item.id}
          size="small"
          variant={item.tone === "danger" ? "danger" : "quiet"}
          disabled={running !== undefined}
          loading={running === item.id}
          onClick={() =>
            void run(item.id, async () => {
              const ids = rows.map((row, at) => rowId(row, at));
              const outcome = await props.act?.(where, { records: ids });
              if (outcome?.ok) onDone();
              return outcome ?? { ok: false as const, message: "" };
            })
          }
        >
          {item.label}
        </Button>
      ))}
      <Button size="small" variant="quiet" className="ml-auto" onClick={onClear}>
        Clear
      </Button>
    </section>
  );
}

const CHECKBOX = "size-4 accent-(--vx-action)";

/**
 * A table as a list, which is what it is on a phone (board 6): the first column is the title,
 * the first figure sits at the right, the first status under it, and the other columns are said
 * in a line under the title. A column with `phone: false` is left out.
 */
export function PhoneRows({
  data,
  specs,
  onRow,
  pressable = false,
  selected,
  actions = [],
  view,
  ticked,
  onTick,
  groupRows,
  groups,
}: {
  data: RowsData;
  specs: ColumnSpec[] | undefined;
  onRow: (id: string) => void;
  /** Something listens for a row being pressed: it is drawn so. */
  pressable?: boolean;
  /** The row whose sheet is open, or that was chosen. */
  selected?: string | undefined;
  actions?: readonly RowAction[];
  view?: Pick<WidgetViewProps, "act" | "can" | "why" | "building" | "viewing">;
  /** With rows to tick: which are, and how to tick one. */
  ticked?: ReadonlySet<string>;
  onTick?: (id: string, on: boolean) => void;
  /** With the rows grouped: by what, and the groups. */
  groupRows?: GroupRows | undefined;
  groups?: readonly RowGroup[] | undefined;
}) {
  const shown = columnsToShow(specs, data).filter(({ spec }) => spec.phone !== false);
  const [head, ...rest] = shown;
  if (!head) return null;
  const isBadge = ({ spec, info }: Shown[number]) =>
    spec.as === "badge" || (spec.as !== "text" && info?.type === "enum");
  const badge = rest.find(isBadge);
  const right = rest.find((one) => one !== badge && isNumeric(one.info));
  const under = rest.filter((one) => one !== badge && one !== right);
  const drawn = (column: string, value: unknown, spec: ColumnSpec, info: ColumnInfo | undefined) =>
    underItsDay(groupRows, data, column, value) ?? cellOf(spec, info, value, data);
  const listOf = (items: readonly { row: Readonly<Record<string, unknown>>; id: string }[]) => (
    <ul className="m-0 flex list-none flex-col p-0">
      {items.map(({ row, id }) => {
        const lines = under
          .map(({ spec, info }) => ({
            key: spec.column,
            value: row[spec.column],
            node: drawn(spec.column, row[spec.column], spec, info),
          }))
          .filter((one) => one.value !== null && one.value !== undefined && one.value !== "");
        return (
          <li
            key={id}
            className={`group/row flex items-start gap-3 border-b border-line px-1 py-3 last:border-b-0 ${
              pressable ? `${PRESSABLE} data-[selected]:bg-action-soft` : ""
            }`}
            // biome-ignore lint/a11y/useKeyWithClickEvents: only a row something listens to is pressed, and that one takes Enter
            {...press(pressable, () => onRow(id), selected === id, id)}
          >
            {onTick ? (
              <input
                type="checkbox"
                className={`${CHECKBOX} mt-1 shrink-0`}
                aria-label={`Choose ${String(row[head.spec.column] ?? id)}`}
                checked={ticked?.has(id) ?? false}
                onClick={(event) => event.stopPropagation()}
                onChange={(event) => onTick(id, event.currentTarget.checked)}
              />
            ) : null}
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <strong className="block truncate font-medium">
                {drawn(head.spec.column, row[head.spec.column], head.spec, head.info)}
              </strong>
              {lines.length > 0 ? (
                <span className="flex flex-wrap items-baseline gap-x-1 text-body-sm text-ink-muted">
                  {lines.map((one, index) => (
                    <span key={one.key} className="min-w-0 break-words">
                      {index > 0 ? <span aria-hidden="true">· </span> : null}
                      {clamped(one.value, one.node)}
                    </span>
                  ))}
                </span>
              ) : null}
              {view && actions.length > 0 ? (
                <span className="mt-1 flex">
                  <RowActionButtons actions={actions} row={row} record={id} props={view} always />
                </span>
              ) : null}
            </span>
            {right || badge ? (
              <span className="flex shrink-0 flex-col items-end gap-1">
                {right ? (
                  <span className="font-medium">
                    {cellOf(right.spec, right.info, row[right.spec.column], data)}
                  </span>
                ) : null}
                {badge ? cellOf(badge.spec, badge.info, row[badge.spec.column], data) : null}
              </span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
  return groups ? (
    <div className="contents">
      {groups.map((group) => (
        <section key={group.id} aria-label={group.name} data-row-group={group.id}>
          <h3 className="m-0 border-b border-line px-1 pt-3 pb-1.5 text-meta font-semibold text-ink-muted">
            <GroupHeading group={group} />
          </h3>
          {listOf(group.rows)}
        </section>
      ))}
    </div>
  ) : (
    listOf(data.rows.map((row, at) => ({ row, id: rowId(row, at) })))
  );
}

export function TableView(props: WithSelected<TableConfig>) {
  const { config, data, size, emit, building, selectedRecord } = props;
  const [own, setOwn] = useState<{ column: string; descending: boolean }>();
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set());
  const rows = data.rows;
  if (rows?.shape !== "rows") return null;
  // Rows that come a page at a time are put in order by the server, over all of them; the rest, here.
  const remote = rows.sortBy !== undefined;
  const sort = remote ? rows.sorted : own;
  const setSort = remote ? (rows.sortBy as NonNullable<RowsData["sortBy"]>) : setOwn;
  const shown = columnsToShow(config.columns, rows);
  const pressable = listensTo(props, "rowClick");
  const actions = config.rowActions ?? [];
  const buttons = config.buttons ?? [];
  const sortable =
    sort &&
    shown.some(({ spec, info }) => spec.column === sort.column && sortableColumn(spec, info));
  // Sorting is of the rows read: the rows shown, in the browser.
  const ordered =
    sortable && !remote ? sortedBy(rows.rows, rows, sort.column, sort.descending) : rows.rows;
  const groups = groupsOf(rows, config.groupRows, ordered);
  const idOf = (row: Record<string, unknown>) => rowId(row, rows.rows.indexOf(row));
  // Only rows that are still there stay chosen (an action ran, or the filters changed).
  const here = new Set(ordered.map(idOf));
  const chosen = [...ticked].filter((id) => here.has(id));
  const chosenRows = ordered.filter((row) => ticked.has(idOf(row)));
  const tick = (id: string, on: boolean) =>
    setTicked((now) => {
      const next = new Set(now);
      if (on) {
        // At most what an action is run on at once.
        if (next.size < MAX_CHOSEN) next.add(id);
      } else next.delete(id);
      return next;
    });
  const selecting = config.select === true;
  // Nothing to list: the frame says so, and the buttons stay on the heading row, still pressable.
  if (rows.rows.length === 0) return <TableButtons buttons={buttons} props={props} />;
  const bar =
    selecting && chosen.length > 0 ? (
      <ChosenBar
        count={chosen.length}
        note={
          rows.more
            ? `Only the ${countText(rows.rows.length)} rows shown can be chosen.`
            : undefined
        }
        rows={chosenRows}
        actions={actions}
        props={props}
        onClear={() => setTicked(new Set())}
        onDone={() => setTicked(new Set())}
      />
    ) : null;
  // On a phone a table is drawn as a list: the definition says so.
  if (size.narrow) {
    return (
      <>
        <TableButtons buttons={buttons} props={props} />
        {bar}
        <PhoneRows
          data={{ ...rows, rows: ordered }}
          specs={config.columns}
          onRow={(record) => emit("rowClick", { record })}
          pressable={pressable}
          selected={selectedRecord}
          actions={actions}
          view={props}
          groupRows={config.groupRows}
          groups={groups}
          {...(selecting ? { ticked, onTick: tick } : {})}
        />
        <ShowMore data={rows} />
      </>
    );
  }
  const most = new Map(shown.map(({ spec }) => [spec.column, largest(rows.rows, spec.column)]));
  const pad = config.rowHeight === "compact" ? "py-1" : "py-[9px]";
  const totals = shown.some(({ spec }) => spec.total);
  const allTicked = ordered.length > 0 && chosen.length === Math.min(ordered.length, MAX_CHOSEN);
  const edge = "px-3";
  const rowOf = (row: Readonly<Record<string, unknown>>, id: string, at: number) => {
    return (
      <tr
        key={id}
        data-box-row=""
        className={`group/row border-b border-line/70 last:border-b-0 ${
          config.stripes && at % 2 === 1 ? "bg-sunken/50" : ""
        } ${pressable ? PRESSABLE : ""}`}
        // biome-ignore lint/a11y/useKeyWithClickEvents: only a row something listens to is pressed, and that one takes Enter
        {...press(pressable, () => emit("rowClick", { record: id }), selectedRecord === id, id)}
      >
        {selecting ? (
          <td className={`${edge} ${pad} align-middle`}>
            <input
              type="checkbox"
              className={CHECKBOX}
              aria-label={`Choose ${String(row[shown[0]?.spec.column ?? "id"] ?? id)}`}
              checked={ticked.has(id)}
              onClick={(event) => event.stopPropagation()}
              onChange={(event) => tick(id, event.currentTarget.checked)}
            />
          </td>
        ) : null}
        {shown.map(({ spec, info }) => (
          <td
            key={spec.column}
            style={spec.width === "fixed" ? { width: "10rem", maxWidth: "10rem" } : undefined}
            className={`${edge} ${pad} align-middle ${isRight(spec, info) ? "text-right" : ""} ${
              spec.width === "fixed" ? "truncate" : ""
            } ${
              // A number, a date or a code is never broken across lines ("INV-" and "9338").
              typeof row[spec.column] === "number" ||
              info?.type === "timestamp" ||
              info?.type === "date" ||
              (typeof row[spec.column] === "string" && (row[spec.column] as string).length <= 20)
                ? "whitespace-nowrap"
                : ""
            }`}
          >
            {clamped(
              row[spec.column],
              underItsDay(config.groupRows, rows, spec.column, row[spec.column]) ??
                cellOf(spec, info, row[spec.column], rows, most.get(spec.column)),
            )}
          </td>
        ))}
        {actions.length > 0 ? (
          <td className={`${edge} ${pad} text-right align-middle whitespace-nowrap`}>
            <RowActionButtons
              actions={actions}
              row={row}
              record={id}
              props={props}
              always={false}
            />
          </td>
        ) : null}
      </tr>
    );
  };
  return (
    <>
      <TableButtons buttons={buttons} props={props} />
      {bar}
      <RowsBox label={`${props.title ?? "Rows"} rows`}>
        {/* table-allowed: a widget's rows are drawn by its view, which the page owns; the kit's grid is for editing data */}
        <table className="w-full border-collapse text-left text-[13.5px]">
          <thead>
            <tr>
              {selecting ? (
                <th
                  scope="col"
                  className="sticky top-0 w-8 border-b border-line bg-surface px-3 py-2"
                >
                  <input
                    type="checkbox"
                    className={CHECKBOX}
                    aria-label={rows.more ? "Choose every row shown" : "Choose every row"}
                    checked={allTicked}
                    onChange={(event) =>
                      setTicked(
                        event.currentTarget.checked
                          ? new Set(ordered.slice(0, MAX_CHOSEN).map(idOf))
                          : new Set(),
                      )
                    }
                  />
                </th>
              ) : null}
              {shown.map(({ spec, info }) => {
                const text = headingOf(spec, rows);
                const sorting = sortableColumn(spec, info) && !building;
                const on = sorting && sort?.column === spec.column ? sort : undefined;
                return (
                  <th
                    key={spec.column}
                    scope="col"
                    aria-sort={
                      on
                        ? on.descending
                          ? "descending"
                          : "ascending"
                        : sorting
                          ? "none"
                          : undefined
                    }
                    style={
                      spec.width === "fixed" ? { width: "10rem", maxWidth: "10rem" } : undefined
                    }
                    className={`sticky top-0 border-b border-line bg-surface ${edge} py-2 text-meta font-medium whitespace-nowrap text-ink-muted ${
                      isRight(spec, info) ? "text-right" : ""
                    }`}
                  >
                    {building ? (
                      <button
                        type="button"
                        title="Change this column"
                        className="rounded-inner font-medium text-inherit hover:text-ink"
                        onClick={(event) => {
                          event.stopPropagation();
                          // The builder opens this column's settings: `PageView` hands it to `editing.onColumn`.
                          emit("column", { group: { column: spec.column } });
                        }}
                      >
                        {text}
                      </button>
                    ) : (
                      <>
                        {sorting ? (
                          <button
                            type="button"
                            title={`Sort by ${text}`}
                            className="inline-flex items-center gap-1 rounded-inner font-medium text-inherit hover:text-ink focus-visible:outline-2 focus-visible:outline-action"
                            onClick={() =>
                              // Ascending, then descending, then as read.
                              setSort(
                                !on
                                  ? { column: spec.column, descending: false }
                                  : on.descending
                                    ? undefined
                                    : { column: spec.column, descending: true },
                              )
                            }
                          >
                            {text}
                            {on ? (
                              on.descending ? (
                                <ChevronDown aria-hidden="true" size={14} />
                              ) : (
                                <ChevronUp aria-hidden="true" size={14} />
                              )
                            ) : null}
                          </button>
                        ) : (
                          text
                        )}
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
          {groups ? (
            groups.map((group) => (
              <tbody key={group.id} data-row-group={group.id}>
                <tr>
                  <th
                    scope="rowgroup"
                    colSpan={shown.length + (selecting ? 1 : 0) + (actions.length > 0 ? 1 : 0)}
                    className={`border-b border-line ${edge} pt-3 pb-1.5 text-left text-meta font-semibold text-ink-muted`}
                  >
                    <GroupHeading group={group} />
                  </th>
                </tr>
                {group.rows.map(({ row, id }, at) => rowOf(row, id, at))}
              </tbody>
            ))
          ) : (
            <tbody>{ordered.map((row, at) => rowOf(row, rowId(row, at), at))}</tbody>
          )}
          {totals ? (
            <tfoot>
              <tr className="border-t border-line-strong font-medium">
                {selecting ? <td className={`${edge} ${pad}`} /> : null}
                {shown.map(({ spec, info }, index) => (
                  <td
                    key={spec.column}
                    className={`${edge} ${pad} align-middle ${isRight(spec, info) ? "text-right" : ""}`}
                  >
                    {spec.total ? (
                      <span className="tabular-nums">{totalOf(rows.rows, spec, info)}</span>
                    ) : index === 0 ? (
                      <span className="text-ink-muted">Total</span>
                    ) : null}
                  </td>
                ))}
                {actions.length > 0 ? <td /> : null}
              </tr>
            </tfoot>
          ) : null}
        </table>
      </RowsBox>
      <ShowMore data={rows} />
    </>
  );
}
