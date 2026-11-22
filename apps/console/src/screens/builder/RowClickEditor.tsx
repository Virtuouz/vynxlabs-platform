import type { Page, PageWidget } from "@volvel/manifest";
import { RadioCards, SelectField, TilePicker } from "@volvel/ui";
import { AppWindow, File, PanelRight } from "lucide-react";
import { useState } from "react";
import { useActionLists } from "../../kit/inspector/catalog.ts";
import type { Action, PageKind } from "./contract.ts";
import { kindOf, withKind } from "./pageKinds.ts";
import {
  type Edit,
  isRowsWidget,
  manyOf,
  oneOf,
  openRecord,
  type PageContext,
  tableOf,
  withRowClick,
} from "./records.ts";
import { rowClickOffer } from "./rowClick.ts";
import { useTableInfo } from "./SampleRecord.tsx";

/** What a click on a row does, as the editor offers it. */
export type RowClickChoice = "nothing" | "detail" | "page" | "action";

/** The pages that show one record of a table: a side sheet, a full record page or a modal. */
export const detailPagesOf = (pages: readonly Page[], table: string): Page[] =>
  pages.filter((page) => kindOf(page) !== "page" && page.record?.table === table);

/** Which choice a row's click is now. */
export function choiceOf(widget: PageWidget, pages: readonly Page[]): RowClickChoice {
  const click = widget.on?.rowClick;
  if (!click) return "nothing";
  const [first] = click.steps;
  if (click.steps.length === 1 && first?.do === "open") {
    const target = pages.find((page) => page.id === first.page);
    return first.record || (target && kindOf(target) !== "page") ? "detail" : "page";
  }
  return "action";
}

/** The page the row's click opens, when it opens one. */
export const openedPage = (widget: PageWidget, pages: readonly Page[]): Page | undefined => {
  const [first] = widget.on?.rowClick?.steps ?? [];
  return first?.do === "open" ? pages.find((page) => page.id === first.page) : undefined;
};

/** The widget with its click set, or taken away. */
export function clickEdit(
  context: PageContext,
  widget: PageWidget,
  click: Action | undefined,
  told: string,
): Edit {
  return {
    widgets: context.widgets.map((one) => {
      if (one.id !== widget.id) return one;
      if (click) return withRowClick(one, click);
      const { rowClick: _gone, ...on } = one.on ?? {};
      const { on: _on, ...rest } = one;
      return Object.keys(on).length > 0 ? { ...rest, on } : rest;
    }),
    addPages: [],
    select: widget.id,
    told,
  };
}

const OPENS_AS: { value: PageKind; label: string; icon: typeof File; line: string }[] = [
  {
    value: "sheet",
    label: "Side sheet",
    icon: PanelRight,
    line: "A side sheet keeps the table in view, so people can step through records.",
  },
  {
    value: "record",
    label: "Full page",
    icon: File,
    line: "A full page takes the whole window, with a way back to the table.",
  },
  {
    value: "modal",
    label: "Modal",
    icon: AppWindow,
    line: "A modal sits over the table and asks for attention until it is closed.",
  },
];

/**
 * "When a row is clicked" (board 3), for a table or list: do nothing, open the record's
 * detail (the page it is, and how it opens), go to a page, or run an action. Each choice
 * is one change of the widget, that Undo takes back whole. The table's drawer places this
 * in its Actions section; `RowClickOffer` mounts it beside the inspector until it does.
 */
export function RowClickEditor({
  root,
  widget,
  context,
  onApply,
  onSetPage,
  onEditLayout,
}: {
  root: string;
  widget: PageWidget;
  context: PageContext;
  onApply: (edit: Edit, label: string) => void;
  /** Another page of the app is changed (the detail's kind): it is replaced by its id. */
  onSetPage?: (page: Page, label: string) => void;
  /** "Edit its layout": the builder shows that page. */
  onEditLayout?: (page: Page) => void;
}) {
  const table = tableOf(widget);
  const info = useTableInfo(root, table);
  const lists = useActionLists(root);
  const current = choiceOf(widget, context.pages);
  // A choice that needs a second answer waits for it: nothing is written until it is given.
  const [waiting, setWaiting] = useState<RowClickChoice>();
  const choice = waiting ?? current;
  if (!isRowsWidget(widget) || !table) return null;
  const noun = oneOf(table).toLowerCase();
  const name = widget.title || manyOf(table);
  const details = detailPagesOf(context.pages, table);
  const opened = openedPage(widget, context.pages);
  const plainPages = context.pages.filter((page) => kindOf(page) === "page" && page.id !== context.page.id);
  const done = (edit: Edit, label: string) => {
    setWaiting(undefined);
    onApply(edit, label);
  };
  const choose = (next: RowClickChoice) => {
    if (next === choice) return;
    if (next === "nothing") {
      return done(
        clickEdit(context, widget, undefined, `A click on a row of ${name} does nothing.`),
        "making rows do nothing when clicked",
      );
    }
    if (next === "detail") {
      const widgets = clickEdit(context, widget, undefined, "").widgets;
      const bare = widgets.find((one) => one.id === widget.id);
      const offer = bare ? rowClickOffer({ ...context, widgets }, bare, info) : undefined;
      const existing = details[0];
      if (existing) {
        return done(
          clickEdit(
            context,
            widget,
            openRecord(existing.id),
            `A click on a row of ${name} opens ${existing.title}.`,
          ),
          "making rows open their detail",
        );
      }
      if (offer) return done(offer.edit, "making rows open their detail");
      return setWaiting("detail");
    }
    setWaiting(next);
  };
  return (
    <section aria-label="When a row is clicked" className="flex flex-col gap-3">
      <h3 className="m-0 text-body-sm font-medium text-ink">When a row is clicked</h3>
      <RadioCards<RowClickChoice>
        label="When a row is clicked"
        value={choice}
        onChange={choose}
        options={[
          { value: "nothing", title: "Do nothing" },
          {
            value: "detail",
            title: "Open record detail",
            line: `Passes the clicked ${noun} along`,
          },
          { value: "page", title: "Go to a page", disabled: plainPages.length === 0 },
          {
            value: "action",
            title: "Run an action",
            disabled: lists.flows.length === 0 && lists.scripts.length === 0,
          },
        ]}
      />
      {choice === "detail" ? (
        <>
          {details.length > 0 ? (
            <div className="flex flex-col gap-1">
              <SelectField
                label="Record detail"
                name="row-click-detail"
                value={opened && details.some((one) => one.id === opened.id) ? opened.id : ""}
                options={[
                  ...(opened && details.some((one) => one.id === opened.id)
                    ? []
                    : [{ value: "", label: "Choose a page" }]),
                  ...details.map((one) => ({ value: one.id, label: one.title })),
                ]}
                onChange={(id) => {
                  const next = details.find((one) => one.id === id);
                  if (!next) return;
                  done(
                    clickEdit(
                      context,
                      widget,
                      openRecord(next.id),
                      `A click on a row of ${name} opens ${next.title}.`,
                    ),
                    "choosing the detail a row opens",
                  );
                }}
              />
              {opened ? (
                <p className="m-0 text-meta text-ink-muted">
                  Made from the {manyOf(table)} table.{" "}
                  {onEditLayout ? (
                    <button
                      type="button"
                      onClick={() => onEditLayout(opened)}
                      className="cursor-pointer border-0 bg-transparent p-0 text-action underline"
                    >
                      Edit its layout
                    </button>
                  ) : null}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="m-0 text-body-sm text-ink-muted">
              No page of this app shows one {noun} yet.
            </p>
          )}
          {opened && onSetPage ? (
            <div className="flex flex-col gap-1.5">
              <span className="text-body-sm font-medium text-ink">Opens as</span>
              <TilePicker<PageKind>
                label="Opens as"
                value={kindOf(opened)}
                columns={3}
                onChange={(kind) => {
                  if (kind === kindOf(opened)) return;
                  const next = withKind(opened, kind, opened.record?.table ?? table);
                  const label = OPENS_AS.find((one) => one.value === kind)?.label ?? kind;
                  onSetPage(next, `making ${opened.title} open as a ${label.toLowerCase()}`);
                }}
                options={OPENS_AS.map(({ value, label, icon }) => ({ value, label, icon }))}
              />
              <p className="m-0 text-meta text-ink-muted">
                {OPENS_AS.find((one) => one.value === kindOf(opened))?.line}
              </p>
            </div>
          ) : null}
        </>
      ) : null}
      {choice === "page" ? (
        <SelectField
          label="Page"
          name="row-click-page"
          value={opened && kindOf(opened) === "page" ? opened.id : ""}
          options={[
            ...(opened && kindOf(opened) === "page" ? [] : [{ value: "", label: "Choose a page" }]),
            ...plainPages.map((one) => ({ value: one.id, label: one.title })),
          ]}
          onChange={(id) => {
            const next = plainPages.find((one) => one.id === id);
            if (!next) return;
            done(
              clickEdit(
                context,
                widget,
                { steps: [{ do: "open", page: next.id }] },
                `A click on a row of ${name} goes to ${next.title}.`,
              ),
              "making rows go to a page",
            );
          }}
        />
      ) : null}
      {choice === "action" ? (
        <SelectField
          label="Action"
          name="row-click-action"
          value={actionValue(widget)}
          options={[
            ...(actionValue(widget) ? [] : [{ value: "", label: "Choose an action" }]),
            ...lists.flows.map((one) => ({ value: `flow:${one.path}`, label: one.path })),
            ...lists.scripts.map((one) => ({ value: `script:${one.path}`, label: one.path })),
          ]}
          onChange={(value) => {
            const [kind, ...rest] = value.split(":");
            const path = rest.join(":");
            if (!path || (kind !== "flow" && kind !== "script")) return;
            done(
              clickEdit(
                context,
                widget,
                { steps: [{ do: kind, path }] },
                `A click on a row of ${name} runs ${path}.`,
              ),
              "making rows run an action",
            );
          }}
        />
      ) : null}
    </section>
  );
}

/** The flow or script a click runs, as the select names it. */
function actionValue(widget: PageWidget): string {
  const [first] = widget.on?.rowClick?.steps ?? [];
  return first && (first.do === "flow" || first.do === "script") ? `${first.do}:${first.path}` : "";
}
