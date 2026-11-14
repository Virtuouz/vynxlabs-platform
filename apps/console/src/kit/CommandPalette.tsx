import { Dialog } from "@vynxlabs/ui";
import { CornerDownLeft, type LucideIcon, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { navigate } from "../router.tsx";

export interface Destination {
  key: string;
  label: string;
  /** Where it is: "Acme › Orders dev", shown after the label. */
  where?: string;
  to: string;
  icon?: LucideIcon;
}

/** Ranks a destination for what was typed: every word must appear; earlier is better. */
function score(destination: Destination, words: string[]): number {
  const text = `${destination.label} ${destination.where ?? ""}`.toLowerCase();
  let total = 0;
  for (const word of words) {
    const at = text.indexOf(word);
    if (at < 0) return -1;
    total += at === 0 ? 0 : destination.label.toLowerCase().startsWith(word) ? 1 : 2 + at / 100;
  }
  return total;
}

/** Opens on ⌘K or Ctrl+K anywhere, and from the header's search box. */
export function useCommandKey(open: () => void) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        open();
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [open]);
}

/** Jump to any screen, tenant or workspace by typing part of its name. */
export function CommandPalette({
  open,
  onClose,
  destinations,
}: {
  open: boolean;
  onClose: () => void;
  destinations: Destination[];
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const list = useRef<HTMLDivElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: starts empty each time it opens
  useEffect(() => {
    setQuery("");
    setActive(0);
  }, [open]);

  const found = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) return destinations.slice(0, 50);
    return destinations
      .map((destination) => [destination, score(destination, words)] as const)
      .filter(([, rank]) => rank >= 0)
      .sort((a, b) => a[1] - b[1])
      .map(([destination]) => destination)
      .slice(0, 50);
  }, [destinations, query]);

  const go = (destination: Destination | undefined) => {
    if (!destination) return;
    onClose();
    navigate(destination.to);
  };

  useEffect(() => {
    list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  return (
    <Dialog open={open} onClose={onClose} title="Go to">
      <div className="flex flex-col gap-2">
        <label className="flex h-10 items-center gap-2 rounded-control border border-line-strong bg-structure px-3">
          <Search aria-hidden="true" size={15} className="text-ink-subtle" />
          <input
            autoFocus
            role="combobox"
            aria-expanded="true"
            aria-controls="command-results"
            aria-activedescendant={found[active] ? `command-${found[active].key}` : undefined}
            aria-label="Search screens, tenants and workspaces"
            placeholder="Search screens, tenants and workspaces"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActive((at) => Math.min(at + 1, found.length - 1));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setActive((at) => Math.max(at - 1, 0));
              } else if (event.key === "Enter") {
                event.preventDefault();
                go(found[active]);
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
          className="max-h-[50vh] overflow-y-auto"
        >
          {found.length === 0 ? (
            <p className="m-0 px-3 py-6 text-center text-ink-muted">Nothing matches “{query}”.</p>
          ) : (
            found.map((destination, index) => {
              const Icon = destination.icon;
              return (
                <div
                  key={destination.key}
                  tabIndex={-1}
                  id={`command-${destination.key}`}
                  data-index={index}
                  role="option"
                  aria-selected={index === active}
                  onMouseEnter={() => setActive(index)}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    go(destination);
                  }}
                  className={`flex cursor-default items-center gap-2.5 rounded-control px-3 py-2 ${
                    index === active ? "bg-selected" : ""
                  }`}
                >
                  {Icon ? (
                    <Icon
                      aria-hidden="true"
                      size={15}
                      strokeWidth={1.75}
                      className="shrink-0 text-ink-muted"
                    />
                  ) : null}
                  <span className="truncate">{destination.label}</span>
                  {destination.where ? (
                    <span className="truncate text-meta text-ink-subtle">{destination.where}</span>
                  ) : null}
                  {index === active ? (
                    <CornerDownLeft
                      aria-hidden="true"
                      size={13}
                      className="ml-auto shrink-0 text-ink-subtle"
                    />
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </div>
    </Dialog>
  );
}
