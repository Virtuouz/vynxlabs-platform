/**
 * The Display and Actions tabs of a Table (boards 12 and 13): the columns as a list to reorder,
 * hide and open, the look of the rows, what a click on a row does, the row actions, the buttons
 * above the table, and selecting rows. Each section is one component that takes the inspector's
 * `Env`; the shell draws it in place of the generic rows for the tab.
 */
import type { PageWidget } from "@volvel/manifest";
import {
  DashedAdd,
  DrawerBlock,
  DrawerEditor,
  DrawerRow,
  NumberField,
  SegmentedControl,
  SortableRows,
  TextField,
  ToggleRow,
} from "@volvel/ui";
import { ListOrdered, Trash2, Type, Zap } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { ActionControl } from "../actionControls.tsx";
import type { Action } from "../actionModel.ts";
import { conditionSentence } from "../actionModel.ts";
import type { Env } from "../controls.tsx";
import { configSettings, heading, uniqueName, withConfig } from "../model.ts";
import { ActionRules } from "../RulesTab.tsx";
import { AnchoredColumnEditor, CanvasColumnEditor } from "./ColumnEditor.tsx";
import {
  type ColumnSetting,
  columnsOf,
  headingOf,
  shownAs,
  shownCount,
  unused,
  withColumn,
} from "./columnModel.ts";
import { clearColumnRequest, useColumnRequest } from "./columnRequest.ts";
import { FullSegments } from "./FullSegments.tsx";
import { Section } from "./Section.tsx";
import { type TableSource, useTableData } from "./tableData.ts";

/** What every section of these drawers is given. */
export interface TableSectionProps extends TableSource {
  env: Env;
  /** Only the group's rows: the shell draws the group. */
  bare?: boolean;
}

const writeConfig = (env: Env, name: string, value: unknown, label: string, key?: string) =>
  env.write(withConfig(env.widget, name, value), label, key);

// ---------------------------------------------------------------------------
// Display

/** COLUMNS: a row for each, to drag, hide and open. */
export function TableColumnsSection({ env, bare, ...source }: TableSectionProps) {
  const { names, facts } = useTableData(env, source);
  const stored = env.config.columns as ColumnSetting[] | undefined;
  const columns = columnsOf(stored, names);
  const request = useColumnRequest(env.widget.id);
  const [open, setOpen] = useState<{ column: string; canvas: boolean } | undefined>();
  const holder = useRef<HTMLDivElement>(null);

  // A click on a heading of the canvas asks for that column: its row is lit, and its editor opens
  // beside the heading (or beside the row, where the request is not from the canvas).
  const serial = request?.serial;
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once for each request
  useEffect(() => {
    if (request) setOpen({ column: request.column, canvas: request.fromCanvas });
  }, [serial]);

  const set = (next: ColumnSetting[]) => writeConfig(env, "columns", next, "changing columns");
  const close = () => {
    setOpen(undefined);
    clearColumnRequest();
  };
  const spec = open ? columns.find((one) => one.column === open.column) : undefined;
  const factsOfOpen = facts.find((one) => one.name === open?.column);
  const change = (patch: Partial<ColumnSetting>) => {
    if (!open) return;
    // A table that lists no columns yet lists them all as soon as one is changed.
    set(withColumn(columns, open.column, patch));
  };
  const rowAt = (column: string) =>
    holder.current?.querySelectorAll<HTMLElement>("li")[
      columns.findIndex((one) => one.column === column)
    ];
  const left = unused(columns, names);

  return (
    <Section
      bare={bare}
      label="Columns"
      aside={shownCount(columns)}
      note="Drag to reorder, the eye to hide, click to rename or format. Clicking a heading on the page opens the same thing."
    >
      <div ref={holder}>
        <SortableRows
          label="Columns"
          activeId={open?.column}
          items={columns.map((one) => ({
            id: one.column,
            label: headingOf(one),
            ...(one.label ? { sub: `from ${heading(one.column)}` } : {}),
            value: shownAs(
              one,
              facts.find((fact) => fact.name === one.column),
            ),
            hidden: one.hidden === true,
          }))}
          onReorder={(ids) =>
            set(
              ids.flatMap((id) => {
                const one = columns.find((column) => column.column === id);
                return one ? [one] : [];
              }),
            )
          }
          onToggleHidden={(id, hidden) => set(withColumn(columns, id, { hidden }))}
          onOpen={(id) => setOpen({ column: id, canvas: false })}
        />
      </div>
      <div className="px-3 py-3">
        <DrawerEditor
          title="Add a column"
          footer={false}
          side="left"
          trigger={
            <button
              type="button"
              className="inline-flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-control border border-dashed border-line-strong px-3 text-body-sm text-ink-muted outline-offset-2 hover:border-action hover:text-ink focus-visible:outline-2 focus-visible:outline-focus"
            >
              <span aria-hidden="true">+</span>
              Column
            </button>
          }
        >
          {left.length ? (
            <ul className="m-0 flex list-none flex-col p-0">
              {left.map((name) => (
                <li key={name}>
                  <button
                    type="button"
                    onClick={() => set([...columns, { column: name }])}
                    className="flex h-9 w-full cursor-pointer items-center rounded-control px-2 text-left text-body-sm text-ink hover:bg-selected"
                  >
                    {heading(name)}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="m-0 text-body-sm text-ink-muted">Every column is already here.</p>
          )}
        </DrawerEditor>
      </div>
      {spec && open && !open.canvas ? (
        <AnchoredColumnEditor
          find={() => rowAt(open.column)}
          spec={spec}
          facts={factsOfOpen}
          onChange={change}
          open={true}
          onClose={close}
          side="left"
        />
      ) : null}
      {spec && open?.canvas ? (
        <CanvasColumnEditor
          widget={env.widget.id}
          spec={spec}
          facts={factsOfOpen}
          onChange={change}
          open={true}
          onClose={close}
        />
      ) : null}
    </Section>
  );
}

/** LOOK: row height, rows at a time, what an empty table says, stripes. */
export function TableLookSection({ env, bare }: TableSectionProps) {
  const config = env.config;
  const height = config.rowHeight === "compact" ? "compact" : "comfortable";
  const pageSize = typeof config.pageSize === "number" ? config.pageSize : 25;
  const empty = typeof config.empty === "string" ? config.empty : "";
  const put = (name: string, value: unknown, label: string, key?: string) =>
    writeConfig(env, name, value, label, key ?? `config:${env.widget.id}:${name}`);
  return (
    <Section bare={bare} label="Look">
      <DrawerBlock label="Row height">
        <FullSegments>
          <SegmentedControl
            label="Row height"
            value={height}
            options={[
              { value: "comfortable", label: "Comfortable" },
              { value: "compact", label: "Compact" },
            ]}
            onChange={(next) => put("rowHeight", next, "changing row height")}
          />
        </FullSegments>
      </DrawerBlock>
      <DrawerRow
        label="Rows at a time"
        icon={ListOrdered}
        value={`${pageSize}, then pages`}
        editorTitle="Rows at a time"
        editor={
          <NumberField
            name={`${env.widget.id}-pageSize`}
            label="Rows at a time"
            required={false}
            min={5}
            max={200}
            step={1}
            value={pageSize}
            hint="Between 5 and 200. More are on the next pages."
            onChange={(n) => {
              if (n !== undefined && n >= 5 && n <= 200) {
                put("pageSize", Math.round(n), "changing rows at a time");
              }
            }}
          />
        }
      />
      <DrawerRow
        label="When empty"
        icon={Type}
        // Unset, it says what the page says for it: the words the view draws (`PageView`).
        value={
          empty ? (
            `“${empty}”`
          ) : (
            <span className="text-ink-muted">
              {`“${env.filters.length > 0 ? "Nothing matches the filters." : "There is nothing here yet."}”`}
            </span>
          )
        }
        editorTitle="When empty"
        editor={
          <TextField
            name={`${env.widget.id}-empty`}
            label="What the table says"
            required={false}
            maxLength={200}
            value={empty}
            placeholder={
              env.filters.length > 0 ? "Nothing matches the filters." : "There is nothing here yet."
            }
            hint="Shown when there are no rows."
            onChange={(text) => put("empty", text, "changing what an empty table says")}
          />
        }
      />
      <ToggleRow
        label="Stripe rows"
        checked={config.stripes === true}
        onChange={(next) => put("stripes", next || undefined, "changing stripes")}
      />
    </Section>
  );
}

/** The Display tab of a Table: the columns, then the look. */
export function TableDisplay(props: TableSectionProps) {
  return (
    <>
      <TableColumnsSection {...props} />
      <TableLookSection {...props} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Actions

type Labelled = { id: string; label: string; tone?: string; action: Action };

/** What an action says in a line: when it may be pressed, or whether it asks first. */
export function actionSummary(action: Action | undefined): string {
  if (!action) return "Nothing yet";
  const when = action.when?.length
    ? `Only when ${action.when.map((one) => conditionSentence(one)).join(" and ")}`
    : undefined;
  if (when) return when;
  if (action.confirm) return "Asks to confirm";
  const steps = action.steps.length;
  return steps ? `${steps} step${steps === 1 ? "" : "s"}` : "No steps yet";
}

/**
 * A list of labelled actions as rows ("Mark paid · Only when Status is Unpaid"), each opening
 * its action's editor, and a dashed add. The editor is the action editor the inspector has today;
 * the step editor of the Actions tab takes its place.
 */
function ActionRows({
  env,
  bare,
  name,
  group,
  noun,
  addLabel,
  firstLabel,
  note,
  icon,
}: {
  env: Env;
  name: "rowActions" | "buttons";
  group: string;
  noun: string;
  addLabel: string;
  firstLabel: string;
  note: ReactNode;
  icon: typeof Zap | undefined;
  bare?: boolean | undefined;
}) {
  const list = (Array.isArray(env.config[name]) ? env.config[name] : []) as Labelled[];
  const setting = configSettings(env.definition, "actions").find((one) => one.name === name);
  const max = typeof setting?.schema.maxItems === "number" ? setting.schema.maxItems : 6;
  const put = (next: Labelled[], label: string, key?: string) =>
    writeConfig(env, name, next, label, key);
  const [openId, setOpenId] = useState<string | undefined>();
  const add = () => {
    const id = uniqueName(
      firstLabel,
      list.map((one) => one.id),
      noun,
      "-",
    );
    put([...list, { id, label: firstLabel, action: { steps: [] } }], `adding ${noun}`);
    setOpenId(id);
  };
  return (
    <Section bare={bare} label={group} note={note}>
      {list.map((one) => (
        <DrawerRow
          key={one.id}
          label={one.label || firstLabel}
          {...(icon ? { icon } : {})}
          value={actionSummary(one.action)}
          editorTitle={one.label || firstLabel}
          open={openId === one.id}
          onOpenChange={(next) => setOpenId(next ? one.id : undefined)}
          editor={
            <div className="flex flex-col gap-3">
              <TextField
                name={`${env.widget.id}-${one.id}-label`}
                label="Says"
                required={false}
                maxLength={40}
                value={one.label}
                onChange={(text) =>
                  put(
                    list.map((was) => (was.id === one.id ? { ...was, label: text } : was)),
                    `changing ${noun}`,
                    `${name}:${env.widget.id}:${one.id}:label`,
                  )
                }
              />
              <ActionControl
                env={env}
                id={`${env.widget.id}-${one.id}`}
                label={`What ${one.label || noun} does`}
                help={undefined}
                action={one.action}
                onChange={(next, key) =>
                  put(
                    list.map((was) =>
                      was.id === one.id ? { ...was, action: next ?? { steps: [] } } : was,
                    ),
                    `changing ${noun}`,
                    key === undefined ? undefined : `${name}:${env.widget.id}:${one.id}:${key}`,
                  )
                }
              />
              <ActionRules
                env={env}
                id={`${env.widget.id}-${one.id}-rules`}
                action={one.action}
                onChange={(next, key) =>
                  put(
                    list.map((was) => (was.id === one.id ? { ...was, action: next } : was)),
                    `changing who can run ${noun}`,
                    key === undefined ? undefined : `${name}:${env.widget.id}:${one.id}:${key}`,
                  )
                }
              />
              <button
                type="button"
                onClick={() => {
                  setOpenId(undefined);
                  put(
                    list.filter((was) => was.id !== one.id),
                    `removing ${noun}`,
                  );
                }}
                className="inline-flex h-8 w-fit cursor-pointer items-center gap-1.5 rounded-control px-2 text-body-sm text-danger outline-offset-2 hover:bg-danger-soft focus-visible:outline-2 focus-visible:outline-focus"
              >
                <Trash2 aria-hidden="true" size={14} />
                Remove {one.label || noun}
              </button>
            </div>
          }
        />
      ))}
      {list.length < max ? (
        <div className="px-3 py-3">
          <DashedAdd inline onClick={add}>
            {addLabel}
          </DashedAdd>
        </div>
      ) : null}
    </Section>
  );
}

/** "Open Invoice detail", from the action a click on a row runs. */
export function rowClickWords(widget: PageWidget, env: Pick<Env, "pages">) {
  const click = widget.on?.rowClick;
  if (!click) return { does: undefined, opensAs: undefined };
  const open = click.steps.find((step) => step.do === "open");
  if (open?.do !== "open") {
    return { does: actionSummary(click), opensAs: undefined };
  }
  const page = env.pages.find((one) => one.id === open.page);
  const opensAs =
    page?.kind === "sheet"
      ? "Side sheet"
      : page?.kind === "modal"
        ? "Modal"
        : page
          ? "Full page"
          : undefined;
  return { does: `Open ${page?.title ?? open.page}`, opensAs };
}

/**
 * WHEN A ROW IS CLICKED: "Do" and "Opens as". The click's editor is the one editor the builder
 * has today (the action editor, and the offer to make a detail when nothing happens yet); pass
 * `rowClickEditor` to draw another in its place.
 */
export function TableRowClickSection({ env, bare }: TableSectionProps) {
  const click = env.widget.on?.rowClick;
  const { does, opensAs } = rowClickWords(env.widget, env);
  // The builder's editor (board 3: radio cards, the detail chosen, "Opens as") is what each row opens.
  const editor = env.rowClickEditor ? (
    <div className="[&_h3]:sr-only">{env.rowClickEditor}</div>
  ) : (
    <div className="flex flex-col gap-3">
      <ActionControl
        env={env}
        id={`${env.widget.id}-rowClick`}
        label="When a row is clicked"
        help={undefined}
        action={click}
        onChange={(next, key) => {
          const { rowClick: _gone, ...rest } = env.widget.on ?? {};
          const on = next ? { ...rest, rowClick: next } : rest;
          const { on: _before, ...widget } = env.widget;
          env.write(
            Object.keys(on).length ? { ...widget, on } : widget,
            "changing what a click on a row does",
            key === undefined ? undefined : `rowClick:${env.widget.id}:${key}`,
          );
        }}
      />
    </div>
  );
  return (
    <Section bare={bare} label="When a row is clicked">
      <DrawerRow
        label="Do"
        value={does ?? "Nothing"}
        editorTitle="When a row is clicked"
        editor={editor}
      />
      <DrawerRow
        label="Opens as"
        value={opensAs}
        editorTitle="Opens as"
        editor={
          env.rowClickEditor ? (
            <div className="[&_h3]:sr-only">{env.rowClickEditor}</div>
          ) : (
            <p className="m-0 text-body-sm text-ink-muted">
              A page that opens on the row clicked is opened as a side sheet, a full page or a
              modal, as its page is set.
            </p>
          )
        }
      />
    </Section>
  );
}

export const ROW_ACTIONS_NOTE = "Shown at the end of the row on hover, and in the detail sheet.";
export const BUTTONS_NOTE =
  "Replaces the separate action group placed above the table today. The buttons move with the table.";

/** ROW ACTIONS: each with when it may be pressed. */
export function TableRowActionsSection({ env, bare }: TableSectionProps) {
  return (
    <ActionRows
      env={env}
      bare={bare}
      name="rowActions"
      group="Row actions"
      noun="row action"
      addLabel="Row action"
      firstLabel="Action"
      icon={Zap}
      note={ROW_ACTIONS_NOTE}
    />
  );
}

/** BUTTONS ABOVE THE TABLE. */
export function TableButtonsSection({ env, bare }: TableSectionProps) {
  return (
    <ActionRows
      env={env}
      bare={bare}
      name="buttons"
      group="Buttons above the table"
      noun="button"
      addLabel="Button"
      firstLabel="Button"
      icon={undefined}
      note={BUTTONS_NOTE}
    />
  );
}

/** SELECTING ROWS. */
export function TableSelectSection({ env, bare }: TableSectionProps) {
  return (
    <Section bare={bare} label="Selecting rows">
      <ToggleRow
        label="Let people select several rows"
        help="Adds checkboxes and lets actions run on all of them."
        checked={env.config.select === true}
        onChange={(next) =>
          writeConfig(env, "select", next || undefined, "changing selecting rows")
        }
      />
    </Section>
  );
}

/** The Actions tab of a Table. */
export function TableActions(
  props: TableSectionProps & { rowClickEditor?: ReactNode; rowClickOffer?: ReactNode },
) {
  return (
    <>
      <TableRowClickSection {...props} />
      <TableRowActionsSection {...props} />
      <TableButtonsSection {...props} />
      <TableSelectSection {...props} />
    </>
  );
}
