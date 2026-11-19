import { Button, Dialog, Notice, TextField } from "@volvel/ui";
import { useEffect, useState } from "react";
import { ApiError, api } from "../api.ts";
import { failureText, notify } from "../ask.tsx";
import { Loading } from "../kit/LoadState.tsx";
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
export function cannotRename(row: {
  ownership: string;
  path: string;
  key?: string | undefined;
}): string | undefined {
  // A file is renamed like anything else: it moves with its resource, or says the new path.
  if (row.ownership === "code") {
    return `It is defined in the repository's code. Change its path or title there, and give it key: "${row.key ?? row.path}".`;
  }
  return undefined;
}

/** An app and an interface are titled where they are edited: the title is part of what they are. */
const titledInBody = (kind: string) => kind === "app" || kind === "interface";

interface Stored {
  kind: string;
  schemaVersion: number;
  body: Record<string, unknown>;
  key?: string;
  title?: string | null;
}

/**
 * What a resource is called: its key, which never changes, its path and its
 * title. Changing the path or the title saves a draft that keeps the key:
 * deployed, it is the same resource, with its history and what is bound to
 * it, and the old path keeps answering for a while. Nothing that runs changes
 * until the draft is deployed.
 *
 * The same button and dialog serve the list of resources and each editor.
 */
export function ResourceIdentity({
  root,
  link,
  row,
  onDone,
  label = "Rename",
  unsaved = false,
}: {
  root: string;
  /** The workspace's address in the console, for the way to the Releases screen. */
  link: string;
  /** An editor knows the path it opened and no key: the dialog reads the key itself. */
  row: Pick<NamedResource, "path" | "kind" | "ownership"> & { key?: string };
  /** Told the path the draft is at now, which is a new one after a rename. */
  onDone: (path: string) => void;
  label?: string;
  /** An editor with changes it has not saved: the draft renamed would not have them. */
  unsaved?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const why = cannotRename(row) ?? (unsaved ? "Save the draft first." : undefined);
  return (
    <>
      <Button size="small" disabled={why !== undefined} title={why} onClick={() => setOpen(true)}>
        {label}
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Name and path of ${row.path}`}
        description={`It stays the same ${row.kind.replaceAll("_", " ")}: its history, its data and what is bound to it come along, and ${row.path} keeps answering for 90 days. Nothing changes until the draft is deployed.`}
      >
        {open ? (
          <IdentityForm
            root={root}
            link={link}
            row={row}
            onClose={() => setOpen(false)}
            onDone={onDone}
          />
        ) : null}
      </Dialog>
    </>
  );
}

function IdentityForm({
  root,
  link,
  row,
  onClose,
  onDone,
}: {
  root: string;
  link: string;
  row: Pick<NamedResource, "path" | "kind"> & { key?: string };
  onClose: () => void;
  onDone: (path: string) => void;
}) {
  const [stored, setStored] = useState<Stored>();
  const [was, setWas] = useState("");
  const [path, setPath] = useState(row.path);
  const [title, setTitle] = useState("");
  const [problem, setProblem] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let current = true;
    const missing = (error: unknown) => {
      if (error instanceof ApiError && error.status === 404) return undefined;
      throw error;
    };
    (async () => {
      // The draft is of the whole resource: what an open draft would make it, or what it is now.
      const [draft, deployed] = await Promise.all([
        api.get<Stored>(`${root}/drafts/${row.path}`).catch(missing),
        api.get<Stored>(`${root}/resources/${row.path}`).catch(missing),
      ]);
      const found = draft ?? deployed;
      if (!current) return;
      if (!found) {
        setProblem(`${row.path} is not there any more.`);
        return;
      }
      // A draft that does not speak of the title leaves the one the resource has.
      const now = (draft && draft.title !== null ? draft.title : deployed?.title) ?? "";
      setStored(found);
      setWas(now);
      setTitle(now);
    })().catch((error) => current && setProblem(failureText(error)));
    return () => {
      current = false;
    };
  }, [root, row.path]);

  if (!stored) return problem ? <Notice tone="danger">{problem}</Notice> : <Loading />;
  const moved = path.trim() !== row.path;
  const retitled = title.trim() !== was;
  const save = async () => {
    setBusy(true);
    setProblem(undefined);
    try {
      await api.put(`${root}/drafts/${row.path}`, {
        kind: stored.kind,
        schemaVersion: stored.schemaVersion,
        body: stored.body,
        ...(moved ? { path: path.trim() } : {}),
        ...(retitled ? { title: title.trim() || null } : {}),
      });
      notify.success(
        moved
          ? `A draft renames ${row.path} to ${path.trim()}.`
          : `A draft changes the title of ${row.path}.`,
        { action: { label: "Review and deploy", onClick: () => navigate(`${link}/release`) } },
      );
      onClose();
      onDone(path.trim());
    } catch (error) {
      setProblem(failureText(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!busy && (moved || retitled) && path.trim() !== "") void save();
      }}
    >
      <div>
        <span className="block text-body-sm text-ink-muted">Key</span>
        <code className="font-mono text-code break-all">{stored.key ?? row.key ?? row.path}</code>
        <span className="block text-meta text-ink-muted">
          What the resource is, whatever it is called. It never changes.
        </span>
      </div>
      <TextField
        name="path"
        label="Path"
        value={path}
        required
        maxLength={255}
        onChange={setPath}
        hint="Where it is found: what code, addresses and tools call it by."
      />
      {titledInBody(row.kind) ? null : (
        <TextField
          name="title"
          label="Title"
          value={title}
          maxLength={200}
          onChange={setTitle}
          hint="What people read in lists. Leave it empty for none."
        />
      )}
      {problem ? <Notice tone="danger">{problem}</Notice> : null}
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="submit"
          variant="primary"
          loading={busy}
          disabled={(!moved && !retitled) || path.trim() === ""}
        >
          Save as a draft
        </Button>
      </div>
    </form>
  );
}
