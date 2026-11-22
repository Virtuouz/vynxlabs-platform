import { MAX_PAGES, type Page } from "@volvel/manifest";
import { Button, Dialog, SelectField, TextField } from "@volvel/ui";
import { useEffect, useMemo, useState } from "react";
import { useCatalog } from "../../kit/inspector/catalog.ts";
import { heading, mainTable } from "../../kit/inspector/model.ts";
import { useTableInfo } from "./SampleRecord.tsx";
import {
  blankPage,
  listPage,
  recordPage,
  STARTS,
  type Start,
  type Started,
  startTitle,
  startWords,
} from "./starters.ts";

const LINES = STARTS;

/**
 * "Add a page": a blank one, or one started from a table: a list of it, or a page for
 * one of its records. A start makes all its pages and widgets at once, and the builder
 * opens the new page.
 */
export function NewPageDialog({
  open,
  onClose,
  root,
  pages,
  onMake,
  preset,
}: {
  open: boolean;
  /** Opened from an empty page: the start and table it chose. */
  preset?: { start: Start; table: string } | undefined;
  onClose: () => void;
  root: string;
  /** The app's pages: a new page's address is made unique among them, and a sheet it needs may already be there. */
  pages: readonly Page[];
  onMake: (started: Started) => void;
}) {
  const { catalog } = useCatalog(root);
  const tables = catalog.tables;
  const [start, setStart] = useState<Start>("blank");
  const [table, setTable] = useState<string>();
  const [typed, setTyped] = useState<string>();
  useEffect(() => {
    if (!open) return;
    setStart(preset?.start ?? "blank");
    setTable(preset?.table);
    setTyped(undefined);
  }, [open, preset]);
  // Started from the table the app reads most, else the first.
  const usual = useMemo(
    () =>
      mainTable(
        pages.flatMap((one) => one.widgets),
        catalog,
      ),
    [pages, catalog],
  );
  const chosen =
    table && tables.some((one) => one.name === table)
      ? table
      : usual && tables.some((one) => one.name === usual)
        ? usual
        : tables[0]?.name;
  const fromTable = start !== "blank" && chosen !== undefined;
  const info = useTableInfo(root, fromTable ? chosen : undefined);
  const title = (typed ?? startTitle(start, chosen)).trim();
  const started = useMemo(() => {
    if (title === "") return undefined;
    if (start === "blank" || !chosen) return blankPage(title, pages);
    if (!info) return undefined;
    return start === "list"
      ? listPage(info, title, pages)
      : recordPage(info, title, pages, catalog);
  }, [start, chosen, info, title, pages, catalog]);
  const room = MAX_PAGES - pages.length;
  const tooMany = started !== undefined && started.pages.length > room;
  const waiting = fromTable && !info;
  const options: Start[] = tables.length > 0 ? ["blank", "list", "record"] : ["blank"];
  return (
    <Dialog open={open} onClose={onClose} title="Add a page">
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (started && !tooMany) onMake(started);
        }}
      >
        <fieldset className="m-0 flex flex-col gap-1 border-0 p-0">
          <legend className="mb-1 text-label text-ink-subtle uppercase">Start from</legend>
          {options.map((one) => (
            <label
              key={one}
              className="flex cursor-pointer items-start gap-3 rounded-control px-2 py-2 hover:bg-action-soft has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus"
            >
              <input
                type="radio"
                name="page-start"
                value={one}
                checked={start === one}
                onChange={() => {
                  setStart(one);
                  setTyped(undefined);
                }}
                className="mt-1 size-4 accent-(--vx-action)"
              />
              <span className="flex min-w-0 flex-col">
                <span className="font-medium text-ink">{startWords(one, chosen)}</span>
                <span className="text-body-sm text-ink-muted">{LINES[one]}</span>
              </span>
            </label>
          ))}
        </fieldset>
        {start !== "blank" ? (
          <SelectField
            label="Table"
            name="page-start-table"
            value={chosen ?? ""}
            options={tables.map((one) => ({ value: one.name, label: heading(one.name) }))}
            onChange={(value) => {
              setTable(value);
              setTyped(undefined);
            }}
          />
        ) : null}
        <TextField
          label="Name of the page"
          name="page-title"
          value={typed ?? startTitle(start, chosen)}
          maxLength={200}
          required
          onChange={setTyped}
        />
        {tooMany ? (
          <p role="alert" className="m-0 text-body-sm text-danger">
            This makes {started.pages.length} pages, and the app has room for {room}. Remove a page
            first.
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button variant="quiet" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={!started || tooMany || waiting}>
            Add the page
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
