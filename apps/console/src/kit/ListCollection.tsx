import { Button, Notice, TextField } from "@vynxlabs/ui";
import { type ReactNode, useState } from "react";
import { useLoad } from "../api.ts";
import { type CreateConfig, CreateDialog } from "../ListScreen.tsx";
import { type CollectionColumn, CollectionView } from "./CollectionView.tsx";
import { Inspector } from "./layout.tsx";

/**
 * A collection read from one GET route that answers `{ items }`, with a search
 * box, the screen's create dialog, and an inspector for the row chosen. The
 * shape most of the instance's and a tenant's lists take.
 */
export function ListCollection<Row>({
  title,
  description,
  path,
  columns,
  rowKey,
  empty,
  create,
  rowActions,
  search,
  inspect,
}: {
  title: string;
  description?: ReactNode;
  path: string;
  columns: CollectionColumn<Row>[];
  rowKey: (row: Row) => string;
  empty: { title: string; text?: ReactNode };
  create?: CreateConfig;
  /** A last column of actions on each row. */
  rowActions?: (row: Row, reload: () => void) => ReactNode;
  /** The words a row is found by, for the search box. Without it there is no box. */
  search?: (row: Row) => string;
  /** What the inspector shows for the chosen row. Without it rows are not chosen. */
  inspect?: {
    title: (row: Row) => ReactNode;
    eyebrow?: (row: Row) => ReactNode;
    body: (row: Row, reload: () => void) => ReactNode;
    footer?: (row: Row, reload: () => void, close: () => void) => ReactNode;
  };
}) {
  const list = useLoad<{ items: Row[] }>(path);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<ReactNode>();
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState<string>();

  const wanted = query.trim().toLowerCase();
  const rows = list.data?.items.filter(
    (row) => !search || wanted === "" || search(row).toLowerCase().includes(wanted),
  );
  const row = chosen ? list.data?.items.find((one) => rowKey(one) === chosen) : undefined;
  const close = () => setChosen(undefined);

  const createButton = create ? (
    <Button variant="primary" onClick={() => setCreating(true)}>
      {create.action}
    </Button>
  ) : null;
  const allColumns: CollectionColumn<Row>[] = rowActions
    ? [
        ...columns,
        {
          header: "Actions",
          align: "end",
          cell: (one) => (
            // Pressing an action is not choosing the row.
            // biome-ignore lint/a11y/noStaticElementInteractions: only stops the click reaching the row
            // biome-ignore lint/a11y/useKeyWithClickEvents: the buttons inside take the keyboard
            <span className="inline-flex gap-2" onClick={(event) => event.stopPropagation()}>
              {rowActions(one, list.reload)}
            </span>
          ),
        },
      ]
    : columns;

  return (
    <>
      <CollectionView<Row>
        title={title}
        description={description}
        actions={createButton}
        toolbar={
          created || search ? (
            <div className="flex flex-col gap-3">
              {created ? <Notice tone="attention">{created}</Notice> : null}
              {search ? (
                <div className="w-full max-w-sm">
                  <TextField
                    label={`Search ${title.toLowerCase()}`}
                    name="search"
                    value={query}
                    onChange={setQuery}
                  />
                </div>
              ) : null}
            </div>
          ) : undefined
        }
        columns={allColumns}
        rows={rows}
        rowKey={rowKey}
        selected={chosen}
        {...(inspect ? { onSelect: (one: Row) => setChosen(rowKey(one)) } : {})}
        inspector={
          inspect && row ? (
            <Inspector
              open
              label={`${title}: details`}
              title={inspect.title(row)}
              eyebrow={inspect.eyebrow?.(row)}
              onClose={close}
              footer={inspect.footer?.(row, list.reload, close)}
            >
              {inspect.body(row, list.reload)}
            </Inspector>
          ) : null
        }
        empty={
          wanted !== "" && list.data && list.data.items.length > 0
            ? { title: "Nothing matches", text: "Try fewer or other words." }
            : { ...empty, action: createButton }
        }
        error={list.error?.message}
        loading={list.loading && !list.data}
      />
      {create ? (
        <CreateDialog
          config={create}
          open={creating}
          onClose={() => setCreating(false)}
          onCreated={(result) => {
            setCreating(false);
            setCreated(create.afterCreate?.(result));
            list.reload();
          }}
        />
      ) : null}
    </>
  );
}
