import { type ProfileName, parse, type Root, walk } from "@volvel/markup";
import { Button, Doc, Popover, reveal as revealIn, useMarkdownKnowledge } from "@volvel/ui";
import {
  Bold,
  Code as CodeIcon,
  Heading,
  Italic,
  Link as LinkIcon,
  List,
  Plus,
  Search,
} from "lucide-react";
import {
  type KeyboardEvent,
  lazy,
  type ReactNode,
  type RefObject,
  Suspense,
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import type { CodeEditorHandle, Marker } from "../../editor/CodeEditor.tsx";
import { UndoRedo } from "../UndoRedo.tsx";
import {
  where as containersWhere,
  type Insertable,
  insertables,
  insertInto,
  nameOf,
  surround,
  togglePrefix,
} from "./insert.ts";

const CodeEditor = lazy(() =>
  import("../../editor/CodeEditor.tsx").then((module) => ({ default: module.CodeEditor })),
);

export type MarkdownMode = "source" | "split" | "preview";

export interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  /** What the text may hold, and so which components the Insert menu offers. */
  profile: Extract<ProfileName, "docs" | "page">;
  /** Names the editor for screen readers: "Source of handbook/refunds". */
  label: string;
  /** A CSS length for the source and the preview. */
  height?: string;
  /**
   * Fill the room the parent gives, whatever the toolbar's height: the source and the
   * preview each scroll inside it, and nothing below is pushed or covered.
   */
  fill?: boolean;
  /** Takes the focus as it opens. */
  autoFocus?: boolean;
  /** More in the toolbar, after the formatting buttons. */
  toolbarExtra?: ReactNode;
  /** The modes offered. Split shows both side by side, and only where it is wide. */
  modes?: readonly MarkdownMode[];
  /** The mode it opens in. Left out, split where it is wide and source where it is not. */
  initialMode?: MarkdownMode;
  /** Identifies the document in the code editor. */
  path?: string;
  /** ⌘S in the source. */
  onSave?: () => void;
  /** Problems found by something else, marked on their lines. */
  problems?: readonly Marker[];
  /** A line to show, for a problem asked about. */
  reveal?: { line: number; column?: number; at: number } | undefined;
  /** Filled with a way to work the editor from outside: undo, redo, text put in as one step. */
  handle?: RefObject<CodeEditorHandle | null>;
  /** Called as the cursor moves. */
  onCursor?: (at: { line: number; column: number }) => void;
  /** For a page with a top of its own: folds it, and says beside it what it holds. */
  frontmatter?: { hint: string };
  /** The text read, where the caller has read it already (with the top of a page, say): the cursor's place in it is found there. */
  tree?: Root;
  /** What the preview draws, in place of the text read as `profile`. Given with `previewLabel`. */
  preview?: ReactNode;
  previewLabel?: string;
  /** Other things beside the source, as tabs after the preview. */
  sideTabs?: readonly { id: string; label: string; content: ReactNode }[];
}

/**
 * Where Markdown is written, as the documentation writes it: the source with
 * its toolbar (headings, bold, links, lists, code), the Insert menu of the
 * profile's components (callouts, steps, tabs, folds, terms, keys, fields),
 * and beside or instead of it the text as it will be read, following the
 * cursor. Every change, typed or made by a button, is a step Undo takes back.
 *
 * It is the console's, not the kit's, because the source is the code editor,
 * with the help and the keys of the console behind it. The docs editor and the
 * Text widget's editor both use it.
 */
export function MarkdownEditor({
  value,
  onChange,
  profile,
  label,
  height = "68vh",
  fill = false,
  autoFocus,
  toolbarExtra,
  modes = ["source", "split", "preview"],
  initialMode,
  path,
  onSave,
  problems,
  reveal,
  handle: given,
  onCursor,
  frontmatter,
  tree,
  preview: custom,
  previewLabel = "Preview of the text",
  sideTabs,
}: MarkdownEditorProps) {
  const id = useId();
  const own = useRef<CodeEditorHandle | null>(null);
  const handle = given ?? own;
  const [mode, setMode] = useState<MarkdownMode>(() => {
    if (initialMode && modes.includes(initialMode)) return initialMode;
    const wide = typeof matchMedia === "function" && matchMedia("(min-width: 1024px)").matches;
    return wide && modes.includes("split") ? "split" : (modes[0] ?? "source");
  });
  const [side, setSide] = useState("preview");
  const [cursor, setCursor] = useState({ line: 1, column: 1 });
  const [can, setCan] = useState({ undo: false, redo: false });
  const [inserting, setInserting] = useState(false);

  const typed = useDeferredValue(value);
  const read = useMemo(() => tree ?? parse(typed), [tree, typed]);
  // What the app around it knows of terms and fields: the preview draws them with it, and a term
  // or a field it cannot find is said, since a reader is shown the word or the path alone.
  const knows = useMarkdownKnowledge();
  const notFound = useMemo(
    () => (custom === undefined && profile === "page" ? unresolved(read, knows) : []),
    [read, knows, custom, profile],
  );
  const shownProblems = useMemo(
    () => (notFound.length > 0 ? [...(problems ?? []), ...notFound] : problems),
    [problems, notFound],
  );
  const within = useMemo(() => containersWhere(read, cursor.line), [read, cursor.line]);
  const offered = useMemo(() => insertables(within, profile), [within, profile]);

  // The preview follows the cursor: the block it is in is marked, and kept in view.
  const shown = useRef<HTMLElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: the preview is drawn anew from `read`, and the mark goes on what is drawn.
  useEffect(() => {
    const node = shown.current;
    if (!node) return;
    for (const old of node.querySelectorAll(".vx-following")) old.classList.remove("vx-following");
    let best: Element | undefined;
    let bestLine = 0;
    for (const one of node.querySelectorAll("[data-line]")) {
      const from = Number(one.getAttribute("data-line"));
      const to = Number(one.getAttribute("data-end-line") ?? from);
      const holds =
        from <= cursor.line && (one.hasAttribute("data-end-line") ? to >= cursor.line : true);
      if (holds && from >= bestLine) {
        best = one;
        bestLine = from;
      }
    }
    if (best) {
      // A tab or a fold the cursor is in shows itself, as the cursor goes in.
      revealIn(best);
      best.classList.add("vx-following");
      if (typeof best.scrollIntoView === "function") best.scrollIntoView({ block: "nearest" });
    }
  }, [cursor.line, read]);

  // A writer who opens it to write is already in it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: once, as it opens.
  useEffect(() => {
    if (!autoFocus) return;
    const wait = setTimeout(() => handle.current?.focus(), 0);
    return () => clearTimeout(wait);
  }, []);

  /** Changes the text as one step of its history, through the editor where it is there. */
  const change = (next: string, select?: { start: number; end: number }) => {
    if (handle.current) handle.current.apply(next, select);
    else onChange(next);
  };
  const selection = () => handle.current?.selection() ?? { start: value.length, end: value.length };
  const insert = (item: Insertable) => {
    const made = insertInto(value, selection(), item, within);
    change(made.text, made.select);
    setInserting(false);
  };
  const format = (made: { text: string; select: { start: number; end: number } }) =>
    change(made.text, made.select);
  const bold = () => format(surround(value, selection(), "**", "**", "bold"));
  const italic = () => format(surround(value, selection(), "_", "_", "italic"));
  const link = () => format(surround(value, selection(), "[", "](address)", "words"));

  // ⌘B, ⌘I and ⌘K in the source, before the code editor has them.
  const keys = (event: KeyboardEvent) => {
    if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return;
    const act =
      event.key === "b" ? bold : event.key === "i" ? italic : event.key === "k" ? link : null;
    if (!act) return;
    event.preventDefault();
    event.stopPropagation();
    act();
  };

  const sourceShown = mode !== "preview";
  const previewShown = mode !== "source";
  const tabs =
    sideTabs && sideTabs.length > 0 ? [{ id: "preview", label: "Preview" }, ...sideTabs] : [];
  const sideTab = sideTabs?.find((one) => one.id === side);
  const previewHeight = tabs.length > 0 ? `calc(${height} - 4vh)` : height;
  const sized = fill ? undefined : { height: previewHeight };

  return (
    <div className={`flex min-h-0 flex-col ${fill ? "h-full" : ""}`}>
      <div
        role="toolbar"
        aria-label="Write"
        className="flex flex-wrap items-center gap-1 border-line border-b px-2 py-1.5"
      >
        <UndoRedo
          history={{
            undo: () => handle.current?.undo(),
            redo: () => handle.current?.redo(),
            undoLabel: can.undo ? "the last change" : undefined,
            redoLabel: can.redo ? "the change undone" : undefined,
          }}
        />
        <span aria-hidden className="mx-1 h-5 w-px bg-line" />
        <Popover
          title="Insert a component"
          titleHidden
          wide
          open={inserting}
          onOpenChange={(next) => {
            setInserting(next);
            if (!next) handle.current?.focus();
          }}
          trigger={
            <Button size="small" variant="quiet">
              <Plus aria-hidden="true" size={14} />
              Insert
              <kbd className="ml-1 rounded-inner border border-line px-1 font-mono text-code-sm text-ink-subtle">
                /
              </kbd>
            </Button>
          }
        >
          <InsertMenu
            items={offered}
            within={within}
            onPick={insert}
            onClose={() => {
              setInserting(false);
              handle.current?.focus();
            }}
          />
        </Popover>
        <span aria-hidden className="mx-1 h-5 w-px bg-line" />
        <ToolButton label="Heading" onClick={() => format(togglePrefix(value, selection(), "## "))}>
          <Heading aria-hidden size={16} />
        </ToolButton>
        <ToolButton label="Bold" onClick={bold}>
          <Bold aria-hidden size={16} />
        </ToolButton>
        <ToolButton label="Italic" onClick={italic}>
          <Italic aria-hidden size={16} />
        </ToolButton>
        <ToolButton label="Link" onClick={link}>
          <LinkIcon aria-hidden size={16} />
        </ToolButton>
        <ToolButton label="List" onClick={() => format(togglePrefix(value, selection(), "- "))}>
          <List aria-hidden size={16} />
        </ToolButton>
        <ToolButton
          label="Code"
          onClick={() => format(surround(value, selection(), "`", "`", "code"))}
        >
          <CodeIcon aria-hidden size={16} />
        </ToolButton>
        {toolbarExtra}
        <p
          className="m-0 ml-2 hidden min-w-0 truncate text-meta text-ink-muted md:block"
          aria-live="polite"
        >
          {within.length > 0 ? (
            <>
              Cursor in{" "}
              <span className="font-mono text-code-sm text-ink">
                {within.map(nameOf).join(" › ")}
              </span>
            </>
          ) : null}
        </p>
        {modes.length > 1 ? (
          <fieldset
            aria-label="What is shown"
            className="m-0 ml-auto flex min-w-0 items-center rounded-control border border-line p-0.5"
          >
            {modes.map((one) => (
              <button
                key={one}
                type="button"
                aria-pressed={mode === one}
                onClick={() => setMode(one)}
                className={`rounded-inner px-2 py-1 text-meta ${one === "split" ? "hidden lg:inline-block" : ""} ${
                  mode === one
                    ? "bg-selected font-medium text-ink"
                    : "text-ink-muted hover:text-ink"
                }`}
              >
                {one === "source" ? "Source" : one === "split" ? "Split" : "Preview"}
              </button>
            ))}
          </fieldset>
        ) : null}
      </div>

      <div
        className={`grid min-h-0 ${mode === "split" ? "lg:grid-cols-2" : "grid-cols-1"} ${fill ? "flex-1 grid-rows-[minmax(0,1fr)]" : ""}`}
      >
        <div
          onKeyDownCapture={keys}
          className={`${fill ? "h-full min-h-0" : ""} ${!sourceShown ? "hidden" : mode === "split" ? "hidden lg:block" : ""}`}
        >
          <Suspense fallback={<p className="p-3 text-ink-muted">Loading the editor…</p>}>
            <CodeEditor
              label={label}
              language="markdown"
              path={path ?? `markdown/${id}.md`}
              value={value}
              onChange={onChange}
              {...(onSave ? { onSave } : {})}
              {...(shownProblems ? { problems: shownProblems } : {})}
              wrap
              height={fill ? "100%" : height}
              {...(reveal ? { reveal } : {})}
              handle={handle}
              onCursor={(at) => {
                setCursor(at);
                onCursor?.(at);
              }}
              onHistory={setCan}
              onSlash={() => setInserting(true)}
              {...(frontmatter ? { frontmatter } : {})}
            />
          </Suspense>
        </div>
        <div
          className={`flex min-h-0 flex-col border-line lg:border-l ${fill ? "h-full" : ""} ${
            !previewShown ? "hidden" : mode === "split" ? "hidden lg:flex" : ""
          }`}
        >
          {tabs.length > 0 ? (
            <div
              role="tablist"
              aria-label="Beside the source"
              className="flex gap-1 border-line border-b px-3"
            >
              {tabs.map((one) => (
                <button
                  key={one.id}
                  type="button"
                  role="tab"
                  aria-selected={side === one.id}
                  onClick={() => setSide(one.id)}
                  className={`-mb-px border-b-2 px-2 py-2 text-meta ${
                    side === one.id
                      ? "border-action font-medium text-ink"
                      : "border-transparent text-ink-muted hover:text-ink"
                  }`}
                >
                  {one.label}
                </button>
              ))}
            </div>
          ) : null}
          {side === "preview" || !sideTab ? (
            <section
              ref={shown}
              className={`overflow-y-auto p-6 ${fill ? "min-h-0 flex-1" : ""}`}
              style={sized}
              aria-label={previewLabel}
            >
              {custom ??
                (value.trim() === "" ? (
                  <p className="m-0 text-ink-muted">Nothing written yet.</p>
                ) : (
                  <Doc
                    tree={read}
                    profile={profile}
                    headingShift={1}
                    lines
                    idPrefix={`p${id}`}
                    {...(knows.term ? { term: knows.term } : {})}
                    {...(knows.field ? { field: knows.field } : {})}
                  />
                ))}
              {within.length > 0 ? (
                <p className="m-0 mt-3 text-meta text-action">
                  Following the cursor · {nameOf(within.at(-1) as (typeof within)[number])}
                </p>
              ) : null}
            </section>
          ) : (
            <section
              aria-label={sideTab.label}
              className={`overflow-y-auto p-4 ${fill ? "min-h-0 flex-1" : ""}`}
              style={sized}
            >
              {sideTab.content}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * The terms and fields of a text that the host, which does know of them, cannot find: said on their
 * lines, since a reader is shown the word or the path with nothing behind it.
 */
function unresolved(tree: Root, knows: ReturnType<typeof useMarkdownKnowledge>): Marker[] {
  const found: Marker[] = [];
  if (!knows.term && !knows.field) return found;
  for (const { node } of walk(tree)) {
    if (node.type !== "component" || node.line === undefined) continue;
    if (node.name === "term" && knows.term && !knows.term(node.props)) {
      const what = node.props.id ?? Object.values(node.props).join(" ");
      found.push({
        line: node.line,
        column: 1,
        severity: "warning",
        message: `No term "${what}" can be found here. Readers see the word with nothing behind it.`,
      });
    } else if (node.name === "field" && knows.field && !knows.field(node.props.path ?? "")) {
      found.push({
        line: node.line,
        column: 1,
        severity: "warning",
        message: `No field "${node.props.path ?? ""}" can be found here. Readers see its path with nothing behind it.`,
      });
    }
  }
  return found;
}

function ToolButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button size="small" variant="quiet" aria-label={label} tooltip={label} onClick={onClick}>
      {children}
    </Button>
  );
}

/** What can be inserted where the cursor is, found by typing. */
function InsertMenu({
  items,
  within,
  onPick,
  onClose,
}: {
  items: readonly Insertable[];
  within: readonly unknown[];
  onPick: (item: Insertable) => void;
  onClose: () => void;
}) {
  const [typed, setTyped] = useState("");
  const [active, setActive] = useState(0);
  const found = items.filter((one) =>
    `${one.name} ${one.spec.summary} ${one.spec.name}`
      .toLowerCase()
      .includes(typed.trim().toLowerCase()),
  );
  const groups = [
    { label: "Blocks", list: found.filter((one) => one.block) },
    { label: "Inline", list: found.filter((one) => !one.block) },
  ].filter((group) => group.list.length > 0);
  const ordered = groups.flatMap((group) => group.list);
  const holder = within.at(-1) as
    | { name: string; props: Record<string, string>; label?: string }
    | undefined;
  return (
    <div className="flex flex-col">
      <label className="flex items-center gap-2 border-line border-b px-3 py-2 text-ink-muted">
        <Search aria-hidden size={14} />
        <input
          // biome-ignore lint/a11y/noAutofocus: the menu is opened to be typed in.
          autoFocus
          aria-label="Find a component"
          placeholder="Find a component"
          value={typed}
          onChange={(event) => {
            setTyped(event.currentTarget.value);
            setActive(0);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActive((now) => Math.min(ordered.length - 1, now + 1));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActive((now) => Math.max(0, now - 1));
            } else if (event.key === "Enter") {
              event.preventDefault();
              const chosen = ordered[active];
              if (chosen) onPick(chosen);
            } else if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              onClose();
            }
          }}
          className="min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-ink-subtle"
        />
      </label>
      <div className="max-h-[22rem] overflow-y-auto p-1.5">
        {groups.length === 0 ? (
          <p className="m-0 p-3 text-meta text-ink-muted">Nothing is called that.</p>
        ) : null}
        {groups.map((group) => (
          <section key={group.label} aria-label={group.label}>
            <p className="m-0 px-2 pt-2 pb-1 text-label text-ink-subtle uppercase">{group.label}</p>
            {group.list.map((one) => {
              const index = ordered.indexOf(one);
              return (
                <button
                  key={one.spec.name}
                  type="button"
                  onMouseEnter={() => setActive(index)}
                  onClick={() => onPick(one)}
                  className={`flex w-full items-center gap-3 rounded-control px-2 py-1.5 text-left ${
                    index === active ? "bg-sunken" : ""
                  }`}
                >
                  <span
                    aria-hidden
                    className="inline-flex size-8 shrink-0 items-center justify-center rounded-control border border-line font-mono text-code-sm text-ink-muted"
                  >
                    {one.glyph}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="font-medium text-ink">{one.name}</span>
                    <span className="truncate text-meta text-ink-muted">{one.spec.summary}</span>
                  </span>
                  <span className="shrink-0 font-mono text-code-sm text-ink-subtle">
                    {one.syntax}
                  </span>
                </button>
              );
            })}
          </section>
        ))}
      </div>
      <p className="m-0 border-line border-t px-3 py-2 text-meta text-ink-muted">
        Inserts at the cursor
        {holder
          ? `, inside ${holder.props.label ? `${holder.name} “${holder.props.label}”` : holder.name}`
          : ""}
        .
      </p>
    </div>
  );
}
