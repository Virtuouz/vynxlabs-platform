import { Button } from "@vynxlabs/ui";
import { ApiError, api } from "../api.ts";
import { ask, notify } from "../ask.tsx";
import { navigate } from "../router.tsx";

export interface NamedResource {
  path: string;
  key: string;
  kind: string;
  title: string | null;
  ownership: string;
  /** The file in the repository that defines it, when that is known and is not the console's own. */
  definedIn: string | null;
}

/** Where a resource is defined, in the words a list has room for. */
export function definedWhere(row: NamedResource): string {
  if (row.definedIn) return `Repository, ${row.definedIn}`;
  return row.ownership === "code" ? "Repository" : "Console";
}

/** Why the console cannot rename a resource, or nothing when it can. */
export function cannotRename(row: NamedResource): string | undefined {
  // A file is renamed like anything else: it moves with its resource, or says the new path.
  if (row.ownership === "code") {
    return `It is defined in the repository's code. Change its path there, and give it key: "${row.key}".`;
  }
  return undefined;
}

/**
 * Renames a resource the console manages. It saves a draft at the new path,
 * which keeps the resource's key: deployed, it is the same resource, with its
 * history and what is bound to it, and the old path keeps answering for a
 * while. Nothing that runs changes until the draft is deployed.
 */
export function RenameResource({
  root,
  link,
  row,
  onDone,
}: {
  root: string;
  /** The workspace's address in the console, for the way to the Releases screen. */
  link: string;
  row: NamedResource;
  onDone: () => void;
}) {
  const why = cannotRename(row);
  return (
    <Button
      size="small"
      disabled={why !== undefined}
      title={why}
      onClick={async () => {
        const path = await ask.prompt({
          title: `Rename ${row.path}`,
          text: `It stays the same ${row.kind.replaceAll("_", " ")}: its history, its data and what is bound to it come along, and ${row.path} keeps answering for 90 days. Its key, ${row.key}, does not change. Nothing changes until the draft is deployed.`,
          label: "New path",
          initial: row.path,
          action: "Save as a draft",
        });
        if (!path || path === row.path) return;
        try {
          // The draft is of the whole resource: what it has now, or what an open draft would make it.
          const current = await api
            .get<{ kind: string; schemaVersion: number; body: Record<string, unknown> }>(
              `${root}/drafts/${row.path}`,
            )
            .catch(async (error) => {
              if (!(error instanceof ApiError) || error.status !== 404) throw error;
              return api.get<{
                kind: string;
                schemaVersion: number;
                body: Record<string, unknown>;
              }>(`${root}/resources/${row.path}`);
            });
          await api.put(`${root}/drafts/${row.path}`, {
            kind: current.kind,
            schemaVersion: current.schemaVersion,
            body: current.body,
            path,
          });
          notify.success(`A draft renames ${row.path} to ${path}.`, {
            action: { label: "Review and deploy", onClick: () => navigate(`${link}/release`) },
          });
          onDone();
        } catch (error) {
          notify.error(error);
        }
      }}
    >
      Rename
    </Button>
  );
}
