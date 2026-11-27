import { ChevronRight, GripVertical } from "lucide-react";
import {
  type DragEvent,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { ICON, STROKE } from "./icons.ts";

export interface TreeNode {
  id: string;
  label: string;
  /** Drawn before the label. */
  icon?: ReactNode;
  /** Drawn right after the label, on its line: a state, such as a draft. */
  badge?: ReactNode;
  /** A second, quieter line under the label: a file's name. */
  detail?: ReactNode;
  /** Drawn after the label: a tag or a count. */
  trailing?: ReactNode;
  /** Buttons for the row, shown while it is pointed at or holds the focus, and always on a touch screen. */
  actions?: ReactNode;
  /** Drawn in place of the label and the detail while the row is being edited, such as renamed. */
  editing?: ReactNode;
  /** Set, even if empty, on a node that opens and closes. */
  children?: TreeNode[];
}

/** Where a dragged row is let go: before a row, after it, or into it when it holds others. */
export type DropPosition = "before" | "after" | "inside";

interface Row {
  node: TreeNode;
  level: number;
  parent?: string;
}

/** How long a closed folder must be held over before it opens. */
const OPEN_AFTER_MS = 600;

/**
 * Things inside things: folders and their pages. One row holds the keyboard.
 * Up and Down move between the rows that show, Right opens a row or steps
 * into it, Left closes it or steps out, Home and End go to the ends, Enter or
 * Space chooses, and F2 renames when the tree says how.
 *
 * With `onMove`, a row can be dragged by its grip: before or after another,
 * or into one that holds others. A line says "between", a filled row says
 * "into", and a closed row held over for a moment opens. A drag is a
 * pointer's way only, so whoever gives `onMove` gives the same move another
 * way too, for the keyboard and for a touch screen.
 */
export function Tree({
  label,
  nodes,
  selected,
  onSelect,
  defaultExpanded,
  canDrag,
  canDrop,
  onMove,
  onRename,
}: {
  /** Names the tree for screen readers: "Pages". */
  label: string;
  nodes: TreeNode[];
  /** The id of the chosen node. */
  selected?: string;
  onSelect?: (id: string) => void;
  /** The ids open to begin with. Left out, every node is open. */
  defaultExpanded?: string[];
  /** Which rows can be picked up. Left out, with `onMove`, every row can. */
  canDrag?: (id: string) => boolean;
  /** Whether a row can be let go there. Left out, with `onMove`, anywhere but on itself. */
  canDrop?: (dragged: string, target: string, position: DropPosition) => boolean;
  /** A row was let go before, after or into another. */
  onMove?: (dragged: string, target: string, position: DropPosition) => void;
  /** F2 on a row. */
  onRename?: (id: string) => void;
}) {
  const base = useId();
  // The row being dragged, and where it would go if it were let go now.
  const [dragged, setDragged] = useState<string>();
  const [over, setOver] = useState<{ id: string; position: DropPosition }>();
  const opening = useRef<{ id: string; timer: ReturnType<typeof setTimeout> }>(undefined);
  const takes = (target: string, position: DropPosition) =>
    onMove !== undefined &&
    dragged !== undefined &&
    dragged !== target &&
    (canDrop ? canDrop(dragged, target, position) : true);
  const everyBranch = useMemo(() => {
    const ids: string[] = [];
    const visit = (list: TreeNode[]) => {
      for (const node of list) {
        if (node.children) {
          ids.push(node.id);
          visit(node.children);
        }
      }
    };
    visit(nodes);
    return ids;
  }, [nodes]);
  const [closed, setClosed] = useState<Set<string>>(
    () => new Set(defaultExpanded ? everyBranch.filter((id) => !defaultExpanded.includes(id)) : []),
  );
  const rows = useMemo(() => {
    const out: Row[] = [];
    const visit = (list: TreeNode[], level: number, parent?: string) => {
      for (const node of list) {
        out.push(parent === undefined ? { node, level } : { node, level, parent });
        if (node.children && !closed.has(node.id)) visit(node.children, level + 1, node.id);
      }
    };
    visit(nodes, 1);
    return out;
  }, [nodes, closed]);
  const [focused, setFocused] = useState<string | undefined>(undefined);
  const current = rows.some((row) => row.node.id === focused)
    ? focused
    : rows.some((row) => row.node.id === selected)
      ? selected
      : rows[0]?.node.id;
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => () => clearTimeout(opening.current?.timer), []);

  const focus = (id: string | undefined) => {
    if (id === undefined) return;
    setFocused(id);
    list.current?.querySelector<HTMLElement>(`[data-tree-id="${CSS.escape(id)}"]`)?.focus();
  };
  const toggle = (id: string, open: boolean) => {
    setClosed((before) => {
      const next = new Set(before);
      if (open) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const stopOpening = () => {
    clearTimeout(opening.current?.timer);
    opening.current = undefined;
  };
  const endDrag = () => {
    stopOpening();
    setDragged(undefined);
    setOver(undefined);
  };

  const onKeyDown = (event: KeyboardEvent, row: Row) => {
    // Keys typed into what a row holds while it is edited are that field's.
    if (event.target !== event.currentTarget) return;
    const at = rows.indexOf(row);
    const branch = row.node.children !== undefined;
    const open = branch && !closed.has(row.node.id);
    switch (event.key) {
      case "ArrowDown":
        focus(rows[at + 1]?.node.id);
        break;
      case "ArrowUp":
        focus(rows[at - 1]?.node.id);
        break;
      case "ArrowRight":
        if (branch && !open) toggle(row.node.id, true);
        else if (open) focus(rows[at + 1]?.node.id);
        break;
      case "ArrowLeft":
        if (open) toggle(row.node.id, false);
        else focus(row.parent);
        break;
      case "Home":
        focus(rows[0]?.node.id);
        break;
      case "End":
        focus(rows.at(-1)?.node.id);
        break;
      case "Enter":
      case " ":
        onSelect?.(row.node.id);
        break;
      case "F2":
        if (!onRename) return;
        onRename(row.node.id);
        break;
      default:
        return;
    }
    event.preventDefault();
  };

  /** Where a row would go, from where the pointer is over another: its top, its middle or its bottom. */
  const positionAt = (event: DragEvent<HTMLElement>, branch: boolean): DropPosition => {
    const box = event.currentTarget.getBoundingClientRect();
    const at = box.height > 0 ? (event.clientY - box.top) / box.height : 0.5;
    if (!branch) return at < 0.5 ? "before" : "after";
    return at < 0.25 ? "before" : at > 0.75 ? "after" : "inside";
  };

  return (
    <div ref={list} role="tree" aria-label={label} className="flex flex-col">
      {rows.map((row, index) => {
        const { node, level } = row;
        const branch = node.children !== undefined;
        const open = branch && !closed.has(node.id);
        const chosen = node.id === selected;
        const grabbable = onMove !== undefined && (canDrag ? canDrag(node.id) : true);
        const here = over?.id === node.id ? over.position : undefined;
        // A row is named by everything it shows, the badge, the detail and what trails included,
        // so that what is heard holds what is seen (WCAG 2.5.3). Its buttons have names of their own.
        const part = (name: string) => `${base}-${index}-${name}`;
        const named =
          node.editing !== undefined
            ? { "aria-label": node.label }
            : {
                "aria-labelledby": [
                  part("name"),
                  ...(node.detail !== undefined ? [part("detail")] : []),
                  ...(node.trailing !== undefined && here !== "inside" ? [part("trailing")] : []),
                ].join(" "),
              };
        return (
          <div
            key={node.id}
            role="treeitem"
            {...named}
            data-tree-id={node.id}
            aria-level={level}
            aria-selected={chosen}
            {...(branch ? { "aria-expanded": open } : {})}
            tabIndex={node.id === current ? 0 : -1}
            onKeyDown={(event) => onKeyDown(event, row)}
            onFocus={(event) => {
              if (event.target === event.currentTarget) setFocused(node.id);
            }}
            onClick={(event) => {
              if (node.editing !== undefined) return;
              if ((event.target as HTMLElement).closest("[data-tree-action]")) return;
              setFocused(node.id);
              onSelect?.(node.id);
            }}
            {...(grabbable && node.editing === undefined
              ? {
                  draggable: true,
                  onDragStart: (event) => {
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", node.label);
                    setDragged(node.id);
                  },
                  onDragEnd: endDrag,
                }
              : {})}
            {...(onMove
              ? {
                  onDragOver: (event) => {
                    const position = positionAt(event, branch);
                    if (!takes(node.id, position)) {
                      if (over?.id === node.id) setOver(undefined);
                      return;
                    }
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                    if (over?.id !== node.id || over.position !== position) {
                      setOver({ id: node.id, position });
                    }
                    // A closed folder held over for a moment opens, so a row can go deeper.
                    if (position === "inside" && branch && !open) {
                      if (opening.current?.id !== node.id) {
                        stopOpening();
                        opening.current = {
                          id: node.id,
                          timer: setTimeout(() => toggle(node.id, true), OPEN_AFTER_MS),
                        };
                      }
                    } else if (opening.current?.id === node.id) stopOpening();
                  },
                  onDragLeave: (event) => {
                    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
                    if (over?.id === node.id) setOver(undefined);
                    if (opening.current?.id === node.id) stopOpening();
                  },
                  onDrop: (event) => {
                    const position = positionAt(event, branch);
                    if (!takes(node.id, position) || dragged === undefined) return;
                    event.preventDefault();
                    const moved = dragged;
                    endDrag();
                    onMove(moved, node.id, position);
                  },
                }
              : {})}
            style={{ paddingLeft: `${(level - 1) * 18 + 2}px` }}
            className={`group relative flex min-h-control cursor-pointer items-center gap-1.5 rounded-control py-1 pr-1.5 ${
              chosen ? "bg-selected text-ink" : "text-ink hover:bg-sunken"
            } ${here === "inside" ? "bg-action-soft outline outline-1 outline-action -outline-offset-1" : ""} ${
              dragged === node.id ? "opacity-50" : ""
            }`}
          >
            {/* The guides of the folders the row is in. */}
            {Array.from({ length: level - 1 }, (_, depth) => (
              <span
                // biome-ignore lint/suspicious/noArrayIndexKey: a guide is its depth, and nothing else.
                key={depth}
                aria-hidden
                className="pointer-events-none absolute inset-y-0 w-px bg-line"
                style={{ left: `${depth * 18 + (onMove ? 32 : 13)}px` }}
              />
            ))}
            {chosen ? (
              <span
                aria-hidden
                className="pointer-events-none absolute inset-y-1.5 w-0.5 rounded-full bg-action"
                style={{ left: `${(level - 1) * 18 + (onMove ? 22 : 3)}px` }}
              />
            ) : null}
            {here === "before" || here === "after" ? (
              <span
                aria-hidden
                className={`pointer-events-none absolute right-1 h-0.5 rounded-full bg-action ${
                  here === "before" ? "-top-px" : "-bottom-px"
                }`}
                style={{ left: `${(level - 1) * 18 + 8}px` }}
              >
                <span className="absolute -top-[3px] -left-1 size-2 rounded-full border-2 border-action bg-surface" />
              </span>
            ) : null}
            {onMove ? (
              <span
                aria-hidden
                className={`inline-flex w-4 shrink-0 justify-center ${
                  grabbable
                    ? "cursor-grab text-ink-subtle opacity-40 group-hover:opacity-100"
                    : "opacity-0"
                }`}
              >
                <GripVertical size={ICON.sm} strokeWidth={STROKE} />
              </span>
            ) : null}
            {branch ? (
              <button
                type="button"
                tabIndex={-1}
                data-tree-action
                aria-label={open ? `Close ${node.label}` : `Open ${node.label}`}
                onClick={(event) => {
                  event.stopPropagation();
                  toggle(node.id, !open);
                }}
                className="inline-flex size-5 shrink-0 items-center justify-center rounded-inner text-ink-muted hover:text-ink"
              >
                <ChevronRight
                  size={ICON.sm}
                  strokeWidth={STROKE}
                  aria-hidden
                  className={`transition-transform motion-fast ${open ? "rotate-90" : ""}`}
                />
              </button>
            ) : (
              <span className="size-5 shrink-0" aria-hidden />
            )}
            {node.icon}
            {node.editing !== undefined ? (
              <div className="min-w-0 flex-1">{node.editing}</div>
            ) : (
              <span className="flex min-w-0 flex-1 flex-col">
                <span
                  id={part("name")}
                  className={`flex min-w-0 items-center gap-1.5 ${chosen ? "font-medium" : ""}`}
                >
                  {/* A space before each part that follows is heard; the layout ignores it. */}
                  <span className="truncate">{node.label}</span>
                  {node.badge !== undefined ? <> {node.badge}</> : null}
                </span>
                {node.detail !== undefined ? " " : null}
                {node.detail !== undefined ? (
                  <span
                    id={part("detail")}
                    className="truncate font-mono text-code-sm text-ink-subtle"
                  >
                    {node.detail}
                  </span>
                ) : null}
              </span>
            )}
            {here === "inside" ? (
              <span className="shrink-0 text-meta text-action">Move into</span>
            ) : node.trailing !== undefined ? (
              <span id={part("trailing")} className="contents">
                {" "}
                {node.trailing}
              </span>
            ) : null}
            {node.actions !== undefined && node.editing === undefined ? (
              <span
                data-tree-action
                className="flex shrink-0 items-center gap-0.5 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100"
              >
                {node.actions}
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
