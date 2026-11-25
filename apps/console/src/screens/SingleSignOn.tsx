import {
  Button,
  CheckboxField,
  ComboboxField,
  EmptyState,
  Facts,
  JsonView,
  Notice,
  Panel,
  SelectField,
  SideSheet,
  Tabs,
  TextAreaField,
  TextField,
} from "@volvel/ui";
import { Plus, Trash2 } from "lucide-react";
import { type ReactNode, useMemo, useRef, useState } from "react";
import { type ApiError, api, useLoad } from "../api.ts";
import { ask, failureText, notify } from "../ask.tsx";
import { Can, useCan } from "../kit/Can.tsx";
import { DataTable } from "../kit/DataTable.tsx";
import { type ChallengeRecord, DnsRecord } from "../kit/DnsRecord.tsx";
import { listOf } from "../kit/format.ts";
import { ErrorState, Loading } from "../kit/LoadState.tsx";
import { Stepper } from "../kit/layout.tsx";
import { PageHeader } from "../kit/PageHeader.tsx";
import { LoadMore, usePagedList } from "../kit/paged.tsx";
import { SaveBar } from "../kit/SaveBar.tsx";
import { SecretField } from "../kit/SecretField.tsx";
import { Mono, StatePill, Tag } from "../kit/status.tsx";
import { useOpenRow } from "../kit/useOpenRow.ts";
import { CopyButton, Page, when } from "../ListScreen.tsx";
import { leaveFirst, Link as RouteLink, useUrlParam } from "../router.tsx";
import { Provisioning } from "./Provisioning.tsx";

type Audience = "members" | "end_users";
type Protocol = "oidc" | "saml";

interface Claims {
  subject?: string;
  email?: string;
  name?: string;
  groups?: string;
}
interface Config {
  claims?: Claims;
  attributes?: Record<string, string>;
  trustEmail?: boolean;
  // OIDC
  issuer?: string;
  clientId?: string;
  scopes?: string[];
  userinfo?: boolean;
  // SAML
  entryPoint?: string;
  idpIssuer?: string;
  certificates?: string[];
  signed?: string;
  signRequests?: boolean;
  encryptAssertions?: boolean;
  allowSha1?: boolean;
  allowIdpInitiated?: boolean;
  nameIdFormat?: string | null;
  spCertificate?: string;
}
interface LastTest {
  at: string;
  ok: boolean;
  would?: string;
  reason?: string;
  message?: string;
  detail?: string | null;
  subject?: string;
  email?: string | null;
  emailVerified?: boolean | null;
  name?: string | null;
  groups?: string[];
  attributes?: Record<string, string>;
  received?: Record<string, unknown>;
}
export interface IdentityProvider {
  id: string;
  tenantId: string | null;
  audience: Audience;
  protocol: Protocol;
  name: string;
  config: Config;
  hasSecret: boolean;
  credentialSetAt?: string | null;
  credentialSetBy?: string | null;
  enabled: boolean;
  enforce: boolean;
  provision: boolean;
  defaultRoleId: string | null;
  paused: boolean;
  addresses: { start: string; callback: string; acs: string; metadata: string; entityId: string };
  lastTest: LastTest | null;
}
interface Domain {
  id: string;
  domain: string;
  verified: boolean;
  verifiedAt: string | null;
  checkedAt: string | null;
  problem: string | null;
  /** When a check first missed the record of a proved domain: it stays proved, and this says so. */
  recordGoneAt?: string | null;
  record: ChallengeRecord | null;
}
interface GroupMap {
  value: string;
  groupId: string;
  groupName?: string;
  /** `release` for one an access change made: it is changed by another access change, not here. */
  managedBy?: "hand" | "release";
}
interface Link {
  id: string;
  subject: string;
  email: string | null;
  name: string | null;
  createdAt: string;
  lastSignedInAt: string | null;
}

const FOR: Record<Audience, string> = { members: "Members", end_users: "End users" };
const PROTOCOL: Record<Protocol, string> = { oidc: "OIDC", saml: "SAML" };

function State({ provider }: { provider: IdentityProvider }) {
  return (
    <span className="flex flex-wrap items-center gap-3">
      <StatePill state={provider.paused ? "paused" : provider.enabled ? "on" : "off"} />
      {provider.enforce ? <Tag>Required</Tag> : null}
    </span>
  );
}

/** One value to give the provider's administrator, with a button to copy it. */
function CopyLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="min-w-0">
        <span className="block text-body-sm text-ink-muted">{label}</span>
        <code className="font-mono text-code break-all">{value}</code>
      </span>
      <CopyButton value={value} label={`Copy ${label.toLowerCase()}`} />
    </div>
  );
}

// ----- Connecting a provider -----

function ConnectDialog({
  base,
  instance,
  open,
  onClose,
  onCreated,
}: {
  base: string;
  instance: boolean;
  open: boolean;
  onClose: () => void;
  onCreated: (provider: IdentityProvider) => void;
}) {
  const [audience, setAudience] = useState<Audience>("members");
  const [protocol, setProtocol] = useState<Protocol>("oidc");
  const [name, setName] = useState("");
  const [issuer, setIssuer] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [metadataUrl, setMetadataUrl] = useState("");
  const [metadataXml, setMetadataXml] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  return (
    <SideSheet
      open={open}
      onClose={onClose}
      title="Connect an identity provider"
      description="The provider is created off. You are then shown what to enter at the provider, and can try it before turning it on."
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError(undefined);
          try {
            const config: Record<string, unknown> =
              protocol === "oidc"
                ? { issuer: issuer.trim(), clientId: clientId.trim() }
                : metadataXml.trim()
                  ? { metadataXml: metadataXml.trim() }
                  : { metadataUrl: metadataUrl.trim() };
            const created = await api.post<IdentityProvider>(`${base}/identity-providers`, {
              audience: instance ? "members" : audience,
              protocol,
              name: name.trim(),
              config,
              ...(protocol === "oidc" && clientSecret ? { clientSecret } : {}),
            });
            setName("");
            setIssuer("");
            setClientId("");
            setClientSecret("");
            setMetadataUrl("");
            setMetadataXml("");
            onCreated(created);
          } catch (caught) {
            setError(failureText(caught));
          } finally {
            setBusy(false);
          }
        }}
      >
        {instance ? null : (
          <SelectField
            label="Who signs in through it"
            name="audience"
            value={audience}
            options={[
              { value: "members", label: "Members, who use this console" },
              { value: "end_users", label: "End users, who use the tenant's apps" },
            ]}
            onChange={(value) => setAudience(value as Audience)}
          />
        )}
        <SelectField
          label="Protocol"
          name="protocol"
          value={protocol}
          options={[
            { value: "oidc", label: "OpenID Connect (OIDC)" },
            { value: "saml", label: "SAML 2.0" },
          ]}
          onChange={(value) => setProtocol(value as Protocol)}
        />
        <TextField
          label="Name"
          name="name"
          value={name}
          required
          maxLength={80}
          hint="What the sign-in button says: Sign in with this name."
          onChange={setName}
        />
        {protocol === "oidc" ? (
          <>
            <TextField
              label="Issuer"
              name="issuer"
              value={issuer}
              required
              placeholder="https://login.example.com/realms/acme"
              hint="The provider's address. Its settings are read from there."
              onChange={setIssuer}
            />
            <TextField
              label="Client ID"
              name="clientId"
              value={clientId}
              required
              onChange={setClientId}
            />
            <TextField
              label="Client secret"
              name="clientSecret"
              type="password"
              autoComplete="off"
              value={clientSecret}
              hint="Kept sealed and never shown again. Leave empty for a public client."
              onChange={setClientSecret}
            />
          </>
        ) : (
          <>
            <TextField
              label="Metadata address"
              name="metadataUrl"
              value={metadataUrl}
              placeholder="https://login.example.com/saml/metadata"
              hint="Where the provider publishes its metadata. Or paste the metadata below."
              onChange={setMetadataUrl}
            />
            <TextAreaField
              label="Metadata"
              name="metadataXml"
              value={metadataXml}
              rows={4}
              hint="The provider's metadata file, pasted. Used instead of the address when filled in."
              onChange={setMetadataXml}
            />
          </>
        )}
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <div className="mt-1 flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={busy}>
            Connect
          </Button>
        </div>
      </form>
    </SideSheet>
  );
}

// ----- One provider -----

function SetUp({
  root,
  provider,
  onChanged,
}: {
  root: string;
  provider: IdentityProvider;
  onChanged: (provider: IdentityProvider) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const test = provider.lastTest;
  return (
    <div className="flex max-w-measure flex-col gap-5">
      <section className="flex flex-col gap-2">
        <h2 className="m-0 text-title font-semibold">1. Enter these at the provider</h2>
        <div className="flex flex-col gap-3 rounded-control bg-sunken p-3">
          {provider.protocol === "oidc" ? (
            <CopyLine label="Redirect address" value={provider.addresses.callback} />
          ) : (
            <>
              <CopyLine label="Reply address (ACS)" value={provider.addresses.acs} />
              <CopyLine label="Entity ID (audience)" value={provider.addresses.entityId} />
              <CopyLine label="Metadata address" value={provider.addresses.metadata} />
            </>
          )}
        </div>
        {provider.audience === "members" ? (
          <div className="flex flex-col gap-1">
            <CopyLine label="Sign-in address" value={provider.addresses.start} />
            <p className="m-0 text-meta text-ink-subtle">
              For a tile in the provider's app list, or a bookmark: it opens this provider's sign-in
              and brings the person back here. It works once the provider is turned on.
            </p>
          </div>
        ) : null}
        <p className="m-0 text-ink-muted">
          {provider.protocol === "oidc"
            ? "Register an application of the web kind, with the authorization code flow. Have it send the email, and a groups claim if you will map groups."
            : "The provider can load everything from the metadata address. Have it send a name ID that lasts, the email, and the groups if you will map them."}
        </p>
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="m-0 text-title font-semibold">2. Try it</h2>
        <p className="m-0 text-ink-muted">
          Opens the provider in a new tab. Signing in there signs nobody in here and changes
          nothing: it shows what the provider sent and what would happen.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="primary"
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const started = await api.post<{ url: string }>(`${root}/tests`);
                window.open(started.url, "_blank", "noopener");
                setTried(true);
              } catch (error) {
                notify.error(error);
              } finally {
                setBusy(false);
              }
            }}
          >
            Try signing in
          </Button>
          {tried ? (
            <Button
              onClick={async () => {
                try {
                  onChanged(await api.get<IdentityProvider>(root));
                } catch (error) {
                  notify.error(error);
                }
              }}
            >
              Show the result
            </Button>
          ) : null}
        </div>
        {test ? (
          <Panel as="div" className="flex flex-col gap-3 p-3">
            <Notice tone={test.ok ? "success" : "danger"}>
              {test.ok
                ? `The provider answered ${when(test.at)}. ${test.would ?? ""}`
                : `The last try, ${when(test.at)}, did not pass. ${test.detail ?? test.message ?? ""}`}
            </Notice>
            {test.subject ? (
              <Facts
                columns={2}
                facts={[
                  { label: "Subject", value: test.subject, code: true },
                  { label: "Email", value: test.email ?? "None sent" },
                  {
                    label: "Email verified",
                    value:
                      test.emailVerified === true
                        ? "Yes"
                        : test.emailVerified === false
                          ? "No"
                          : "Not said",
                  },
                  { label: "Name", value: test.name ?? "None sent" },
                  { label: "Groups", value: (test.groups ?? []).join(", ") || "None sent" },
                  {
                    label: "Attributes",
                    value:
                      Object.entries(test.attributes ?? {})
                        .map(([name, value]) => `${name} = ${value}`)
                        .join(", ") || "None mapped",
                  },
                ]}
              />
            ) : null}
            {test.received ? (
              <details>
                <summary className="cursor-pointer text-ink-muted">
                  Everything the provider sent
                </summary>
                <div className="mt-2">
                  <JsonView label="What the provider sent" value={test.received} />
                </div>
              </details>
            ) : null}
          </Panel>
        ) : null}
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="m-0 text-title font-semibold">3. Turn it on</h2>
        <p className="m-0 text-ink-muted">
          {provider.audience === "members"
            ? "A provider of members needs an email domain first: see Domains. Then use Turn on, above."
            : "Use Turn on, above. A sign-in button appears on the tenant's sign-in page."}
        </p>
      </section>
    </div>
  );
}

function Domains({ root, instance }: { root: string; instance: boolean }) {
  const list = useLoad<{ items: Domain[] }>(`${root}/domains`);
  const [domain, setDomain] = useState("");
  const [busy, setBusy] = useState(false);
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
      list.reload();
    } catch (error) {
      notify.error(error);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col gap-4">
      <p className="m-0 max-w-measure text-ink-muted">
        {instance
          ? "The email domains this provider signs in. As the instance's operator you answer for them, so no proof is asked."
          : "The email domains this provider signs in. Each is proved with a DNS record before an email in it is believed. A member is signed in only by an email in a proved domain."}
      </p>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void run(async () => {
            const added = await api.post<Domain>(`${root}/domains`, { domain: domain.trim() });
            // Proved at once (the instance's own domains): nothing to publish. Unproved with a
            // record: the record is shown. Neither: only what happened.
            notify.success(
              added.verified
                ? `${added.domain} is added. It needs no proof here.`
                : added.record
                  ? `${added.domain} is added. Prove it is yours with the record shown.`
                  : `${added.domain} is added.`,
            );
            setDomain("");
          });
        }}
      >
        <div className="w-72">
          <TextField
            label="Email domain"
            name="domain"
            value={domain}
            placeholder="example.com"
            required
            onChange={setDomain}
          />
        </div>
        <Button type="submit" variant="primary" loading={busy}>
          Add domain
        </Button>
      </form>
      {list.error ? <ErrorState error={list.error} onRetry={list.reload} /> : null}
      {(list.data?.items ?? []).map((row) => (
        <Panel as="div" key={row.id} className="flex flex-col gap-3 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex flex-wrap items-center gap-2">
              <strong>{row.domain}</strong>
              {row.verified && row.recordGoneAt ? (
                <StatePill state="warning">
                  Proved {when(row.verifiedAt ?? "")}; record gone since {when(row.recordGoneAt)}
                </StatePill>
              ) : row.verified ? (
                <StatePill state="verified">Proved</StatePill>
              ) : (
                <StatePill state="unverified">Not proved</StatePill>
              )}
            </span>
            <span className="flex flex-wrap gap-2">
              {row.record ? (
                <Button
                  disabled={busy}
                  onClick={() => run(() => api.post(`${root}/domains/${row.id}/checks`))}
                >
                  Check now
                </Button>
              ) : null}
              <Button
                variant="danger"
                disabled={busy}
                onClick={async () => {
                  const sure = await ask.confirm({
                    title: `Remove ${row.domain}?`,
                    text: "People already tied to the provider still sign in. Nobody new in this domain will be. A provider of members with no proved domain left is turned off.",
                    action: "Remove",
                    danger: true,
                  });
                  if (sure) await run(() => api.delete(`${root}/domains/${row.id}`));
                }}
              >
                Remove
              </Button>
            </span>
          </div>
          {row.record && !row.verified ? (
            <div className="flex flex-col gap-3 rounded-control bg-sunken p-3">
              <p className="m-0 text-ink-muted">
                Create this TXT record where the domain's DNS is managed, then check.
              </p>
              <DnsRecord record={row.record} />
            </div>
          ) : null}
          {row.problem ? <Notice tone="attention">{row.problem}</Notice> : null}
        </Panel>
      ))}
      {list.data && list.data.items.length === 0 ? (
        <EmptyState title="No domains yet">
          Add the domain of the people's email addresses.
        </EmptyState>
      ) : null}
    </div>
  );
}

function Groups({ base, root, audience }: { base: string; root: string; audience: Audience }) {
  // The picker is searched on the server, so a group past the first page can still be chosen.
  const [typed, setTyped] = useState("");
  const groups = usePagedList<{ id: string; name: string }>(
    `${base}/${audience === "members" ? "groups" : "end-user-groups"}`,
    { search: typed, limit: 200 },
  );
  const stored = useLoad<{ items: GroupMap[] }>(`${root}/group-maps`);
  const [edited, setEdited] = useState<GroupMap[]>();
  const [busy, setBusy] = useState(false);
  const all = stored.data?.items ?? [];
  const released = all.filter((row) => row.managedBy === "release");
  const rows = edited ?? all.filter((row) => row.managedBy !== "release");
  const [problem, setProblem] = useState<string>();
  const tenantId = base.split("/").pop();
  const change = (index: number, patch: Partial<GroupMap>) =>
    setEdited(rows.map((row, at) => (at === index ? { ...row, ...patch } : row)));
  // A group already chosen stays an option when a search leaves it out of the list. The same
  // list until something changes: a list that changes under the box resets what is typed in it.
  const chosenKey = JSON.stringify([
    (groups.items ?? []).map((group) => [group.id, group.name]),
    rows.map((row) => [row.groupId, row.groupName ?? null]),
  ]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: chosenKey stands for both lists
  const options = useMemo(() => {
    const listed = groups.items ?? [];
    return [
      ...listed.map((group) => ({ value: group.id, label: group.name })),
      ...rows
        .filter((row) => row.groupId && !listed.some((one) => one.id === row.groupId))
        .map((row) => ({ value: row.groupId, label: row.groupName ?? row.groupId })),
    ];
  }, [chosenKey]);
  const saveMapping = async () => {
    // A row left empty is nothing; one half filled in is not saved quietly without its half.
    const half = rows.findIndex((row) => !!row.value.trim() !== !!row.groupId);
    if (half >= 0) {
      setProblem(
        `Row ${half + 1} is not complete. ${
          rows[half]?.value.trim()
            ? "Choose the group here for it"
            : "Write the group at the provider for it"
        }, or remove the row.`,
      );
      return;
    }
    setProblem(undefined);
    const items = rows.filter((row) => row.value.trim() && row.groupId);
    setBusy(true);
    try {
      await api.put(`${root}/group-maps`, {
        items: items.map((row) => ({ value: row.value.trim(), groupId: row.groupId })),
      });
      setEdited(undefined);
      stored.reload();
      notify.success("The group mapping was saved.");
    } catch (error) {
      notify.error(error);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex max-w-measure flex-col gap-4">
      <p className="m-0 text-ink-muted">
        On every sign-in a person is put in exactly the groups listed here that the provider names
        for them, and taken out of the listed groups it does not. A group that is not listed is
        never touched. Use <code className="font-mono text-code">*</code> for everyone the provider
        signs in.
      </p>
      {released.length > 0 ? (
        <div className="flex flex-col gap-2">
          <p className="m-0 text-ink-muted">
            These come from an{" "}
            <RouteLink to={`/t/${tenantId}/releases`} className="text-action">
              access change
            </RouteLink>
            . Change them there.
          </p>
          {released.map((row) => (
            <div
              key={`${row.value}\n${row.groupId}`}
              className="flex flex-wrap items-center gap-2 rounded-control bg-structure px-3 py-2"
            >
              <Mono>{row.value}</Mono>
              <span className="text-ink-muted">goes to</span>
              <strong>{row.groupName ?? row.groupId}</strong>
              <Tag tone="neutral">Access change</Tag>
            </div>
          ))}
        </div>
      ) : null}
      {rows.map((row, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: rows have no identity until saved
        <div key={index} className="flex flex-wrap items-end gap-2">
          <div className="w-64">
            <TextField
              label="Group at the provider"
              name={`value-${index}`}
              value={row.value}
              placeholder="Finance Team"
              onChange={(value) => change(index, { value })}
            />
          </div>
          <div className="w-64">
            <ComboboxField
              label="Group here"
              options={options}
              value={row.groupId || undefined}
              onSearch={setTyped}
              onChange={(value) =>
                change(index, {
                  groupId: value ?? "",
                  groupName: options.find((option) => option.value === value)?.label ?? "",
                })
              }
            />
          </div>
          <Button
            aria-label={`Remove mapping ${index + 1}`}
            onClick={() => setEdited(rows.filter((_, at) => at !== index))}
          >
            <Trash2 size={16} aria-hidden="true" />
          </Button>
        </div>
      ))}
      <LoadMore
        shown={groups.items?.length ?? 0}
        hasMore={groups.hasMore}
        loading={groups.loadingMore}
        error={groups.moreError}
        noun="groups"
        onMore={groups.loadMore}
      />
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setEdited([...rows, { value: "", groupId: "" }])}>
          <Plus size={16} aria-hidden="true" /> Add a mapping
        </Button>
      </div>
      {problem ? <Notice tone="danger">{problem}</Notice> : null}
      <SaveBar
        dirty={edited !== undefined}
        saving={busy}
        onSave={() => void saveMapping()}
        onDiscard={() => {
          setEdited(undefined);
          setProblem(undefined);
        }}
        what="this group mapping"
      />
      {groups.items && options.length === 0 && !typed ? (
        <Notice tone="attention">
          {audience === "members"
            ? "This tenant has no groups yet. Create one under Groups."
            : "This tenant has no groups of end users yet. Create one under End users, on the Groups tab."}
        </Notice>
      ) : null}
    </div>
  );
}

const SIGNED = [
  { value: "either", label: "The assertion or the whole response" },
  { value: "assertion", label: "The assertion" },
  { value: "response", label: "The whole response" },
  { value: "both", label: "Both" },
];

/** The name ID formats providers are usually asked for. A stored one that is not here is kept. */
const NAME_ID_FORMATS = [
  { value: "", label: "Not asked: the provider chooses" },
  {
    value: "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
    label: "Email address",
  },
  { value: "urn:oasis:names:tc:SAML:2.0:nameid-format:persistent", label: "Persistent" },
  { value: "urn:oasis:names:tc:SAML:2.0:nameid-format:transient", label: "Transient" },
  { value: "urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified", label: "Unspecified" },
];

function Settings({
  base,
  root,
  instance,
  provider,
  onChanged,
}: {
  base: string;
  root: string;
  instance: boolean;
  provider: IdentityProvider;
  onChanged: (provider: IdentityProvider) => void;
}) {
  const roles = useLoad<{ items: { id: string; name: string; workspaceId?: string | null }[] }>(
    provider.audience === "members" && !instance ? `${base}/roles?limit=200` : null,
  );
  const [name, setName] = useState(provider.name);
  const [config, setConfig] = useState<Config>(provider.config);
  const [certificates, setCertificates] = useState((provider.config.certificates ?? []).join("\n"));
  const [attributes, setAttributes] = useState(
    Object.entries(provider.config.attributes ?? {})
      .map(([attribute, claim]) => `${attribute} = ${claim}`)
      .join("\n"),
  );
  const [clientSecret, setClientSecret] = useState("");
  const [removeSecret, setRemoveSecret] = useState(false);
  const [scopes, setScopes] = useState((provider.config.scopes ?? []).join(" "));
  const [provision, setProvision] = useState(provider.provision);
  const [roleId, setRoleId] = useState(provider.defaultRoleId ?? undefined);
  const [error, setError] = useState<ApiError | string>();
  // A refusal of one field is said at that field, with what was typed kept. Only what no field
  // here shows, or that is not about a field, is said in a notice.
  const fieldError = (tail: string) =>
    typeof error === "string"
      ? undefined
      : error?.fields?.find(
          (one) => one.path === `/body/${tail}` || one.path.startsWith(`/body/${tail}/`),
        )?.message;
  const unplaced =
    error === undefined
      ? undefined
      : typeof error === "string"
        ? error
        : error.fields?.length
          ? error.fields.some(
              (one) =>
                !/^\/body\/(name|defaultRoleId|config\/(entryPoint|idpIssuer|certificates|nameIdFormat|signed|issuer|clientId|scopes|attributes))(\/|$)/.test(
                  one.path,
                ),
            )
            ? failureText(error)
            : undefined
          : failureText(error);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<Config>) => setConfig((current) => ({ ...current, ...patch }));
  const claim = (key: keyof Claims, label: string, usual: string) => (
    <TextField
      label={label}
      name={`claim-${key}`}
      value={config.claims?.[key] ?? ""}
      placeholder={usual}
      onChange={(value) => set({ claims: { ...config.claims, [key]: value } })}
    />
  );
  const saml = provider.protocol === "saml";
  // What is on the screen, to tell whether it differs from what was last saved.
  const snapshotOf = (values: { config: Config; certificates: string }) =>
    JSON.stringify([
      name,
      values.config,
      values.certificates,
      attributes,
      clientSecret,
      removeSecret,
      scopes,
      provision,
      roleId ?? null,
    ]);
  const [saved, setSaved] = useState(() => snapshotOf({ config, certificates }));
  const dirty = snapshotOf({ config, certificates }) !== saved;
  const form = useRef<HTMLFormElement>(null);
  const discard = () => {
    setName(provider.name);
    setConfig(provider.config);
    setCertificates((provider.config.certificates ?? []).join("\n"));
    setAttributes(
      Object.entries(provider.config.attributes ?? {})
        .map(([attribute, claim]) => `${attribute} = ${claim}`)
        .join("\n"),
    );
    setClientSecret("");
    setRemoveSecret(false);
    setScopes((provider.config.scopes ?? []).join(" "));
    setProvision(provider.provision);
    setRoleId(provider.defaultRoleId ?? undefined);
    setError(undefined);
  };
  const [metadataUrl, setMetadataUrl] = useState("");
  const [metadataXml, setMetadataXml] = useState("");
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState<ApiError | string>();
  const readAgain = async () => {
    setReadError(undefined);
    const sure = await ask.confirm({
      title: "Read the metadata again?",
      text: "The sign-in address, the provider's entity ID and the signing certificates are replaced by what the metadata says. If the entity ID is another, the ties between people and this provider's sign-ins are removed.",
      action: "Read the metadata",
    });
    if (!sure) return;
    setReading(true);
    try {
      // Only the metadata is sent: the three values it describes would win over it if sent too.
      const read = await api.patch<IdentityProvider>(root, {
        config: metadataXml.trim()
          ? { metadataXml: metadataXml.trim() }
          : { metadataUrl: metadataUrl.trim() },
      });
      setConfig(read.config);
      setCertificates((read.config.certificates ?? []).join("\n"));
      setSaved(
        snapshotOf({
          config: read.config,
          certificates: (read.config.certificates ?? []).join("\n"),
        }),
      );
      setMetadataUrl("");
      setMetadataXml("");
      onChanged(read);
      notify.success("The metadata was read. The sign-in address and certificates are as it says.");
    } catch (caught) {
      setReadError(caught as ApiError);
    } finally {
      setReading(false);
    }
  };

  return (
    <div className="flex max-w-measure flex-col gap-6">
      {saml ? (
        <section className="flex flex-col gap-3" aria-label="Read the metadata again">
          <h2 className="m-0 text-title font-semibold">Read the metadata again</h2>
          <p className="m-0 text-ink-muted">
            When the provider changes its certificate or its address, have it be read here instead
            of copied by hand.
          </p>
          <TextField
            label="Metadata address"
            name="readMetadataUrl"
            value={metadataUrl}
            placeholder="https://login.example.com/saml/metadata"
            disabled={metadataXml.trim() !== ""}
            hint="Where the provider publishes its metadata."
            onChange={setMetadataUrl}
          />
          <TextAreaField
            label="Or paste the metadata"
            name="readMetadataXml"
            value={metadataXml}
            rows={4}
            hint="The provider's metadata file. Used instead of the address when filled in."
            onChange={setMetadataXml}
          />
          {readError ? <Notice tone="danger">{failureText(readError)}</Notice> : null}
          <div>
            <Button
              variant="secondary"
              loading={reading}
              disabled={metadataUrl.trim() === "" && metadataXml.trim() === ""}
              onClick={readAgain}
            >
              Read the metadata
            </Button>
          </div>
        </section>
      ) : null}
      <form
        ref={form}
        className="flex flex-col gap-3"
        onSubmit={async (event) => {
          event.preventDefault();
          setError(undefined);
          // Subjects belong to the issuer that gave them: another issuer may use one for another
          // person. Saying so first is what lets the ties go with the old one.
          const moved = saml
            ? (config.idpIssuer ?? "") !== (provider.config.idpIssuer ?? "")
            : (config.issuer ?? "") !== (provider.config.issuer ?? "");
          if (moved) {
            const sure = await ask.confirm({
              title: saml ? "Change the identity provider's entity ID?" : "Change the issuer?",
              text: `The ties between people and this provider's sign-ins are removed. The next time each person signs in, they are found by their email again.${
                saml
                  ? ""
                  : " A client secret stored for the old address is not sent to a new one: give it again if the address changes."
              }`,
              action: "Change it",
              danger: true,
            });
            if (!sure) return;
          }
          // One a line, split at the first equals sign: a claim may hold one. A line that is not
          // whole is said, not dropped.
          const pairs: [string, string][] = [];
          const lines = attributes.split("\n");
          for (const [at, line] of lines.entries()) {
            if (!line.trim()) continue;
            const cut = line.indexOf("=");
            const attribute = cut < 0 ? "" : line.slice(0, cut).trim();
            const claimName = cut < 0 ? "" : line.slice(cut + 1).trim();
            if (!attribute || !claimName) {
              setError(
                `Line ${at + 1} is not complete: write the attribute here, an equals sign, then the claim it is read from.`,
              );
              return;
            }
            pairs.push([attribute, claimName]);
          }
          setBusy(true);
          try {
            const { spCertificate: _ours, ...sent } = config;
            const updated = await api.patch<IdentityProvider>(root, {
              name: name.trim(),
              config: {
                ...sent,
                ...(saml
                  ? {
                      certificates: certificates
                        .split(/(?<=-----END CERTIFICATE-----)/)
                        .map((certificate) => certificate.trim())
                        .filter(Boolean),
                    }
                  : {}),
                ...(saml ? {} : { scopes: scopes.split(/\s+/).filter(Boolean) }),
                attributes: Object.fromEntries(pairs),
              },
              ...(clientSecret ? { clientSecret } : removeSecret ? { clientSecret: null } : {}),
              provision,
              ...(provider.audience === "members" && !instance
                ? { defaultRoleId: roleId ?? null }
                : {}),
            });
            setClientSecret("");
            setRemoveSecret(false);
            // What was typed is now what is saved; the secret is never kept on the screen.
            setSaved(
              JSON.stringify([
                name,
                config,
                certificates,
                attributes,
                "",
                false,
                scopes,
                provision,
                roleId ?? null,
              ]),
            );
            onChanged(updated);
            // A secret stored for the old issuer is not sent to a new one: said, not lost in silence.
            if (provider.hasSecret && !updated.hasSecret)
              notify.info(
                "The provider was saved. Its client secret was dropped because the issuer changed: give it again in Settings.",
              );
            else notify.success("The provider was saved.");
          } catch (caught) {
            setError(caught as ApiError);
          } finally {
            setBusy(false);
          }
        }}
      >
        <TextField
          label="Name"
          name="name"
          error={fieldError("name")}
          value={name}
          required
          maxLength={80}
          onChange={setName}
        />
        {saml ? (
          <>
            <TextField
              label="Sign-in address"
              name="entryPoint"
              error={fieldError("config/entryPoint")}
              value={config.entryPoint ?? ""}
              required
              hint="Where people are sent to sign in."
              onChange={(entryPoint) => set({ entryPoint })}
            />
            <TextField
              label="Provider's entity ID"
              name="idpIssuer"
              error={fieldError("config/idpIssuer")}
              value={config.idpIssuer ?? ""}
              required
              onChange={(idpIssuer) => set({ idpIssuer })}
            />
            <TextAreaField
              label="Signing certificates"
              name="certificates"
              error={fieldError("config/certificates")}
              value={certificates}
              rows={5}
              hint="One or more, in PEM form. List the new one beside the old one while a certificate is being replaced."
              onChange={setCertificates}
            />
            <SelectField
              label="Name ID format"
              name="nameIdFormat"
              error={fieldError("config/nameIdFormat")}
              value={config.nameIdFormat ?? ""}
              options={
                config.nameIdFormat && !NAME_ID_FORMATS.some((f) => f.value === config.nameIdFormat)
                  ? [...NAME_ID_FORMATS, { value: config.nameIdFormat, label: config.nameIdFormat }]
                  : NAME_ID_FORMATS
              }
              hint="What this side asks the provider to send as the person's name ID. Persistent keeps one person to one name ID; email address is for a provider that has no lasting one."
              onChange={(value) => set({ nameIdFormat: value === "" ? null : value })}
            />
            <SelectField
              label="What must be signed"
              name="signed"
              error={fieldError("config/signed")}
              value={config.signed ?? "either"}
              options={SIGNED}
              onChange={(signed) => set({ signed })}
            />
            <CheckboxField
              label="Sign the requests sent to the provider"
              name="signRequests"
              checked={config.signRequests ?? true}
              onChange={(signRequests) => set({ signRequests })}
            />
            <CheckboxField
              label="Ask the provider to encrypt assertions"
              name="encryptAssertions"
              checked={config.encryptAssertions ?? false}
              hint="Publishes this side's certificate in the metadata for the provider to encrypt to. The provider must wrap the key with RSA-OAEP with MGF1 (rsa-oaep-mgf1p) and the SHA-1 digest. Keycloak's defaults differ: set both on its client."
              onChange={(encryptAssertions) => set({ encryptAssertions })}
            />
            <CheckboxField
              label="Accept SHA-1 signatures"
              name="allowSha1"
              checked={config.allowSha1 ?? false}
              hint="Weak. Only for a provider that cannot sign with SHA-256. Turning this on is written to the audit log."
              onChange={(allowSha1) => set({ allowSha1 })}
            />
            <CheckboxField
              label="Accept sign-ins the provider begins"
              name="allowIdpInitiated"
              checked={config.allowIdpInitiated ?? false}
              hint="For a tile on the provider's own start page. Such a sign-in answers no request of ours, so it is off unless you need it. Turning this on is written to the audit log."
              onChange={(allowIdpInitiated) => set({ allowIdpInitiated })}
            />
          </>
        ) : (
          <>
            <TextField
              label="Issuer"
              name="issuer"
              error={fieldError("config/issuer")}
              value={config.issuer ?? ""}
              required
              onChange={(issuer) => set({ issuer })}
            />
            <TextField
              label="Client ID"
              name="clientId"
              error={fieldError("config/clientId")}
              value={config.clientId ?? ""}
              required
              onChange={(clientId) => set({ clientId })}
            />
            <SecretField
              label="Client secret"
              name="clientSecret"
              stored={provider.hasSecret}
              setAt={provider.credentialSetAt}
              setBy={provider.credentialSetBy}
              autoComplete="off"
              value={clientSecret}
              onChange={setClientSecret}
            />
            {provider.hasSecret && !clientSecret ? (
              <CheckboxField
                label="Remove the stored client secret"
                name="removeSecret"
                checked={removeSecret}
                hint="For a public client: the provider is then signed in with PKCE alone. Applies when you save."
                onChange={setRemoveSecret}
              />
            ) : null}
            <TextField
              label="Scopes"
              name="scopes"
              error={fieldError("config/scopes")}
              value={scopes}
              hint="Separated by spaces."
              onChange={setScopes}
            />
            <CheckboxField
              label="Also read the user-info address"
              name="userinfo"
              checked={config.userinfo ?? false}
              hint="For a provider that leaves groups or email out of the ID token."
              onChange={(userinfo) => set({ userinfo })}
            />
          </>
        )}
        <h2 className="mt-3 mb-0 text-title font-semibold">Which claims to read</h2>
        <p className="m-0 text-ink-muted">Leave a field empty to use the usual name.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {claim("subject", "Subject", saml ? "The name ID" : "sub")}
          {claim("email", "Email", saml ? "email, mail" : "email")}
          {claim("name", "Name", saml ? "name, displayName" : "name")}
          {claim("groups", "Groups", saml ? "groups, memberOf" : "groups")}
        </div>
        {provider.audience === "end_users" ? (
          <>
            <TextAreaField
              label="Attributes"
              name="attributes"
              error={fieldError("config/attributes")}
              value={attributes}
              rows={3}
              placeholder="customer_id = customerId"
              hint="One a line: the attribute here, an equals sign, the claim it is read from. A table's row rules can match on these."
              onChange={setAttributes}
            />
            <CheckboxField
              label="Take the provider's word on emails"
              name="trustEmail"
              checked={config.trustEmail ?? false}
              hint="Lets a first sign-in take over an existing account with the same email, in a domain that has not been proved here. Only for a provider that verifies emails itself."
              onChange={(trustEmail) => set({ trustEmail })}
            />
          </>
        ) : null}
        <h2 className="mt-3 mb-0 text-title font-semibold">New people</h2>
        <CheckboxField
          label="Create people the first time they sign in"
          name="provision"
          checked={provision}
          hint={
            provider.audience === "members"
              ? `Off, only members who already exist can sign in.${
                  instance
                    ? " A person made here has no access until an operator gives it, one person at a time."
                    : ""
                }`
              : "Off, only end users who already exist can sign in."
          }
          onChange={setProvision}
        />
        {provider.audience === "members" && !instance ? (
          <ComboboxField
            label="Role given to a new member"
            error={fieldError("defaultRoleId")}
            options={(roles.data?.items ?? [])
              .filter((role) => !role.workspaceId)
              .map((role) => ({ value: role.id, label: role.name }))}
            value={roleId}
            hint="Leave empty to give nothing. A new member can then sign in and see nothing until someone gives them a role."
            onChange={setRoleId}
          />
        ) : null}
        {unplaced ? <Notice tone="danger">{unplaced}</Notice> : null}
        <SaveBar
          dirty={dirty}
          saving={busy}
          onSave={() => form.current?.requestSubmit()}
          onDiscard={discard}
          what="this provider's settings"
        />
      </form>
    </div>
  );
}

function People({ root }: { root: string }) {
  const list = usePagedList<Link>(`${root}/links`, { limit: 200 });
  return list.error ? (
    <ErrorState error={list.error} onRetry={list.reload} />
  ) : (
    <div className="flex flex-col gap-3">
      <DataTable<Link>
        variant="static"
        framed
        label="People who signed in"
        rows={list.items ?? []}
        rowKey={(row) => row.id}
        empty={
          <EmptyState title="Nobody yet">
            People appear here the first time they sign in through this provider.
          </EmptyState>
        }
        columns={[
          { header: "Person", cell: (row) => row.name || row.email || "Unknown" },
          { header: "Email at the provider", priority: 2, cell: (row) => row.email ?? "" },
          {
            header: "Subject",
            priority: 3,
            cell: (row) => <code className="font-mono text-code break-all">{row.subject}</code>,
          },
          {
            header: "Last signed in",
            priority: 2,
            cell: (row) => (row.lastSignedInAt ? when(row.lastSignedInAt) : "Never"),
          },
          {
            header: "",
            cell: (row) => (
              <Button
                onClick={async () => {
                  const sure = await ask.confirm({
                    title: `Untie ${row.email ?? row.subject}?`,
                    text: "For when this person's identity at the provider was replaced. Their next sign-in ties them again by email, under the rules of a first sign-in.",
                    action: "Untie",
                    danger: true,
                  });
                  if (!sure) return;
                  try {
                    await api.delete(`${root}/links/${row.id}`);
                    notify.success("Untied. Their next sign-in ties them again by email.");
                    list.reload();
                  } catch (error) {
                    notify.error(error);
                  }
                }}
              >
                Untie
              </Button>
            ),
          },
        ]}
      />
      <LoadMore
        shown={list.items?.length ?? 0}
        hasMore={list.hasMore}
        loading={list.loadingMore}
        error={list.moreError}
        noun="people"
        onMore={list.loadMore}
      />
    </div>
  );
}

function ProviderDetail({
  base,
  instance,
  provider,
  onChanged,
  onRemoved,
}: {
  base: string;
  instance: boolean;
  provider: IdentityProvider;
  onChanged: (provider: IdentityProvider) => void;
  onRemoved: () => void;
}) {
  const root = `${base}/identity-providers/${provider.id}`;
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useUrlParam("tab", "setup", { push: true });
  const domains = useLoad<{ items: Domain[] }>(`${root}/domains`);
  const maps = useLoad<{ items: GroupMap[] }>(instance ? null : `${root}/group-maps`);
  const proved = (domains.data?.items ?? []).some((domain) => domain.verified);
  const mapped = (maps.data?.items ?? []).length > 0;
  const on = provider.enabled && !provider.paused;
  const steps = [
    {
      key: "setup",
      label: "Connect",
      detail: provider.lastTest?.ok ? "A try passed" : "Enter the addresses, then try it",
      done: provider.lastTest?.ok === true,
    },
    {
      key: "domains",
      label: "Prove domains",
      detail: proved
        ? "Proved"
        : provider.audience === "members"
          ? "Needed for members"
          : "Optional for end users",
      done: proved,
    },
    ...(instance
      ? []
      : [
          {
            key: "groups",
            label: "Map groups",
            detail: mapped ? `${maps.data?.items.length} mapped` : "Optional",
            done: mapped,
          },
        ]),
    {
      key: "enforce",
      label: "Switch on",
      detail: provider.enforce ? "On and required" : on ? "On; passwords still work" : "Off",
      done: on,
    },
  ];
  const current = steps.find((step) => !step.done && step.key !== "groups")?.key ?? "enforce";
  const patch = async (body: Record<string, unknown>, done: string) => {
    setBusy(true);
    try {
      onChanged(await api.patch<IdentityProvider>(root, body));
      notify.success(done);
    } catch (error) {
      notify.error(error);
    } finally {
      setBusy(false);
    }
  };
  const who = provider.audience === "members" ? "members" : "end users";
  // What changes a provider needs: switched off for a member who may only read.
  const gate = {
    base: instance ? "/instance" : base,
    permission: instance ? "instance:write" : "sso:write",
  };
  const can = useCan(gate.base, gate.permission);
  // Changing tab drops what the tab holds unsaved: it asks as leaving the page does.
  const changeTab = leaveFirst(setTab);
  const guarded = (content: ReactNode) => (
    <Can {...gate} what="this provider">
      {content}
    </Can>
  );

  return (
    <section className="flex flex-col gap-4">
      <PageHeader
        title={provider.name}
        state={<State provider={provider} />}
        meta={
          <span className="text-ink-muted">
            {PROTOCOL[provider.protocol]}, for {who}
          </span>
        }
        actions={
          <>
            <Button
              variant="danger"
              disabled={busy || !can}
              onClick={async () => {
                const sure = await ask.typeToConfirm({
                  title: `Remove ${provider.name}?`,
                  text: "Its domains, group mapping and ties to people go with it. The people it signed in stay, and need another way in.",
                  expected: provider.name,
                  action: "Remove",
                });
                if (!sure) return;
                try {
                  await api.delete(root);
                  onRemoved();
                } catch (error) {
                  notify.error(error);
                }
              }}
            >
              Remove
            </Button>
            {provider.enabled && !provider.paused ? (
              <Button
                disabled={busy || !can}
                onClick={async () => {
                  const sure = await ask.confirm(
                    provider.enforce
                      ? {
                          title: "Stop requiring single sign-on?",
                          text: `The ${who} this provider covers can use a password again.`,
                          action: "Stop requiring it",
                        }
                      : {
                          title: "Require single sign-on?",
                          text:
                            provider.audience === "members"
                              ? "Members with an email in this provider's proved domains can no longer sign in with a password. Their open sessions end now, except yours, and they sign in again with the provider. The operators of this instance keep their passwords and sessions, so that a broken provider locks nobody out for good."
                              : "End users this provider covers can no longer sign in with a password: those in its proved domains, or everyone when it has none. Their open sessions end now.",
                          action: "Require it",
                          danger: true,
                        },
                  );
                  if (sure) {
                    await patch(
                      { enforce: !provider.enforce },
                      provider.enforce
                        ? "Passwords are allowed again."
                        : "Single sign-on is now required.",
                    );
                  }
                }}
              >
                {provider.enforce ? "Stop requiring it" : "Require it"}
              </Button>
            ) : null}
            <Button
              variant="primary"
              loading={busy}
              disabled={!can}
              onClick={async () => {
                if (on) {
                  // Turning it off ends sign-in through it for everyone it covers: that is said first.
                  const proved = (domains.data?.items ?? [])
                    .filter((domain) => domain.verified)
                    .map((domain) => domain.domain);
                  const covers =
                    proved.length > 0
                      ? `It signs in ${who} with an email in ${listOf(proved)}.`
                      : provider.audience === "members"
                        ? "It has no proved domain, so it signs in no member now."
                        : "It has no domain, so it signs in every end user of this tenant.";
                  const sure = await ask.confirm({
                    title: `Turn off ${provider.name}?`,
                    text: `Nobody signs in through it until it is turned on again. ${covers} ${
                      provider.enforce
                        ? `It is required now, and stops being required: those ${who} can use a password again.`
                        : `Those ${who} can still use a password.`
                    } Anyone who has no password needs one, or another provider, to get in. A directory that pushes people to it keeps pushing while it is off.`,
                    action: "Turn off",
                    danger: true,
                  });
                  if (!sure) return;
                }
                await patch({ enabled: !on }, on ? "The provider is off." : "The provider is on.");
              }}
            >
              {on ? "Turn off" : "Turn on"}
            </Button>
          </>
        }
      />
      <nav aria-label="Setting up">
        <Stepper
          steps={steps}
          current={current}
          onChoose={(key) => changeTab(key === "enforce" ? "setup" : key)}
        />
      </nav>
      {on && !provider.enforce && provider.audience === "members" ? (
        <Notice tone="plain">
          Before you require single sign-on, owners should generate recovery codes in Account. A
          code lets an owner sign in with a password if the provider breaks.
        </Notice>
      ) : null}
      {provider.paused ? (
        <Notice tone="attention">
          This tenant came from another instance, so the provider is paused. Give the provider's
          administrator the addresses under Set up, which belong to this instance, prove the domains
          again, then turn it on.
        </Notice>
      ) : null}
      <Tabs
        label="Provider sections"
        value={tab}
        onChange={changeTab}
        tabs={[
          {
            id: "setup",
            label: "Set up",
            content: guarded(<SetUp root={root} provider={provider} onChanged={onChanged} />),
          },
          {
            id: "domains",
            label: "Domains",
            content: guarded(<Domains root={root} instance={instance} />),
          },
          ...(instance
            ? []
            : [
                {
                  id: "groups",
                  label: "Groups",
                  content: guarded(<Groups base={base} root={root} audience={provider.audience} />),
                },
              ]),
          {
            id: "settings",
            label: "Settings",
            content: guarded(
              <Settings
                key={provider.id}
                base={base}
                root={root}
                instance={instance}
                provider={provider}
                onChanged={onChanged}
              />,
            ),
          },
          { id: "people", label: "People", content: guarded(<People root={root} />) },
          {
            id: "provisioning",
            label: "Provisioning",
            content: guarded(
              <Provisioning
                root={`${base}/provisioning/${provider.id}`}
                instance={instance}
                audience={provider.audience}
              />,
            ),
          },
        ]}
      />
    </section>
  );
}

/** A tenant's identity providers, or the instance's own when `base` is `/instance`. */
export function SingleSignOn({ base }: { base: string }) {
  const instance = base === "/instance";
  const list = useLoad<{ items: IdentityProvider[] }>(`${base}/identity-providers`);
  const [connecting, setConnecting] = useState(false);
  const canConnect = useCan(base, instance ? "instance:write" : "sso:write");
  // The provider open is in the address: a link opens it, and the breadcrumb leads back.
  const [open, setOpen] = useUrlParam("provider", undefined, { push: true });
  const [shown, setFresh] = useOpenRow(list, open);
  const setShown = (provider: IdentityProvider | undefined) => {
    setFresh(provider);
    setOpen(provider?.id);
  };

  if (open && !shown && list.error) return <ErrorState error={list.error} onRetry={list.reload} />;
  if (open && !shown && !list.data) return <Loading />;
  if (shown) {
    return (
      <ProviderDetail
        base={base}
        instance={instance}
        provider={shown}
        onChanged={(provider) => {
          setFresh(provider);
          list.reload();
        }}
        onRemoved={() => {
          setShown(undefined);
          list.reload();
          notify.success("The provider was removed.");
        }}
      />
    );
  }
  const connect = (
    <Button variant="primary" disabled={!canConnect} onClick={() => setConnecting(true)}>
      Connect a provider
    </Button>
  );
  return (
    <Page
      title="Single sign-on"
      description={
        instance
          ? "Identity providers for the people who run this instance. A tenant connects its own under its settings."
          : "Let people sign in through your organization's identity provider, over OIDC or SAML: members to this console, end users to the tenant's apps."
      }
      action={connect}
    >
      {list.error ? (
        <Notice tone="danger" action={<Button onClick={list.reload}>Try again</Button>}>
          {list.error.message}
        </Notice>
      ) : list.data ? (
        <DataTable<IdentityProvider>
          variant="static"
          framed
          label="Identity providers"
          rows={list.data.items}
          rowKey={(row) => row.id}
          empty={
            <EmptyState title="No identity providers" action={connect}>
              People sign in with a password until a provider is connected and turned on.
            </EmptyState>
          }
          columns={[
            {
              header: "Name",
              cell: (row) => (
                <button
                  type="button"
                  className="cursor-pointer border-0 bg-transparent p-0 font-semibold text-action"
                  onClick={() => setShown(row)}
                >
                  {row.name}
                </button>
              ),
            },
            { header: "For", priority: 2, cell: (row) => FOR[row.audience] },
            { header: "Protocol", priority: 3, cell: (row) => PROTOCOL[row.protocol] },
            { header: "State", cell: (row) => <State provider={row} /> },
          ]}
        />
      ) : null}
      <ConnectDialog
        base={base}
        instance={instance}
        open={connecting}
        onClose={() => setConnecting(false)}
        onCreated={(provider) => {
          setConnecting(false);
          setShown(provider);
        }}
      />
    </Page>
  );
}
