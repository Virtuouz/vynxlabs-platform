/**
 * The inspector: the settings of the widget that is chosen, drawn from its
 * definition (`@volvel/widgets`) and from nothing else. It knows no widget
 * type by name, so a pack's widget has settings the day it is registered.
 *
 * Board 8's drawer, for every widget: a header (the type's icon tile, the name, the kind, a ⋯
 * menu: Layout, Duplicate, Move to, Remove); the tabs its definition has, with a dot on a tab that
 * has something set; and in a tab, groups of rows, each row showing its value and opening a small
 * editor. What a widget type adds of its own is registered in `custom.ts`. Size and position are
 * not a tab: ⋯ › Layout (`LayoutPanel.tsx`).
 */
import type { Page, PageFilter, PageWidget } from "@volvel/manifest";
import {
  Button,
  Details,
  DrawerGroup,
  DrawerHeader,
  DrawerPanel,
  DrawerTabs,
  Menu,
} from "@volvel/ui";
import {
  type Surface,
  TAB_TITLES,
  type Tab,
  type WidgetDefinition,
  WidgetRegistry,
} from "@volvel/widgets";
import { Copy, CornerDownRight, Ellipsis, LayoutGrid, Trash2 } from "lucide-react";
import { Fragment, type ReactNode, useEffect, useId, useRef, useState } from "react";
import { outlineIcon } from "../../screens/builder/widgetIcons.ts";
import { formatCombo } from "../keys.ts";
import { ActionsTab, RulesSummary } from "./ActionsTab.tsx";
import { useOpenAction } from "./widgets/subView.ts";
import "./widgets/registerAll.ts";
import { type Env, SettingRow } from "./controls.tsx";
import {
  drawersFor,
  headingIsFields,
  headingPlace,
  hiddenData,
  hiddenSettings,
  tabLabelFor,
} from "./custom.ts";
import { DataControl } from "./dataControls.tsx";
import { HeadingGroup, hasHeading } from "./heading.tsx";
import { type Device, LayoutPanel } from "./LayoutPanel.tsx";
import { type MovePlace, MoveTo } from "./MoveTo.tsx";
import {
  type Catalog,
  type ConfigSetting,
  configOf,
  configSettings,
  type DataPart,
  dataParts,
  type FlowChoice,
  heading,
  isShown,
  READS_NO_ROWS,
  type ScriptChoice,
  type TabFate,
  tabsOf,
  widgetName,
} from "./model.ts";
import { RulesTab } from "./RulesTab.tsx";

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
  /** ⋯ › Move to: where the widget can go (the page, a Section, a tab), and the move. Left out: no such item. */
  places?: readonly MovePlace[] | undefined;
  onMove?: ((place: string) => void) | undefined;
  /** What a container holds, in words ("holds 3 widgets"), for its header. */
  holds?: string | undefined;
  /** Where a table's row rules are changed, if the reader may go there. */
  rowRules?: ((table: string) => string) | undefined;
  /** The page the widget is on (its kind and the table of its record), when it is an app's. */
  page?: Page | undefined;
  /** The interface's pages, for "Open a page" and the `page` setting. */
  pages?: readonly Page[];
  /** The workspace's flows; only those with a manual trigger are offered to "Run a workflow". */
  flows?: readonly FlowChoice[];
  scripts?: readonly ScriptChoice[];
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
  /** The tab shown, when the host keeps it; and told when it changes. */
  tab?: Tab | undefined;
  onTab?: ((tab: Tab) => void) | undefined;
  /** Chooses another widget of the page (a Section's "Holds" rows). */
  onSelect?: ((id: string) => void) | undefined;
  /** "When a row is clicked" as the builder draws it, for a table or a list. */
  rowClickEditor?: ReactNode;
  /** Someone who may not edit reads the drawer: its settings are shown, none can be changed. */
  readOnly?: boolean;
  /** ⋯ › Layout: what a device's automatic place is now, for "Custom" to start from. */
  automaticAt?: (widget: PageWidget, device: Device) => PageWidget["at"];
}

const lower = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

/** What a disclosure holds, in a line: "Sorted by, at most". */
function aboutMore(labels: readonly string[]): string {
  return labels.map((label, at) => (at === 0 ? label : lower(label))).join(", ");
}

/** What a tab is called for this widget: "Content" for a Text, else the usual. */
const tabName = (type: string, tab: Tab) => tabLabelFor(type, tab) ?? TAB_TITLES[tab];

export function Inspector(props: InspectorProps) {
  const { widget, definition } = props;
  const [view, setView] = useState<"settings" | "layout">("settings");
  const [moving, setMoving] = useState(false);
  const [own, setOwn] = useState<Tab>("data");
  // A host that wants to know the tab (the builder's sheet preview shows with Actions) keeps it.
  const tab = props.tab ?? own;
  const setTab = (next: Tab) => {
    setOwn(next);
    props.onTab?.(next);
  };
  // A button opens on Display: its Data tab only says it reads no rows.
  // biome-ignore lint/correctness/useExhaustiveDependencies: once, as it is opened
  useEffect(() => {
    if (READS_NO_ROWS.has(widget.type) && tab === "data") setTab("display");
  }, []);
  const prefix = useId();
  const menu = useRef<HTMLSpanElement>(null);
  const cameBack = useRef(false);
  const name = widgetName(widget, definition);

  // Coming back from Layout, focus goes back to the ⋯ it was opened from.
  useEffect(() => {
    if (view === "settings" && cameBack.current) {
      cameBack.current = false;
      menu.current?.querySelector<HTMLElement>("button")?.focus();
    }
  }, [view]);

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
  const named = pack === "core" ? definition.title : `${definition.title} · ${heading(pack)} pack`;
  const kind = props.holds ? `${named} · ${props.holds}` : named;
  const Icon = outlineIcon(definition.icon);

  if (view === "layout") {
    return (
      <LayoutPanel
        widget={widget}
        definition={definition}
        icon={Icon}
        kind={definition.title}
        onBack={() => {
          cameBack.current = true;
          setView("settings");
        }}
        onChange={props.onChange}
        widgets={props.widgets}
        onChangeWidgets={props.onChangeWidgets}
        automaticAt={props.automaticAt}
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
    select: props.onSelect,
    openTab: setTab,
    rowClickEditor: props.rowClickEditor,
  };
  const tabs = tabsOf(definition);
  const current = tabs.includes(tab) ? tab : (tabs[0] ?? "display");

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <DrawerHeader
        icon={Icon}
        name={name}
        kind={kind}
        menu={
          props.readOnly ? undefined : (
            <span ref={menu}>
              <Menu
                ariaLabel={`More about ${name}`}
                align="end"
                triggerClassName="inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-control border border-line-control hover:bg-sunken"
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
                  ...(props.places && props.places.length > 0 && props.onMove
                    ? [
                        {
                          label: "Move to…",
                          icon: <CornerDownRight aria-hidden="true" size={14} />,
                          onSelect: () => setMoving(true),
                        },
                      ]
                    : []),
                  {
                    label: "Remove",
                    icon: <Trash2 aria-hidden="true" size={14} />,
                    danger: true,
                    separated: true,
                    onSelect: props.onRemove,
                  },
                ]}
              />
            </span>
          )
        }
      />
      {props.places && props.onMove ? (
        <MoveTo
          open={moving}
          onClose={() => setMoving(false)}
          name={name}
          places={props.places}
          onChoose={props.onMove}
        />
      ) : null}
      <DrawerTabs
        idPrefix={prefix}
        label={`Settings of ${name}`}
        value={current}
        onChange={(next) => setTab(next as Tab)}
        tabs={tabs.map((one) => ({
          id: one,
          label: tabName(definition.type, one),
          dot: tabHasSettings(env, one),
        }))}
      />
      <DrawerPanel idPrefix={prefix} tab={current}>
        <fieldset
          disabled={props.readOnly}
          className="m-0 flex min-w-0 flex-col gap-5 border-0 p-0"
        >
          <TabBody
            tab={current}
            env={env}
            rowRules={props.rowRules}
            onOpenRules={() => setTab("rules")}
          />
        </fieldset>
      </DrawerPanel>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The dot on a tab

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Whether a tab has something set: a setting that is not its default, data bound, an action, a rule. */
export function tabHasSettings(env: Env, tab: Tab): boolean {
  const { definition, widget } = env;
  if (drawersFor(definition.type, tab).some((one) => one.dot?.(env))) return true;
  const changed = configSettings(definition, tab).some(({ name, schema }) => {
    const set = widget.config?.[name];
    if (set === undefined) return false;
    return !same(set, definition.defaults?.[name] ?? schema.default);
  });
  if (changed) return true;
  switch (tab) {
    case "data":
      return Object.values(widget.data ?? {}).some(
        (input) => "visual" in input.source || Object.keys(input.source).length > 0,
      );
    case "display":
      return Boolean(widget.title || widget.subtitle);
    case "actions":
      return Object.keys(widget.on ?? {}).length > 0;
    case "rules":
      return Object.values(widget.rules ?? {}).some(
        (one) => one !== undefined && (!Array.isArray(one) || one.length > 0),
      );
  }
}

// ---------------------------------------------------------------------------
// One tab

interface Block {
  key: string;
  order: number;
  node: ReactNode;
}
interface Item {
  key: string;
  order: number;
  node: ReactNode;
}
interface Group {
  label: string;
  items: Item[];
  note?: ReactNode;
  aside?: ReactNode;
}

const called = (value: ReactNode | ((env: Env) => ReactNode) | undefined, env: Env) =>
  typeof value === "function" ? value(env) : value;

function TabBody({
  tab,
  env,
  rowRules,
  onOpenRules,
}: {
  tab: Tab;
  env: Env;
  rowRules: InspectorProps["rowRules"];
  onOpenRules: () => void;
}) {
  // A row action or button open in the drawer is the whole Actions tab: nothing else of it shows.
  const subViewOpen = useOpenAction(env.widget.id) !== undefined;
  if (tab === "rules") return <RulesTab env={env} rowRules={rowRules} />;
  const { definition } = env;
  if (tab === "actions" && drawersFor(definition.type, "actions").length === 0) {
    return <ActionsTab env={env} onOpenRules={onOpenRules} />;
  }

  const groups = new Map<string, Group>();
  const more: ReactNode[] = [];
  const moreLabels: string[] = [];
  const blocks: Block[] = [];
  const add = (label: string, item: Item) => {
    const group = groups.get(label) ?? { label, items: [] };
    group.items.push(item);
    groups.set(label, group);
  };

  // The data parts are groups of their own ("Rows it uses", "What it shows"), in the order the
  // definition gives, less what the widget's own sections draw.
  const hiddenParts = hiddenData(definition.type);
  const parts = tab === "data" ? dataParts(definition) : [];
  parts.forEach((part: DataPart, at) => {
    if (hiddenParts.has(part.control)) return;
    const key = `${part.input}:${part.control}`;
    const node = (
      <DataControl
        key={key}
        env={env}
        input={part.input}
        control={part.control}
        label={part.label}
        help={part.help}
        hide={hiddenParts}
      />
    );
    if (part.level !== "main") {
      more.push(node);
      moreLabels.push(part.label);
      return;
    }
    blocks.push({ key, order: at - parts.length, node });
  });

  // The heading: first in the tab, last (a table, a list, a detail, a form), or where a section
  // puts it. A frameless widget has none.
  if (tab === "display" && hasHeading(env)) {
    const place = headingPlace(definition.type, tab);
    if (place !== "own") {
      blocks.push({
        key: "heading",
        order: place === "last" ? 1e6 : -2000,
        node: <HeadingGroup env={env} fields={headingIsFields(definition.type, tab)} />,
      });
    }
  }

  // The settings, each in the group its hint names, or one named by the tab.
  const hidden = hiddenSettings(definition.type);
  if (hasHeading(env)) hidden.add("caption");
  const settings = configSettings(definition, tab).filter(
    (one) => isShown(one.hint, env.config) && !hidden.has(one.name),
  );
  const own = tabName(definition.type, tab);
  settings.forEach((setting: ConfigSetting, at) => {
    const node = <SettingRow key={setting.name} env={env} setting={setting} />;
    if ((setting.hint.level ?? "main") !== "main") {
      more.push(node);
      moreLabels.push(setting.hint.label);
      return;
    }
    add(setting.hint.group ?? own, {
      key: setting.name,
      order: setting.hint.order ?? 1000 + at / 1000,
      node,
    });
  });

  // What the widget's own pieces add: rows into a group, or a whole section.
  drawersFor(definition.type, tab).forEach((piece, at) => {
    if (piece.when && !piece.when(env)) return;
    const order = piece.order ?? 1000 + at / 1000;
    if (piece.group === undefined) {
      const Section = piece.section;
      blocks.push({ key: `section:${at}`, order, node: <Section env={env} /> });
      return;
    }
    const group = groups.get(piece.group) ?? { label: piece.group, items: [] };
    group.items.push({ key: `custom:${at}`, order, node: piece.render(env) });
    const note = called(piece.note, env);
    const aside = called(piece.aside, env);
    if (note !== undefined) group.note = note;
    if (aside !== undefined) group.aside = aside;
    groups.set(piece.group, group);
  });

  for (const group of groups.values()) {
    const items = [...group.items].sort((a, b) => a.order - b.order);
    blocks.push({
      key: `group:${group.label}`,
      order: items[0]?.order ?? 0,
      node: (
        <DrawerGroup
          label={group.label}
          {...(group.note ? { note: group.note } : {})}
          {...(group.aside ? { aside: group.aside } : {})}
        >
          {items.map((item) => (
            <Fragment key={item.key}>{item.node}</Fragment>
          ))}
        </DrawerGroup>
      ),
    });
  }
  blocks.sort((a, b) => a.order - b.order);

  if (tab === "data" && blocks.length === 0 && READS_NO_ROWS.has(definition.type)) {
    return (
      <p className="m-0 px-1 text-body-sm text-ink-muted">
        {definition.type === "core/actions"
          ? "An action group reads no rows. What each button does is on its own Actions tab: choose a button in Display."
          : "A button reads no rows. What it does is on the Actions tab."}
      </p>
    );
  }

  return (
    <>
      {blocks.map((block) => (
        <Fragment key={block.key}>{block.node}</Fragment>
      ))}
      {tab === "actions" && !subViewOpen ? (
        <RulesSummary env={env} onOpenRules={onOpenRules} />
      ) : null}
      {more.length > 0 ? (
        <Details
          summary={
            <>
              More {own.toLowerCase()} options{" "}
              <span className="font-normal text-body-sm text-ink-muted">
                {aboutMore(moreLabels)}
              </span>
            </>
          }
        >
          <div className="flex flex-col gap-4 pt-1">{more}</div>
        </Details>
      ) : null}
    </>
  );
}
