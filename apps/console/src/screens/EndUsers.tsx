import {
  Badge,
  Button,
  Dialog,
  EmptyState,
  Menu,
  Notice,
  Pagination,
  Table,
  TextField,
} from "@vynxlabs/ui";
import { useState } from "react";
import { type ApiError, api, useLoad } from "../api.ts";
import { CopyButton, CreateDialog, Page, when } from "../ListScreen.tsx";

interface EndUser {
  id: string;
  email: string;
  name: string;
  hasPassword: boolean;
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

const failed = (error: unknown) => {
  const failure = error as ApiError;
  return [failure.message, ...(failure.fields ?? []).map((field) => field.message)].join(" ");
};

function Status({ user }: { user: EndUser }) {
  return (
    <span className="flex flex-wrap gap-1">
      {user.disabled ? <Badge tone="danger">Disabled</Badge> : null}
      {user.hasPassword ? null : <Badge tone="attention">Invited</Badge>}
      {user.hasPassword && !user.disabled ? <Badge tone="success">Active</Badge> : null}
    </span>
  );
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
            <code className="font-mono text-[13px] break-all select-all">{link.url}</code>
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

export function EndUsers({ base }: { base: string }) {
  const [search, setSearch] = useState("");
  // The cursor of each page opened so far, so that Previous can go back.
  const [trail, setTrail] = useState<(string | null)[]>([null]);
  const [inviting, setInviting] = useState(false);
  const [link, setLink] = useState<ShownLink>();
  const [problem, setProblem] = useState<string>();

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
  const makeLink = (user: EndUser, purpose: "invite" | "reset") =>
    act(async () => {
      const made = await api.post<MadeLink>(`${base}/end-users/${user.id}/links`, { purpose });
      setLink({ ...made, email: user.email, purpose });
    });
  const actions = (user: EndUser) => [
    // A disabled account cannot be sent a link: enable it first.
    ...(user.disabled
      ? []
      : [
          user.hasPassword
            ? { label: "Password reset link", onSelect: () => makeLink(user, "reset") }
            : { label: "New invitation link", onSelect: () => makeLink(user, "invite") },
        ]),
    user.disabled
      ? {
          label: "Enable",
          onSelect: () => act(() => api.patch(`${base}/end-users/${user.id}`, { disabled: false })),
        }
      : {
          label: "Disable",
          onSelect: () => act(() => api.patch(`${base}/end-users/${user.id}`, { disabled: true })),
        },
    {
      label: "Delete",
      onSelect: () => {
        if (
          !window.confirm(
            `Delete ${user.email}? They can no longer sign in, and access given to them is removed. Their rows in tables are kept.`,
          )
        )
          return;
        return act(() => api.delete(`${base}/end-users/${user.id}`));
      },
    },
  ];

  const inviteButton = (
    <Button variant="primary" onClick={() => setInviting(true)}>
      Invite an end user
    </Button>
  );

  return (
    <Page
      title="End users"
      description="The client's own customers and portal users: the people who sign in to this tenant's portal and apps. They are a pool that belongs to this tenant alone, separate from members, and they never see the console."
      action={inviteButton}
    >
      <div className="max-w-sm">
        <TextField
          label="Search by email or name"
          name="search"
          value={search}
          required={false}
          onChange={(value) => {
            setSearch(value);
            setTrail([null]);
          }}
        />
      </div>
      {problem ? <Notice tone="danger">{problem}</Notice> : null}
      {page.error ? (
        <Notice tone="danger" action={<Button onClick={page.reload}>Try again</Button>}>
          {page.error.message}
        </Notice>
      ) : page.data ? (
        <Table<EndUser>
          rows={rows}
          rowKey={(row) => row.id}
          columns={[
            { header: "Email", cell: (row) => <span className="font-medium">{row.email}</span> },
            { header: "Name", cell: (row) => row.name },
            { header: "Status", cell: (row) => <Status user={row} /> },
            {
              header: "Last signed in",
              cell: (row) =>
                row.lastSignedInAt ? (
                  <span className="whitespace-nowrap">{when(row.lastSignedInAt)}</span>
                ) : (
                  <span className="text-ink-muted">Never</span>
                ),
            },
            {
              header: "",
              align: "end",
              cell: (row) => (
                <span className="inline-block">
                  <Menu
                    label={
                      <span>
                        Actions<span className="sr-only"> for {row.email}</span>
                      </span>
                    }
                    items={actions(row)}
                  />
                </span>
              ),
            },
          ]}
          empty={
            search.trim() ? (
              <EmptyState title="No end user matches that search" />
            ) : (
              <EmptyState title="No end users yet" action={inviteButton}>
                Invite someone by email. They get a link to choose a password, and can then open the
                apps that are open to them.
              </EmptyState>
            )
          }
        />
      ) : (
        <p className="text-ink-muted">Loading…</p>
      )}
      {trail.length > 1 || page.data?.nextCursor ? (
        <Pagination
          label={`Page ${trail.length}`}
          hasPrevious={trail.length > 1}
          hasNext={Boolean(page.data?.nextCursor)}
          onPrevious={() => setTrail((current) => current.slice(0, -1))}
          onNext={() => setTrail((current) => [...current, page.data?.nextCursor as string | null])}
        />
      ) : null}
      <CreateDialog
        config={{
          action: "Invite an end user",
          description:
            "They get a link to choose their password. Inviting gives no access by itself: open an app to them under Access or in the repository.",
          fields: [
            { name: "email", label: "Email", type: "email" },
            { name: "name", label: "Name", required: false },
          ],
          submit: ({ email, name }) =>
            api.post(`${base}/end-users`, { email, ...(name ? { name } : {}) }),
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
    </Page>
  );
}
