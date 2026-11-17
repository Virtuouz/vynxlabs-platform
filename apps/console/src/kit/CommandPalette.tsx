import { CheckboxField, Dialog, Kbd } from "@vynxlabs/ui";
import {
  Activity,
  Boxes,
  Braces,
  CornerDownLeft,
  FileCode2,
  Keyboard,
  type LucideIcon,
  Play,
  Plug,
  Radio,
  Search,
  Table2,
  User,
  Workflow,
  Zap,
} from "lucide-react";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api.ts";
import { notify } from "../ask.tsx";
import { InputDialog } from "../InputDialog.tsx";
import { navigate } from "../router.tsx";
import { useThemeChoice } from "../theme.ts";
import {
  formatCombo,
  isMac,
  isSingle,
  OPEN_PALETTE,
  OPEN_SHORTCUTS,
  openShortcuts,
  useShortcut,
  useSingleKeys,
} from "./keys.ts";
import { objectHref } from "./objects.tsx";
import { SCOPES, SHORTCUTS, type ShortcutId } from "./shortcuts.ts";

export interface Destination {
  key: string;
  label: string;
  /** Where it is: "Acme › Orders dev", shown after the label. */
  where?: string;
  to: string;
  icon?: LucideIcon;
}

/** Something the search found, as `GET /tenants/:t/search` gives it. */
interface Found {
  kind: string;
  id: string;
  ref: string;
  workspaceId: string | null;
  workspaceSlug: string | null;
  title: string;
  hint: string | null;
}

/** One line of the palette. */
interface Item {
  key: string;
  label: string;
  where?: string | undefined;
  icon?: LucideIcon | undefined;
  section: string;
  open: () => void;
  /** What ⌘↵ does with it: Run, Start, Pause, Run again. */
  secondary?: { label: string; run: () => void } | undefined;
}

const KIND_ICON: Record<string, LucideIcon> = {
  script: FileCode2,
  flow: Workflow,
  app: Boxes,
  interface: Boxes,
  table: Table2,
  trigger: Zap,
  schedule: Zap,
  connection: Plug,
  event: Radio,
  run: Play,
  flow_run: Play,
  member: User,
  end_user: User,
};
const KIND_LABEL: Record<string, string> = {
  script: "Script",
  flow: "Flow",
  app: "App",
  interface: "App Builder",
  table: "Table",
  trigger: "Trigger",
  schedule: "Schedule",
  connection: "Connection",
  event: "Event",
  run: "Run",
  flow_run: "Flow run",
  member: "Member",
  end_user: "End user",
};
const SECTIONS = [
  "Recent",
  "This workspace",
  "Other workspaces",
  "Runs",
  "People",
  "Screens",
  "Actions",
  "Choose",
];

/** Ranks a text for what was typed: every word must appear; earlier is better. */
function score(label: string, where: string | undefined, words: string[]): number {
  const text = `${label} ${where ?? ""}`.toLowerCase();
  let total = 0;
  for (const word of words) {
    const at = text.indexOf(word);
    if (at < 0) return -1;
    total += at === 0 ? 0 : label.toLowerCase().startsWith(word) ? 1 : 2 + at / 100;
  }
  return total;
}

/** Opens on ⌘K or Ctrl+K anywhere, from the header's search box, and when asked by `openPalette`. */
export function useCommandKey(open: () => void) {
  useShortcut("palette", open);
  useEffect(() => {
    addEventListener(OPEN_PALETTE, open);
    return () => removeEventListener(OPEN_PALETTE, open);
  }, [open]);
}

/** Where a found thing's page is. */
function pageOf(tenantId: string, found: Found): string {
  if (found.kind === "member") return `/t/${tenantId}/members`;
  if (found.kind === "end_user") return `/t/${tenantId}/end-users`;
  const ws = `/t/${tenantId}/workspaces/${found.workspaceId}`;
  switch (found.kind) {
    // A script found by name is most often wanted to be changed.
    case "script":
      return `${ws}/scripts/edit/${found.ref}`;
    case "flow":
    case "interface":
    case "table":
    case "trigger":
    case "schedule":
    case "connection":
    case "variable":
    case "secret":
    case "event":
    case "app":
      return objectHref(ws, found.kind, found.ref);
    default:
      return `${ws}/runs/${found.id}`;
  }
}

/** What was typed, read for its prefix: `>` runs, `#` resources, `/` actions, `@` people. */
function readQuery(query: string): {
  mode: "all" | "runs" | "resources" | "actions" | "people";
  text: string;
} {
  const first = query.charAt(0);
  const text = query.slice(1).trim();
  if (first === ">") return { mode: "runs", text };
  if (first === "#") return { mode: "resources", text };
  if (first === "/") return { mode: "actions", text };
  if (first === "@") return { mode: "people", text };
  return { mode: "all", text: query.trim() };
}

type Picking = "script" | "flow" | "pause" | "resume" | "workspace";

/**
 * Jump to a screen, find a script, a flow or a run by name or ID, or do
 * something: run a script, start a flow, pause a trigger. Recent things first.
 */
export function CommandPalette({
  open,
  onClose,
  destinations,
  tenantId,
  workspaceId,
  workspaceType,
  workspaces = [],
}: {
  open: boolean;
  onClose: () => void;
  destinations: Destination[];
  tenantId?: string | undefined;
  workspaceId?: string | undefined;
  workspaceType?: string | undefined;
  workspaces?: { id: string; name: string }[];
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [found, setFound] = useState<Found[]>([]);
  const [recent, setRecent] = useState<(Found & { visitedAt: string })[]>([]);
  const [picking, setPicking] = useState<Picking>();
  const [choices, setChoices] = useState<Item[]>([]);
  const [starting, setStarting] = useState<{
    kind: "script" | "flow";
    path: string;
    workspaceId: string;
    schema: Record<string, unknown> | undefined;
  }>();
  const [theme, setTheme] = useThemeChoice();
  const list = useRef<HTMLDivElement>(null);
  const asked = useRef(0);
  const ws = tenantId && workspaceId ? `/tenants/${tenantId}/workspaces/${workspaceId}` : undefined;

  // biome-ignore lint/correctness/useExhaustiveDependencies: starts empty each time it opens
  useEffect(() => {
    setQuery("");
    setActive(0);
    setPicking(undefined);
    setFound([]);
    if (!open || !tenantId) return;
    api
      .get<{ items: (Found & { visitedAt: string; workspaceId: string })[] }>(
        `/me/recent-items?tenant=${tenantId}`,
      )
      .then(
        (answer) =>
          setRecent(
            answer.items.map((one) => ({
              ...one,
              id: one.ref,
              hint: null,
            })),
          ),
        () => setRecent([]),
      );
  }, [open]);

  const { mode, text } = readQuery(query);

  // What the server finds, asked for once typing pauses. An older answer is dropped.
  useEffect(() => {
    if (!open || !tenantId || picking || mode === "actions" || text === "") {
      setFound([]);
      return;
    }
    const mine = ++asked.current;
    const timer = setTimeout(() => {
      const only = mode === "all" ? "" : `&only=${mode}`;
      const here = workspaceId ? `&workspace=${workspaceId}` : "";
      api
        .get<{ items: Found[] }>(
          `/tenants/${tenantId}/search?q=${encodeURIComponent(text)}${here}${only}`,
        )
        .then(
          (answer) => mine === asked.current && setFound(answer.items),
          () => mine === asked.current && setFound([]),
        );
    }, 150);
    return () => clearTimeout(timer);
  }, [open, tenantId, workspaceId, mode, text, picking]);

  const close = () => onClose();

  /** Opens the form a script or a flow takes, and starts it. */
  const start = async (kind: "script" | "flow", path: string, inWorkspace: string) => {
    if (!tenantId) return;
    const root = `/tenants/${tenantId}/workspaces/${inWorkspace}`;
    let schema: Record<string, unknown> | undefined;
    try {
      if (kind === "script") {
        const resource = await api.get<{ body: { input?: Record<string, unknown> } }>(
          `${root}/resources/${path}`,
        );
        schema = resource.body.input;
      } else {
        const flows = await api.get<{
          items: { path: string; manualInput: Record<string, unknown> | null }[];
        }>(`${root}/flows`);
        schema = flows.items.find((one) => one.path === path)?.manualInput ?? undefined;
      }
    } catch {
      // Without its schema, the input is asked for as JSON.
    }
    close();
    setStarting({ kind, path, workspaceId: inWorkspace, schema });
  };

  const pause = async (path: string, node: string, on: boolean) => {
    if (!ws) return;
    const at = `${ws}/trigger-pauses/${path}${node ? `?node=${encodeURIComponent(node)}` : ""}`;
    try {
      if (on) await api.put(at, {});
      else await api.delete(at);
      notify.success(on ? `${path} is paused.` : `${path} is resumed.`);
    } catch (error) {
      notify.error(error);
    }
    close();
  };

  /** What a picker offers, read when it opens. */
  // biome-ignore lint/correctness/useExhaustiveDependencies: read once per picker
  useEffect(() => {
    if (!picking) return;
    setChoices([]);
    if (picking === "workspace") {
      setChoices(
        workspaces.map((one) => ({
          key: `pick-${one.id}`,
          label: one.name,
          section: "Choose",
          icon: Boxes,
          open: () => {
            close();
            navigate(`/t/${tenantId}/workspaces/${one.id}/overview`);
          },
        })),
      );
      return;
    }
    if (!ws || !workspaceId) return;
    const load = async (): Promise<Item[]> => {
      if (picking === "script") {
        const scripts = await api.get<{
          items: { path: string; description?: string; deployed?: boolean }[];
        }>(`${ws}/scripts`);
        // Only what runs here can be started: a script that is only a draft cannot yet.
        return scripts.items
          .filter((one) => one.deployed !== false)
          .map((one) => ({
            key: `pick-${one.path}`,
            label: one.path,
            where: one.description,
            section: "Choose",
            icon: FileCode2,
            open: () => void start("script", one.path, workspaceId),
          }));
      }
      if (picking === "flow") {
        const flows = await api.get<{ items: { path: string; triggers: string[] }[] }>(
          `${ws}/flows`,
        );
        return flows.items
          .filter((one) => one.triggers.includes("manual"))
          .map((one) => ({
            key: `pick-${one.path}`,
            label: one.path,
            section: "Choose",
            icon: Workflow,
            open: () => void start("flow", one.path, workspaceId),
          }));
      }
      const triggers = await api.get<{
        items: { path: string; node: string; type: string; paused: unknown }[];
      }>(`${ws}/triggers`);
      return triggers.items
        .filter((one) => (picking === "pause" ? !one.paused : one.paused))
        .map((one) => ({
          key: `pick-${one.path}#${one.node}`,
          label: one.node ? `${one.path}#${one.node}` : one.path,
          where: one.type,
          section: "Choose",
          icon: Zap,
          open: () => void pause(one.path, one.node, picking === "pause"),
        }));
    };
    load().then(setChoices, (error) => notify.error(error));
  }, [picking]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: the helpers it calls read only what is listed
  const items = useMemo<Item[]>(() => {
    const words = text.toLowerCase().split(/\s+/).filter(Boolean);
    const matches = (label: string, where?: string) =>
      words.length === 0 || score(label, where, words) >= 0;
    if (picking) return choices.filter((one) => matches(one.label, one.where));

    const actions: Item[] = [
      ...(ws && workspaceId
        ? [
            {
              key: "a-run",
              label: "Run script…",
              icon: Play,
              section: "Actions",
              open: () => {
                setQuery("");
                setPicking("script");
              },
            },
            {
              key: "a-start",
              label: "Start flow…",
              icon: Workflow,
              section: "Actions",
              open: () => {
                setQuery("");
                setPicking("flow");
              },
            },
            ...(workspaceType === "dev"
              ? [
                  {
                    key: "a-new-script",
                    label: "New script",
                    icon: FileCode2,
                    section: "Actions",
                    open: () => {
                      close();
                      navigate(`/t/${tenantId}/workspaces/${workspaceId}/scripts/new`);
                    },
                  },
                  {
                    key: "a-new-flow",
                    label: "New flow",
                    icon: Workflow,
                    section: "Actions",
                    open: () => {
                      close();
                      navigate(`/t/${tenantId}/workspaces/${workspaceId}/flows/new`);
                    },
                  },
                ]
              : []),
            {
              key: "a-pause",
              label: "Pause trigger…",
              icon: Zap,
              section: "Actions",
              open: () => {
                setQuery("");
                setPicking("pause");
              },
            },
            {
              key: "a-resume",
              label: "Resume trigger…",
              icon: Zap,
              section: "Actions",
              open: () => {
                setQuery("");
                setPicking("resume");
              },
            },
            {
              key: "a-copy",
              label: "Copy workspace ID",
              icon: Braces,
              section: "Actions",
              open: () => {
                void navigator.clipboard?.writeText(workspaceId).catch(() => {});
                notify.success("The workspace ID is copied.");
                close();
              },
            },
          ]
        : []),
      ...(tenantId && workspaces.length > 1
        ? [
            {
              key: "a-switch",
              label: "Switch workspace…",
              icon: Boxes,
              section: "Actions",
              open: () => {
                setQuery("");
                setPicking("workspace");
              },
            },
          ]
        : []),
      {
        key: "a-theme",
        label: `Switch to ${theme === "dark" ? "light" : "dark"} theme`,
        icon: Activity,
        section: "Actions",
        open: () => {
          setTheme(theme === "dark" ? "light" : "dark");
          close();
        },
      },
      {
        key: "a-api",
        label: "Open the API description",
        icon: Braces,
        section: "Actions",
        open: () => {
          close();
          window.open("/api/v1/openapi.json", "_blank", "noopener");
        },
      },
      {
        key: "a-keys",
        label: "Keyboard shortcuts",
        icon: Keyboard,
        section: "Actions",
        open: () => {
          close();
          openShortcuts();
        },
      },
    ];
    if (mode === "actions") return actions.filter((one) => matches(one.label));

    const entity = (one: Found, section: string): Item => {
      const inWorkspace = one.workspaceId ?? workspaceId ?? "";
      const secondary =
        one.kind === "script"
          ? { label: "Run", run: () => void start("script", one.ref, inWorkspace) }
          : one.kind === "flow"
            ? { label: "Start", run: () => void start("flow", one.ref, inWorkspace) }
            : one.kind === "run" || one.kind === "flow_run"
              ? {
                  label: "Run again",
                  run: async () => {
                    const root = `/tenants/${tenantId}/workspaces/${inWorkspace}`;
                    try {
                      const made =
                        one.kind === "run"
                          ? await api.post<{ id: string }>(`${root}/runs/${one.id}/rerun`, {})
                          : await api.post<{ id: string }>(`${root}/flow-runs/${one.id}/retry`, {
                              from: "start",
                            });
                      close();
                      navigate(`/t/${tenantId}/workspaces/${inWorkspace}/runs/${made.id}`);
                    } catch (error) {
                      notify.error(error);
                    }
                  },
                }
              : undefined;
      return {
        key: `${section}-${one.kind}-${one.id}`,
        label: one.title,
        where: [KIND_LABEL[one.kind] ?? one.kind, one.workspaceSlug, one.hint]
          .filter(Boolean)
          .join(" · "),
        icon: KIND_ICON[one.kind],
        section,
        open: () => {
          close();
          if (tenantId) navigate(pageOf(tenantId, one));
        },
        secondary,
      };
    };

    const screens: Item[] = destinations
      .map(
        (destination) => [destination, score(destination.label, destination.where, words)] as const,
      )
      .filter(([, rank]) => words.length === 0 || rank >= 0)
      .sort((a, b) => a[1] - b[1])
      .map(([destination]) => ({
        key: `d-${destination.key}`,
        label: destination.label,
        where: destination.where,
        icon: destination.icon,
        section: "Screens",
        open: () => {
          close();
          navigate(destination.to);
        },
      }));

    if (text === "") {
      return [
        ...recent.slice(0, 8).map((one) => entity(one, "Recent")),
        ...(mode === "all" ? screens.slice(0, 12) : []),
        ...(mode === "all" ? actions.slice(0, 4) : []),
      ];
    }
    const sectionOf = (one: Found) =>
      one.kind === "run" || one.kind === "flow_run"
        ? "Runs"
        : one.kind === "member" || one.kind === "end_user"
          ? "People"
          : one.workspaceId === workspaceId
            ? "This workspace"
            : "Other workspaces";
    const results = found.map((one) => entity(one, sectionOf(one)));
    if (mode !== "all") return results;
    return [...results, ...screens.slice(0, 20), ...actions.filter((one) => matches(one.label))];
  }, [
    text,
    mode,
    picking,
    choices,
    found,
    recent,
    destinations,
    tenantId,
    workspaceId,
    workspaceType,
    workspaces,
    theme,
  ]);

  // Lines grouped by section, in the sections' order.
  const ordered = useMemo(
    () => [...items].sort((a, b) => SECTIONS.indexOf(a.section) - SECTIONS.indexOf(b.section)),
    [items],
  );

  useEffect(() => {
    list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const placeholder = picking
    ? {
        script: "Choose the script to run",
        flow: "Choose the flow to start",
        pause: "Choose the trigger to pause",
        resume: "Choose the trigger to resume",
        workspace: "Choose a workspace",
      }[picking]
    : "Find anything. > runs, # resources, / actions, @ people";

  let lastSection = "";
  return (
    <>
      <Dialog open={open} onClose={onClose} title="Go to" size="palette">
        <div className="flex flex-col gap-2">
          <label className="flex h-10 items-center gap-2 rounded-control border border-line-strong bg-structure px-3">
            <Search aria-hidden="true" size={16} className="text-ink-subtle" />
            <input
              autoFocus
              role="combobox"
              aria-expanded="true"
              aria-controls="command-results"
              aria-activedescendant={ordered[active] ? `command-${ordered[active].key}` : undefined}
              aria-label={placeholder}
              placeholder={placeholder}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActive(0);
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setActive((at) => Math.min(at + 1, ordered.length - 1));
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setActive((at) => Math.max(at - 1, 0));
                } else if (event.key === "Enter") {
                  event.preventDefault();
                  const chosen = ordered[active];
                  if (!chosen) return;
                  if ((event.metaKey || event.ctrlKey) && chosen.secondary) chosen.secondary.run();
                  else chosen.open();
                } else if (event.key === "Backspace" && query === "" && picking) {
                  setPicking(undefined);
                }
              }}
              className="min-w-0 flex-1 border-0 bg-transparent text-ink outline-none placeholder:text-ink-subtle"
            />
          </label>
          <div
            id="command-results"
            ref={list}
            role="listbox"
            aria-label="Results"
            className="max-h-[calc(100vh-10rem)] overflow-y-auto md:max-h-[55vh]"
          >
            {ordered.length === 0 ? (
              <p className="m-0 px-3 py-6 text-center text-ink-muted">
                {text ? `Nothing matches “${text}”.` : "Type to find something."}
              </p>
            ) : (
              ordered.map((item, index) => {
                const Icon = item.icon;
                const heading: ReactNode =
                  item.section !== lastSection ? (
                    <div
                      role="presentation"
                      className="px-3 pt-2 pb-1 text-meta font-medium tracking-wide text-ink-subtle uppercase"
                    >
                      {item.section}
                    </div>
                  ) : null;
                lastSection = item.section;
                return (
                  <div key={item.key}>
                    {heading}
                    <div
                      tabIndex={-1}
                      id={`command-${item.key}`}
                      data-index={index}
                      role="option"
                      aria-selected={index === active}
                      onMouseEnter={() => setActive(index)}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        item.open();
                      }}
                      className={`flex cursor-default items-center gap-2 rounded-control px-3 py-2 ${
                        index === active ? "bg-selected" : ""
                      }`}
                    >
                      {Icon ? (
                        <Icon aria-hidden="true" size={16} className="shrink-0 text-ink-muted" />
                      ) : null}
                      {/* The name keeps its room; what it is, and where, gives way. */}
                      <span className="max-w-[75%] shrink-0 truncate">{item.label}</span>
                      {item.where ? (
                        <span className="min-w-0 flex-1 truncate text-meta text-ink-subtle">
                          {item.where}
                        </span>
                      ) : null}
                      {index === active ? (
                        <span className="ml-auto flex shrink-0 items-center gap-2 text-meta text-ink-subtle">
                          {item.secondary ? (
                            <span className="hidden md:inline">⌘↵ {item.secondary.label}</span>
                          ) : null}
                          <CornerDownLeft aria-hidden="true" size={14} />
                        </span>
                      ) : null}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </Dialog>
      {starting && tenantId ? (
        <InputDialog
          open
          onClose={() => setStarting(undefined)}
          title={`${starting.kind === "script" ? "Run" : "Start"} ${starting.path}`}
          action={starting.kind === "script" ? "Run" : "Start flow"}
          schema={starting.schema}
          onSubmit={async (input) => {
            const root = `/tenants/${tenantId}/workspaces/${starting.workspaceId}`;
            const made =
              starting.kind === "script"
                ? await api.post<{ id: string }>(`${root}/runs`, { script: starting.path, input })
                : await api.post<{ id: string }>(`${root}/flow-runs`, {
                    flow: starting.path,
                    input,
                  });
            setStarting(undefined);
            navigate(`/t/${tenantId}/workspaces/${starting.workspaceId}/runs/${made.id}`);
          }}
        />
      ) : null}
    </>
  );
}

/**
 * Every shortcut, from the registry, grouped by where it works: `?` outside a
 * text field, "Keyboard shortcuts" in the account menu, or the palette. It
 * holds the switch for single-key shortcuts, which some people need off.
 */
export function ShortcutSheet() {
  const [open, setOpen] = useState(false);
  const [singles, setSingles] = useSingleKeys();
  const show = useCallback(() => setOpen(true), []);
  useShortcut("sheet", show);
  useEffect(() => {
    addEventListener(OPEN_SHORTCUTS, show);
    return () => removeEventListener(OPEN_SHORTCUTS, show);
  }, [show]);
  const mac = isMac();
  return (
    <Dialog open={open} onClose={() => setOpen(false)} title="Keyboard shortcuts" size="wide">
      <div className="flex flex-col gap-5">
        <CheckboxField
          name="single-keys"
          label="Single-key shortcuts"
          hint="?, /, j, k, x and the g shortcuts. Turn them off if they get in the way of a screen reader or speech input."
          checked={singles}
          onChange={(on) => setSingles(on ? undefined : false)}
        />
        <div className="grid gap-x-8 gap-y-5 md:grid-cols-2">
          {SCOPES.map((scope) => {
            const here = (Object.keys(SHORTCUTS) as ShortcutId[]).filter(
              (id) => SHORTCUTS[id].scope === scope,
            );
            if (here.length === 0) return null;
            return (
              <section key={scope} aria-label={scope} className="flex flex-col gap-2">
                <h3 className="m-0 text-label font-semibold tracking-wide text-ink-subtle uppercase">
                  {scope}
                </h3>
                <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
                  {here.map((id) => {
                    const shortcut = SHORTCUTS[id];
                    const off = !singles && shortcut.keys.every(isSingle);
                    return (
                      <div key={id} className={`contents ${off ? "text-ink-subtle" : ""}`}>
                        <dt className="flex flex-wrap gap-1">
                          {shortcut.keys.map((combo) => (
                            <Kbd key={combo}>{formatCombo(combo, mac)}</Kbd>
                          ))}
                        </dt>
                        <dd className={`m-0 ${off ? "" : "text-ink-muted"}`}>
                          {shortcut.label}
                          {off ? " (off)" : ""}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              </section>
            );
          })}
        </div>
      </div>
    </Dialog>
  );
}
