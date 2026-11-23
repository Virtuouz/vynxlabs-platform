import { Button, Closing, ComboboxField, Dialog, EmptyState, Notice, TextField } from "@volvel/ui";
import { useEffect, useState } from "react";
import { api, useLoad } from "../api.ts";
import { ask, failureText, notify } from "../ask.tsx";
import { CollectionView } from "../kit/CollectionView.tsx";
import { ErrorState } from "../kit/LoadState.tsx";
import { usePagedList } from "../kit/paged.tsx";
import { Code, Mono, Tag } from "../kit/status.tsx";
import { Time } from "../kit/Time.tsx";
import { CreateDialog, RemoveButton } from "../ListScreen.tsx";
import { useUrlParam } from "../router.tsx";
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
  open,
  onClose,
}: {
  group: { id: string; name: string };
  /** The group's own route: `GET` gives its members, and `/members/:id` adds and removes. */
  path: string;
  /** A route listing everyone who could be added. */
  candidates: string;
  /** What the people are called: "member" or "end user". */
  noun: string;
  open: boolean;
  onClose: () => void;
}) {
  const detail = useLoad<{ members: Person[] }>(path);
  const [typed, setTyped] = useState("");
  // The server searches the people who could be added, so no one past the first page is out of reach.
  const everyone = usePagedList<Person>(candidates, { search: typed });
  const [adding, setAdding] = useState<string>();
  const [problem, setProblem] = useState<string>();
  const [busy, setBusy] = useState(false);
  const members = detail.data?.members ?? [];
  const inGroup = new Set(members.map((person) => person.id));
  const options = (everyone.items ?? [])
    .filter((person) => !inGroup.has(person.id))
    .map((person) => ({
      value: person.id,
      label: person.email,
      ...(person.name ? { hint: person.name } : {}),
    }));
  // A page of people who are all in the group already is not the end of the list.
  const { hasMore, loadMore, loading: finding, loadingMore } = everyone;
  const nobodyYet = options.length === 0 && !finding && !loadingMore && !everyone.moreError;
  useEffect(() => {
    if (nobodyYet && hasMore) void loadMore();
  }, [nobodyYet, hasMore, loadMore]);

  return (
    <Dialog
      open={open}
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
              notify.success("Added to the group.");
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
              hint={hasMore && options.length > 0 && !typed ? "Type to find others." : undefined}
              empty={
                finding || loadingMore || hasMore
                  ? "Loading…"
                  : typed
                    ? `No ${noun} matches that, or the ones that do are in the group already.`
                    : `Every ${noun} of this tenant is already in the group.`
              }
              onChange={setAdding}
              onSearch={setTyped}
            />
          </div>
          <Button type="submit" variant="primary" loading={busy} disabled={!adding}>
            Add
          </Button>
        </form>
        {problem ? <Notice tone="danger">{problem}</Notice> : null}
        {detail.error ? <ErrorState error={detail.error} onRetry={detail.reload} /> : null}
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
                    <span className="block truncate text-meta text-ink-muted">{person.name}</span>
                  ) : null}
                </span>
                <Button
                  size="small"
                  variant="danger"
                  aria-label={`Take ${person.email} out`}
                  onClick={async () => {
                    const sure = await ask.confirm({
                      title: `Take ${person.email} out of ${group.name}?`,
                      text: `They lose whatever ${group.name} gives, from their next request. Anything given to them directly, or through other groups, stays.`,
                      action: "Take out",
                      danger: true,
                    });
                    if (!sure) return;
                    api.delete(`${path}/members/${person.id}`).then(() => {
                      notify.success(`${person.email} is out of the group.`);
                      detail.reload();
                    }, notify.error);
                  }}
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

/** Asks which sign-in values fill a group, and saves them through the release. */
async function fillFromSignIn(
  route: string,
  row: { name: string; signInValues?: string[] },
  reload: () => void,
) {
  const typed = await ask.prompt({
    title: `Filled by sign-in: ${row.name}`,
    text: "Someone whose sign-in says one of these values is put in this group when they sign in. One value per line, as the identity provider names it. Leave it empty to fill the group by hand only.",
    label: "Values",
    initial: (row.signInValues ?? []).join("\n"),
    action: "Save",
    required: false,
    multiline: true,
  });
  if (typed === null) return;
  const values = [
    ...new Set(
      typed
        .split("\n")
        .map((one) => one.trim())
        .filter(Boolean),
    ),
  ];
  if (values.join("\n") === [...(row.signInValues ?? [])].sort().join("\n")) return;
  try {
    await api.patch(route, { signInValues: values });
    reload();
  } catch (error) {
    notify.error(error);
  }
}

/** What a group is filled by at sign-in, said under its name. */
function FilledBySignIn({ values }: { values: string[] | undefined }) {
  if (!values || values.length === 0) return null;
  return <span className="text-meta text-ink-muted">Filled by sign-in: {values.join(", ")}</span>;
}

/** Asks what a group is for and saves it. Both kinds of group say it the same way. */
async function describeGroup(
  route: string,
  row: { name: string; description: string },
  reload: () => void,
) {
  const next = await ask.prompt({
    title: `What ${row.name} is for`,
    label: "Description",
    hint: "In plain words, 500 characters at most. Leave it empty to say nothing.",
    initial: row.description,
    action: "Save",
    required: false,
    multiline: true,
    maxLength: 500,
  });
  if (next === null || next.trim() === row.description) return;
  try {
    await api.patch(route, { description: next.trim() });
    reload();
  } catch (error) {
    notify.error(error);
  }
}

interface MemberGroup {
  id: string;
  /** What code and a repository name it by. It never changes. */
  key: string;
  name: string;
  description: string;
  managedBy: string;
  /** What a sign-in says that puts someone in the group. */
  signInValues?: string[];
  createdAt: string;
}

/** Groups of members: staff who are given access together. */
export function Groups({ base, framed }: { base: string; framed?: Framed }) {
  const groups = useLoad<{ items: MemberGroup[] }>(`${base}/groups`);
  // The open group is in the address, so a link reaches it and Back closes it.
  const [openId, setOpenId] = useUrlParam("group", undefined, { push: true });
  const open = groups.data?.items.find((row) => row.id === openId);
  const [creating, setCreating] = useState(false);
  return (
    <>
      <CollectionView<MemberGroup>
        title={framed?.title ?? "Groups"}
        helpKey="groups"
        description="A group is a set of members that can be given access together. Give a group a role under Access."
        actions={
          <Button variant="primary" onClick={() => setCreating(true)}>
            Create group
          </Button>
        }
        toolbar={toolbarOf(framed)}
        needs={{ base: base, permission: "group:write", what: "this tenant's groups" }}
        label="Groups"
        rows={groups.data?.items}
        error={groups.error}
        onRetry={groups.reload}
        rowKey={(row) => row.id}
        columns={[
          {
            header: "Name",
            cell: (row) => (
              <span className="flex flex-col">
                <span className="font-medium">{row.name}</span>
                {row.description ? (
                  <span className="text-meta text-ink-muted">{row.description}</span>
                ) : null}
                <FilledBySignIn values={row.signInValues} />
              </span>
            ),
          },
          {
            header: "Key",
            priority: 2,
            cell: (row) => (
              <span className="inline-flex flex-wrap items-center gap-2">
                <Code>{row.key}</Code>
                {row.managedBy === "provider" ? <Tag tone="neutral">Identity provider</Tag> : null}
              </span>
            ),
          },
          {
            header: "Created",
            priority: 2,
            cell: (row) => <Time value={row.createdAt} mode="ago" />,
          },
          {
            header: "",
            align: "end",
            cell: (row) => (
              <span className="inline-flex flex-wrap justify-end gap-1">
                <Button size="small" onClick={() => setOpenId(row.id)}>
                  Members
                </Button>
                <Button
                  size="small"
                  onClick={async () => {
                    const name = await ask.prompt({
                      title: `Rename ${row.name}`,
                      text: `Its key, ${row.key}, stays: access given to it, and code that names it by key, is not touched.`,
                      label: "Name",
                      initial: row.name,
                      action: "Rename",
                    });
                    if (!name || name === row.name) return;
                    try {
                      await api.patch(`${base}/groups/${row.id}`, { name });
                      groups.reload();
                    } catch (error) {
                      notify.error(error);
                    }
                  }}
                  disabled={row.managedBy === "provider"}
                >
                  Rename
                </Button>
                <Button
                  size="small"
                  onClick={() => describeGroup(`${base}/groups/${row.id}`, row, groups.reload)}
                  disabled={row.managedBy === "provider"}
                >
                  Describe
                </Button>
                <Button
                  size="small"
                  onClick={() => fillFromSignIn(`${base}/groups/${row.id}`, row, groups.reload)}
                  disabled={row.managedBy === "provider"}
                  {...(row.managedBy === "provider"
                    ? { title: "An identity provider made this group. Change it there." }
                    : {})}
                >
                  Sign-in values
                </Button>
                <RemoveButton
                  label="Delete"
                  disabled={
                    row.managedBy === "provider"
                      ? "An identity provider made this group. Remove it there."
                      : undefined
                  }
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
          fields: [
            { name: "name", label: "Name", placeholder: "Finance team" },
            { name: "description", label: "What it is for", required: false },
          ],
          submit: ({ name, description }) =>
            api.post(`${base}/groups`, { name, ...(description ? { description } : {}) }),
        }}
      />
      <Closing subject={open}>
        {(open, shown) => (
          <MembersDialog
            open={shown}
            key={open.id}
            group={open}
            path={`${base}/groups/${open.id}`}
            candidates={`${base}/members`}
            noun="member"
            onClose={() => setOpenId(undefined)}
          />
        )}
      </Closing>
    </>
  );
}

interface EndUserGroup {
  id: string;
  /** What code and a table's rules name it by. It never changes. */
  key?: string;
  name: string;
  description: string;
  memberCount: number;
  managedBy?: string;
  signInValues?: string[];
}

/** Groups of end users: the people of the tenant's apps, sorted by what they may see and do. */
export function EndUserGroups({ base, framed }: { base: string; framed?: Framed }) {
  const groups = useLoad<{ items: EndUserGroup[] }>(`${base}/end-user-groups`);
  const [openId, setOpenId] = useUrlParam("group", undefined, { push: true });
  const open = groups.data?.items.find((row) => row.id === openId);
  const [creating, setCreating] = useState(false);
  return (
    <>
      <CollectionView<EndUserGroup>
        title={framed?.title ?? "End-user groups"}
        helpKey="end-user-groups"
        toolbar={toolbarOf(framed)}
        description="Sort the people who use your apps into groups, such as one per customer or per job. Give a group a role under Access, and rule a table's rows by it under Tables."
        actions={
          <Button variant="primary" onClick={() => setCreating(true)}>
            Create group
          </Button>
        }
        needs={{ base: base, permission: "end_user_group:write", what: "the end-user groups" }}
        label="End-user groups"
        rows={groups.data?.items}
        error={groups.error}
        onRetry={groups.reload}
        rowKey={(row) => row.id}
        columns={[
          { header: "Name", cell: (row) => <Mono>{row.name}</Mono> },
          {
            header: "Key",
            priority: 2,
            cell: (row) => (
              <span className="inline-flex flex-wrap items-center gap-2">
                {row.key ? <Code>{row.key}</Code> : null}
                {row.managedBy === "provider" ? <Tag tone="neutral">Identity provider</Tag> : null}
              </span>
            ),
          },
          {
            header: "What it is for",
            priority: 2,
            cell: (row) => (
              <span className="flex flex-col text-ink-muted">
                {row.description}
                <FilledBySignIn values={row.signInValues} />
              </span>
            ),
          },
          {
            header: "People",
            align: "end",
            cell: (row) => <span className="font-mono text-code">{row.memberCount}</span>,
          },
          {
            header: "",
            align: "end",
            cell: (row) => (
              <span className="inline-flex flex-wrap justify-end gap-1">
                <Button size="small" onClick={() => setOpenId(row.id)}>
                  People
                </Button>
                <Button
                  size="small"
                  onClick={async () => {
                    const name = await ask.prompt({
                      title: `Rename ${row.name}`,
                      text: "Access given to the group, and rules that name it by its key, are not touched. A rule that holds the old name stops matching its people: have rows hold the key.",
                      label: "Name",
                      initial: row.name,
                      action: "Rename",
                    });
                    if (!name || name.trim() === row.name) return;
                    try {
                      await api.patch(`${base}/end-user-groups/${row.id}`, { name: name.trim() });
                      groups.reload();
                    } catch (error) {
                      notify.error(error);
                    }
                  }}
                  disabled={row.managedBy === "provider"}
                >
                  Rename
                </Button>
                <Button
                  size="small"
                  onClick={() =>
                    describeGroup(`${base}/end-user-groups/${row.id}`, row, groups.reload)
                  }
                >
                  Describe
                </Button>
                <Button
                  size="small"
                  onClick={() =>
                    fillFromSignIn(`${base}/end-user-groups/${row.id}`, row, groups.reload)
                  }
                  disabled={row.managedBy === "provider"}
                  {...(row.managedBy === "provider"
                    ? { title: "An identity provider made this group. Change it there." }
                    : {})}
                >
                  Sign-in values
                </Button>
                <RemoveButton
                  label="Delete"
                  disabled={
                    row.managedBy === "provider"
                      ? "An identity provider made this group. Remove it there."
                      : undefined
                  }
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
          description:
            "It gets a key from its name. The key is what code and a table's rules refer to, and never changes. The name can be changed later.",
          fields: [
            {
              name: "name",
              label: "Name",
              placeholder: "Front desk",
              hint: "Any name on one line, such as Front desk.",
            },
            { name: "description", label: "What it is for", required: false },
          ],
          submit: (values) => api.post(`${base}/end-user-groups`, values),
        }}
      />
      <Closing subject={open}>
        {(open, shown) => (
          <MembersDialog
            open={shown}
            key={open.id}
            group={open}
            path={`${base}/end-user-groups/${open.id}`}
            candidates={`${base}/end-users`}
            noun="end user"
            onClose={() => {
              setOpenId(undefined);
              // The count on the list is of the people just added or taken out.
              groups.reload();
            }}
          />
        )}
      </Closing>
    </>
  );
}

/** A person's attributes as rows of a name and a value, saved together. */
export function AttributesDialog({
  base,
  user,
  open,
  onClose,
  onSaved,
}: {
  base: string;
  user: { id: string; email: string; attributes: Record<string, string> };
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [rows, setRows] = useState<[string, string][]>(() => {
    const given = Object.entries(user.attributes);
    return given.length > 0 ? given : [["", ""]];
  });
  const [problem, setProblem] = useState<string>();
  const [busy, setBusy] = useState(false);
  // A name is read without the spaces around it, and a name is given once.
  const repeats = new Set<number>();
  const seen = new Map<string, number>();
  rows.forEach(([name], index) => {
    const key = name.trim();
    if (key === "") return;
    if (seen.has(key)) repeats.add(index);
    else seen.set(key, index);
  });
  // The server's rule, said at the field: lowercase letters, digits and underscores, starting with a letter.
  const unusable = (name: string) =>
    name.trim() !== "" && !/^[a-z][a-z0-9_]{0,62}$/.test(name.trim());
  const badNames = rows.filter(([name]) => unusable(name)).length;
  const change = (index: number, at: 0 | 1, text: string) =>
    setRows((before) =>
      before.map((row, each) =>
        each === index ? ((at === 0 ? [text, row[1]] : [row[0], text]) as [string, string]) : row,
      ),
    );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Attributes of ${user.email}`}
      description="Facts about this person that a table's rules can match, such as which customer they belong to."
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={async (event) => {
          event.preventDefault();
          if (repeats.size > 0 || badNames > 0) return;
          setBusy(true);
          setProblem(undefined);
          try {
            await api.patch(`${base}/end-users/${user.id}`, {
              attributes: Object.fromEntries(
                rows
                  .filter(([name]) => name.trim() !== "")
                  .map(([name, value]) => [name.trim(), value]),
              ),
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
              {...(repeats.has(index)
                ? { error: `${name.trim()} is given twice. Each name takes one value.` }
                : unusable(name)
                  ? {
                      error: `${name.trim()} cannot be a name. Use lowercase letters, digits and underscores, starting with a letter, up to 63 characters.`,
                    }
                  : {})}
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
        <p className="m-0 text-body-sm text-ink-muted">
          Names are lowercase letters, digits and underscores.
        </p>
        {problem ? <Notice tone="danger">{problem}</Notice> : null}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={busy}>
            Save
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
