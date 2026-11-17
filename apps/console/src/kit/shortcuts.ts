/**
 * Every keyboard shortcut in the console, declared once (phase 15, P3-1). The
 * shortcuts sheet is drawn from this list, tooltips and menus show their keys
 * from it, and `useShortcut` binds to it by ID. A shortcut a kit component
 * handles itself, such as a list's `j` and `k`, is marked `handledBy`: it is
 * listed here so the sheet tells the truth, and its component has the test.
 */

export type Scope =
  | "Everywhere"
  | "Go to"
  | "Lists"
  | "Editors"
  | "Flow editor"
  | "Palette"
  | "Logs";

export interface Shortcut {
  keys: string[];
  label: string;
  scope: Scope;
  /** Ignored while typing in a field, which has its own: undo, for one. */
  notInFields?: boolean;
  /** A kit component that handles the keys itself, rather than through `useShortcut`. */
  handledBy?: string;
}

const declared = {
  palette: { keys: ["Mod+K"], label: "Find anything, or do something", scope: "Everywhere" },
  sheet: { keys: ["?"], label: "These shortcuts", scope: "Everywhere" },
  search: { keys: ["/"], label: "Search this list", scope: "Everywhere" },

  "go.overview": { keys: ["g o"], label: "Overview", scope: "Go to" },
  "go.runs": { keys: ["g r"], label: "Runs", scope: "Go to" },
  "go.flows": { keys: ["g f"], label: "Flows", scope: "Go to" },
  "go.scripts": { keys: ["g s"], label: "Scripts", scope: "Go to" },
  "go.triggers": { keys: ["g t"], label: "Triggers", scope: "Go to" },
  "go.approvals": { keys: ["g a"], label: "Approvals", scope: "Go to" },

  "list.move": {
    keys: ["j", "k", "ArrowDown", "ArrowUp"],
    label: "Move down or up the list",
    scope: "Lists",
    handledBy: "DataTable",
  },
  "list.open": { keys: ["Enter"], label: "Open the row", scope: "Lists", handledBy: "DataTable" },
  "list.open-tab": {
    keys: ["Mod+Enter"],
    label: "Open the row in a new tab",
    scope: "Lists",
    handledBy: "DataTable",
  },
  "list.check": {
    keys: ["x", " "],
    label: "Check the row",
    scope: "Lists",
    handledBy: "DataTable",
  },
  "list.extend": {
    keys: ["Shift+j", "Shift+k"],
    label: "Check the rows from here down or up",
    scope: "Lists",
    handledBy: "DataTable",
  },
  "list.all": {
    keys: ["Mod+A"],
    label: "Check every row shown",
    scope: "Lists",
    handledBy: "DataTable",
  },
  "list.uncheck": {
    keys: ["Escape"],
    label: "Uncheck the rows",
    scope: "Lists",
    handledBy: "DataTable",
  },
  close: { keys: ["Escape"], label: "Close what is open beside the list", scope: "Lists" },

  save: { keys: ["Mod+S"], label: "Save now", scope: "Editors" },
  run: { keys: ["Mod+Enter"], label: "Run the draft", scope: "Editors" },
  undo: { keys: ["Mod+Z"], label: "Undo", scope: "Editors", notInFields: true },
  redo: { keys: ["Shift+Mod+Z", "Ctrl+Y"], label: "Redo", scope: "Editors", notInFields: true },

  "flow.duplicate": {
    keys: ["Mod+D"],
    label: "Duplicate the chosen steps",
    scope: "Flow editor",
    notInFields: true,
  },
  "flow.copy": {
    keys: ["Mod+C", "Mod+X", "Mod+V"],
    label: "Copy, cut or paste the chosen steps, here or in another flow",
    scope: "Flow editor",
    handledBy: "FlowEditor's copy and paste",
  },
  "flow.menu": {
    keys: ["Shift+F10"],
    label: "The menu for a step, or for the canvas",
    scope: "Flow editor",
    handledBy: "ContextMenu",
  },

  "palette.runs": {
    keys: [">"],
    label: "Then an ID: open a run",
    scope: "Palette",
    handledBy: "CommandPalette",
  },
  "palette.resources": {
    keys: ["#"],
    label: "Then a name: find a script, a flow, a table…",
    scope: "Palette",
    handledBy: "CommandPalette",
  },
  "palette.actions": {
    keys: ["/"],
    label: "Then a word: run a script, start a flow, pause a trigger…",
    scope: "Palette",
    handledBy: "CommandPalette",
  },
  "palette.people": {
    keys: ["@"],
    label: "Then a name: find a person",
    scope: "Palette",
    handledBy: "CommandPalette",
  },
  "palette.second": {
    keys: ["Mod+Enter"],
    label: "Run, start or run again what is chosen",
    scope: "Palette",
    handledBy: "CommandPalette",
  },

  "log.find": { keys: ["Mod+F"], label: "Find in the log", scope: "Logs", handledBy: "LogViewer" },
} satisfies Record<string, Shortcut>;

export type ShortcutId = keyof typeof declared;
export const SHORTCUTS: Record<ShortcutId, Shortcut> = declared;
export const SCOPES: Scope[] = [
  "Everywhere",
  "Go to",
  "Lists",
  "Editors",
  "Flow editor",
  "Palette",
  "Logs",
];
