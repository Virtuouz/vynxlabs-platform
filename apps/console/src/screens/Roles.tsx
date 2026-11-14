import { Badge, Button, Dialog, Notice, TextField } from "@vynxlabs/ui";
import { useMemo, useState } from "react";
import { type ApiError, api, useLoad } from "../api.ts";
import { CollectionView } from "../kit/CollectionView.tsx";
import { FilterChips, Inspector, SectionLabel } from "../kit/layout.tsx";
import { Mono, Tag } from "../kit/status.tsx";
import { RemoveButton } from "../ListScreen.tsx";
import { type Framed, toolbarOf } from "./Members.tsx";

export interface Role {
  id: string;
  name: string;
  description: string;
  permissions: string[];
  builtin: boolean;
  workspaceId: string | null;
  managedByResource: boolean;
}

interface PermissionKind {
  kind: string;
  label: string;
  group: string;
  scope: "instance" | "tenant" | "workspace";
  appFacing: boolean;
  verbs: { verb: "read" | "write"; permission: string; description: string }[];
}

type Verb = "read" | "write";

/** Whether a set of permissions allows `kind:verb`, counting `*` on either side. */
export function allows(held: readonly string[], kind: string, verb: Verb): boolean {
  return held.some((one) => {
    const [k, v] = one.split(":");
    return (k === "*" || k === kind) && (v === "*" || v === verb);
  });
}

/**
 * Turns one box on or off. A wildcard that covers the box is first written out
 * as the permissions it stands for, so that taking one away leaves the rest.
 */
export function toggle(
  held: readonly string[],
  kinds: readonly PermissionKind[],
  kind: string,
  verb: Verb,
  on: boolean,
): string[] {
  const target = `${kind}:${verb}`;
  if (on) return allows(held, kind, verb) ? [...held] : [...held, target];
  const next = new Set<string>();
  for (const one of held) {
    const [k, v] = one.split(":") as [string, string];
    const covers = (k === "*" || k === kind) && (v === "*" || v === verb);
    if (!covers) {
      next.add(one);
      continue;
    }
    // Write the wildcard out, then leave the one box off.
    for (const entry of kinds) {
      if (k !== "*" && entry.kind !== k) continue;
      for (const { verb: each, permission } of entry.verbs) {
        if (v !== "*" && each !== v) continue;
        if (permission !== target) next.add(permission);
      }
    }
  }
  return [...next];
}

/** A grid of what a role allows: one row per kind of thing, one box per verb. */
export function PermissionPicker({
  kinds,
  value,
  onChange,
  disabled,
}: {
  kinds: readonly PermissionKind[];
  value: readonly string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const known = useMemo(
    () => new Set(kinds.flatMap((entry) => entry.verbs.map((verb) => verb.permission))),
    [kinds],
  );
  const kindNames = useMemo(() => new Set(kinds.map((entry) => entry.kind)), [kinds]);
  // Permissions the list does not know: kept, shown, and removable, never dropped silently.
  const unknown = value.filter((one) => {
    const [kind, verb] = one.split(":");
    if (known.has(one)) return false;
    if (kind === "*") return false;
    return !(verb === "*" && kindNames.has(kind as string));
  });
  const everything = value.includes("*:*");
  const needle = query.trim().toLowerCase();
  const shown = kinds.filter(
    (entry) =>
      needle === "" ||
      entry.label.toLowerCase().includes(needle) ||
      entry.kind.includes(needle) ||
      entry.group.toLowerCase().includes(needle),
  );
  const groups = [...new Set(shown.map((entry) => entry.group))];

  const all = (verb: Verb, on: boolean) => {
    if (on) {
      onChange([...value.filter((one) => !one.endsWith(`:${verb}`)), `*:${verb}`]);
      return;
    }
    onChange(
      value.filter((one) => {
        const [, v] = one.split(":");
        return v !== verb && v !== "*";
      }),
    );
  };
  const box = "size-4 accent-[var(--vx-action)] disabled:opacity-50";

  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0" disabled={disabled}>
      <legend className="p-0 text-[13px] font-medium text-ink">Permissions</legend>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <input
          type="search"
          aria-label="Find a permission"
          placeholder="Find a permission"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          className="h-8 min-w-40 flex-1 rounded-control border border-line bg-surface px-2.5"
        />
        <label className="inline-flex items-center gap-1.5 text-[13px]">
          <input
            type="checkbox"
            className={box}
            checked={everything || value.includes("*:read")}
            onChange={(event) => all("read", event.currentTarget.checked)}
          />
          Read everything
        </label>
        <label className="inline-flex items-center gap-1.5 text-[13px]">
          <input
            type="checkbox"
            className={box}
            checked={everything || value.includes("*:write")}
            onChange={(event) => all("write", event.currentTarget.checked)}
          />
          Change everything
        </label>
      </div>
      <div className="max-h-[46vh] overflow-y-auto rounded-control border border-line">
        <table className="w-full border-collapse text-left">
          <thead className="sticky top-0 bg-sunken text-[12px] text-ink-muted">
            <tr>
              <th scope="col" className="px-3 py-1.5 font-medium">
                What
              </th>
              <th scope="col" className="w-16 px-2 py-1.5 text-center font-medium">
                Read
              </th>
              <th scope="col" className="w-16 px-2 py-1.5 text-center font-medium">
                Change
              </th>
            </tr>
          </thead>
          {groups.map((group) => (
            <tbody key={group}>
              <tr>
                <th
                  colSpan={3}
                  scope="colgroup"
                  className="border-t border-line bg-canvas px-3 py-1 text-[12px] font-semibold tracking-wide text-ink-muted uppercase"
                >
                  {group}
                </th>
              </tr>
              {shown
                .filter((entry) => entry.group === group)
                .map((entry) => (
                  <tr key={entry.kind} className="border-t border-line">
                    <th scope="row" className="px-3 py-1.5 font-normal">
                      <span className="flex flex-wrap items-center gap-2">
                        {entry.label}
                        <code className="font-mono text-[12px] text-ink-muted">{entry.kind}</code>
                        {entry.appFacing ? <Badge>End users can hold it</Badge> : null}
                      </span>
                    </th>
                    {(["read", "write"] as const).map((verb) => {
                      const found = entry.verbs.find((one) => one.verb === verb);
                      return (
                        <td key={verb} className="px-2 py-1.5 text-center">
                          {found ? (
                            <input
                              type="checkbox"
                              className={box}
                              aria-label={found.permission}
                              title={found.description}
                              checked={allows(value, entry.kind, verb)}
                              onChange={(event) =>
                                onChange(
                                  toggle(
                                    value,
                                    kinds,
                                    entry.kind,
                                    verb,
                                    event.currentTarget.checked,
                                  ),
                                )
                              }
                            />
                          ) : (
                            <span className="text-ink-muted" title="Nothing checks this">
                              –
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
            </tbody>
          ))}
        </table>
        {shown.length === 0 ? (
          <p className="m-0 px-3 py-2 text-ink-muted">Nothing matches.</p>
        ) : null}
      </div>
      {unknown.length > 0 ? (
        <Notice tone="attention">
          <span className="flex flex-wrap items-center gap-2">
            This role also lists permissions that nothing checks:
            {unknown.map((one) => (
              <span
                key={one}
                className="inline-flex items-center gap-1 rounded-[4px] bg-surface px-1.5 font-mono text-[13px]"
              >
                {one}
                <button
                  type="button"
                  aria-label={`Remove ${one}`}
                  className="text-ink-muted hover:text-ink"
                  onClick={() => onChange(value.filter((held) => held !== one))}
                >
                  ×
                </button>
              </span>
            ))}
          </span>
        </Notice>
      ) : null}
    </fieldset>
  );
}

/** A short account of a role's permissions for a table cell. */
function Summary({ role, kinds }: { role: Role; kinds: readonly PermissionKind[] }) {
  if (role.permissions.includes("*:*")) return <span>Everything</span>;
  const read = kinds.filter((entry) => allows(role.permissions, entry.kind, "read")).length;
  const write = kinds.filter(
    (entry) =>
      entry.verbs.some((verb) => verb.verb === "write") &&
      allows(role.permissions, entry.kind, "write"),
  ).length;
  return (
    <span className="text-ink-muted" title={role.permissions.join("  ")}>
      Reads {read === kinds.length ? "everything" : `${read} of ${kinds.length}`}
      {write > 0 ? `, changes ${write}` : ""}
    </span>
  );
}

function RoleDialog({
  base,
  kinds,
  role,
  onClose,
  onSaved,
}: {
  base: string;
  kinds: readonly PermissionKind[];
  /** The role to change, or nothing to create one. */
  role: Role | undefined;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [permissions, setPermissions] = useState<string[]>(role?.permissions ?? []);
  const [error, setError] = useState<ApiError>();
  const [busy, setBusy] = useState(false);
  const readOnly = role !== undefined && (role.builtin || role.managedByResource);
  const fieldError = (field: string) =>
    error?.fields.find((one) => one.path.startsWith(`/body/${field}`))?.message;

  return (
    <Dialog
      open
      size="wide"
      onClose={onClose}
      title={role ? (readOnly ? role.name : `Change ${role.name}`) : "Create role"}
      {...(readOnly
        ? {
            description: role?.builtin
              ? "A built-in role cannot be changed. Create a role of your own to allow something else."
              : "This role comes from the tenant's repository and is changed there.",
          }
        : {})}
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError(undefined);
          try {
            if (role) await api.patch(`${base}/roles/${role.id}`, { description, permissions });
            else await api.post(`${base}/roles`, { name, description, permissions });
            onSaved();
          } catch (caught) {
            setError(caught as ApiError);
          } finally {
            setBusy(false);
          }
        }}
      >
        {role ? null : (
          <TextField
            name="name"
            label="Name"
            value={name}
            placeholder="secret_keeper"
            hint="Lowercase letters, digits and underscores."
            error={fieldError("name")}
            onChange={setName}
          />
        )}
        <TextField
          name="description"
          label="Description"
          value={description}
          required={false}
          disabled={readOnly}
          error={fieldError("description")}
          onChange={setDescription}
        />
        <PermissionPicker
          kinds={kinds}
          value={permissions}
          onChange={setPermissions}
          disabled={readOnly}
        />
        {error ? <Notice tone="danger">{error.message}</Notice> : null}
        <div className="mt-1 flex justify-end gap-2">
          <Button onClick={onClose}>{readOnly ? "Close" : "Cancel"}</Button>
          {readOnly ? null : (
            <Button type="submit" variant="primary" disabled={busy || permissions.length === 0}>
              {role ? "Save" : "Create role"}
            </Button>
          )}
        </div>
      </form>
    </Dialog>
  );
}

type Show = "all" | "own" | "builtin";

/** What a role allows, in a few lines a person reads at a glance. */
export function inShort(role: Role, kinds: readonly PermissionKind[]): string[] {
  if (role.permissions.includes("*:*")) return ["Everything, everywhere it is given."];
  const groups = [...new Set(kinds.map((entry) => entry.group))];
  const lines: string[] = [];
  for (const group of groups) {
    const inGroup = kinds.filter((entry) => entry.group === group);
    const changes = inGroup.filter(
      (entry) =>
        entry.verbs.some((verb) => verb.verb === "write") &&
        allows(role.permissions, entry.kind, "write"),
    );
    const reads = inGroup.filter(
      (entry) => allows(role.permissions, entry.kind, "read") && !changes.includes(entry),
    );
    if (changes.length === 0 && reads.length === 0) continue;
    const names = (list: PermissionKind[]) =>
      list.length === inGroup.length ? "all of it" : list.map((entry) => entry.label).join(", ");
    const parts = [
      changes.length > 0 ? `changes ${names(changes)}` : "",
      reads.length > 0 ? `reads ${names(reads)}` : "",
    ].filter(Boolean);
    lines.push(`${group}: ${parts.join("; ")}.`);
  }
  return lines.length > 0 ? lines : ["Nothing yet."];
}

export function Roles({ base, framed }: { base: string; framed?: Framed }) {
  const roles = useLoad<{ items: Role[] }>(`${base}/roles`);
  const catalog = useLoad<{ items: PermissionKind[] }>("/permissions");
  const [open, setOpen] = useState<Role | "new">();
  const [selected, setSelected] = useState<string>();
  const [show, setShow] = useState<Show>("all");
  const kinds = catalog.data?.items ?? [];
  const failure = roles.error ?? catalog.error;
  const all = roles.data?.items;
  const rows =
    all && catalog.data
      ? all.filter((role) => show === "all" || (show === "own" ? !role.builtin : role.builtin))
      : undefined;
  const chosen = all?.find((role) => role.id === selected);
  const fixed = chosen ? chosen.builtin || chosen.managedByResource : false;

  return (
    <>
      <CollectionView<Role>
        title={framed?.title ?? "Roles"}
        description="A role is a named set of permissions. Give a role to a person, a group or a service account under Access grants."
        actions={
          <Button variant="primary" onClick={() => setOpen("new")}>
            Create role
          </Button>
        }
        toolbar={toolbarOf(
          framed,
          <FilterChips<Show>
            label="Show"
            value={show}
            onChange={setShow}
            options={[
              { value: "all", label: "All roles", count: all?.length ?? null },
              {
                value: "own",
                label: "Made here",
                count: all ? all.filter((role) => !role.builtin).length : null,
              },
              {
                value: "builtin",
                label: "Built in",
                count: all ? all.filter((role) => role.builtin).length : null,
              },
            ]}
          />,
        )}
        label="Roles"
        rows={rows}
        error={failure?.message}
        rowKey={(row) => row.id}
        selected={selected}
        onSelect={(row) => setSelected(row.id)}
        columns={[
          {
            header: "Role",
            cell: (row) => (
              <span className="flex flex-wrap items-center gap-2">
                <Mono>{row.name}</Mono>
                {row.builtin ? <Tag>Built in</Tag> : null}
                {row.managedByResource ? <Tag tone="repository">From repository</Tag> : null}
              </span>
            ),
          },
          {
            header: "What it is for",
            priority: 2,
            cell: (row) => <span className="text-ink-muted">{row.description}</span>,
          },
          {
            header: "Permissions",
            priority: 3,
            cell: (row) => <Summary role={row} kinds={kinds} />,
          },
        ]}
        empty={{ title: "No roles" }}
        inspector={
          <Inspector
            open={chosen !== undefined}
            label="Role"
            eyebrow={chosen?.builtin ? "Built-in role" : "Role"}
            title={chosen?.name}
            onClose={() => setSelected(undefined)}
            footer={
              chosen ? (
                <>
                  <Button size="small" onClick={() => setOpen(chosen)}>
                    {fixed ? "View" : "Change"}
                  </Button>
                  {fixed ? null : (
                    <RemoveButton
                      label="Delete"
                      confirm={`The role ${chosen.name} is deleted. Whoever held it loses what it allowed.`}
                      run={() => api.delete(`${base}/roles/${chosen.id}`)}
                      onDone={() => {
                        setSelected(undefined);
                        roles.reload();
                      }}
                    />
                  )}
                </>
              ) : null
            }
          >
            {chosen ? (
              <div className="flex flex-col gap-5">
                {chosen.description ? (
                  <p className="m-0 text-ink-muted">{chosen.description}</p>
                ) : null}
                <div className="flex flex-col gap-2">
                  <SectionLabel>In short</SectionLabel>
                  <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                    {inShort(chosen, kinds).map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </div>
                <div className="flex flex-col gap-2">
                  <SectionLabel>Permissions</SectionLabel>
                  <p className="m-0 flex flex-wrap gap-1.5">
                    {chosen.permissions.map((permission) => (
                      <Mono key={permission}>{permission}</Mono>
                    ))}
                  </p>
                </div>
              </div>
            ) : null}
          </Inspector>
        }
      />
      {open ? (
        <RoleDialog
          key={open === "new" ? "new" : open.id}
          base={base}
          kinds={kinds}
          role={open === "new" ? undefined : open}
          onClose={() => setOpen(undefined)}
          onSaved={() => {
            setOpen(undefined);
            roles.reload();
          }}
        />
      ) : null}
    </>
  );
}
