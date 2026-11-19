import { CheckboxField, Closing, Dialog, Kbd } from "@volvel/ui";
import {
  Activity,
  BookOpen,
  Boxes,
  Braces,
  CircleHelp,
  CornerDownLeft,
  FileCode2,
  Keyboard,
  type LucideIcon,
  Pin,
  PinOff,
  Play,
  Plug,
  Radio,
  Search,
  Table2,
  User,
  Workflow,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, api } from "../api.ts";
import { ask, notify } from "../ask.tsx";
import { openHelp } from "../help/store.ts";
import { InputDialog } from "../InputDialog.tsx";
import { usePreference } from "../prefs.ts";
import { navigate } from "../router.tsx";
import { useThemeChoice } from "../theme.ts";
import { type Pinnable, useCurrent } from "./current.ts";
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
import { useDelayed } from "./LoadState.tsx";
import { objectHref } from "./objects.tsx";
import { SCOPES, SHORTCUTS, type ShortcutId } from "./shortcuts.ts";
import { Truncate } from "./Truncate.tsx";

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
  /** Something found, which ⌘P pins or unpins. */
  pin?: Pinnable | undefined;
  danger?: boolean | undefined;
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
  doc: BookOpen,
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
  doc: "Page",
  run: "Run",
  flow_run: "Flow run",
  member: "Member",
  end_user: "End user",
};
const SECTIONS = [
  // The open object's own commands come first, under its own heading.
  "Pinned",
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

/** Items in their sections, each with its place in the whole list, for the arrow keys. */
function groupsOf(items: Item[]): [string, [Item, number][]][] {
  const groups = new Map<string, [Item, number][]>();
  items.forEach((item, index) => {
    const group = groups.get(item.section) ?? [];
    group.push([item, index]);
    groups.set(item.section, group);
  });
  return [...groups];
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
  if (found.kind === "member") return `/t/${tenantId}/members/${found.id}`;
  if (found.kind === "end_user") return `/t/${tenantId}/end-users?user=${found.id}`;
  const ws = `/t/${tenantId}/workspaces/${found.workspaceId}`;
  switch (found.kind) {
    // Its page, where its runs, schedule and source are; ⌘↵ runs it, and Edit is one press there.
    case "script":
      return `${ws}/scripts/${found.ref}`;
    case "app":
      return `${ws}/apps?app=${found.id}`;
    case "doc":
      return `${ws}/docs/${found.ref}`;
    case "flow":
    case "interface":
    case "table":
    case "trigger":
    case "schedule":
    case "connection":
    case "variable":
    case "secret":
    case "event":
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
  const current = useCurrent();
  const [pins, setPins] = usePreference<Pinnable[]>(`palette.pins:${tenantId ?? "none"}`, []);
  const pinned = (one: Pinnable) =>
    pins.some((pin) => pin.kind === one.kind && pin.ref === one.ref);
  const togglePin = (one: Pinnable) => {
    const next = pinned(one)
      ? pins.filter((pin) => !(pin.kind === one.kind && pin.ref === one.ref))
      : [one, ...pins].slice(0, 12);
    setPins(next.length > 0 ? next : undefined);
    notify.success(
      pinned(one) ? `${one.title} is unpinned.` : `${one.title} is pinned to the palette.`,
    );
  };
  const [searching, setSearching] = useState(false);
  const [failure, setFailure] = useState<unknown>();
  const [again, setAgain] = useState(0);
  const slow = useDelayed(searching, 300);
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
  // biome-ignore lint/correctness/useExhaustiveDependencies: `again` is Try again: it asks once more
  useEffect(() => {
    setFailure(undefined);
    if (!open || !tenantId || picking || mode === "actions" || text === "") {
      setFound([]);
      setSearching(false);
      return;
    }
    const mine = ++asked.current;
    setSearching(true);
    const timer = setTimeout(() => {
      const only = mode === "all" ? "" : `&only=${mode}`;
      const here = workspaceId ? `&workspace=${workspaceId}` : "";
      api
        .get<{ items: Found[] }>(
          `/tenants/${tenantId}/search?q=${encodeURIComponent(text)}${here}${only}`,
        )
        .then(
          (answer) => {
            if (mine !== asked.current) return;
            setFound(answer.items);
            setSearching(false);
          },
          (error) => {
            if (mine !== asked.current) return;
            // A search that failed says so: it is not "nothing matches".
            setFound([]);
            setFailure(error);
            setSearching(false);
          },
        );
    }, 150);
    return () => clearTimeout(timer);
  }, [open, tenantId, workspaceId, mode, text, picking, again]);

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
        key: "a-help",
        label: "Help for this page",
        icon: CircleHelp,
        section: "Actions",
        open: () => {
          close();
          openHelp();
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
                    const sure = await ask.confirm({
                      title: `Run ${one.title} again?`,
                      text: "With the same input, on the version it ran.",
                      action: "Run again",
                    });
                    if (!sure) return;
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
        pin: {
          kind: one.kind,
          ref: one.ref,
          id: one.id,
          workspaceId: one.workspaceId,
          workspaceSlug: one.workspaceSlug,
          title: one.title,
        },
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
      // What the page on screen shows comes first: with a run open, Run again is one press away.
      const here: Item[] =
        mode === "all" && current
          ? [
              ...current.commands.map((command) => ({
                key: `c-${command.key}`,
                label: command.label,
                icon: command.icon,
                danger: command.danger,
                section: current.heading,
                open: () => {
                  close();
                  void command.run();
                },
              })),
              ...(current.pin
                ? [
                    {
                      key: "c-pin",
                      label: pinned(current.pin) ? "Unpin from the palette" : "Pin to the palette",
                      icon: pinned(current.pin) ? PinOff : Pin,
                      section: current.heading,
                      open: () => {
                        togglePin(current.pin as Pinnable);
                        close();
                      },
                    },
                  ]
                : []),
            ]
          : [];
      const pinnedItems = pins.map((one) =>
        entity({ ...one, workspaceSlug: one.workspaceSlug ?? null, hint: null }, "Pinned"),
      );
      return [
        ...here,
        ...pinnedItems,
        ...recent
          .filter((one) => !pins.some((pin) => pin.kind === one.kind && pin.ref === one.ref))
          .slice(0, 8)
          .map((one) => entity(one, "Recent")),
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
    current,
    pins,
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

  const mac = isMac();
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
                } else if (
                  event.key.toLowerCase() === "p" &&
                  (isMac() ? event.metaKey : event.ctrlKey) &&
                  ordered[active]?.pin
                ) {
                  // ⌘P pins what is chosen, so it is first the next time.
                  event.preventDefault();
                  togglePin(ordered[active].pin as Pinnable);
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
            aria-busy={searching || undefined}
            className="max-h-[calc(100dvh-10rem)] overflow-y-auto md:max-h-[55vh]"
          >
            {failure ? (
              <div
                role="alert"
                className="m-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-control bg-danger-soft px-3 py-2 text-body-sm text-danger"
              >
                <span>The search failed. What is typed may still be there; try again.</span>
                {failure instanceof ApiError && failure.requestId ? (
                  <span className="font-mono text-code-sm">Request ID {failure.requestId}</span>
                ) : null}
                <button
                  type="button"
                  className="ml-auto font-medium underline"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => setAgain((count) => count + 1)}
                >
                  Try again
                </button>
              </div>
            ) : null}
            {slow && ordered.length === 0 ? (
              <p className="m-0 px-3 py-6 text-center text-ink-muted">Searching…</p>
            ) : ordered.length === 0 && !failure ? (
              <p className="m-0 px-3 py-6 text-center text-ink-muted">
                {text ? `Nothing matches “${text}”.` : "Type to find something."}
              </p>
            ) : (
              groupsOf(ordered).map(([section, members]) => {
                const headingId = `command-group-${section.replace(/\W+/g, "-")}`;
                return (
                  // biome-ignore lint/a11y/useSemanticElements: a listbox groups its options with role="group"; a fieldset is for form controls
                  <div key={section} role="group" aria-labelledby={headingId}>
                    <div
                      id={headingId}
                      role="presentation"
                      className="px-3 pt-2 pb-1 text-meta font-medium tracking-wide text-ink-subtle uppercase"
                    >
                      {section}
                    </div>
                    {members.map(([item, index]) => {
                      const Icon = item.icon;
                      return (
                        <div
                          key={item.key}
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
                          } ${item.danger ? "text-danger" : ""}`}
                        >
                          {Icon ? (
                            <Icon
                              aria-hidden="true"
                              size={16}
                              className={`shrink-0 ${item.danger ? "" : "text-ink-muted"}`}
                            />
                          ) : null}
                          {/* The name keeps its room; what it is, and where, gives way. */}
                          <Truncate mode="middle" className="max-w-[75%] shrink-0">
                            {item.label}
                          </Truncate>
                          {item.where ? (
                            <span className="min-w-0 flex-1 truncate text-meta text-ink-subtle">
                              {item.where}
                            </span>
                          ) : null}
                          {index === active ? (
                            <span className="ml-auto hidden shrink-0 items-center gap-2 text-meta text-ink-subtle md:flex">
                              {item.pin ? (
                                <span>
                                  {formatCombo("Mod+P", mac)}{" "}
                                  {pins.some(
                                    (pin) =>
                                      pin.kind === item.pin?.kind && pin.ref === item.pin?.ref,
                                  )
                                    ? "Unpin"
                                    : "Pin"}
                                </span>
                              ) : null}
                              {item.secondary ? (
                                <span>
                                  {formatCombo("Mod+Enter", mac)} {item.secondary.label}
                                </span>
                              ) : null}
                              <CornerDownLeft aria-hidden="true" size={14} />
                            </span>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </Dialog>
      <Closing subject={tenantId ? starting : undefined}>
        {(starting, shown) => (
          <InputDialog
            open={shown}
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
        )}
      </Closing>
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
