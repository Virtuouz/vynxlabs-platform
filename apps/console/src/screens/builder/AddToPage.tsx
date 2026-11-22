import { Dialog, Kbd } from "@volvel/ui";
import { type Surface, type WidgetDefinition, WidgetRegistry } from "@volvel/widgets";
import { Search, Sparkles } from "lucide-react";
import { useState } from "react";
import { type Catalog, heading } from "../../kit/inspector/model.ts";
import { manyOf } from "./records.ts";
import { offeredOn } from "./registry.ts";
import { factsOf, matchesWords, previewOf, SUGGESTION_WORDS, wordsOf } from "./selectorData.ts";
import { WidgetDrawing } from "./WidgetDrawing.tsx";
import { outlineIcon } from "./widgetIcons.ts";

/** How far a pointer travels from a widget in the list before it is carried, in pixels: as far as a drag on the page. */
const CARRY_FROM = 4;

/** The selector's groups of widgets. Text is "Organize and explain", with Section and Tabs. */
const GROUPS = [
  { id: "records", title: "Work with records", of: ["records"] },
  { id: "understand", title: "Understand data", of: ["understand"] },
  { id: "action", title: "Take action", of: ["action"] },
  { id: "organize", title: "Organize and explain", of: ["organize", "content"] },
] as const;

/** What a suggestion is drawn with: the icon of the widget it adds. */
const SUGGESTION_ICON: Record<string, string> = {
  search: "filter",
  detail: "detail",
  form: "form",
  mark: "button",
  filter: "filter",
  group: "actions",
  section: "section",
};

interface Suggested {
  key: string;
  label: string;
  hint?: string | undefined;
}

type Stop = { id: string; widget?: WidgetDefinition; suggestion?: Suggested };

/**
 * "Add to page" (board 7): what can be put on the page, by what it is for, with a
 * preview of the one in view. The search finds words, in titles, descriptions,
 * examples and suggestions: "take payments" finds Button. Enter places a widget at
 * the end of the page (or of the container chosen); dragging one out carries it
 * onto the page, where it lands where it is let go (the dialog closes as it is
 * picked up). The arrow keys walk the tiles across and down. It lists what is
 * registered for this kind of page, so a pack's widget is here the day the pack is.
 */
export function AddToPage({
  open,
  onClose,
  surface,
  onAdd,
  onCarry,
  suggestions,
  target,
  catalog,
  startTable,
}: {
  open: boolean;
  onClose: () => void;
  surface: Surface;
  onAdd: (definition: WidgetDefinition) => void;
  /** A widget was dragged out of the list: carry it onto the page from where the pointer is. */
  onCarry?: (definition: WidgetDefinition, from: { x: number; y: number }) => void;
  /** Where a click adds, when it is not the end of the page: "Orders", "Views › By status". */
  target?: string | undefined;
  /** "This page shows Invoices. Common next steps: …": what is worth adding to what the page shows. */
  suggestions?: {
    table: string;
    items: readonly { key: string; label: string; hint?: string }[];
    onPick: (key: string) => void;
  };
  /** The workspace's tables: the preview's examples are made from the page's own. */
  catalog?: Catalog;
  /** The table the page already uses: where a widget that reads one starts. */
  startTable?: string | undefined;
}) {
  const [search, setSearch] = useState("");
  const [lit, setLit] = useState<string>();
  const typed = search.trim();
  const needle = wordsOf(typed).length > 0 ? wordsOf(typed) : typed.toLowerCase().split(/\s+/);
  const everything = typed === "";
  const facts = factsOf(catalog?.tables.find((one) => one.name === startTable));
  const matches = (definition: WidgetDefinition) =>
    everything ||
    matchesWords(
      needle,
      [
        definition.title,
        definition.description,
        previewOf(definition.type).words,
        previewOf(definition.type).goodFor(facts).join(" "),
        WidgetRegistry.packOf(definition.type),
      ].join(" "),
    );
  const found = offeredOn(surface).filter(matches);
  // The suggestions come first, and the search narrows them as it does the widgets.
  const suggested = (suggestions?.items ?? []).filter(
    (item) =>
      everything ||
      matchesWords(
        needle,
        [
          item.label,
          item.hint ?? "",
          suggestions?.table ?? "",
          SUGGESTION_WORDS[item.key] ?? "",
        ].join(" "),
      ),
  );
  const groups = GROUPS.map((group) => ({
    ...group,
    widgets: found.filter((definition) =>
      (group.of as readonly string[]).includes(definition.category),
    ),
  }));
  // The tiles as they are laid out, row by row: what the arrow keys walk.
  const grid = layout(suggested, groups);
  const shown = found.find((one) => one.type === lit) ?? found[0];

  const done = () => setSearch("");
  const add = (definition: WidgetDefinition) => {
    onAdd(definition);
    done();
  };
  const pick = (key: string) => {
    suggestions?.onPick(key);
    done();
  };
  /** The arrow keys walk the tiles across and down, from the search field and back to it. */
  const walk = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const keys = ["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight"];
    if (!keys.includes(event.key)) return;
    const here = event.target as HTMLElement;
    const inSearch = here.getAttribute("name") === "add-to-page-search";
    const id = here.getAttribute("data-add-item");
    const focus = (to: string | undefined) => {
      if (!to) return;
      event.preventDefault();
      event.currentTarget
        .querySelector<HTMLElement>(`[data-add-item="${CSS.escape(to)}"]`)
        ?.focus();
    };
    if (inSearch) {
      if (event.key === "ArrowDown") focus(grid[0]?.[0]?.id);
      return;
    }
    if (id === null) return;
    const row = grid.findIndex((one) => one.some((stop) => stop.id === id));
    if (row < 0) return;
    const col = grid[row]?.findIndex((stop) => stop.id === id) ?? 0;
    if (event.key === "ArrowRight") return focus(grid[row]?.[col + 1]?.id);
    if (event.key === "ArrowLeft") return focus(grid[row]?.[col - 1]?.id);
    const to = row + (event.key === "ArrowDown" ? 1 : -1);
    if (to < 0) {
      event.preventDefault();
      event.currentTarget.querySelector<HTMLElement>("input[name=add-to-page-search]")?.focus();
      return;
    }
    const next = grid[to];
    focus(next?.[Math.min(col, next.length - 1)]?.id);
  };
  /** A press on a widget in the list that travels is a carry, not a click. A finger scrolls the list instead. */
  const pickUp = (event: React.PointerEvent<HTMLButtonElement>, definition: WidgetDefinition) => {
    if (!onCarry || event.button !== 0 || event.pointerType === "touch") return;
    const from = { x: event.clientX, y: event.clientY };
    const follow = (moving: PointerEvent) => {
      if (Math.hypot(moving.clientX - from.x, moving.clientY - from.y) < CARRY_FROM) return;
      stop();
      done();
      onCarry(definition, { x: moving.clientX, y: moving.clientY });
    };
    const stop = () => {
      window.removeEventListener("pointermove", follow);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
    window.addEventListener("pointermove", follow);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
  };

  const tile = (definition: WidgetDefinition) => {
    const Icon = outlineIcon(definition.icon);
    const pack = WidgetRegistry.packOf(definition.type);
    return (
      <button
        key={definition.type}
        type="button"
        data-add-item={definition.type}
        aria-current={shown?.type === definition.type ? "true" : undefined}
        onClick={() => add(definition)}
        onPointerDown={(event) => pickUp(event, definition)}
        onFocus={() => setLit(definition.type)}
        onPointerEnter={() => setLit(definition.type)}
        draggable={false}
        className={`flex h-full w-full items-start gap-3 rounded-panel border p-3 text-left select-none hover:border-action/60 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus ${
          shown?.type === definition.type
            ? "border-action bg-action-soft"
            : "border-line bg-surface"
        } ${onCarry ? "cursor-grab active:cursor-grabbing" : ""}`}
      >
        <span
          className={`flex size-9 shrink-0 items-center justify-center rounded-control border border-line-control bg-sunken ${
            shown?.type === definition.type ? "text-action" : "text-ink"
          }`}
        >
          <Icon aria-hidden="true" size={16} />
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="flex flex-wrap items-center gap-x-2 text-body-sm font-semibold text-ink">
            {definition.title}
            {pack === "labs" ? (
              <span className="rounded-control border border-action/40 px-1.5 text-tag font-normal text-action">
                Labs
              </span>
            ) : pack === "core" ? null : (
              <span className="text-meta font-normal text-ink-muted">{heading(pack)} pack</span>
            )}
          </span>
          <span className="text-meta text-ink-muted">{definition.description}</span>
        </span>
      </button>
    );
  };

  const group = (id: string, cols: string) => {
    const here = groups.find((one) => one.id === id);
    if (!here || here.widgets.length === 0) return null;
    return (
      <section key={id} aria-label={here.title} className="flex min-w-0 flex-col gap-2">
        <h3 className="m-0 text-label text-ink-muted uppercase">{here.title}</h3>
        <ul className={`m-0 grid list-none gap-2 p-0 ${cols}`}>
          {here.widgets.map((definition) => (
            <li key={definition.type} className="min-w-0">
              {tile(definition)}
            </li>
          ))}
        </ul>
      </section>
    );
  };

  const pair = [
    group("action", "grid-cols-1 sm:grid-cols-2"),
    group("organize", "grid-cols-1 sm:grid-cols-2"),
  ];
  const more = shown ? previewOf(shown.type) : undefined;

  return (
    <Dialog
      open={open}
      onClose={() => {
        done();
        onClose();
      }}
      title="Add to page"
      size="wide"
      width={1042}
      bare
    >
      {/* biome-ignore lint/a11y/noStaticElementInteractions: the arrow keys walk the tiles inside; each is reachable by Tab as well */}
      <div
        className="flex h-[min(742px,calc(100vh-4rem))] min-h-0 flex-col md:h-[min(742px,74vh)]"
        onKeyDown={walk}
      >
        <form
          className="flex h-14 shrink-0 items-center gap-3 border-line border-b px-4"
          onSubmit={(event) => {
            event.preventDefault();
            const [first] = suggested;
            if (first) return pick(first.key);
            const [one] = found;
            if (one) add(one);
          }}
        >
          <Search aria-hidden="true" size={16} className="shrink-0 text-ink-muted" />
          <input
            name="add-to-page-search"
            data-autofocus=""
            aria-label="Find something to add, or describe what people should do"
            placeholder="Find something to add, or describe what people should do"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="h-10 min-w-0 flex-1 border-0 bg-transparent text-emphasis text-ink outline-none focus-visible:outline-none! placeholder:text-ink-muted"
          />
          <Kbd>esc</Kbd>
        </form>
        <div className="grid min-h-0 flex-1 md:grid-cols-[minmax(0,1fr)_17.5rem]">
          <div className="flex min-h-0 min-w-0 flex-col gap-4 overflow-y-auto px-4 pt-4 pb-4.5 md:px-[18px]">
            {suggestions && suggested.length > 0 ? (
              <section
                aria-label={`Suggested for ${suggestions.table}`}
                className="flex flex-col gap-2"
              >
                <h3 className="m-0 flex items-center gap-1.5 text-label text-ink-muted uppercase">
                  <Sparkles aria-hidden="true" size={14} className="text-action" /> Suggested for
                  this page
                </h3>
                <ul className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2 xl:grid-cols-3">
                  {suggested.map((item) => {
                    const Icon = outlineIcon(SUGGESTION_ICON[item.key]);
                    return (
                      <li key={item.key} className="min-w-0">
                        <button
                          type="button"
                          data-add-item={`suggest:${item.key}`}
                          onClick={() => pick(item.key)}
                          className="flex h-full w-full items-center gap-3 rounded-panel border border-action/40 bg-surface px-3 py-3 text-left hover:border-action focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
                        >
                          <Icon aria-hidden="true" size={16} className="shrink-0 text-action" />
                          <span className="flex min-w-0 flex-col gap-0.5">
                            <span className="text-body-sm font-semibold text-ink">
                              {item.label}
                            </span>
                            {item.hint ? (
                              <span className="text-meta text-ink-muted">{item.hint}</span>
                            ) : null}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null}
            {found.length === 0 && suggested.length === 0 ? (
              <div
                role="status"
                className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center"
              >
                <Search aria-hidden="true" size={20} className="text-ink-subtle" />
                <p className="m-0 font-semibold text-ink">Nothing matches “{typed}”</p>
                <p className="m-0 max-w-sm text-body-sm text-ink-muted">
                  Try a word for what it shows, such as “chart” or “records”, or for what people do,
                  such as “take payments”.
                </p>
              </div>
            ) : (
              <>
                {group("records", "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3")}
                {group("understand", "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3")}
                {pair.some(Boolean) ? (
                  <div className="grid gap-5 xl:grid-cols-2">{pair}</div>
                ) : null}
              </>
            )}
            <p
              className={`m-0 text-meta text-ink-muted ${found.length === 0 && suggested.length === 0 ? "hidden" : ""}`}
            >
              {target ? (
                <>
                  Adds to <strong className="font-medium text-ink">{target}</strong> (a Section or
                  Tabs goes on the page).{" "}
                </>
              ) : null}
              {onCarry
                ? `Click to place at the end of ${target ? "it" : "the page"}, or drag it onto the page where you want it.`
                : `Click to place at the end of ${target ? "it" : "the page"}, then drag it where you want it.`}
            </p>
          </div>
          {shown && more ? (
            <aside
              aria-label="Preview"
              data-preview-of={shown.type}
              className="hidden min-h-0 flex-col gap-3 overflow-y-auto border-line border-l bg-sunken p-[18px] md:flex"
            >
              <WidgetDrawing drawing={more.drawing} />
              <h3 className="m-0 mt-1 text-title font-semibold text-ink">{shown.title}</h3>
              <p className="m-0 text-body-sm text-ink-muted">{more.about}</p>
              {more.goodFor(facts).length > 0 ? (
                <div className="flex flex-col gap-1">
                  <h4 className="m-0 text-label text-ink-muted uppercase">Good for</h4>
                  <ul className="m-0 flex list-none flex-col gap-1 p-0 text-meta text-ink">
                    {more.goodFor(facts).map((example) => (
                      <li key={example}>{example}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {more.reads && startTable ? (
                <p className="m-0 mt-auto text-meta text-ink-muted">
                  Starts on <strong className="font-medium text-ink">{manyOf(startTable)}</strong>,
                  the table this page already uses.
                </p>
              ) : null}
              <p
                className={`m-0 flex flex-wrap items-center gap-x-3 gap-y-1 text-meta text-ink-muted ${
                  more.reads && startTable ? "" : "mt-auto"
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <Kbd>↵</Kbd> place at the end
                </span>
                {onCarry ? (
                  <span className="flex items-center gap-1.5">
                    <Kbd>drag</Kbd> place anywhere
                  </span>
                ) : null}
              </p>
            </aside>
          ) : null}
        </div>
      </div>
    </Dialog>
  );
}

/** The tiles in the rows they are laid out in, for the arrow keys: the suggestions, then each group, the last two side by side. */
function layout(
  suggested: readonly Suggested[],
  groups: readonly { id: string; widgets: WidgetDefinition[] }[],
): Stop[][] {
  const rows: Stop[][] = [];
  const chunk = (stops: Stop[], by: number) => {
    for (let at = 0; at < stops.length; at += by) rows.push(stops.slice(at, at + by));
  };
  // The widest layout: three across. Narrower ones wrap, and the arrows still walk row by row.
  chunk(
    suggested.map((item) => ({ id: `suggest:${item.key}`, suggestion: item })),
    3,
  );
  const of = (id: string): Stop[] =>
    (groups.find((one) => one.id === id)?.widgets ?? []).map((widget) => ({
      id: widget.type,
      widget,
    }));
  chunk(of("records"), 3);
  chunk(of("understand"), 3);
  // Take action and Organize and explain sit side by side, two across each.
  const left = of("action");
  const right = of("organize");
  for (let at = 0; at < Math.max(left.length, right.length); at += 2) {
    const row = [...left.slice(at, at + 2), ...right.slice(at, at + 2)];
    if (row.length > 0) rows.push(row);
  }
  return rows;
}
