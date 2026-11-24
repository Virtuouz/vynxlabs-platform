/**
 * Tabs' drawer (board 18, right): the tabs with what each holds and an "Opens first" chip, and
 * the look. A tab row opens its own small view (rename, opens first, remove); the chip on a row
 * sets which tab opens first. A tab's id is made when it is added and never changes.
 */
import { childrenOf } from "@volvel/manifest";
import {
  Button,
  DrawerBlock,
  SegmentedControl,
  SelectField,
  type SortableItem,
  SortableRows,
  TextField,
  ToggleRow,
} from "@volvel/ui";
import { useState } from "react";
import { type TabFate, tabsFor, uniqueName } from "../model.ts";
import {
  BackHead,
  dashedFace,
  type Env,
  Group,
  LabelledBlock,
  reorderBy,
  setConfig,
} from "./recordShared.tsx";

const MAX_TABS = 8;

type Tab = { id: string; title: string };

export const heldWords = (count: number): string =>
  count === 0 ? "Empty" : `${count} widget${count === 1 ? "" : "s"}`;

/** The tab that opens first: the one named, else the first. */
export const opensFirstOf = (env: Env, tabs: readonly Tab[]): string | undefined => {
  const named = env.config.opensFirst;
  return tabs.find((one) => one.id === named)?.id ?? tabs[0]?.id;
};

export function TabsDisplaySection({ env }: { env: Env }) {
  const tabs = tabsFor({ ...env.widget, config: env.config });
  const first = opensFirstOf(env, tabs);
  const [open, setOpen] = useState<string | undefined>();
  const held = (id: string) => childrenOf(env.widgets, env.widget.id, id).length;
  const writeTabs = (next: Tab[], label: string, key?: string) =>
    env.write({ ...env.widget, config: { ...(env.widget.config ?? {}), tabs: next } }, label, key);
  const setFirst = (id: string) => setConfig(env, "opensFirst", id, "which tab opens first");

  const current = tabs.find((one) => one.id === open);
  if (current) {
    const others = tabs.filter((one) => one.id !== current.id);
    const count = held(current.id);
    return (
      <TabView
        env={env}
        tab={current}
        others={others}
        count={count}
        isFirst={first === current.id}
        onBack={() => setOpen(undefined)}
        onRename={(title) =>
          writeTabs(
            tabs.map((one) => (one.id === current.id ? { ...one, title } : one)),
            "renaming a tab",
            `tab:${env.widget.id}:${current.id}`,
          )
        }
        onFirst={() => setFirst(current.id)}
        onRemove={(fate) => {
          if (fate) env.onRemoveTab?.(current.id, fate);
          else writeTabs(others, `removing the tab ${current.title}`);
          setOpen(undefined);
        }}
      />
    );
  }

  const add = () => {
    const title = `Tab ${tabs.length + 1}`;
    writeTabs(
      [
        ...tabs,
        {
          id: uniqueName(
            title,
            tabs.map((one) => one.id),
            "tab",
            "-",
          ),
          title,
        },
      ],
      "adding a tab",
    );
  };
  const items: SortableItem[] = tabs.map((one) => ({
    id: one.id,
    label: one.title,
    sub: heldWords(held(one.id)),
    value: (
      <OpensFirstChip on={one.id === first} title={one.title} onPick={() => setFirst(one.id)} />
    ),
  }));
  return (
    <>
      <Group
        label="Tabs"
        note="Click a tab on the page to fill it. Rename one by choosing it here."
      >
        <SortableRows
          label="Tabs"
          items={items}
          onReorder={(ids) => writeTabs(reorderBy(tabs, ids), "moving a tab")}
          onOpen={setOpen}
        />
        {tabs.length < MAX_TABS ? (
          <div className="px-3 py-2">
            <button type="button" onClick={add} className={dashedFace}>
              <span aria-hidden="true">+</span>
              Tab
            </button>
          </div>
        ) : null}
      </Group>
      <Group label="Look">
        <LabelledBlock label="Style">
          <SegmentedControl<"underline" | "pills">
            label="Style"
            value={env.config.look === "pills" ? "pills" : "underline"}
            options={[
              { value: "underline", label: "Underline" },
              { value: "pills", label: "Pills" },
            ]}
            onChange={(next) => setConfig(env, "look", next, "its style")}
          />
        </LabelledBlock>
        <ToggleRow
          label="Remember the last tab"
          help="Per person, on this device."
          checked={env.config.remember === true}
          onChange={(next) => setConfig(env, "remember", next ? true : undefined, "remembering")}
        />
      </Group>
    </>
  );
}

/** The chip on a tab's row: it says which tab opens first, and a click on another's sets it. */
function OpensFirstChip({ on, title, onPick }: { on: boolean; title: string; onPick: () => void }) {
  if (on) {
    return (
      <span className="rounded-control border border-action bg-action-soft px-2 py-1 text-body-sm text-action">
        Opens first
      </span>
    );
  }
  // A row is one button, so this is a control beside the chevron, not a button inside a button.
  return (
    // biome-ignore lint/a11y/useSemanticElements: it sits inside a row that is itself a button
    <span
      role="button"
      tabIndex={0}
      aria-label={`Open ${title} first`}
      onClick={(event) => {
        event.stopPropagation();
        onPick();
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          event.stopPropagation();
          onPick();
        }
      }}
      className="rounded-control border border-transparent px-2 py-1 text-body-sm text-ink-muted opacity-0 outline-offset-1 hover:border-line hover:text-ink focus:opacity-100 focus-visible:outline-2 focus-visible:outline-focus group-hover:opacity-100 [li:hover_&]:opacity-100"
    >
      Opens first
    </span>
  );
}

function TabView({
  env,
  tab,
  others,
  count,
  isFirst,
  onBack,
  onRename,
  onFirst,
  onRemove,
}: {
  env: Env;
  tab: Tab;
  others: Tab[];
  count: number;
  isFirst: boolean;
  onBack: () => void;
  onRename: (title: string) => void;
  onFirst: () => void;
  onRemove: (fate: TabFate | undefined) => void;
}) {
  const [moveTo, setMoveTo] = useState(others[0]?.id ?? "");
  const last = others.length === 0;
  return (
    <div className="flex flex-col gap-4">
      <BackHead onBack={onBack} title={tab.title} kind={`Tab · ${heldWords(count)}`} />
      <Group label="Tab">
        <DrawerBlock>
          <TextField
            name={`${env.widget.id}-${tab.id}-title`}
            label="Name"
            required={false}
            value={tab.title}
            maxLength={40}
            onChange={onRename}
          />
        </DrawerBlock>
        <ToggleRow
          label="Opens first"
          help="When the address and memory say nothing."
          checked={isFirst}
          onChange={(next) => next && onFirst()}
        />
      </Group>
      {last ? (
        <p className="m-0 text-meta text-ink-muted">Tabs keeps at least one tab.</p>
      ) : count === 0 ? (
        <div>
          <Button size="small" variant="quiet" onClick={() => onRemove(undefined)}>
            Remove {tab.title}
          </Button>
        </div>
      ) : (
        <Group
          label="Remove"
          note={`${tab.title} holds ${heldWords(count).toLowerCase()}. Say where they go.`}
        >
          <DrawerBlock>
            <SelectField
              name={`${env.widget.id}-${tab.id}-move`}
              label="Move them to"
              value={moveTo}
              options={others.map((one) => ({ value: one.id, label: one.title }))}
              onChange={setMoveTo}
            />
            <div className="flex flex-wrap gap-2">
              <Button size="small" variant="secondary" onClick={() => onRemove({ move: moveTo })}>
                Move and remove the tab
              </Button>
              <Button size="small" variant="quiet" onClick={() => onRemove({ remove: true })}>
                Remove it with its widgets
              </Button>
            </div>
          </DrawerBlock>
        </Group>
      )}
    </div>
  );
}
