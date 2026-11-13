import { Button, CheckboxField, EmptyState, Facts, Notice, SelectField, Table } from "@vynxlabs/ui";
import { useEffect, useState } from "react";
import { api, useLoad } from "../api.ts";
import { ask, notify } from "../ask.tsx";
import { CopyButton, when } from "../ListScreen.tsx";

interface Settings {
  subjectFrom: "externalId" | "userName" | null;
  groups: "sign_in" | "scim";
  createGroups: boolean;
}
interface Token {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
}
interface State {
  address: string;
  settings: Settings;
  tokens: Token[];
  users: { pushed: number; active: number };
  groups: number;
  lastPushAt: string | null;
}

/**
 * How a provider pushes the people and groups it holds, over SCIM: the
 * address and token to give it, how its pushes are taken, and what it has
 * pushed so far.
 */
export function Provisioning({
  root,
  instance,
  audience,
}: {
  /** The provider's provisioning route. */
  root: string;
  /** The instance's own provider, which has no groups to push to. */
  instance: boolean;
  audience: "members" | "end_users";
}) {
  const state = useLoad<State>(root);
  const [settings, setSettings] = useState<Settings>();
  const [made, setMade] = useState<{ name: string; token: string }>();
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (state.data) setSettings(state.data.settings);
  }, [state.data]);

  if (state.error) return <Notice tone="danger">{state.error.message}</Notice>;
  if (!state.data || !settings) return <p className="text-ink-muted">Loading…</p>;
  const { data } = state;
  const dirty = JSON.stringify(settings) !== JSON.stringify(data.settings);
  const who = audience === "members" ? "member" : "end user";

  const make = async () => {
    const name = await ask.prompt({
      title: "Make a token",
      text: "Name it after what will use it, such as the directory's name. The token is shown once.",
      label: "Name",
      action: "Make the token",
    });
    if (!name?.trim()) return;
    try {
      const created = await api.post<Token & { token: string }>(`${root}/tokens`, {
        name: name.trim(),
      });
      setMade({ name: created.name, token: created.token });
      state.reload();
    } catch (error) {
      notify.error(error);
    }
  };
  const save = async () => {
    setBusy(true);
    try {
      await api.put(root, settings);
      notify.success("Saved how pushes are taken.");
      state.reload();
    } catch (error) {
      notify.error(error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <p className="m-0 max-w-3xl text-ink-muted">
        The provider can push the people it holds, and say when one has left, without waiting for
        them to sign in. Give it the address below as its SCIM 2.0 base address, and a token as its
        bearer token.
      </p>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="min-w-0">
          <span className="block text-[13px] text-ink-muted">SCIM base address</span>
          <code className="font-mono text-[13px] break-all">{data.address}</code>
        </span>
        <CopyButton value={data.address} label="Copy the address" />
      </div>

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="m-0 text-[15px] font-semibold">Tokens</h3>
          <Button variant="primary" onClick={make}>
            Make a token
          </Button>
        </div>
        {made ? (
          <Notice tone="attention">
            <span className="flex flex-wrap items-center justify-between gap-2">
              <span className="min-w-0">
                The token “{made.name}”. Copy it now: it cannot be shown again.
                <code className="mt-1 block font-mono text-[13px] break-all">{made.token}</code>
              </span>
              <CopyButton value={made.token} label="Copy the token" />
            </span>
          </Notice>
        ) : null}
        <Table<Token>
          rows={data.tokens}
          rowKey={(row) => row.id}
          empty={
            <EmptyState title="No tokens yet">
              Nothing can be pushed until the provider has a token.
            </EmptyState>
          }
          columns={[
            { header: "Name", cell: (row) => row.name },
            {
              header: "Begins",
              cell: (row) => <code className="font-mono text-[13px]">{row.prefix}…</code>,
            },
            { header: "Made", cell: (row) => when(row.createdAt) },
            {
              header: "Last used",
              cell: (row) => (row.lastUsedAt ? when(row.lastUsedAt) : "Never"),
            },
            {
              header: "",
              align: "end",
              cell: (row) => (
                <Button
                  size="small"
                  variant="danger"
                  onClick={async () => {
                    const sure = await ask.confirm({
                      title: `Revoke the token “${row.name}”?`,
                      text: "Pushes made with it are refused from now on. Whatever was pushed stays as it is.",
                      action: "Revoke",
                      danger: true,
                    });
                    if (!sure) return;
                    await api.delete(`${root}/tokens/${row.id}`).then(state.reload, notify.error);
                  }}
                >
                  Revoke
                </Button>
              ),
            },
          ]}
        />
      </section>

      <section className="flex max-w-xl flex-col gap-3">
        <h3 className="m-0 text-[15px] font-semibold">How pushes are taken</h3>
        <SelectField
          name="subject-from"
          label="The name the provider signs a person in by is pushed as"
          value={settings.subjectFrom ?? ""}
          options={[
            { value: "", label: "Not pushed: tie each person at their first sign-in" },
            { value: "externalId", label: "externalId" },
            { value: "userName", label: "userName" },
          ]}
          hint={`With one chosen, a pushed ${who} is tied to the provider at once. It must be the very value a sign-in gives as the subject, or the name ID.`}
          onChange={(value) =>
            setSettings({
              ...settings,
              subjectFrom: value === "externalId" || value === "userName" ? value : null,
            })
          }
        />
        {instance ? null : (
          <>
            <SelectField
              name="groups-from"
              label="A person's groups come from"
              value={settings.groups}
              options={[
                { value: "sign_in", label: "What each sign-in says" },
                { value: "scim", label: "The groups the provider pushes" },
              ]}
              hint="Either way, the Groups tab says which of the provider's groups is which group here."
              onChange={(value) =>
                setSettings({ ...settings, groups: value === "scim" ? "scim" : "sign_in" })
              }
            />
            {settings.groups === "scim" ? (
              <CheckboxField
                name="create-groups"
                label="Make a group here for each pushed group that nothing maps yet"
                checked={settings.createGroups}
                onChange={(createGroups) => setSettings({ ...settings, createGroups })}
              />
            ) : null}
          </>
        )}
        <div>
          <Button variant="primary" disabled={!dirty || busy} onClick={save}>
            Save
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="m-0 text-[15px] font-semibold">What has been pushed</h3>
        <Facts
          facts={[
            { label: "People", value: String(data.users.pushed) },
            { label: "Of them, turned off", value: String(data.users.pushed - data.users.active) },
            ...(instance ? [] : [{ label: "Groups", value: String(data.groups) }]),
            { label: "Last change", value: data.lastPushAt ? when(data.lastPushAt) : "Never" },
          ]}
        />
        <p className="m-0 max-w-3xl text-[13px] text-ink-muted">
          {audience === "members"
            ? instance
              ? "A person the provider turns off has their account disabled everywhere: their sessions end and their API keys stop working."
              : "A person the provider turns off is suspended in this tenant. They keep their account, what they hold in other tenants, and what they held here for if they come back."
            : "A person the provider turns off is disabled, and whatever they were signed in to ends."}{" "}
          A push never deletes an account.
        </p>
      </section>
    </div>
  );
}
