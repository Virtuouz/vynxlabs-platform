import { Button, Notice, TextField } from "@volvel/ui";
import { useState } from "react";
import { ApiError, api, useLoad } from "../api.ts";
import { ask, notify } from "../ask.tsx";
import { KeyValues, Panel, SectionLabel } from "../kit/layout.tsx";
import { OneTimeSecret } from "../kit/OneTimeSecret.tsx";
import { StatePill } from "../kit/status.tsx";
import { Time } from "../kit/Time.tsx";
import { CopyButton, ListScreen, RemoveButton } from "../ListScreen.tsx";

export interface KeyRow {
  id: string;
  name: string;
  prefix: string;
  /** The key's last four characters. Null for a key made before they were kept. */
  suffix?: string | null;
  expiresAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

/** How a key is told apart: its first characters and, when kept, its last four. */
export const keyLabel = (row: Pick<KeyRow, "prefix" | "suffix">) =>
  row.suffix ? `${row.prefix}…${row.suffix}` : `${row.prefix}…`;

export const keyColumns = [
  { header: "Name", cell: (row: KeyRow) => row.name },
  {
    header: "Key",
    cell: (row: KeyRow) => (
      <code
        className="font-mono text-code"
        title={row.suffix ? undefined : "Made before the last four characters were kept"}
      >
        {keyLabel(row)}
      </code>
    ),
  },
  {
    // As every list says a time: how long ago, with the moment itself on hover. A time to the
    // second did not fit the column on a phone for a key used today.
    header: "Last used",
    cell: (row: KeyRow) => (row.lastUsedAt ? <Time value={row.lastUsedAt} mode="ago" /> : "Never"),
  },
  {
    header: "Status",
    cell: (row: KeyRow) =>
      row.revokedAt ? (
        <StatePill state="revoked" />
      ) : row.expiresAt && new Date(row.expiresAt) < new Date() ? (
        <StatePill state="expired" />
      ) : (
        <StatePill state="active" />
      ),
  },
];

export const showNewKey = (result: unknown, dismiss?: () => void) => (
  <OneTimeSecret value={(result as { token: string }).token} noun="key" onDone={dismiss} />
);

interface RecoveryState {
  eligible: boolean;
  left: number;
  madeAt: string | null;
}

/**
 * One-time codes for a tenant's owner: while single sign-on is required, a code
 * with their own password lets them in once, so a broken provider cannot lock
 * the tenant out.
 */
export function RecoveryCodes() {
  const state = useLoad<RecoveryState>("/me/recovery-codes");
  const [codes, setCodes] = useState<string[]>();
  const [busy, setBusy] = useState(false);
  if (!state.data?.eligible) return null;
  const { left, madeAt } = state.data;

  const make = async () => {
    if (madeAt) {
      const sure = await ask.confirm({
        title: "Make new recovery codes?",
        text: "The codes you have now stop working. Keep the new ones somewhere safe that does not depend on your organization's sign-in.",
        action: "Make new codes",
        danger: true,
      });
      if (!sure) return;
    }
    setBusy(true);
    try {
      const made = await api.post<{ codes: string[] }>("/me/recovery-codes");
      setCodes(made.codes);
      state.reload();
    } catch (error) {
      notify.error(error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel className="flex flex-col gap-4 p-4 md:p-5">
      <SectionLabel>Recovery codes</SectionLabel>
      <p className="m-0 max-w-measure text-ink-muted">
        You own a tenant. If your organization's sign-in breaks while it is required, a recovery
        code with your password lets you in once, to put it right. Each code works one time.
      </p>
      <KeyValues
        rows={[
          { label: "Codes left", value: madeAt ? String(left) : "None made yet" },
          ...(madeAt ? [{ label: "Made", value: <Time value={madeAt} /> }] : []),
        ]}
      />
      {madeAt && left <= 2 && !codes ? (
        <Notice tone="attention">
          {left === 0 ? "You have no codes left." : `Only ${left} left.`} Make new ones while you
          can still sign in.
        </Notice>
      ) : null}
      {codes ? (
        <div className="flex flex-col gap-3">
          <Notice tone="attention">Copy these codes now. They are not shown again.</Notice>
          <ul
            aria-label="New recovery codes"
            className="m-0 grid list-none grid-cols-1 gap-2 rounded-control bg-code-bg p-3 font-mono text-code sm:grid-cols-2"
          >
            {codes.map((code) => (
              <li key={code} className="select-all">
                {code}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <CopyButton value={codes.join("\n")} label="Copy all" />
            <Button onClick={() => setCodes(undefined)}>I have kept them</Button>
          </div>
        </div>
      ) : (
        <div>
          <Button variant={madeAt ? "secondary" : "primary"} disabled={busy} onClick={make}>
            {madeAt ? "Make new codes" : "Make recovery codes"}
          </Button>
        </div>
      )}
    </Panel>
  );
}

const MIN_PASSWORD = 12;

/**
 * Changes the password of the person signed in. Their other sessions end with it: someone who
 * had the old password should not stay in.
 */
export function ChangePassword() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string>();
  const [done, setDone] = useState(false);
  const mismatch = again !== "" && again !== next;
  const short = next !== "" && next.length < MIN_PASSWORD;
  const ready = current !== "" && next.length >= MIN_PASSWORD && next === again;

  return (
    <Panel role="region" aria-label="Password" className="flex max-w-xl flex-col gap-4 p-4 md:p-5">
      <SectionLabel>Password</SectionLabel>
      <p className="m-0 max-w-measure text-ink-muted">
        Changing it signs you out everywhere else. If your organization's sign-in is the only way
        you get in, you have no password here to change.
      </p>
      <form
        className="flex flex-col gap-3"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!ready) return;
          setBusy(true);
          setProblem(undefined);
          setDone(false);
          try {
            await api.post("/auth/change-password", {
              currentPassword: current,
              newPassword: next,
              revokeOtherSessions: true,
            });
            setCurrent("");
            setNext("");
            setAgain("");
            setDone(true);
          } catch (error) {
            const refused = error as ApiError;
            setProblem(
              refused instanceof ApiError &&
                (refused.status === 400 || refused.status === 401) &&
                /password/i.test(`${refused.code} ${refused.message}`)
                ? "The current password is not right."
                : refused.message,
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <TextField
          label="Current password"
          name="currentPassword"
          type="password"
          value={current}
          required
          autoComplete="current-password"
          onChange={setCurrent}
        />
        <TextField
          label="New password"
          name="newPassword"
          type="password"
          value={next}
          required
          autoComplete="new-password"
          hint={`At least ${MIN_PASSWORD} characters.`}
          error={short ? `Use at least ${MIN_PASSWORD} characters.` : undefined}
          onChange={setNext}
        />
        <TextField
          label="New password again"
          name="again"
          type="password"
          value={again}
          required
          autoComplete="new-password"
          error={mismatch ? "The two do not match." : undefined}
          onChange={setAgain}
        />
        {problem ? <Notice tone="danger">{problem}</Notice> : null}
        {done ? (
          <Notice tone="attention">
            Your password is changed. Your other sessions were signed out.
          </Notice>
        ) : null}
        <div>
          <Button type="submit" variant="primary" loading={busy} disabled={!ready}>
            Change password
          </Button>
        </div>
      </form>
    </Panel>
  );
}

export function Account() {
  return (
    <div className="flex flex-col gap-8">
      <ListScreen<KeyRow>
        title="API keys"
        description="A key acts as you, with your permissions. Use one for the command line or a script."
        path="/api-keys"
        rowKey={(row) => row.id}
        columns={keyColumns}
        empty={{ title: "No API keys", text: "Create a key to sign in from the command line." }}
        create={{
          action: "Create API key",
          fields: [
            {
              name: "name",
              label: "Name",
              placeholder: "My laptop",
              hint: "Where the key will be used.",
            },
          ],
          submit: (values) => api.post("/api-keys", values),
          afterCreate: showNewKey,
        }}
        rowActions={(row, reload) =>
          row.revokedAt ? null : (
            <RemoveButton
              label="Revoke"
              confirm={`Revoke the key "${row.name}"? Anything using it stops working.`}
              run={() => api.delete(`/api-keys/${row.id}`)}
              onDone={reload}
            />
          )
        }
      />
      <ChangePassword />
      <RecoveryCodes />
    </div>
  );
}
