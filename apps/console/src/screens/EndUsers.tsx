import { Button, Closing, Dialog, Notice, SelectField, TextField } from "@volvel/ui";
import { useState } from "react";
import { type ApiError, api, useLoad } from "../api.ts";
import { ask, notify } from "../ask.tsx";
import { useNeeds } from "../kit/Can.tsx";
import { CollectionView } from "../kit/CollectionView.tsx";
import { Inspector, KeyValues, SectionLabel } from "../kit/layout.tsx";
import { StatePill, Tag } from "../kit/status.tsx";
import { Time } from "../kit/Time.tsx";
import { Truncate } from "../kit/Truncate.tsx";
import { CopyButton, CreateDialog, when } from "../ListScreen.tsx";
import { useUrlParam } from "../router.tsx";
import { AttributesDialog } from "./Groups.tsx";
import type { Framed } from "./Members.tsx";

interface EndUser {
  id: string;
  email: string;
  name: string;
  hasPassword: boolean;
  /** An identity provider has signed them in: they set no password, and wait for no invitation. */
  signsInWithProvider?: boolean;
  attributes: Record<string, string>;
  groups: string[];
  disabled: boolean;
  lastSignedInAt: string | null;
  createdAt: string;
}
interface MadeLink {
  url: string;
  expiresAt: string;
  emailed: boolean;
}
/** A link that was just made, and what it is for. It is shown once. */
interface ShownLink extends MadeLink {
  email: string;
  purpose: "invite" | "reset";
}

const PAGE = 50;

interface Address {
  id: string;
  hostname: string;
  enabled: boolean;
}
const THIS_INSTANCE = "This instance's own address";

/** Which of the tenant's addresses a link is built on. Asked only when there is a choice. */
function AddressDialog({
  asked,
  addresses,
  onClose,
  onChosen,
}: {
  asked: { email: string; purpose: "invite" | "reset" } | undefined;
  addresses: Address[];
  onClose: () => void;
  onChosen: (domainId: string | undefined) => void;
}) {
  const [chosen, setChosen] = useState("");
  return (
    <Dialog
      open={asked !== undefined}
      onClose={onClose}
      title={asked?.purpose === "reset" ? "Password reset link" : "Invitation link"}
      description={`Whoever opens it lands on the address you choose. For ${asked?.email ?? "them"}.`}
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          onChosen(chosen || undefined);
        }}
      >
        <SelectField
          name="domainId"
          label="On which address"
          options={[
            { value: "", label: THIS_INSTANCE },
            ...addresses.map((one) => ({ value: one.id, label: one.hostname })),
          ]}
          value={chosen}
          hint="The tenant's own hostnames that are enabled. The link works on the one you pick."
          onChange={setChosen}
        />
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary">
            Make link
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

const failed = (error: unknown) => {
  const failure = error as ApiError;
  return [failure.message, ...(failure.fields ?? []).map((field) => field.message)].join(" ");
};

function Status({ user }: { user: EndUser }) {
  if (user.disabled) return <StatePill state="disabled" />;
  // Invited until they have used the invitation, or a provider has signed them in.
  if (!user.hasPassword && !user.signsInWithProvider && !user.lastSignedInAt)
    return <StatePill state="invited" />;
  return <StatePill state="active" />;
}

/** The one time a sign-in link is shown: whoever holds it chooses the account's password. */
function LinkDialog({ link, onClose }: { link: ShownLink | undefined; onClose: () => void }) {
  return (
    <Dialog
      open={link !== undefined}
      onClose={onClose}
      title={link?.purpose === "reset" ? "Password reset link" : "Invitation link"}
      {...(link
        ? {
            description:
              link.purpose === "reset"
                ? `Whoever opens it sets a new password for ${link.email}.`
                : `Whoever opens it chooses the password for ${link.email}.`,
          }
        : {})}
    >
      {link ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 rounded-control border border-line bg-sunken p-3">
            <code className="font-mono text-code break-all select-all">{link.url}</code>
            <div>
              <CopyButton value={link.url} label="Copy link" />
            </div>
          </div>
          <p className="m-0">
            {link.emailed
              ? "It was also emailed to them."
              : "This instance sends no mail, so pass the link on yourself."}{" "}
            It works once, until {when(link.expiresAt)}. It is not shown again here: make a new one
            if it is lost.
          </p>
          <div className="flex justify-end">
            <Button variant="primary" onClick={onClose}>
              Done
            </Button>
          </div>
        </div>
      ) : null}
    </Dialog>
  );
}

export function EndUsers({ base, framed }: { base: string; framed?: Framed }) {
  const [search, setSearch] = useUrlParam("q", "");
  // The cursor of each page opened so far, so that Previous can go back.
  const [trail, setTrail] = useState<(string | null)[]>([null]);
  const [inviting, setInviting] = useState(false);
  const [link, setLink] = useState<ShownLink>();
  const [attributesOf, setAttributesOf] = useState<EndUser>();
  const [problem, setProblem] = useState<string>();
  const [selected, setSelected] = useUrlParam("user", undefined, { push: true });
  const [addressFor, setAddressFor] = useState<{
    user: EndUser;
    purpose: "invite" | "reset";
  }>();
  // Someone who may not read the domains has no choice to make: links are built as they always were.
  const domains = useLoad<{ items: Address[] }>(`${base}/domains`);
  const addresses = (domains.data?.items ?? []).filter((one) => one.enabled);

  const query = new URLSearchParams({ limit: String(PAGE) });
  const cursor = trail[trail.length - 1];
  if (cursor) query.set("cursor", cursor);
  if (search.trim()) query.set("search", search.trim());
  const page = useLoad<{ items: EndUser[]; nextCursor: string | null }>(
    `${base}/end-users?${query}`,
  );
  const rows = page.data?.items ?? [];

  const act = async (run: () => Promise<unknown>) => {
    setProblem(undefined);
    try {
      await run();
      page.reload();
    } catch (error) {
      setProblem(failed(error));
    }
  };
  const makeLinkOn = (user: EndUser, purpose: "invite" | "reset", domainId?: string) =>
    act(async () => {
      const made = await api.post<MadeLink>(`${base}/end-users/${user.id}/links`, {
        purpose,
        ...(domainId ? { domainId } : {}),
      });
      setLink({ ...made, email: user.email, purpose });
    });
  const makeLink = (user: EndUser, purpose: "invite" | "reset") =>
    addresses.length > 0 ? setAddressFor({ user, purpose }) : makeLinkOn(user, purpose);
  const actions = (user: EndUser) => [
    {
      label: "Rename",
      onSelect: async () => {
        const name = await ask.prompt({
          title: `Rename ${user.email}`,
          text: "The name is what people see beside their email. Their email, what they were given and their sign-in are not touched.",
          label: "Name",
          initial: user.name,
          action: "Rename",
          required: false,
        });
        if (name === null || name.trim() === user.name) return;
        return act(async () => {
          await api.patch(`${base}/end-users/${user.id}`, { name: name.trim() });
          notify.success(name.trim() ? `Now called ${name.trim()}.` : "Their name is cleared.");
        });
      },
    },
    {
      label: "Attributes",
      onSelect: () => setAttributesOf({ ...user, attributes: user.attributes ?? {} }),
    },
    // A disabled account cannot be sent a link: enable it first.
    ...(user.disabled
      ? []
      : user.hasPassword
        ? [{ label: "Password reset link", onSelect: () => makeLink(user, "reset") }]
        : // Someone a provider signs in has no password to set: a link would add one beside it.
          user.signsInWithProvider || user.lastSignedInAt
          ? []
          : [{ label: "New invitation link", onSelect: () => makeLink(user, "invite") }]),
    user.disabled
      ? {
          label: "Enable",
          onSelect: () =>
            act(async () => {
              await api.patch(`${base}/end-users/${user.id}`, { disabled: false });
              notify.success(`${user.email} can sign in again.`);
            }),
        }
      : {
          label: "Disable",
          onSelect: async () => {
            const sure = await ask.confirm({
              title: `Disable ${user.email}?`,
              text: "They are signed out of every app now and cannot sign in until you enable them again. What they were given is kept.",
              action: "Disable",
              danger: true,
            });
            if (!sure) return;
            return act(async () => {
              await api.patch(`${base}/end-users/${user.id}`, { disabled: true });
              notify.success(`${user.email} can no longer sign in.`);
            });
          },
        },
    {
      label: "Delete",
      onSelect: async () => {
        const sure = await ask.confirm({
          title: `Delete ${user.email}?`,
          text: "They can no longer sign in, and access given to them is removed. Their rows in tables are kept.",
          action: "Delete",
          danger: true,
        });
        if (!sure) return;
        return act(() => api.delete(`${base}/end-users/${user.id}`));
      },
    },
  ];

  const listed = rows.find((row) => row.id === selected);
  // A link to someone past the pages loaded opens them all the same: they are read by themselves.
  const alone = useLoad<EndUser>(
    selected && page.data && !listed ? `${base}/end-users/${selected}` : null,
  );
  const chosen = listed ?? alone.data;
  const pages =
    trail.length > 1 || page.data?.nextCursor ? (
      <div className="flex items-center gap-2 text-meta text-ink-muted">
        <span>Page {trail.length}</span>
        <Button
          size="small"
          disabled={trail.length <= 1}
          onClick={() => setTrail((current) => current.slice(0, -1))}
        >
          Previous
        </Button>
        <Button
          size="small"
          disabled={!page.data?.nextCursor}
          onClick={() =>
            setTrail((current) => [...current, page.data?.nextCursor as string | null])
          }
        >
          Next
        </Button>
      </div>
    ) : null;

  const may = useNeeds({ base, permission: "end_user:write", what: "this tenant's end users" });
  return (
    <>
      <CollectionView<EndUser>
        title="End users"
        description="The people who sign in to this tenant's portal and apps: the client's own customers. They belong to this tenant alone, separate from members, and never see the console."
        actions={
          <Button variant="primary" onClick={() => setInviting(true)}>
            Invite an end user
          </Button>
        }
        toolbar={
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="w-full max-w-xs">
                <TextField
                  label="Search by email or name"
                  labelHidden
                  name="search"
                  value={search}
                  onChange={(value) => {
                    setSearch(value);
                    setTrail([null]);
                  }}
                />
              </div>
              {pages}
            </div>
            {problem ? <Notice tone="danger">{problem}</Notice> : null}
            {framed?.tabs}
          </div>
        }
        needs={{ base, permission: "end_user:write", what: "this tenant's end users" }}
        label="End users"
        rows={page.data ? rows : undefined}
        error={page.error}
        onRetry={page.reload}
        rowKey={(row) => row.id}
        selected={selected}
        onSelect={(row) => setSelected(row.id)}
        columns={[
          {
            header: "Email",
            cell: (row) => (
              <span className="flex min-w-0 flex-col">
                <Truncate className="font-medium">{row.email}</Truncate>
                {row.name ? (
                  <span className="text-meta text-ink-muted md:hidden">{row.name}</span>
                ) : null}
              </span>
            ),
          },
          { header: "Name", priority: 3, cell: (row) => row.name },
          { header: "Status", cell: (row) => <Status user={row} /> },
          {
            header: "Groups",
            priority: 2,
            cell: (row) => (
              <span className="flex flex-wrap gap-1">
                {(row.groups ?? []).map((group) => (
                  <Tag key={group}>{group}</Tag>
                ))}
              </span>
            ),
          },
          {
            header: "Last signed in",
            priority: 3,
            cell: (row) =>
              row.lastSignedInAt ? (
                <Time value={row.lastSignedInAt} mode="ago" />
              ) : (
                <span className="text-ink-muted">Never</span>
              ),
          },
        ]}
        empty={
          search.trim()
            ? { title: "No end user matches that search" }
            : {
                title: "No end users yet",
                text: "Invite someone by email. They get a link to choose a password, and can then open the apps that are open to them.",
              }
        }
        inspector={
          <Inspector
            open={chosen !== undefined}
            label="End user"
            eyebrow="End user"
            title={chosen?.email}
            onClose={() => setSelected(undefined)}
            footer={
              chosen ? (
                <fieldset disabled={!may.can} className="contents">
                  {actions(chosen).map((action) => (
                    <Button
                      key={action.label}
                      size="small"
                      variant={action.label === "Delete" ? "danger" : "secondary"}
                      onClick={action.onSelect}
                    >
                      {action.label}
                    </Button>
                  ))}
                </fieldset>
              ) : null
            }
          >
            {chosen ? (
              <div className="flex flex-col gap-5">
                <KeyValues
                  rows={[
                    { label: "Name", value: chosen.name || "Not given" },
                    { label: "Status", value: <Status user={chosen} /> },
                    {
                      label: "Last signed in",
                      value: chosen.lastSignedInAt ? (
                        <Time value={chosen.lastSignedInAt} mode="stamp" />
                      ) : (
                        "Never"
                      ),
                    },
                    { label: "Added", value: <Time value={chosen.createdAt} mode="stamp" /> },
                    {
                      label: "Groups",
                      value:
                        (chosen.groups ?? []).length > 0 ? (
                          <span className="flex flex-wrap gap-1">
                            {chosen.groups.map((group) => (
                              <Tag key={group}>{group}</Tag>
                            ))}
                          </span>
                        ) : (
                          "None"
                        ),
                    },
                  ]}
                />
                <div className="flex flex-col gap-2">
                  <SectionLabel>Attributes</SectionLabel>
                  {Object.keys(chosen.attributes ?? {}).length === 0 ? (
                    <p className="m-0 text-ink-muted">
                      None. A table's rules can match facts such as which customer they belong to.
                    </p>
                  ) : (
                    <KeyValues
                      rows={Object.entries(chosen.attributes).map(([name, value]) => ({
                        label: name,
                        value,
                        mono: true,
                      }))}
                    />
                  )}
                </div>
              </div>
            ) : null}
          </Inspector>
        }
      />
      <CreateDialog
        config={{
          action: "Invite an end user",
          description:
            "They get a link to choose their password. Inviting gives no access by itself: open an app to them under Access or in the repository.",
          fields: [
            { name: "email", label: "Email", type: "email" },
            { name: "name", label: "Name", required: false },
            ...(addresses.length > 0
              ? [
                  {
                    name: "domainId",
                    label: "On which address",
                    options: [
                      { value: "", label: THIS_INSTANCE },
                      ...addresses.map((one) => ({ value: one.id, label: one.hostname })),
                    ],
                    hint: "The link they are given opens on this address.",
                  },
                ]
              : []),
          ],
          submit: ({ email, name, domainId }) =>
            api.post(`${base}/end-users`, {
              email,
              ...(name ? { name } : {}),
              ...(domainId ? { domainId } : {}),
            }),
        }}
        open={inviting}
        onClose={() => setInviting(false)}
        onCreated={(result) => {
          const made = result as { endUser: EndUser; invitation: MadeLink };
          setInviting(false);
          setLink({ ...made.invitation, email: made.endUser.email, purpose: "invite" });
          page.reload();
        }}
      />
      <LinkDialog link={link} onClose={() => setLink(undefined)} />
      <AddressDialog
        asked={
          addressFor ? { email: addressFor.user.email, purpose: addressFor.purpose } : undefined
        }
        addresses={addresses}
        onClose={() => setAddressFor(undefined)}
        onChosen={(domainId) => {
          const asked = addressFor;
          setAddressFor(undefined);
          if (asked) void makeLinkOn(asked.user, asked.purpose, domainId);
        }}
      />
      <Closing subject={attributesOf}>
        {(attributesOf, shown) => (
          <AttributesDialog
            open={shown}
            key={attributesOf.id}
            base={base}
            user={attributesOf}
            onClose={() => setAttributesOf(undefined)}
            onSaved={() => {
              setAttributesOf(undefined);
              page.reload();
            }}
          />
        )}
      </Closing>
    </>
  );
}
