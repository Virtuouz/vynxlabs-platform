import { Badge, Button, EmptyState, Notice, Table } from "@vynxlabs/ui";
import { useEffect, useState } from "react";
import { type ApiError, api } from "../api.ts";
import { Page, when } from "../ListScreen.tsx";

interface Entry {
  id: string;
  occurredAt: string;
  actorType: string;
  actorId: string | null;
  accessGrantId: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  details: Record<string, unknown>;
  ipAddress: string | null;
}

/** The audit log, newest first, loading older entries on request. */
export function AuditTable({
  title,
  description,
  path,
}: {
  title: string;
  description: string;
  path: string;
}) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<ApiError>();
  const [loaded, setLoaded] = useState(false);

  const load = async (from: string | null) => {
    try {
      const page = await api.get<{ items: Entry[]; nextCursor: string | null }>(
        `${path}?limit=50${from ? `&cursor=${from}` : ""}`,
      );
      setEntries((current) => (from ? [...current, ...page.items] : page.items));
      setCursor(page.nextCursor);
      setError(undefined);
    } catch (caught) {
      setError(caught as ApiError);
    }
    setLoaded(true);
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: the first page is loaded again only when the route changes
  useEffect(() => {
    load(null);
  }, [path]);

  return (
    <Page title={title} description={description}>
      {error ? <Notice tone="danger">{error.message}</Notice> : null}
      {loaded ? (
        <Table
          rows={entries}
          rowKey={(row) => row.id}
          empty={<EmptyState title="Nothing recorded yet" />}
          columns={[
            {
              header: "When",
              cell: (row) => <span className="whitespace-nowrap">{when(row.occurredAt)}</span>,
            },
            {
              header: "Action",
              cell: (row) => (
                <span className="flex flex-wrap items-center gap-2">
                  <code className="font-mono text-[13px]">{row.action}</code>
                  {row.accessGrantId ? <Badge tone="attention">Operator access</Badge> : null}
                </span>
              ),
            },
            {
              header: "Who",
              cell: (row) => (
                <span title={row.actorId ?? ""}>
                  {row.actorType}
                  {row.actorId ? (
                    <span className="text-ink-muted"> {row.actorId.slice(-8)}</span>
                  ) : null}
                </span>
              ),
            },
            {
              header: "What",
              cell: (row) => (
                <span className="text-ink-muted">
                  {row.targetType} {row.targetId ?? ""}
                  {Object.keys(row.details).length > 0 ? ` ${JSON.stringify(row.details)}` : ""}
                </span>
              ),
            },
            { header: "From", cell: (row) => row.ipAddress ?? "" },
          ]}
        />
      ) : (
        <p className="text-ink-muted">Loading…</p>
      )}
      {cursor ? (
        <div>
          <Button onClick={() => load(cursor)}>Show older entries</Button>
        </div>
      ) : null}
    </Page>
  );
}
