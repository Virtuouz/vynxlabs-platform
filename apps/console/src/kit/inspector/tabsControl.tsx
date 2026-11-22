/**
 * The `tabs` control: a container's tabs as a list. Add, rename, move (with the buttons, or
 * Alt and an arrow key in the name) and remove. A tab that holds widgets asks what to do
 * with them: move them to another tab, or remove them with it. A tab's id is made from its
 * title when it is added and never changes, so what is placed on it stays there.
 */
import { childrenOf } from "@volvel/manifest";
import { Button, Dialog, MoveButtons, SelectField, TextField, useFlip } from "@volvel/ui";
import { Plus, X } from "lucide-react";
import { useState } from "react";
import type { Env } from "./controls.tsx";
import { type TabFate, tabsFor, uniqueName, withConfig } from "./model.ts";

/** A page's container holds at most this many tabs. */
const MAX_TABS = 8;

type Tab = { id: string; title: string };

export function TabsControl({ env, field }: { env: Env; field: string }) {
  const tabs = tabsFor({ ...env.widget, config: env.config });
  const holder = useFlip<HTMLUListElement>(tabs.map((one) => one.id).join(" "));
  const [asking, setAsking] = useState<Tab | undefined>();
  const [moveTo, setMoveTo] = useState("");
  const held = (tab: string) => childrenOf(env.widgets, env.widget.id, tab).length;

  const keep = (next: Tab[], label: string, key?: string) =>
    env.write(withConfig(env.widget, "tabs", next), label, key);
  const add = () => {
    const title = `Tab ${tabs.length + 1}`;
    keep(
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
  const move = (at: number, by: -1 | 1) => {
    const next = [...tabs];
    const [taking] = next.splice(at, 1);
    if (taking) next.splice(at + by, 0, taking);
    keep(next, "moving a tab");
  };
  const remove = (tab: Tab, fate: TabFate | undefined) => {
    if (fate) {
      // What a tab held goes where it is told: the editor does it (`removeTab`), as one step.
      env.onRemoveTab?.(tab.id, fate);
    } else
      keep(
        tabs.filter((one) => one.id !== tab.id),
        `removing the tab ${tab.title}`,
      );
    setAsking(undefined);
  };
  const others = tabs.filter((one) => one.id !== asking?.id);
  const count = asking ? held(asking.id) : 0;

  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
      <legend className="p-0 text-body-sm font-medium text-ink">Tabs</legend>
      <p className="m-0 text-body-sm text-ink-muted">
        Each tab holds its own widgets. Drag a widget onto a tab to put it there.
      </p>
      <ul ref={holder} className="m-0 flex list-none flex-col gap-2 p-0">
        {tabs.map((tab, at) => (
          <li
            key={tab.id}
            data-flip-key={tab.id}
            aria-label={tab.title}
            className="flex flex-col gap-1 rounded-control border border-line p-2"
            onKeyDown={(event) => {
              if (!event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
              event.preventDefault();
              const by = event.key === "ArrowUp" ? -1 : 1;
              if (at + by >= 0 && at + by < tabs.length) move(at, by);
            }}
          >
            <div className="flex items-end gap-1">
              <div className="min-w-0 flex-1">
                <TitleField
                  label="Tab name"
                  name={`${field}-${tab.id}-title`}
                  title={tab.title}
                  onTitle={(title) =>
                    keep(
                      tabs.map((one) => (one.id === tab.id ? { ...one, title } : one)),
                      "renaming a tab",
                      `tab:${env.widget.id}:${tab.id}`,
                    )
                  }
                />
              </div>
              <MoveButtons
                label={tab.title}
                at={at}
                count={tabs.length}
                onMove={(by) => move(at, by)}
              />
              <Button
                size="small"
                variant="quiet"
                aria-label={`Remove the tab ${tab.title}`}
                disabled={tabs.length <= 1}
                tooltip={tabs.length <= 1 ? "Tabs hold at least one tab." : undefined}
                onClick={() => {
                  if (held(tab.id) === 0) remove(tab, undefined);
                  else {
                    setMoveTo(tabs.find((one) => one.id !== tab.id)?.id ?? "");
                    setAsking(tab);
                  }
                }}
              >
                <X aria-hidden="true" size={14} />
              </Button>
            </div>
            <span className="text-meta text-ink-muted">
              {held(tab.id) === 0
                ? "Nothing in it yet"
                : `${held(tab.id)} widget${held(tab.id) === 1 ? "" : "s"}`}
            </span>
          </li>
        ))}
      </ul>
      <div>
        <Button
          size="small"
          disabled={tabs.length >= MAX_TABS}
          tooltip={tabs.length >= MAX_TABS ? `Tabs hold at most ${MAX_TABS} tabs.` : undefined}
          onClick={add}
        >
          <Plus aria-hidden="true" size={14} /> Add a tab
        </Button>
      </div>
      <Dialog
        open={asking !== undefined}
        onClose={() => setAsking(undefined)}
        title={`Remove the tab “${asking?.title ?? ""}”?`}
        description={`It holds ${count} widget${count === 1 ? "" : "s"}. What should become of ${count === 1 ? "it" : "them"}?`}
      >
        <div className="flex flex-col gap-4">
          <SelectField
            label="Move them to"
            name={`${field}-move-to`}
            value={moveTo}
            options={others.map((one) => ({ value: one.id, label: one.title }))}
            onChange={setMoveTo}
          />
          <div className="flex flex-wrap justify-end gap-2">
            <Button onClick={() => setAsking(undefined)}>Cancel</Button>
            <Button variant="danger" onClick={() => asking && remove(asking, { remove: true })}>
              Remove them with the tab
            </Button>
            <Button
              variant="primary"
              disabled={moveTo === ""}
              onClick={() => asking && remove(asking, { move: moveTo })}
            >
              Move them and remove the tab
            </Button>
          </div>
        </div>
      </Dialog>
    </fieldset>
  );
}

/** A name that may be cleared while it is typed over: it is kept only when something is there. */
function TitleField({
  label,
  name,
  title,
  onTitle,
}: {
  label: string;
  name: string;
  title: string;
  onTitle: (title: string) => void;
}) {
  const [draft, setDraft] = useState<string | undefined>();
  return (
    <div role="presentation" onBlur={() => setDraft(undefined)}>
      <TextField
        label={label}
        name={name}
        required={false}
        maxLength={40}
        value={draft ?? title}
        onChange={(text) => {
          setDraft(text);
          if (text.trim() !== "") onTitle(text);
        }}
      />
    </div>
  );
}
