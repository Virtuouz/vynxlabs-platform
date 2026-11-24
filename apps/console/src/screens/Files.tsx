import { Button, EmptyState, Notice, TextField } from "@volvel/ui";
import { Upload } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { type ApiError, api } from "../api.ts";
import { ask, notify } from "../ask.tsx";
import { useNeeds } from "../kit/Can.tsx";
import { DataTable } from "../kit/DataTable.tsx";
import { bytes } from "../kit/format.ts";
import { ErrorState, Loading } from "../kit/LoadState.tsx";
import { Time } from "../kit/Time.tsx";
import { Page } from "../ListScreen.tsx";

/** The most the platform stores in one file, as the server holds it to. */
const MAX_FILE_BYTES = 25 * 1024 * 1024;
/** How many files one page of the list holds. */
const PAGE = 50;

/** A file as the list gives it, with the tables whose rows hold it. */
interface Listed {
  id: string;
  name: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
  namedBy: { table: string; column: string; rows: number | null }[];
}

interface FilePage {
  items: Listed[];
  nextCursor: string | null;
}

/** What names a file, in words: "tasks, attachment (2 rows)". Nothing when no row does. */
function naming(file: Listed): string {
  return file.namedBy
    .map((one) => {
      const how =
        one.rows === null ? "could not be read" : `${one.rows} ${one.rows === 1 ? "row" : "rows"}`;
      return `${one.table}, ${one.column} (${how})`;
    })
    .join("; ");
}

/**
 * Files stored in a workspace: uploaded by people in a table's file column, by a script, or here.
 * A file a row names cannot be deleted, so what names it is said on its row. The list is read a
 * page at a time, newest first.
 */
export function Files({ root }: { root: string }) {
  const [typed, setTyped] = useState("");
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<Listed[]>();
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<ApiError>();
  const [more, setMore] = useState(false);
  const [uploading, setUploading] = useState(false);
  /** Counted up to read the first page again, after an upload or a delete. */
  const [again, setAgain] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  // What is typed is looked for a moment after the last key.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(typed.trim()), 250);
    return () => clearTimeout(timer);
  }, [typed]);

  const path = useCallback(
    (from: string | null) => {
      const query = new URLSearchParams({ limit: String(PAGE) });
      if (search) query.set("search", search);
      if (from) query.set("cursor", from);
      return `${root}/files?${query}`;
    },
    [root, search],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: `again` reads the first page once more
  useEffect(() => {
    let current = true;
    setError(undefined);
    api.get<FilePage>(path(null)).then(
      (page) => {
        if (!current) return;
        setItems(page.items);
        setCursor(page.nextCursor);
      },
      (caught: ApiError) => current && setError(caught),
    );
    return () => {
      current = false;
    };
  }, [path, again]);

  const showMore = async () => {
    if (!cursor) return;
    setMore(true);
    try {
      const page = await api.get<FilePage>(path(cursor));
      setItems((now) => [...(now ?? []), ...page.items]);
      setCursor(page.nextCursor);
    } catch (caught) {
      notify.error(caught);
    } finally {
      setMore(false);
    }
  };

  const upload = async (file: File) => {
    if (file.size > MAX_FILE_BYTES) {
      notify.error(
        new Error(`${file.name} is over ${bytes(MAX_FILE_BYTES)}, the most a file can be.`),
      );
      return;
    }
    if (file.size === 0) {
      notify.error(new Error(`${file.name} is empty. Choose a file with something in it.`));
      return;
    }
    setUploading(true);
    try {
      await api.upload(`${root}/files?name=${encodeURIComponent(file.name)}`, file);
      notify.success(`${file.name} was uploaded.`);
      // A new file is first in the list, whatever was typed to look for.
      setTyped("");
      setSearch("");
      setAgain((n) => n + 1);
    } catch (caught) {
      notify.error(caught);
    } finally {
      setUploading(false);
    }
  };

  const remove = async (file: Listed) => {
    const sure = await ask.confirm({
      title: `Delete ${file.name}?`,
      text: "The file is gone for good. Nothing that names it is left: no row holds it.",
      action: "Delete",
      danger: true,
    });
    if (!sure) return;
    try {
      await api.delete(`${root}/files/${file.id}`);
      notify.success(`${file.name} was deleted.`);
      setAgain((n) => n + 1);
    } catch (caught) {
      notify.error(caught);
    }
  };

  const may = useNeeds({ base: root, permission: "file:write", what: "this workspace's files" });
  const action = (
    <>
      <input
        ref={input}
        type="file"
        hidden
        aria-label="File to upload"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (file) void upload(file);
        }}
      />
      <Button
        variant="primary"
        loading={uploading}
        disabled={!may.can}
        {...(may.reason ? { tooltip: may.reason } : {})}
        onClick={() => input.current?.click()}
      >
        <Upload aria-hidden="true" size={16} /> Upload file
      </Button>
    </>
  );

  return (
    <Page
      title="Files"
      description="Files stored in this workspace: those put in a table's file column, those a script saved, and those uploaded here. A file that a row names cannot be deleted: change the row first."
      action={action}
    >
      {may.line}
      {error && !items ? (
        <ErrorState what="files" error={error} onRetry={() => setAgain((n) => n + 1)} />
      ) : !items ? (
        <Loading what="files" />
      ) : (
        <>
          {error ? (
            <Notice
              tone="danger"
              action={<Button onClick={() => setAgain((n) => n + 1)}>Try again</Button>}
            >
              {error.message}
            </Notice>
          ) : null}
          <div className="w-full max-w-sm">
            <TextField
              name="find-file"
              label="Find a file by name"
              required={false}
              value={typed}
              onChange={setTyped}
            />
          </div>
          <DataTable<Listed>
            variant="static"
            framed
            label="Files"
            rows={items}
            rowKey={(row) => row.id}
            empty={
              search ? (
                <EmptyState title="No file has that in its name">
                  Look for part of a name, such as the end of one: .pdf.
                </EmptyState>
              ) : (
                <EmptyState title="No files yet" action={action}>
                  A file is stored when someone attaches one to a row, a script saves one, or one is
                  uploaded here.
                </EmptyState>
              )
            }
            columns={[
              {
                header: "Name",
                cell: (row) => (
                  <a
                    className="font-medium text-action"
                    href={`/api/v1${root}/files/${row.id}/content`}
                    download={row.name}
                    aria-label={`Download ${row.name}`}
                  >
                    {row.name}
                  </a>
                ),
              },
              { header: "Type", priority: 3, cell: (row) => row.contentType },
              { header: "Size", priority: 2, align: "end", cell: (row) => bytes(row.sizeBytes) },
              {
                header: "Uploaded",
                priority: 2,
                cell: (row) => <Time value={row.createdAt} mode="ago" />,
              },
              {
                header: "Named by",
                cell: (row) =>
                  row.namedBy.length > 0 ? (
                    naming(row)
                  ) : (
                    <span className="text-ink-muted">No row</span>
                  ),
              },
              {
                header: "",
                align: "end",
                cell: (row) => (
                  <Button
                    size="small"
                    variant="danger"
                    disabled={row.namedBy.length > 0 || !may.can}
                    aria-label={`Delete ${row.name}`}
                    {...(row.namedBy.length > 0 || may.reason
                      ? {
                          tooltip:
                            row.namedBy.length > 0
                              ? "A row still names this file. Change the row first."
                              : (may.reason as string),
                        }
                      : {})}
                    onClick={() => void remove(row)}
                  >
                    Delete
                  </Button>
                ),
              },
            ]}
          />
          {cursor ? (
            <div>
              <Button loading={more} onClick={() => void showMore()}>
                Show more files
              </Button>
            </div>
          ) : null}
        </>
      )}
    </Page>
  );
}
