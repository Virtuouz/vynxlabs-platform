import { Button, ComboboxField, Dialog, EmptyState, Notice, TextField } from "@vynxlabs/ui";
import { useState } from "react";
import { api, useLoad } from "../api.ts";
import { failureText, notify } from "../ask.tsx";
import { CollectionView } from "../kit/CollectionView.tsx";
import { Mono } from "../kit/status.tsx";
import { CreateDialog, RemoveButton, when } from "../ListScreen.tsx";
import { type Framed, toolbarOf } from "./Members.tsx";

interface Person {
  id: string;
  email: string;
  name: string;
}

/**
 * Who is in a group: the people in it, a way to add one of the tenant's
 * people by searching, and a way to take one out.
 */
function MembersDialog({
  group,
  path,
  candidates,
  noun,
  onClose,
}: {
  group: { id: string; name: string };
  /** The group's own route: `GET` gives its members, and `/members/:id` adds and removes. */
  path: string;
  /** A route listing everyone who could be added. */
  candidates: string;
  /** What the people are called: "member" or "end user". */
  noun: string;
  onClose: () => void;
}) {
  const detail = useLoad<{ members: Person[] }>(path);
  const everyone = useLoad<{ items: Person[] }>(candidates);
  const [adding, setAdding] = useState<string>();
  const [problem, setProblem] = useState<string>();
  const [busy, setBusy] = useState(false);
  const members = detail.data?.members ?? [];
  const inGroup = new Set(members.map((person) => person.id));
  const options = (everyone.data?.items ?? [])
    .filter((person) => !inGroup.has(person.id))
    .map((person) => ({
      value: person.id,
      label: person.email,
      ...(person.name ? { hint: person.name } : {}),
    }));

  return (
    <Dialog
      open
      size="wide"
      onClose={onClose}
      title={`Who is in ${group.name}`}
      description={`Whatever the group is given, each ${noun} in it has from their next request.`}
    >
      <div className="flex flex-col gap-4">
        <form
          className="flex items-end gap-2"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!adding) return;
            setBusy(true);
            setProblem(undefined);
            try {
              await api.put(`${path}/members/${adding}`);
              setAdding(undefined);
              detail.reload();
            } catch (error) {
              setProblem(failureText(error));
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="min-w-0 flex-1">
            <ComboboxField
              label={`Add ${noun === "end user" ? "an" : "a"} ${noun}`}
              options={options}
              value={adding}
              placeholder="Search by email"
              empty={
                everyone.loading
                  ? "Loading…"
                  : `Every ${noun} of this tenant is already in the group.`
              }
              onChange={setAdding}
            />
          </div>
          <Button type="submit" variant="primary" disabled={busy || !adding}>
            Add
          </Button>
        </form>
        {problem ? <Notice tone="danger">{problem}</Notice> : null}
        {detail.error ? <Notice tone="danger">{detail.error.message}</Notice> : null}
        {members.length === 0 ? (
          <EmptyState title={detail.loading ? "Loading…" : "Nobody is in this group yet"} />
        ) : (
          <ul className="m-0 max-h-[40vh] list-none overflow-y-auto rounded-control border border-line p-0">
            {members.map((person) => (
              <li
                key={person.id}
                className="flex items-center justify-between gap-3 border-line border-b px-3 py-2 last:border-b-0"
              >
                <span className="min-w-0">
                  <span className="block truncate">{person.email}</span>
                  {person.name ? (
                    <span className="block truncate text-[12.5px] text-ink-muted">
                      {person.name}
                    </span>
                  ) : null}
                </span>
                <Button
                  size="small"
                  variant="danger"
                  aria-label={`Take ${person.email} out`}
                  onClick={() =>
                    api.delete(`${path}/members/${person.id}`).then(detail.reload, notify.error)
                  }
                >
                  Take out
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex justify-end">
          <Button onClick={onClose}>Done</Button>
        </div>
      </div>
    </Dialog>
  );
}

/** Groups of members: staff who are given access together. */
export function Groups({ base, framed }: { base: string; framed?: Framed }) {
  const groups = useLoad<{ items: { id: string; name: string; createdAt: string }[] }>(
    `${base}/groups`,
  );
  const [open, setOpen] = useState<{ id: string; name: string }>();
  const [creating, setCreating] = useState(false);
  return (
    <>
      <CollectionView<{ id: string; name: string; createdAt: string }>
        title={framed?.title ?? "Groups"}
        description="A group is a set of members that can be given access together. Give a group a role under Access grants."
        actions={
          <Button variant="primary" onClick={() => setCreating(true)}>
            Create group
          </Button>
        }
        toolbar={toolbarOf(framed)}
        label="Groups"
        rows={groups.data?.items}
        error={groups.error?.message}
        rowKey={(row) => row.id}
        columns={[
          { header: "Name", cell: (row) => <span className="font-medium">{row.name}</span> },
          { header: "Created", priority: 2, cell: (row) => when(row.createdAt) },
          {
            header: "",
            align: "end",
            cell: (row) => (
              <span className="inline-flex gap-1">
                <Button size="small" onClick={() => setOpen(row)}>
                  Members
                </Button>
                <RemoveButton
                  label="Delete"
                  confirm={`The group ${row.name} is deleted, and access given to it is removed.`}
                  run={() => api.delete(`${base}/groups/${row.id}`)}
                  onDone={groups.reload}
                />
              </span>
            ),
          },
        ]}
        empty={{
          title: "No groups yet",
          text: "Create a group when several people need the same access.",
        }}
      />
      <CreateDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={() => {
          setCreating(false);
          groups.reload();
        }}
        config={{
          action: "Create group",
          fields: [{ name: "name", label: "Name", placeholder: "Finance team" }],
          submit: (values) => api.post(`${base}/groups`, values),
        }}
      />
      {open ? (
        <MembersDialog
          key={open.id}
          group={open}
          path={`${base}/groups/${open.id}`}
          candidates={`${base}/members?limit=200`}
          noun="member"
          onClose={() => setOpen(undefined)}
        />
      ) : null}
    </>
  );
}

interface EndUserGroup {
  id: string;
  name: string;
  description: string;
  memberCount: number;
}

/** Groups of end users: the people of the tenant's apps, sorted by what they may see and do. */
export function EndUserGroups({ base }: { base: string }) {
  const groups = useLoad<{ items: EndUserGroup[] }>(`${base}/end-user-groups`);
  const [open, setOpen] = useState<EndUserGroup>();
  const [creating, setCreating] = useState(false);
  return (
    <>
      <CollectionView<EndUserGroup>
        title="End-user groups"
        description="Sort the people who use your apps into groups, such as one per customer or per job. Give a group a role under Access grants, and rule a table's rows by it under Tables."
        actions={
          <Button variant="primary" onClick={() => setCreating(true)}>
            Create group
          </Button>
        }
        label="End-user groups"
        rows={groups.data?.items}
        error={groups.error?.message}
        rowKey={(row) => row.id}
        columns={[
          { header: "Name", cell: (row) => <Mono>{row.name}</Mono> },
          {
            header: "What it is for",
            priority: 2,
            cell: (row) => <span className="text-ink-muted">{row.description}</span>,
          },
          {
            header: "People",
            align: "end",
            cell: (row) => <span className="font-mono text-telemetry">{row.memberCount}</span>,
          },
          {
            header: "",
            align: "end",
            cell: (row) => (
              <span className="inline-flex gap-1">
                <Button size="small" onClick={() => setOpen(row)}>
                  People
                </Button>
                <RemoveButton
                  label="Delete"
                  confirm={`The group ${row.name} is deleted. Its people lose what it was given, and rows ruled by it are shown to nobody in it.`}
                  run={() => api.delete(`${base}/end-user-groups/${row.id}`)}
                  onDone={groups.reload}
                />
              </span>
            ),
          },
        ]}
        empty={{
          title: "No groups of end users yet",
          text: "Create one when some of your apps' users should see or do what others should not.",
        }}
      />
      <CreateDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={() => {
          setCreating(false);
          groups.reload();
        }}
        config={{
          action: "Create group",
          description: "The name is what a table's rules refer to, so it cannot be changed later.",
          fields: [
            {
              name: "name",
              label: "Name",
              placeholder: "Front desk",
              hint: "Any name on one line, such as Front desk. A table's rules match it exactly.",
            },
            { name: "description", label: "What it is for", required: false },
          ],
          submit: (values) => api.post(`${base}/end-user-groups`, values),
        }}
      />
      {open ? (
        <MembersDialog
          key={open.id}
          group={open}
          path={`${base}/end-user-groups/${open.id}`}
          candidates={`${base}/end-users?limit=200`}
          noun="end user"
          onClose={() => {
            setOpen(undefined);
            // The count on the list is of the people just added or taken out.
            groups.reload();
          }}
        />
      ) : null}
    </>
  );
}

/** A person's attributes as rows of a name and a value, saved together. */
export function AttributesDialog({
  base,
  user,
  onClose,
  onSaved,
}: {
  base: string;
  user: { id: string; email: string; attributes: Record<string, string> };
  onClose: () => void;
  onSaved: () => void;
}) {
  const [rows, setRows] = useState<[string, string][]>(() => {
    const given = Object.entries(user.attributes);
    return given.length > 0 ? given : [["", ""]];
  });
  const [problem, setProblem] = useState<string>();
  const [busy, setBusy] = useState(false);
  const change = (index: number, at: 0 | 1, text: string) =>
    setRows((before) =>
      before.map((row, each) =>
        each === index ? ((at === 0 ? [text, row[1]] : [row[0], text]) as [string, string]) : row,
      ),
    );

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Attributes of ${user.email}`}
      description="Facts about this person that a table's rules can match, such as which customer they belong to."
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setProblem(undefined);
          try {
            await api.patch(`${base}/end-users/${user.id}`, {
              attributes: Object.fromEntries(rows.filter(([name]) => name.trim() !== "")),
            });
            onSaved();
          } catch (error) {
            setProblem(failureText(error));
          } finally {
            setBusy(false);
          }
        }}
      >
        {rows.map(([name, value], index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: a row has no identity but its place while its name is being typed
          <div key={index} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
            <TextField
              name={`name-${index}`}
              label="Name"
              value={name}
              required={false}
              placeholder="customer_id"
              onChange={(text) => change(index, 0, text)}
            />
            <TextField
              name={`value-${index}`}
              label="Value"
              value={value}
              required={false}
              onChange={(text) => change(index, 1, text)}
            />
            <Button
              variant="quiet"
              aria-label={`Remove ${name || "this attribute"}`}
              onClick={() => setRows((before) => before.filter((_, each) => each !== index))}
            >
              Remove
            </Button>
          </div>
        ))}
        <div>
          <Button size="small" onClick={() => setRows((before) => [...before, ["", ""]])}>
            Add an attribute
          </Button>
        </div>
        <p className="m-0 text-[13px] text-ink-muted">
          Names are lowercase letters, digits and underscores.
        </p>
        {problem ? <Notice tone="danger">{problem}</Notice> : null}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={busy}>
            Save
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
