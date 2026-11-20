import { ChevronRight } from "lucide-react";
import { type KeyboardEvent, type ReactNode, useMemo, useRef, useState } from "react";
import { ICON, STROKE } from "./icons.ts";

export interface TreeNode {
  id: string;
  label: string;
  /** Drawn before the label. */
  icon?: ReactNode;
  /** Drawn after the label: a tag or a count. */
  trailing?: ReactNode;
  /** Set, even if empty, on a node that opens and closes. */
  children?: TreeNode[];
}

interface Row {
  node: TreeNode;
  level: number;
  parent?: string;
}

/**
 * Things inside things: folders and their pages. One row holds the keyboard.
 * Up and Down move between the rows that show, Right opens a row or steps
 * into it, Left closes it or steps out, Home and End go to the ends, and
 * Enter or Space chooses.
 *
 * With `onMove`, a row can be dragged onto another: a page onto a folder. A
 * drag is a pointer's way only, so whoever gives `onMove` gives the same move
 * another way too, for the keyboard.
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
  /** Whether one row can be let go on another. Left out, with `onMove`, on any but itself. */
  canDrop?: (dragged: string, onto: string) => boolean;
  /** A row was dragged onto another. */
  onMove?: (dragged: string, onto: string) => void;
}) {
  // The row being dragged, and the row it is over, when it may be let go there.
  const [dragged, setDragged] = useState<string>();
  const [over, setOver] = useState<string>();
  const takes = (onto: string) =>
    onMove !== undefined &&
    dragged !== undefined &&
    dragged !== onto &&
    (canDrop ? canDrop(dragged, onto) : true);
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

  const onKeyDown = (event: KeyboardEvent, row: Row) => {
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
      default:
        return;
    }
    event.preventDefault();
  };

  return (
    <div ref={list} role="tree" aria-label={label} className="flex flex-col">
      {rows.map((row) => {
        const { node, level } = row;
        const branch = node.children !== undefined;
        const open = branch && !closed.has(node.id);
        const chosen = node.id === selected;
        return (
          <div
            key={node.id}
            role="treeitem"
            data-tree-id={node.id}
            aria-level={level}
            aria-selected={chosen}
            {...(branch ? { "aria-expanded": open } : {})}
            tabIndex={node.id === current ? 0 : -1}
            onKeyDown={(event) => onKeyDown(event, row)}
            onFocus={() => setFocused(node.id)}
            onClick={() => {
              setFocused(node.id);
              onSelect?.(node.id);
            }}
            {...(onMove && (canDrag ? canDrag(node.id) : true)
              ? {
                  draggable: true,
                  onDragStart: (event) => {
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", node.label);
                    setDragged(node.id);
                  },
                  onDragEnd: () => {
                    setDragged(undefined);
                    setOver(undefined);
                  },
                }
              : {})}
            {...(onMove
              ? {
                  onDragOver: (event) => {
                    if (!takes(node.id)) return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                    if (over !== node.id) setOver(node.id);
                  },
                  onDragLeave: () => {
                    if (over === node.id) setOver(undefined);
                  },
                  onDrop: (event) => {
                    if (!takes(node.id) || dragged === undefined) return;
                    event.preventDefault();
                    const moved = dragged;
                    setDragged(undefined);
                    setOver(undefined);
                    onMove(moved, node.id);
                  },
                }
              : {})}
            style={{ paddingLeft: `${(level - 1) * 16 + 4}px` }}
            className={`flex min-h-control cursor-pointer items-center gap-1.5 rounded-control pr-2 ${
              chosen ? "bg-selected font-medium text-ink" : "text-ink hover:bg-sunken"
            } ${over === node.id ? "outline outline-2 outline-action -outline-offset-2" : ""} ${
              dragged === node.id ? "opacity-60" : ""
            }`}
          >
            {branch ? (
              <button
                type="button"
                tabIndex={-1}
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
            <span className="min-w-0 flex-1 truncate">{node.label}</span>
            {node.trailing}
          </div>
        );
      })}
    </div>
  );
}
