import type { Page } from "@volvel/manifest";
import { PAGE_SIZES } from "@volvel/manifest";
import {
  DrawerBlock,
  DrawerGroup,
  DrawerHeader,
  DrawerPanel,
  DrawerTabs,
  Menu,
  PAGE_ICONS,
  pageIconOf,
  SelectField,
  TextField,
  TilePicker,
} from "@volvel/ui";
import {
  AppWindow,
  Ellipsis,
  File,
  FileText,
  type LucideIcon,
  PanelRight,
  Trash2,
} from "lucide-react";
import { useId, useState } from "react";
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
  const prefix = useId();
  const [tab, setTab] = useState<"data" | "display">("display");
  const [topic, setTopic] = useState(page.help ?? "");
  const [topicError, setTopicError] = useState<string>();
  const tables = catalog.tables.map((one) => ({ value: one.name, label: heading(one.name) }));
  const opensOnRecord = kind !== "page";
  // A page's data is on its widgets: only one that opens on a record has some of its own. It has no rules.
  const tabs = [
    ...(opensOnRecord ? [{ id: "data", label: "Data" }] : []),
    { id: "display", label: "Display" },
  ];
  const current = opensOnRecord ? tab : "display";
  const PageIcon = pageIconOf(page.icon);
  const KindIcon = KIND_TILE_ICONS[kind];
  return (
    <section className="flex min-w-0 flex-col gap-4" aria-label="Page settings">
      <DrawerHeader
        icon={KindIcon}
        name={page.title}
        kind={KIND_NAMES[kind]}
        menu={
          canRemove ? (
            <Menu
              ariaLabel={`More about ${page.title}`}
              align="end"
              triggerClassName="inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-control border border-line-control hover:bg-sunken"
              label={<Ellipsis aria-hidden="true" size={16} />}
              items={[
                {
                  label: "Remove page",
                  icon: <Trash2 aria-hidden="true" size={14} />,
                  danger: true,
                  onSelect: onRemove,
                },
              ]}
            />
          ) : undefined
        }
      />
      <DrawerTabs
        idPrefix={prefix}
        label={`Settings of ${page.title}`}
        value={current}
        onChange={(next) => setTab(next as "data" | "display")}
        tabs={tabs}
      />
      <DrawerPanel idPrefix={prefix} tab={current}>
        {current === "display" ? (
          <>
            <DrawerGroup label="Page type" note={KIND_LINE}>
              <DrawerBlock>
                <TilePicker<PageKind>
                  label="Page type"
                  columns={2}
                  value={kind}
                  options={(Object.keys(KIND_NAMES) as PageKind[]).map((one) => ({
                    value: one,
                    label: KIND_NAMES[one],
                    icon: KIND_TILE_ICONS[one],
                  }))}
                  onChange={(one) => {
                    if (kind === one) return;
                    const table = page.record?.table ?? mostReadTable ?? tables[0]?.value;
                    onChange(
                      withKind(page, one, one === "modal" ? page.record?.table : table),
                      `making ${page.title} a ${KIND_NAMES[one].toLowerCase()}`,
                    );
                  }}
                />
              </DrawerBlock>
            </DrawerGroup>
            <DrawerGroup label={kind === "page" ? "In the app menu" : "Name"}>
              <DrawerBlock>
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
                    if (title)
                      onChange({ ...page, title }, "renaming the page", `page-title:${page.id}`);
                  }}
                />
                {kind === "page" ? (
                  <div className="flex flex-col gap-1.5">
                    <SelectField
                      label="Icon"
                      name="page-icon"
                      icon={
                        PageIcon ? (
                          <span data-page-icon-preview="" className="flex">
                            <PageIcon size={16} />
                          </span>
                        ) : undefined
                      }
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
                        onChange(
                          value ? { ...rest, icon: value } : rest,
                          "choosing the page's icon",
                        );
                      }}
                    />
                    <p className="m-0 text-meta text-ink-muted">
                      Drawn beside its title in the app's menu.
                    </p>
                  </div>
                ) : kind === "record" ? null : (
                  // Only a side sheet or a modal opens over something, so only they have a size.
                  <SelectField
                    label="Size"
                    name="page-size"
                    value={sizeOf(page)}
                    hint="How big it opens. The edge of its frame on the page changes it too."
                    options={PAGE_SIZES.map((value) => ({ value, label: SIZE_NAMES[value] }))}
                    onChange={(value) => {
                      const size = PAGE_SIZES.find((one) => one === value);
                      if (size)
                        onChange(
                          withSize(page, size),
                          `making ${page.title} ${SIZE_NAMES[size].toLowerCase()}`,
                        );
                    }}
                  />
                )}
              </DrawerBlock>
            </DrawerGroup>
            <DrawerGroup label="Help">
              <DrawerBlock>
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
              </DrawerBlock>
            </DrawerGroup>
          </>
        ) : (
          <DrawerGroup
            label="Opens on"
            note="A page has no rules of its own: who sees what is set on its widgets."
          >
            <DrawerBlock>
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
                  ...(kind === "modal"
                    ? [{ value: "", label: "None: it opens on no record" }]
                    : []),
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
            </DrawerBlock>
          </DrawerGroup>
        )}
      </DrawerPanel>
    </section>
  );
}
