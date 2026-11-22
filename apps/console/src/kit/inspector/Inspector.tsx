/**
 * The inspector: the settings of the widget that is chosen, drawn from its
 * definition (`@volvel/widgets`) and from nothing else. It knows no widget
 * type by name, so a pack's widget has settings the day it is registered.
 *
 * A header with the widget's title and kind and a ⋯ menu (Layout, Duplicate,
 * Remove); then the tabs its definition has (Data, Display, Actions, Rules),
 * each showing its main settings and one "More … options" disclosure, never
 * deeper (08, S9 §inspector).
 */
import type { Page, PageFilter, PageWidget } from "@volvel/manifest";
import { Button, Details, Menu, NumberField, SegmentedControl, Tabs, TextField } from "@volvel/ui";
import {
  type Surface,
  TAB_TITLES,
  type Tab,
  type WidgetDefinition,
  WidgetRegistry,
} from "@volvel/widgets";
import { ArrowLeft, Copy, Ellipsis, LayoutGrid, Trash2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Link } from "../../router.tsx";
import { formatCombo } from "../keys.ts";
import { ActionEditor, actionContext } from "./actionControls.tsx";
import { type Action, type Condition, conditionSentence, firstCondition } from "./actionModel.ts";
import { ConditionsEditor } from "./conditions.tsx";
import { ConfigControl, type Env } from "./controls.tsx";
import { DataControl } from "./dataControls.tsx";
import {
  type Catalog,
  type ConfigSetting,
  clampPlace,
  configOf,
  configSettings,
  type DataPart,
  dataParts,
  type FlowChoice,
  heading,
  isShown,
  type ScriptChoice,
  type TabFate,
  tabCount,
  tabsOf,
  visualOf,
  withText,
} from "./model.ts";

export interface InspectorProps {
  widget: PageWidget;
  /** Its definition, or nothing when no pack declares its type. */
  definition: WidgetDefinition | undefined;
  /** Where the page is: an app's, or a dashboard's. */
  surface: Surface;
  filters: readonly PageFilter[];
  /** The page's other widgets: a filter narrows a table here as it does there. */
  neighbours?: readonly PageWidget[];
  catalog: Catalog;
  /** Writes the widget as it should now be; `key` joins quick changes into one step to undo. */
  onChange: (next: PageWidget, label: string, key?: string) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  /** Where a table's row rules are changed, if the reader may go there. */
  rowRules?: ((table: string) => string) | undefined;
  /** The page the widget is on (its kind and the table of its record), when it is an app's. */
  page?: Page | undefined;
  /** The interface's pages, for "Open a page" and the `page` setting. */
  pages?: readonly Page[];
  /** The workspace's flows; only those with a manual trigger are offered to "Run a workflow". */
  flows?: readonly FlowChoice[];
  scripts?: readonly ScriptChoice[];
  /** The names of the groups of members, for "the current user is in …". */
  groups?: readonly string[];
  /** Every widget of the page, this one included: a filter followed or a tab removed reaches the others. */
  widgets?: readonly PageWidget[];
  /** Writes the page's widgets as they should now be, for a change that reaches more than this widget. */
  onChangeWidgets?: (next: PageWidget[], label: string, key?: string) => void;
  /** Takes back the last step: offered beside what is removed. */
  onUndo?: () => void;
  /** Adds a Search and filter widget at the top of the page. Left out where the page cannot. */
  onAddFilters?: () => void;
  /** Removes a tab of this container with what it held moved or removed; the container editor's own, when it has one. */
  onRemoveTab?: (tab: string, fate: TabFate) => void;
}

const lower = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

/** What a disclosure holds, in a line: "Sorted by, at most". */
function aboutMore(labels: readonly string[]): string {
  return labels.map((label, at) => (at === 0 ? label : lower(label))).join(", ");
}

export function Inspector(props: InspectorProps) {
  const { widget, definition } = props;
  const [view, setView] = useState<"settings" | "layout">("settings");
  const name = widget.title || definition?.title || widget.id;

  if (!definition) {
    return (
      <div className="flex flex-col gap-3">
        <h2 className="m-0 text-title">{name}</h2>
        <p className="m-0 text-ink-muted">
          There is no widget called “{widget.type}”. A pack that declares it may be missing from
          this workspace. Its place on the page is kept, and nothing is drawn.
        </p>
        <div>
          <Button variant="danger" onClick={props.onRemove}>
            <Trash2 aria-hidden="true" size={14} /> Remove it
          </Button>
        </div>
      </div>
    );
  }

  const pack = WidgetRegistry.packOf(definition.type);
  const kind = pack === "core" ? definition.title : `${definition.title} · ${heading(pack)} pack`;

  if (view === "layout") {
    return (
      <LayoutPanel
        {...props}
        definition={definition}
        kind={definition.title}
        onBack={() => setView("settings")}
      />
    );
  }

  const config = configOf(definition, widget);
  const env: Env = {
    definition,
    widget,
    surface: props.surface,
    filters: props.filters,
    neighbours: props.neighbours ?? [],
    catalog: props.catalog,
    config,
    write: props.onChange,
    page: props.page,
    pages: props.pages ?? [],
    flows: props.flows ?? [],
    scripts: props.scripts ?? [],
    groups: props.groups ?? [],
    widgets: props.widgets ?? [widget, ...(props.neighbours ?? [])],
    writeAll:
      props.onChangeWidgets ??
      ((next, label, key) => {
        const mine = next.find((one) => one.id === widget.id);
        if (mine) props.onChange(mine, label, key);
      }),
    undo: props.onUndo,
    addFilters: props.onAddFilters,
    onRemoveTab: props.onRemoveTab,
  };
  const tabs = tabsOf(definition);

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col">
          <h2 className="m-0 truncate text-title">{name}</h2>
          <p className="m-0 text-meta text-ink-muted">{kind}</p>
        </div>
        <Menu
          ariaLabel={`More about ${name}`}
          align="end"
          triggerClassName="inline-flex size-8 shrink-0 items-center justify-center rounded-control border border-line-control hover:bg-sunken"
          label={<Ellipsis aria-hidden="true" size={16} />}
          items={[
            {
              label: "Layout",
              icon: <LayoutGrid aria-hidden="true" size={14} />,
              onSelect: () => setView("layout"),
            },
            {
              label: "Duplicate",
              icon: <Copy aria-hidden="true" size={14} />,
              keys: formatCombo("Mod+d"),
              onSelect: props.onDuplicate,
            },
            {
              label: "Remove",
              icon: <Trash2 aria-hidden="true" size={14} />,
              danger: true,
              separated: true,
              onSelect: props.onRemove,
            },
          ]}
        />
      </div>
      <Tabs
        dense
        label={`Settings of ${name}`}
        tabs={tabs.map((tab) => {
          const count = tabCount(definition, widget, tab);
          return {
            id: tab,
            label: count ? `${TAB_TITLES[tab]} (${count})` : TAB_TITLES[tab],
            content: <TabBody tab={tab} env={env} rowRules={props.rowRules} />,
          };
        })}
      />
      <p className="m-0 flex items-start gap-2 rounded-control border border-line p-3 text-body-sm text-ink-muted">
        <LayoutGrid aria-hidden="true" size={14} className="mt-0.5 shrink-0" />
        <span>
          Size and position live on the page. Drag, or press the arrow keys.{" "}
          <strong className="font-medium text-ink">⋯ › Layout</strong> for exact values.
        </span>
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// One tab

function TabBody({
  tab,
  env,
  rowRules,
}: {
  tab: Tab;
  env: Env;
  rowRules: InspectorProps["rowRules"];
}) {
  if (tab === "actions") return <ActionsTab env={env} />;
  if (tab === "rules") return <RulesTab env={env} rowRules={rowRules} />;

  const { definition } = env;
  const settings = configSettings(definition, tab).filter((one) => isShown(one.hint, env.config));
  const parts = tab === "data" ? dataParts(definition) : [];
  const main: ReactNode[] = [];
  const more: ReactNode[] = [];
  const moreLabels: string[] = [];
  const inputs = Object.keys(definition.data);

  const drawPart = (part: DataPart) => (
    <DataControl
      key={`${part.input}:${part.control}`}
      env={env}
      input={part.input}
      control={part.control}
      label={part.label}
      help={part.help}
    />
  );
  const drawSetting = (setting: ConfigSetting) => (
    <ConfigControl key={setting.name} env={env} setting={setting} />
  );

  // A widget with several data inputs says which is which.
  for (const input of inputs) {
    const mine = parts.filter((one) => one.input === input);
    const named = definition.data[input]?.label;
    if (mine.length === 0) continue;
    if (inputs.length > 1) {
      main.push(
        <h3 key={`h-${input}`} className="m-0 text-label text-ink-subtle uppercase">
          {named ?? heading(input)}
        </h3>,
      );
    }
    for (const part of mine) {
      if (part.level === "main") main.push(drawPart(part));
      else {
        more.push(drawPart(part));
        moreLabels.push(part.label);
      }
    }
  }
  if (tab === "display") {
    main.push(
      <TextField
        key="title"
        name={`${env.widget.id}-title`}
        label="Title"
        hint="Or click the title on the page."
        required={false}
        maxLength={100}
        value={env.widget.title ?? ""}
        onChange={(text) =>
          env.write(
            withText(env.widget, "title", text),
            "renaming the widget",
            `title:${env.widget.id}`,
          )
        }
      />,
      <TextField
        key="subtitle"
        name={`${env.widget.id}-subtitle`}
        label="A line under the title"
        hint="What the numbers are, or what to notice."
        required={false}
        maxLength={200}
        value={env.widget.subtitle ?? ""}
        onChange={(text) =>
          env.write(
            withText(env.widget, "subtitle", text),
            "changing the line under the title",
            `subtitle:${env.widget.id}`,
          )
        }
      />,
    );
  }
  for (const setting of settings) {
    if ((setting.hint.level ?? "main") === "main") main.push(drawSetting(setting));
    else {
      more.push(drawSetting(setting));
      moreLabels.push(setting.hint.label);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {main}
      {more.length > 0 ? (
        <Details
          summary={
            <>
              More {TAB_TITLES[tab].toLowerCase()} options{" "}
              <span className="font-normal text-body-sm text-ink-muted">
                {aboutMore(moreLabels)}
              </span>
            </>
          }
        >
          <div className="flex flex-col gap-4 pt-1">{more}</div>
        </Details>
      ) : null}
    </div>
  );
}

function ActionsTab({ env }: { env: Env }) {
  const events = Object.entries(env.definition.events);
  const settings = configSettings(env.definition, "actions").filter((one) =>
    isShown(one.hint, env.config),
  );
  const setEvent = (name: string, action: Action | undefined, key?: string) => {
    const on = { ...(env.widget.on ?? {}) };
    if (action) on[name] = action;
    else delete on[name];
    const { on: _before, ...rest } = env.widget;
    env.write(
      Object.keys(on).length > 0 ? { ...rest, on } : rest,
      "changing what it does",
      key ? `on:${env.widget.id}:${name}` : undefined,
    );
  };
  return (
    <div className="flex flex-col gap-4">
      {events.map(([name, event]) => (
        <ActionEditor
          key={name}
          env={env}
          id={`${env.widget.id}-on-${name}`}
          heading={event.label}
          action={env.widget.on?.[name]}
          onChange={(next, key) => setEvent(name, next, key)}
        />
      ))}
      {settings.map((setting) => (
        <ConfigControl key={setting.name} env={env} setting={setting} />
      ))}
    </div>
  );
}

function RulesTab({ env, rowRules }: { env: Env; rowRules: InspectorProps["rowRules"] }) {
  const tables = [
    ...new Set(
      Object.values(env.widget.data ?? {}).flatMap((input) => {
        const visual = visualOf(input);
        return visual?.table ? [visual.table] : [];
      }),
    ),
  ];
  const noun = env.surface === "app" ? "app" : "dashboard";
  // A widget's own rules can read the record its page is open on, and no clicked one.
  const ctx = { ...actionContext(env), eventTable: undefined, defaultRef: "this" as const };
  const showWhen = env.widget.rules?.showWhen;
  const setShowWhen = (next: Condition[] | undefined, key?: string) => {
    const { rules: _before, ...rest } = env.widget;
    env.write(
      next && next.length > 0
        ? { ...rest, rules: { ...(env.widget.rules ?? {}), showWhen: next } }
        : rest,
      "changing when it is shown",
      key ? `showWhen:${env.widget.id}` : undefined,
    );
  };
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <span className="text-body-sm font-medium text-ink">Show this widget</span>
        <div>
          <SegmentedControl
            label="Show this widget"
            options={[
              { value: "always", label: "Always" },
              { value: "when", label: "Only when …" },
            ]}
            value={showWhen ? "when" : "always"}
            onChange={(next) => {
              if (next === "always") setShowWhen(undefined);
              else if (!showWhen) setShowWhen([firstCondition(ctx, env.groups)]);
            }}
          />
        </div>
        {showWhen ? (
          <>
            <ConditionsEditor
              id={`${env.widget.id}-show`}
              noun="rule"
              conditions={showWhen}
              ctx={ctx}
              groups={env.groups}
              onChange={(next, key) => setShowWhen(next, key)}
            />
            <p className="m-0 text-body-sm text-ink-muted">
              Shown only when {showWhen.map((one) => conditionSentence(one)).join(" and ")}.
            </p>
          </>
        ) : null}
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-body-sm font-medium text-ink">Who can see it</span>
        <p className="m-0 flex h-control items-center rounded-control border border-line px-3 text-ink-muted">
          Everyone who can open the {noun}
        </p>
      </div>
      <p className="m-0 flex flex-col gap-1 rounded-control border border-line p-3 text-body-sm text-ink-muted">
        <span>
          Hiding a widget isn’t security. What rows each person receives is decided by{" "}
          {tables.length === 0 ? (
            "the row rules of the tables it reads."
          ) : (
            <>the {tables.map((table) => heading(table)).join(" and ")} row rules.</>
          )}
        </span>
        {rowRules
          ? tables.map((table) => (
              <Link
                key={table}
                to={rowRules(table)}
                className="text-action underline underline-offset-2"
              >
                Open row rules{tables.length > 1 ? ` for ${heading(table)}` : ""}
              </Link>
            ))
          : null}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Layout: exact numbers, for keyboards

function LayoutPanel({
  widget,
  definition,
  kind,
  onChange,
  onBack,
}: InspectorProps & { definition: WidgetDefinition; kind: string; onBack: () => void }) {
  const { min, max } = definition.layout;
  const at = widget.at;
  const set = (patch: Partial<typeof at>) =>
    onChange(
      { ...widget, at: clampPlace(definition, { ...at, ...patch }) },
      "placing the widget",
      `layout:${widget.id}`,
    );
  const columns = 12;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div>
          <Button size="small" variant="quiet" onClick={onBack}>
            <ArrowLeft aria-hidden="true" size={14} /> Back to settings
          </Button>
        </div>
        <h2 className="m-0 text-title">{widget.title || kind} · Layout</h2>
      </div>
      <fieldset className="m-0 flex min-w-0 flex-col gap-3 border-0 p-0">
        <legend className="p-0 text-body-sm font-medium text-ink">Position on the page</legend>
        <div className="grid grid-cols-2 gap-3">
          <NumberField
            name={`${widget.id}-column`}
            label="Column"
            min={1}
            max={columns - at.w + 1}
            step={1}
            value={at.x + 1}
            onChange={(n) => n !== undefined && set({ x: n - 1 })}
          />
          <NumberField
            name={`${widget.id}-row`}
            label="Row"
            min={1}
            step={1}
            value={at.y + 1}
            onChange={(n) => n !== undefined && set({ y: n - 1 })}
          />
          <NumberField
            name={`${widget.id}-width`}
            label="Width"
            min={min.w}
            max={Math.min(max?.w ?? columns, columns)}
            step={1}
            value={at.w}
            onChange={(n) => n !== undefined && set({ w: n })}
          />
          <NumberField
            name={`${widget.id}-height`}
            label="Height"
            min={min.h}
            max={max?.h ?? 40}
            step={1}
            value={at.h}
            onChange={(n) => n !== undefined && set({ h: n })}
          />
        </div>
        <p className="m-0 text-body-sm text-ink-muted">
          For keyboards and exact placement. Usually you drag. A {definition.title.toLowerCase()} is{" "}
          {min.w} to {Math.min(max?.w ?? columns, columns)} wide and {min.h} to {max?.h ?? 40} high,
          on twelve columns.
        </p>
      </fieldset>
    </div>
  );
}
