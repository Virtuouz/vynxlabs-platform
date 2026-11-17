import type { InterfacePage, WidgetAction, WidgetType } from "@vynxlabs/manifest";
import { PageRenderer, settle, type TableInfo, type TargetInfo } from "@vynxlabs/screens";
import { Button, SelectField } from "@vynxlabs/ui";
import { Plus } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useLoad } from "../../api.ts";
import { notify } from "../../ask.tsx";
import type { TargetFacts } from "../ActionSettings.tsx";
import { VIEWPORTS } from "./AppBuilder.tsx";
import { clientFor, keyOf, pageActions, TYPES, tablesOf, useTables } from "./data.ts";
import { EditorShell } from "./EditorShell.tsx";
import { PageFilterSettings } from "./PageFilters.tsx";
import { WidgetSettings } from "./WidgetSettings.tsx";

/** A page as it is, for someone who may look and not change it. */
export function PageView({ root, page }: { root: string; page: InterfacePage }) {
  const client = useMemo(() => clientFor(root), [root]);
  const [known, setKnown] = useState<Record<string, TableInfo>>({});
  const tables = useTables(root, tablesOf({ title: "", pages: [page] }, known));
  useEffect(() => setKnown(tables), [tables]);
  return <PageRenderer page={page} tables={known} client={client} />;
}

// ----- One page being worked on -----

/**
 * A page drawn from the workspace's rows as the member may read them, beside
 * the settings of the widget that is chosen. The builder of an app uses it
 * for each of the app's pages, and a dashboard is one of these.
 */
export function PageEditor({
  root,
  page,
  selected,
  onSelect,
  onChange,
  interfacePath,
  kinds,
  shell,
  pages,
}: {
  root: string;
  /** The interface the page is of, so the builder can say who would not see an action. */
  interfacePath?: string | undefined;
  page: InterfacePage;
  selected: string | undefined;
  onSelect: (widget: string | undefined) => void;
  /** Every change goes through here, named for undo; `key` joins quick changes into one step. */
  onChange: (apply: (page: InterfacePage) => void, label?: string, key?: string) => void;
  /** The kinds of widget that can be added. Every kind when left out. */
  kinds?: WidgetType[];
  /** The toolbar and its notices, as the editor around the page has them. */
  shell: Omit<Parameters<typeof EditorShell>[0], "outline" | "canvas" | "inspector">;
  /** The pages of an app, above what is on this one. */
  pages?: ReactNode;
}) {
  const tableList = useLoad<{ items: { name: string; status: string }[] }>(`${root}/tables`);
  const [viewport, setViewport] = useState<keyof typeof VIEWPORTS>("desktop");
  const [asGroup, setAsGroup] = useState("");
  const tenantBase = root.split("/workspaces/")[0] ?? "";
  const memberGroups = useLoad<{ items: { id: string; name: string }[] }>(
    `${tenantBase}/groups?limit=200`,
  );
  const endUserGroups = useLoad<{ items: { id: string; name: string }[] }>(
    `${tenantBase}/end-user-groups?limit=200`,
  );
  const client = useMemo(() => clientFor(root, asGroup || undefined), [root, asGroup]);
  const [known, setKnown] = useState<Record<string, TableInfo>>({});
  const tables = useTables(root, tablesOf({ title: "", pages: [page] }, known));
  useEffect(() => setKnown(tables), [tables]);
  const tableNames = (tableList.data?.items ?? [])
    .filter((table) => table.status === "active")
    .map((table) => table.name);
  const widget = page.widgets.find((candidate) => candidate.id === selected);

  // What the page's actions start, and who would not see them.
  const keys = [...new Set(pageActions(page).map(keyOf))].sort();
  const facts = useLoad<{ items: TargetFacts[] }>(
    keys.length > 0
      ? `${root}/interface-targets?targets=${encodeURIComponent(keys.join(","))}${
          interfacePath ? `&interface=${encodeURIComponent(interfacePath)}` : ""
        }`
      : null,
  );
  const factsOf = (action: WidgetAction) =>
    facts.data?.items.find((one) => one.key === keyOf(action));
  const targets: Record<string, TargetInfo> = Object.fromEntries(
    (facts.data?.items ?? []).map((one) => [
      one.key,
      {
        canStart: one.found && one.startable,
        description: one.description,
        inputSchema: one.inputSchema,
      },
    ]),
  );
  const workspace = useLoad<{ type: string }>(root);
  const consoleBase = root.replace(/^\/tenants\//, "/t/");

  const addWidget = (type: WidgetType) => {
    let id: string = type;
    for (let count = 2; page.widgets.some((one) => one.id === id); count += 1) {
      id = `${type}_${count}`;
    }
    onChange(
      (target) => {
        const bottom = Math.max(0, ...target.widgets.map((one) => one.at.y + one.at.h));
        const wide = type === "table" || type === "cards";
        target.widgets.push({
          id,
          type,
          title: TYPES.find((one) => one.type === type)?.label ?? type,
          at: {
            x: 0,
            y: bottom,
            w: wide ? 12 : type === "figure" || type === "action" ? 3 : 6,
            h: type === "text" || type === "figure" ? 3 : type === "action" ? 2 : 8,
          },
          ...(type === "text" ? { options: { text: "Write something here." } } : {}),
          ...(type === "figure"
            ? { summary: { groupBy: [], aggregates: [{ fn: "count" as const, as: "count" }] } }
            : {}),
        });
      },
      `adding ${TYPES.find((one) => one.type === type)?.label.toLowerCase() ?? type}`,
    );
    onSelect(id);
  };
  const offered = TYPES.filter((one) => !kinds || kinds.includes(one.type));

  return (
    <EditorShell
      {...shell}
      outline={
        <>
          {pages}
          <section aria-labelledby="on-the-page" className="flex flex-col gap-1">
            <h2 id="on-the-page" className="m-0 text-label text-ink-subtle uppercase">
              On this page
            </h2>
            {page.widgets.length === 0 ? (
              <p className="m-0 text-body-sm text-ink-muted">Nothing yet.</p>
            ) : (
              <ul className="m-0 flex list-none flex-col p-0">
                {[...page.widgets]
                  .sort((a, b) => a.at.y - b.at.y || a.at.x - b.at.x)
                  .map((one) => (
                    <li key={one.id}>
                      <button
                        type="button"
                        aria-current={one.id === selected ? "true" : undefined}
                        onClick={() => onSelect(one.id)}
                        className={`w-full truncate rounded-inner px-2 py-1 text-left text-body-sm ${
                          one.id === selected
                            ? "bg-selected text-action"
                            : "text-ink hover:bg-sunken"
                        }`}
                      >
                        {one.title || one.id}
                      </button>
                    </li>
                  ))}
              </ul>
            )}
          </section>
          {page.widgets.length < 12 ? (
            <section aria-labelledby="add-a-widget" className="flex flex-col gap-1">
              <h2 id="add-a-widget" className="m-0 text-label text-ink-subtle uppercase">
                Add
              </h2>
              <div className="flex flex-wrap gap-1 lg:flex-col">
                {offered.map((one) => (
                  <Button
                    key={one.type}
                    size="small"
                    variant="quiet"
                    className="lg:justify-start"
                    tooltip={one.about}
                    onClick={() => addWidget(one.type)}
                  >
                    <Plus size={14} aria-hidden="true" /> {one.label}
                  </Button>
                ))}
              </div>
            </section>
          ) : null}
        </>
      }
      canvas={
        <>
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div
              role="radiogroup"
              aria-label="Screen size"
              className="flex rounded-control border border-line p-0.5"
            >
              {(Object.keys(VIEWPORTS) as (keyof typeof VIEWPORTS)[]).map((one) => {
                const Icon = VIEWPORTS[one].icon;
                return (
                  // biome-ignore lint/a11y/useSemanticElements: a segmented control of toggle buttons
                  <button
                    key={one}
                    type="button"
                    role="radio"
                    aria-checked={viewport === one}
                    onClick={() => setViewport(one)}
                    className={`flex items-center gap-1.5 rounded-inner px-3 py-1 text-meta ${
                      viewport === one ? "bg-selected text-ink" : "text-ink-muted hover:text-ink"
                    }`}
                  >
                    <Icon aria-hidden="true" size={14} /> {VIEWPORTS[one].label}
                    {VIEWPORTS[one].width ? (
                      <span className="font-mono text-tag text-ink-subtle">
                        {VIEWPORTS[one].width}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
            <div className="w-64">
              <SelectField
                label="See it as"
                name="as"
                value={asGroup}
                onChange={setAsGroup}
                options={[
                  { value: "", label: "You, as you may read it" },
                  ...(endUserGroups.data?.items ?? []).map((group) => ({
                    value: group.id,
                    label: `End users in ${group.name}`,
                  })),
                  ...(memberGroups.data?.items ?? []).map((group) => ({
                    value: group.id,
                    label: `Members in ${group.name}`,
                  })),
                ]}
              />
            </div>
          </div>
          {asGroup ? (
            <p className="mt-0 mb-3 text-meta text-ink-muted">
              Rows as someone in this group who owns none would see them. Owner rules show nothing
              here.
            </p>
          ) : null}
          <div
            data-preview={viewport}
            className="mx-auto overflow-x-auto rounded-panel border border-line bg-canvas p-3 transition-[max-width] motion-slow"
            style={{
              maxWidth: VIEWPORTS[viewport].width ? `${VIEWPORTS[viewport].width}px` : undefined,
            }}
          >
            <PageRenderer
              page={page}
              tables={known}
              client={client}
              targets={targets}
              member
              runLink={(run) => `${consoleBase}/runs/${run.id}`}
              // Outside a dev workspace the preview says what an action would send, and starts nothing.
              dryRun={workspace.data?.type !== "dev"}
              editing={{
                selected,
                onSelect,
                onMove: (id, to) =>
                  onChange(
                    (target) => {
                      const moved = target.widgets.find((one) => one.id === id);
                      if (moved) moved.at = to;
                      // Whatever it was dropped on moves out of its way.
                      settle(target.widgets, id);
                    },
                    "moving a widget",
                    `move:${id}`,
                  ),
              }}
            />
          </div>
          <PageFilterSettings page={page} known={known} onChange={onChange} />
        </>
      }
      inspector={
        widget ? (
          <WidgetSettings
            key={widget.id}
            root={root}
            factsOf={factsOf}
            widget={widget}
            page={page}
            tables={known}
            tableNames={tableNames}
            onChange={(apply) =>
              onChange(
                (target) => {
                  const changed = target.widgets.find((one) => one.id === widget.id);
                  if (!changed) return;
                  const before = JSON.stringify(changed.at);
                  apply(changed);
                  if (JSON.stringify(changed.at) !== before) settle(target.widgets, widget.id);
                },
                `changing ${widget.title ? `“${widget.title}”` : "the widget"}`,
                `settings:${widget.id}`,
              )
            }
            onRemove={() => {
              const name = widget.title ? `“${widget.title}”` : "the widget";
              onChange((target) => {
                target.widgets = target.widgets.filter((one) => one.id !== widget.id);
                // Whatever followed it follows nothing now.
                for (const one of target.widgets) {
                  if (one.link?.from === widget.id) delete one.link;
                }
                // What was under it rises into the room it left.
                settle(target.widgets, undefined);
              }, `removing ${name}`);
              onSelect(undefined);
              notify.success(`Removed ${name}.`, {
                action: { label: "Undo", onClick: shell.history.undo },
              });
            }}
          />
        ) : (
          <p className="m-0 text-ink-muted">
            Press Edit on a widget to change it, or add one. What you see is drawn from this
            workspace's rows, as you may read them.
          </p>
        )
      }
    />
  );
}
