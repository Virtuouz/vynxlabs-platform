import type { Page } from "@volvel/manifest";
import { PAGE_SIZES } from "@volvel/manifest";
import { Button, PAGE_ICONS, pageIconOf, SelectField, TextField } from "@volvel/ui";
import { AppWindow, File, FileText, type LucideIcon, PanelRight } from "lucide-react";
import { useState } from "react";
import { type Catalog, heading } from "../../kit/inspector/model.ts";
import type { PageKind } from "./contract.ts";
import {
  KIND_LINE,
  KIND_NAMES,
  kindOf,
  SIZE_NAMES,
  sizeOf,
  withKind,
  withSize,
} from "./pageKinds.ts";

/** Page type's tiles (board 2). */
const KIND_TILE_ICONS: Record<PageKind, LucideIcon> = {
  page: File,
  record: FileText,
  sheet: PanelRight,
  modal: AppWindow,
};

const TOPIC = /^[a-z0-9][a-z0-9_-]*$/;

/**
 * The settings of the page itself, shown in the inspector's place when a page
 * is chosen and no widget (board 2's Page tab): what kind of page it is, the
 * table its record is of, its title in the app's menu, and its help.
 */
export function PageSettings({
  page,
  catalog,
  mostReadTable,
  onChange,
  onRemove,
  canRemove,
}: {
  page: Page;
  catalog: Catalog;
  /** The table the page's widgets mostly read: what a record page is most likely of. */
  mostReadTable: string | undefined;
  onChange: (next: Page, label: string, key?: string) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const kind = kindOf(page);
  const [topic, setTopic] = useState(page.help ?? "");
  const [topicError, setTopicError] = useState<string>();
  const tables = catalog.tables.map((one) => ({ value: one.name, label: heading(one.name) }));
  const opensOnRecord = kind !== "page";
  const PageIcon = pageIconOf(page.icon);
  return (
    <section className="flex flex-col gap-4" aria-label="Page settings">
      <h2 className="m-0 text-heading-sm">{page.title}</h2>
      <fieldset className="m-0 flex min-w-0 flex-col gap-1.5 border-0 p-0">
        <legend className="mb-1.5 p-0 text-body-sm font-medium">Page type</legend>
        <div role="radiogroup" aria-label="Page type" className="grid grid-cols-2 gap-2">
          {(Object.keys(KIND_NAMES) as PageKind[]).map((one) => {
            const Icon = KIND_TILE_ICONS[one];
            return (
              // biome-ignore lint/a11y/useSemanticElements: a tile chosen by looking at it
              <button
                key={one}
                type="button"
                role="radio"
                aria-checked={kind === one}
                onClick={() => {
                  if (kind === one) return;
                  const table = page.record?.table ?? mostReadTable ?? tables[0]?.value;
                  onChange(
                    withKind(page, one, one === "modal" ? page.record?.table : table),
                    `making ${page.title} a ${KIND_NAMES[one].toLowerCase()}`,
                  );
                }}
                className={`flex h-9 items-center gap-2 rounded-control border px-3 text-body-sm ${
                  kind === one
                    ? "border-action bg-action-soft text-action"
                    : "border-line-control text-ink hover:bg-sunken"
                }`}
              >
                <Icon aria-hidden="true" size={14} className="shrink-0" /> {KIND_NAMES[one]}
              </button>
            );
          })}
        </div>
        <p className="m-0 text-meta text-ink-muted">{KIND_LINE}</p>
      </fieldset>
      {opensOnRecord ? (
        <SelectField
          label="Table of its record"
          name="page-record-table"
          value={page.record?.table ?? ""}
          hint={
            kind === "modal"
              ? "A modal that makes a new record opens on none."
              : "The record it opens on is a row of this table."
          }
          options={[
            ...(kind === "modal" ? [{ value: "", label: "None: it opens on no record" }] : []),
            ...tables,
          ]}
          onChange={(value) => {
            const { record: _gone, ...rest } = page;
            onChange(
              value ? { ...rest, record: { table: value } } : rest,
              "choosing the table of the record",
            );
          }}
        />
      ) : null}
      <TextField
        label={kind === "page" ? "Title in the app menu" : "Title"}
        name="page-title"
        value={page.title}
        maxLength={200}
        required
        {...(kind === "page"
          ? {}
          : { hint: "A record page, side sheet or modal is not in the menu." })}
        onChange={(title) => {
          if (title) onChange({ ...page, title }, "renaming the page", `page-title:${page.id}`);
        }}
      />
      {kind === "page" ? (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-end gap-2">
            <span
              aria-hidden="true"
              data-page-icon-preview=""
              className="mb-px flex size-9 shrink-0 items-center justify-center rounded-control border border-line text-ink-muted"
            >
              {PageIcon ? <PageIcon size={16} /> : null}
            </span>
            <div className="min-w-0 flex-1">
              <SelectField
                label="Icon"
                name="page-icon"
                value={page.icon && PAGE_ICONS[page.icon] ? page.icon : ""}
                options={[
                  { value: "", label: "No icon" },
                  ...Object.entries(PAGE_ICONS).map(([value, one]) => ({
                    value,
                    label: one.label,
                  })),
                ]}
                onChange={(value) => {
                  const { icon: _icon, ...rest } = page;
                  onChange(value ? { ...rest, icon: value } : rest, "choosing the page's icon");
                }}
              />
            </div>
          </div>
          <p className="m-0 text-meta text-ink-muted">Drawn beside its title in the app's menu.</p>
        </div>
      ) : (
        <SelectField
          label="Size"
          name="page-size"
          value={sizeOf(page)}
          hint="How big it opens. The edge of its frame on the page changes it too."
          options={PAGE_SIZES.map((value) => ({ value, label: SIZE_NAMES[value] }))}
          onChange={(value) => {
            const size = PAGE_SIZES.find((one) => one === value);
            if (size) onChange(withSize(page, size), `making ${page.title} ${SIZE_NAMES[size].toLowerCase()}`);
          }}
        />
      )}
      <TextField
        label="Help topic"
        name="page-help"
        required={false}
        value={topic}
        error={topicError}
        hint="A topic of your documentation. Whoever uses the app, and may open that documentation, gets a Help button that shows it. Leave it empty for no help."
        onChange={(value) => {
          setTopic(value);
          const named = value.trim();
          if (named !== "" && !TOPIC.test(named)) {
            setTopicError(
              "A topic is lowercase letters, digits, hyphens and underscores, as it is written in the page's frontmatter.",
            );
            return;
          }
          setTopicError(undefined);
          const { help: _help, ...rest } = page;
          onChange(
            named === "" ? rest : { ...rest, help: named },
            "setting the page's help",
            `page-help:${page.id}`,
          );
        }}
      />
      {canRemove ? (
        <div>
          <Button variant="quiet" onClick={onRemove}>
            Remove page
          </Button>
        </div>
      ) : null}
    </section>
  );
}
