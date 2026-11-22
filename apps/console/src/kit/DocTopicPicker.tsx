import { Button, Dialog, Notice, Skeleton } from "@volvel/ui";
import { BookOpen, Search, TriangleAlert } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useLoad } from "../api.ts";
import { Link } from "../router.tsx";
import type { DocsList } from "../screens/docs/model.ts";
import { type DocPick, grouped, matching, pickOfTopic, picksOf } from "./docPicks.ts";

/**
 * Chooses a topic of the workspace's documentation, from its pages, and says what has been chosen:
 * the page's title, where it is, and its topic, with Change and Clear. A topic that no page has any
 * more is said to be a problem, not hidden. Whatever asks for a topic asks it here, as a picklist,
 * never as free text (the page settings' Help topic is the first).
 */
export function DocTopicPicker({
  root,
  link,
  label,
  value,
  onChange,
  hint,
  disabled = false,
}: {
  /** The workspace's path. */
  root: string;
  /** The workspace's link in the console, for "Edit it" and "Write the first". */
  link: string;
  label: string;
  /** The topic now, or nothing. */
  value: string | undefined;
  /** The topic chosen, or `undefined` for none. */
  onChange: (topic: string | undefined) => void;
  hint?: string;
  disabled?: boolean;
}) {
  const list = useLoad<DocsList>(`${root}/docs`);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const picks = useMemo(() => (list.data ? picksOf(list.data) : []), [list.data]);
  const chosen = value ? pickOfTopic(picks, value) : undefined;
  const lost = value !== undefined && value !== "" && list.data !== undefined && !chosen;
  const id = useId();
  return (
    <div ref={box} className="flex min-w-0 flex-col gap-1.5" data-doc-topic="">
      <span id={`${id}-label`} className="text-body-sm font-medium text-ink">
        {label}
      </span>
      {value ? (
        <div
          className={`flex min-w-0 flex-col gap-2 rounded-control border p-2.5 ${
            lost ? "border-attention bg-attention-soft" : "border-line bg-surface"
          }`}
        >
          {chosen ? (
            <div className="flex min-w-0 items-start gap-2">
              <BookOpen aria-hidden="true" size={16} className="mt-0.5 shrink-0 text-ink-muted" />
              <div className="min-w-0">
                <p className="m-0 truncate text-body-sm font-medium text-ink">{chosen.title}</p>
                <p className="m-0 truncate text-meta text-ink-muted">{chosen.where}</p>
                <p className="m-0 truncate text-meta text-ink-muted">
                  Topic <code className="font-mono text-code-sm">{value}</code>
                </p>
              </div>
            </div>
          ) : lost ? (
            <div className="flex min-w-0 items-start gap-2" role="status">
              <TriangleAlert
                aria-hidden="true"
                size={16}
                className="mt-0.5 shrink-0 text-attention"
              />
              <div className="min-w-0 text-body-sm text-ink">
                <p className="m-0 font-medium">
                  No document has the topic <code className="font-mono text-code-sm">{value}</code>
                </p>
                <p className="m-0 text-meta text-ink-muted">
                  The Help button of this page shows nothing until a document has it, or another is
                  chosen.
                </p>
              </div>
            </div>
          ) : (
            <p className="m-0 text-body-sm text-ink-muted" role="status">
              Topic <code className="font-mono text-code-sm">{value}</code>
              {list.error ? ". The documents could not be read." : ". Reading the documents…"}
            </p>
          )}
          {!disabled ? (
            <div className="flex gap-2">
              <Button size="small" variant="secondary" onClick={() => setOpen(true)}>
                Change
              </Button>
              <Button size="small" variant="quiet" onClick={() => onChange(undefined)}>
                Clear
              </Button>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col items-start gap-1.5">
          <Button
            size="small"
            variant="secondary"
            disabled={disabled}
            aria-describedby={`${id}-label`}
            onClick={() => setOpen(true)}
          >
            <Search aria-hidden="true" size={14} /> Choose a document
          </Button>
          <p className="m-0 text-meta text-ink-muted">None: this page has no Help button.</p>
        </div>
      )}
      {hint ? <p className="m-0 text-meta text-ink-muted">{hint}</p> : null}
      <TopicDialog
        open={open}
        onClose={() => {
          setOpen(false);
          // Focus goes back to what opened it.
          setTimeout(() => box.current?.querySelector<HTMLElement>("button")?.focus(), 0);
        }}
        title={label}
        link={link}
        picks={picks}
        loading={list.data === undefined && !list.error}
        failed={list.error !== undefined && list.data === undefined}
        onRetry={() => void list.reload()}
        current={value}
        onChoose={(topic) => {
          setOpen(false);
          onChange(topic);
        }}
      />
    </div>
  );
}

/** The window: a search over every page of the documentation, grouped by folder. */
export function TopicDialog({
  open,
  onClose,
  title,
  link,
  picks,
  loading,
  failed,
  onRetry,
  current,
  onChoose,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  link: string;
  picks: readonly DocPick[];
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
  current: string | undefined;
  onChoose: (topic: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [at, setAt] = useState(0);
  const id = useId();
  const found = useMemo(() => matching(picks, query), [picks, query]);
  const groups = useMemo(() => grouped(found), [found]);
  // What the arrows go through: the pages that have a topic.
  const ready = useMemo(() => found.filter((one) => one.topic), [found]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new search starts at the top
  useEffect(() => setAt(0), [query]);
  useEffect(() => {
    if (open) setQuery("");
  }, [open]);
  // The page that is in use is the one the list opens on.
  // biome-ignore lint/correctness/useExhaustiveDependencies: once, as it opens
  useEffect(() => {
    if (!open) return;
    const now = ready.findIndex((one) => one.topic === current);
    if (now > 0) setAt(now);
  }, [open, ready.length]);
  const active = ready[Math.min(at, ready.length - 1)];
  const optionId = (one: DocPick) => `${id}-${one.path}`;
  // The highlighted row stays in view.
  // biome-ignore lint/correctness/useExhaustiveDependencies: by what is highlighted
  useEffect(() => {
    if (!active) return;
    document.getElementById(optionId(active))?.scrollIntoView?.({ block: "nearest" });
  }, [active?.path]);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description="Choose the page of your documentation that the Help button shows."
      footer={
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
      }
    >
      <div className="flex min-w-0 flex-col gap-3">
        <div className="relative">
          <Search
            aria-hidden="true"
            size={14}
            className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-ink-muted"
          />
          <input
            type="search"
            role="combobox"
            aria-label="Search the documents"
            aria-expanded="true"
            aria-controls={`${id}-list`}
            aria-activedescendant={active ? optionId(active) : undefined}
            placeholder="Search by title, folder or topic"
            autoComplete="off"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                if (ready.length === 0) return;
                setAt((now) =>
                  event.key === "ArrowDown"
                    ? Math.min(ready.length - 1, now + 1)
                    : Math.max(0, now - 1),
                );
              } else if (event.key === "Home" && event.ctrlKey) {
                setAt(0);
              } else if (event.key === "Enter") {
                event.preventDefault();
                if (active?.topic) onChoose(active.topic);
              }
            }}
            className="h-control w-full rounded-control border border-line-control bg-surface pr-3 pl-8 text-ink placeholder:text-ink-muted/70 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-action"
          />
        </div>
        {loading ? (
          <Skeleton lines={4} label="Reading the documents" />
        ) : failed ? (
          <Notice
            tone="danger"
            action={
              <Button size="small" variant="secondary" onClick={onRetry}>
                Try again
              </Button>
            }
          >
            The documents could not be read.
          </Notice>
        ) : picks.length === 0 ? (
          <div className="flex flex-col items-start gap-2 py-2" role="status">
            <p className="m-0 text-body-sm text-ink-muted">
              This workspace has no documentation yet. A page with a topic is what a Help button can
              show.
            </p>
            <Link to={`${link}/docs`} className="text-body-sm text-action underline">
              Write the first page
            </Link>
          </div>
        ) : found.length === 0 ? (
          <p className="m-0 py-2 text-body-sm text-ink-muted" role="status">
            No document matches “{query}”.
          </p>
        ) : (
          <div
            id={`${id}-list`}
            role="listbox"
            aria-label="Documents"
            className="m-0 flex max-h-[min(24rem,50vh)] flex-col gap-2 overflow-y-auto p-0"
          >
            {groups.map((group) => (
              <div key={group.folder} role="presentation">
                {/* biome-ignore lint/a11y/useSemanticElements: a group of options in a listbox is a role, not a fieldset */}
                <div role="group" aria-label={group.folder} className="flex flex-col">
                  <div
                    role="presentation"
                    className="px-2 py-1 text-label text-ink-muted uppercase"
                  >
                    {group.folder}
                  </div>
                  {group.items.map((one) => {
                    const usable = one.topic !== null;
                    const on = active?.path === one.path;
                    const mine = usable && one.topic === current;
                    return (
                      <div
                        key={one.path}
                        id={optionId(one)}
                        role="option"
                        tabIndex={-1}
                        aria-selected={mine}
                        aria-disabled={usable ? undefined : true}
                        data-active={on ? "" : undefined}
                        onClick={() => {
                          if (one.topic) onChoose(one.topic);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" && one.topic) onChoose(one.topic);
                        }}
                        className={`flex min-w-0 items-start gap-2 rounded-inner px-2 py-1.5 ${
                          usable ? "cursor-pointer" : "cursor-default opacity-70"
                        } ${on ? "bg-action-soft" : usable ? "hover:bg-sunken" : ""}`}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="m-0 truncate text-body-sm font-medium text-ink">
                            {one.title}
                            {mine ? (
                              <span className="ml-2 text-meta text-action">In use</span>
                            ) : null}
                          </p>
                          {one.description ? (
                            <p className="m-0 truncate text-meta text-ink-muted">
                              {one.description}
                            </p>
                          ) : null}
                          <p className="m-0 truncate text-meta text-ink-muted">
                            {one.where}
                            {usable ? (
                              <>
                                {" · topic "}
                                <code className="font-mono text-code-sm">{one.topic}</code>
                              </>
                            ) : null}
                          </p>
                          {usable ? null : (
                            <p className="m-0 text-meta text-attention">
                              This page has no topic.{" "}
                              <Link to={`${link}/docs/edit/${one.path}`} className="underline">
                                Edit it
                              </Link>{" "}
                              to give it one.
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Dialog>
  );
}
