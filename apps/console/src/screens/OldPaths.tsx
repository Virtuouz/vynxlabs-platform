import { api, useLoad } from "../api.ts";
import { Code } from "../kit/status.tsx";
import { Time } from "../kit/Time.tsx";
import { ListScreen, RemoveButton } from "../ListScreen.tsx";

interface Alias {
  path: string;
  kind: string;
  resourceId: string;
  now: string;
  createdAt: string;
  expiresAt: string;
  lastUsedAt: string | null;
}

/**
 * The paths renamed resources had and that still answer. Shown only while
 * there are any: most workspaces have none, and then there is nothing to say.
 */
export function OldPaths({ root, canEnd }: { root: string; canEnd: boolean }) {
  const aliases = useLoad<{ items: Alias[] }>(`${root}/aliases`);
  if (!aliases.data || aliases.data.items.length === 0) return null;
  return (
    <ListScreen<Alias>
      title="Old paths"
      description="A renamed resource still answers at the path it had, for 90 days, and tells whoever calls it where it is now. End one sooner once nothing calls it."
      path={`${root}/aliases`}
      rowKey={(row) => row.path}
      columns={[
        { header: "Old path", cell: (row) => <Code>{row.path}</Code> },
        { header: "Now at", cell: (row) => <Code>{row.now}</Code> },
        { header: "Kind", cell: (row) => row.kind.replaceAll("_", " ") },
        {
          header: "Last called",
          cell: (row) => (row.lastUsedAt ? <Time value={row.lastUsedAt} mode="ago" /> : "Never"),
        },
        { header: "Answers until", cell: (row) => <Time value={row.expiresAt} /> },
      ]}
      empty={{ title: "No old paths", text: "No renamed resource still answers at an old path." }}
      {...(canEnd
        ? {
            rowActions: (row: Alias, reload: () => void) => (
              <RemoveButton
                label="End now"
                confirm={`Stop ${row.path} answering for ${row.now}? Whatever still calls the old path will fail.`}
                run={() => api.delete(`${root}/aliases/${row.path}`)}
                onDone={() => {
                  reload();
                  aliases.reload();
                }}
              />
            ),
          }
        : {})}
    />
  );
}
