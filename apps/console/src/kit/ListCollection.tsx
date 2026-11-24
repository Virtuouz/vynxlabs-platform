import { Button, Notice, TextField } from "@volvel/ui";
import { type ReactNode, useState } from "react";
import { type CreateConfig, CreateDialog } from "../ListScreen.tsx";
import { useUrlState } from "../router.tsx";
import { type Needs, useNeeds } from "./Can.tsx";
import { type CollectionColumn, CollectionView } from "./CollectionView.tsx";
import { Inspector } from "./layout.tsx";
import { LoadMore, usePagedList } from "./paged.tsx";
import { useRowActionColumns } from "./rowActions.tsx";

const LIST_URL = { q: { type: "string" }, item: { type: "string", push: true } } as const;

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
  paged,
  filters,
  inspect,
  needs,
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
  /**
   * The route pages and takes `?search=`: the box then asks the server, so a
   * row past the first page is found, and "Load more" follows the list.
   * `search` then only says there is a box.
   */
  paged?: boolean;
  /** Controls beside the search box that narrow the list: kept by the screen, in the address. */
  filters?: ReactNode;
  /** What the inspector shows for the chosen row. Without it rows are not chosen. */
  /** What changing the list takes: without it, the controls to change are greyed with the reason. */
  needs?: Needs;
  inspect?: {
    title: (row: Row) => ReactNode;
    eyebrow?: (row: Row) => ReactNode;
    body: (row: Row, reload: () => void) => ReactNode;
    footer?: (row: Row, reload: () => void, close: () => void) => ReactNode;
  };
}) {
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<ReactNode>();
  // The search and the open row are in the address: a reload or a link keeps them,
  // and Back closes the inspector before it leaves the screen.
  const [url, setUrl] = useUrlState(LIST_URL);
  const query = url.q ?? "";
  const setQuery = (value: string) => setUrl({ q: value || undefined });
  const chosen = url.item;
  const setChosen = (key: string | undefined) => setUrl({ item: key });

  const hasSearch = Boolean(search || paged);
  const wanted = query.trim().toLowerCase();
  const list = usePagedList<Row>(path, {
    search: paged ? query : "",
    limit: paged ? 50 : 0,
  });
  const rows = paged
    ? list.items
    : list.items?.filter(
        (row) => !search || wanted === "" || search(row).toLowerCase().includes(wanted),
      );
  const row = chosen ? list.items?.find((one) => rowKey(one) === chosen) : undefined;
  const close = () => setChosen(undefined);

  const { can, line, reason } = useNeeds(needs);
  const createButton = create ? (
    <Button
      variant="primary"
      disabled={!can}
      {...(reason ? { tooltip: reason } : {})}
      onClick={() => setCreating(true)}
    >
      {create.action}
    </Button>
  ) : null;
  // The column of actions, as every list draws it (kit/rowActions.tsx).
  const allColumns = useRowActionColumns(columns, rowActions, { can, reload: list.reload });

  return (
    <>
      <CollectionView<Row>
        title={title}
        description={description}
        actions={createButton}
        toolbar={
          created || hasSearch || filters || line ? (
            <div className="flex flex-col gap-3">
              {line}
              {created ? <Notice tone="attention">{created}</Notice> : null}
              {hasSearch || filters ? (
                <div className="flex flex-wrap items-end gap-3">
                  {hasSearch ? (
                    <div className="w-full max-w-sm">
                      <TextField
                        label={`Search ${title.toLowerCase()}`}
                        name="search"
                        value={query}
                        onChange={setQuery}
                      />
                    </div>
                  ) : null}
                  {filters}
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
              footer={
                inspect.footer ? (
                  <fieldset disabled={!can} className="contents">
                    {inspect.footer(row, list.reload, close)}
                  </fieldset>
                ) : undefined
              }
            >
              {inspect.body(row, list.reload)}
            </Inspector>
          ) : null
        }
        empty={
          wanted !== "" && list.items && (paged || list.items.length > 0)
            ? { title: "Nothing matches", text: "Try fewer or other words." }
            : { ...empty, action: createButton }
        }
        error={list.error}
        onRetry={list.reload}
        loading={list.loading && !list.items}
        table={{
          onRetry: list.reload,
          ...(paged
            ? {
                footer: (
                  <LoadMore
                    shown={list.items?.length ?? 0}
                    hasMore={list.hasMore}
                    loading={list.loadingMore}
                    error={list.moreError}
                    noun={title.toLowerCase()}
                    onMore={list.loadMore}
                  />
                ),
              }
            : {}),
          ...(wanted !== "" ? { filtered: { onClear: () => setQuery("") } } : {}),
        }}
      />
      {create ? (
        <CreateDialog
          config={create}
          open={creating}
          onClose={() => setCreating(false)}
          onCreated={(result) => {
            setCreating(false);
            setCreated(create.afterCreate?.(result, () => setCreated(undefined)));
            list.reload();
          }}
        />
      ) : null}
    </>
  );
}
