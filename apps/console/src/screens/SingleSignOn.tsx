import {
  Badge,
  Button,
  CheckboxField,
  ComboboxField,
  Dialog,
  EmptyState,
  Facts,
  JsonView,
  Notice,
  SelectField,
  Table,
  Tabs,
  TextAreaField,
  TextField,
} from "@vynxlabs/ui";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { type ApiError, api, useLoad } from "../api.ts";
import { ask, failureText, notify } from "../ask.tsx";
import { CopyButton, Page, when } from "../ListScreen.tsx";
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
  record: { name: string; value: string } | null;
}
interface GroupMap {
  value: string;
  groupId: string;
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
    <span className="flex flex-wrap gap-1">
      {provider.paused ? (
        <Badge tone="attention">Paused</Badge>
      ) : provider.enabled ? (
        <Badge tone="success">On</Badge>
      ) : (
        <Badge>Off</Badge>
      )}
      {provider.enforce ? <Badge tone="action">Required</Badge> : null}
    </span>
  );
}

/** One value to give the provider's administrator, with a button to copy it. */
function CopyLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="min-w-0">
        <span className="block text-[13px] text-ink-muted">{label}</span>
        <code className="font-mono text-[13px] break-all">{value}</code>
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
    <Dialog
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
          <Button type="submit" variant="primary" disabled={busy}>
            Connect
          </Button>
        </div>
      </form>
    </Dialog>
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
    <div className="flex max-w-[80ch] flex-col gap-5">
      <section className="flex flex-col gap-2">
        <h2 className="m-0 text-base font-semibold">1. Enter these at the provider</h2>
        <div className="flex flex-col gap-3 rounded-control border border-line bg-sunken p-3">
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
        <p className="m-0 text-ink-muted">
          {provider.protocol === "oidc"
            ? "Register an application of the web kind, with the authorization code flow. Have it send the email, and a groups claim if you will map groups."
            : "The provider can load everything from the metadata address. Have it send a name ID that lasts, the email, and the groups if you will map them."}
        </p>
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="m-0 text-base font-semibold">2. Try it</h2>
        <p className="m-0 text-ink-muted">
          Opens the provider in a new tab. Signing in there signs nobody in here and changes
          nothing: it shows what the provider sent and what would happen.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="primary"
            disabled={busy}
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
          <div className="flex flex-col gap-3 rounded-control border border-line p-3">
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
          </div>
        ) : null}
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="m-0 text-base font-semibold">3. Turn it on</h2>
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
      <p className="m-0 max-w-[75ch] text-ink-muted">
        {instance
          ? "The email domains this provider signs in. As the instance's operator you answer for them, so no proof is asked."
          : "The email domains this provider signs in. Each is proved with a DNS record before an email in it is believed. A member is signed in only by an email in a proved domain."}
      </p>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void run(async () => {
            await api.post(`${root}/domains`, { domain: domain.trim() });
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
        <Button type="submit" variant="primary" disabled={busy}>
          Add domain
        </Button>
      </form>
      {list.error ? <Notice tone="danger">{list.error.message}</Notice> : null}
      {(list.data?.items ?? []).map((row) => (
        <div key={row.id} className="flex flex-col gap-3 rounded-control border border-line p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex flex-wrap items-center gap-2">
              <strong>{row.domain}</strong>
              {row.verified ? (
                <Badge tone="success">Proved</Badge>
              ) : (
                <Badge tone="attention">Not proved</Badge>
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
              <CopyLine label="Record name" value={row.record.name} />
              <CopyLine label="Record value" value={row.record.value} />
            </div>
          ) : null}
          {row.problem ? <Notice tone="attention">{row.problem}</Notice> : null}
        </div>
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
  const groups = useLoad<{ items: { id: string; name: string }[] }>(
    `${base}/${audience === "members" ? "groups" : "end-user-groups"}?limit=200`,
  );
  const stored = useLoad<{ items: GroupMap[] }>(`${root}/group-maps`);
  const [edited, setEdited] = useState<GroupMap[]>();
  const [busy, setBusy] = useState(false);
  const rows = edited ?? stored.data?.items ?? [];
  const change = (index: number, patch: Partial<GroupMap>) =>
    setEdited(rows.map((row, at) => (at === index ? { ...row, ...patch } : row)));
  const options = (groups.data?.items ?? []).map((group) => ({
    value: group.id,
    label: group.name,
  }));
  return (
    <div className="flex max-w-[80ch] flex-col gap-4">
      <p className="m-0 text-ink-muted">
        On every sign-in a person is put in exactly the groups listed here that the provider names
        for them, and taken out of the listed groups it does not. A group that is not listed is
        never touched. Use <code className="font-mono text-[13px]">*</code> for everyone the
        provider signs in.
      </p>
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
              onChange={(value) => change(index, { groupId: value ?? "" })}
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
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setEdited([...rows, { value: "", groupId: "" }])}>
          <Plus size={16} aria-hidden="true" /> Add a mapping
        </Button>
        <Button
          variant="primary"
          disabled={busy || edited === undefined}
          onClick={async () => {
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
          }}
        >
          Save mapping
        </Button>
      </div>
      {groups.data && options.length === 0 ? (
        <Notice tone="attention">
          {audience === "members"
            ? "This tenant has no groups yet. Create one under Groups."
            : "This tenant has no groups of end users yet. Create one under End-user groups."}
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
  const [provision, setProvision] = useState(provider.provision);
  const [roleId, setRoleId] = useState(provider.defaultRoleId ?? undefined);
  const [error, setError] = useState<ApiError>();
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

  return (
    <form
      className="flex max-w-[80ch] flex-col gap-3"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setError(undefined);
        try {
          const { spCertificate: _ours, ...sent } = config;
          const saved = await api.patch<IdentityProvider>(root, {
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
              attributes: Object.fromEntries(
                attributes
                  .split("\n")
                  .map((line) => line.split("=").map((part) => part.trim()))
                  .filter((parts) => parts.length === 2 && parts[0] && parts[1]),
              ),
            },
            ...(clientSecret ? { clientSecret } : {}),
            provision,
            ...(provider.audience === "members" && !instance
              ? { defaultRoleId: roleId ?? null }
              : {}),
          });
          setClientSecret("");
          onChanged(saved);
          notify.success("The provider was saved.");
        } catch (caught) {
          setError(caught as ApiError);
        } finally {
          setBusy(false);
        }
      }}
    >
      <TextField label="Name" name="name" value={name} required maxLength={80} onChange={setName} />
      {saml ? (
        <>
          <TextField
            label="Sign-in address"
            name="entryPoint"
            value={config.entryPoint ?? ""}
            required
            hint="Where people are sent to sign in."
            onChange={(entryPoint) => set({ entryPoint })}
          />
          <TextField
            label="Provider's entity ID"
            name="idpIssuer"
            value={config.idpIssuer ?? ""}
            required
            onChange={(idpIssuer) => set({ idpIssuer })}
          />
          <TextAreaField
            label="Signing certificates"
            name="certificates"
            value={certificates}
            rows={5}
            hint="One or more, in PEM form. List the new one beside the old one while a certificate is being replaced."
            onChange={setCertificates}
          />
          <SelectField
            label="What must be signed"
            name="signed"
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
            value={config.issuer ?? ""}
            required
            onChange={(issuer) => set({ issuer })}
          />
          <TextField
            label="Client ID"
            name="clientId"
            value={config.clientId ?? ""}
            required
            onChange={(clientId) => set({ clientId })}
          />
          <TextField
            label="New client secret"
            name="clientSecret"
            type="password"
            autoComplete="off"
            value={clientSecret}
            hint={
              provider.hasSecret
                ? "A secret is stored. Leave this empty to keep it."
                : "No secret is stored."
            }
            onChange={setClientSecret}
          />
          <TextField
            label="Scopes"
            name="scopes"
            value={(config.scopes ?? []).join(" ")}
            hint="Separated by spaces."
            onChange={(value) => set({ scopes: value.split(/\s+/).filter(Boolean) })}
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
      <h2 className="mt-3 mb-0 text-base font-semibold">Which claims to read</h2>
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
      <h2 className="mt-3 mb-0 text-base font-semibold">New people</h2>
      <CheckboxField
        label="Create people the first time they sign in"
        name="provision"
        checked={provision}
        hint={
          provider.audience === "members"
            ? "Off, only members who already exist can sign in."
            : "Off, only end users who already exist can sign in."
        }
        onChange={setProvision}
      />
      {provider.audience === "members" && !instance ? (
        <ComboboxField
          label="Role given to a new member"
          options={(roles.data?.items ?? [])
            .filter((role) => !role.workspaceId)
            .map((role) => ({ value: role.id, label: role.name }))}
          value={roleId}
          hint="Leave empty to give nothing. A new member can then sign in and see nothing until someone gives them a role."
          onChange={setRoleId}
        />
      ) : null}
      {error ? <Notice tone="danger">{failureText(error)}</Notice> : null}
      <div className="mt-1 flex justify-end">
        <Button type="submit" variant="primary" disabled={busy}>
          Save
        </Button>
      </div>
    </form>
  );
}

function People({ root }: { root: string }) {
  const list = useLoad<{ items: Link[] }>(`${root}/links`);
  return list.error ? (
    <Notice tone="danger">{list.error.message}</Notice>
  ) : (
    <Table<Link>
      rows={list.data?.items ?? []}
      rowKey={(row) => row.id}
      empty={
        <EmptyState title="Nobody yet">
          People appear here the first time they sign in through this provider.
        </EmptyState>
      }
      columns={[
        { header: "Person", cell: (row) => row.name || row.email || "Unknown" },
        { header: "Email at the provider", cell: (row) => row.email ?? "" },
        {
          header: "Subject",
          cell: (row) => <code className="font-mono text-[13px] break-all">{row.subject}</code>,
        },
        {
          header: "Last signed in",
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
  );
}

function ProviderDetail({
  base,
  instance,
  provider,
  onBack,
  onChanged,
  onRemoved,
}: {
  base: string;
  instance: boolean;
  provider: IdentityProvider;
  onBack: () => void;
  onChanged: (provider: IdentityProvider) => void;
  onRemoved: () => void;
}) {
  const root = `${base}/identity-providers/${provider.id}`;
  const [busy, setBusy] = useState(false);
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

  return (
    <section className="flex flex-col gap-4">
      <button
        type="button"
        className="flex w-fit cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-action"
        onClick={onBack}
      >
        <ArrowLeft size={16} aria-hidden="true" /> All providers
      </button>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-xl font-semibold tracking-tight">{provider.name}</h1>
          <span className="flex flex-wrap items-center gap-2 text-ink-muted">
            {PROTOCOL[provider.protocol]}, for {who} <State provider={provider} />
          </span>
        </div>
        <span className="flex flex-wrap gap-2">
          <Button
            variant="danger"
            disabled={busy}
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
              disabled={busy}
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
                            ? "Members with an email in this provider's proved domains can no longer sign in with a password. The operators of this instance keep theirs, so that a broken provider locks nobody out for good."
                            : "End users this provider covers can no longer sign in with a password: those in its proved domains, or everyone when it has none.",
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
            disabled={busy}
            onClick={() =>
              patch(
                { enabled: !(provider.enabled && !provider.paused) },
                provider.enabled && !provider.paused
                  ? "The provider is off."
                  : "The provider is on.",
              )
            }
          >
            {provider.enabled && !provider.paused ? "Turn off" : "Turn on"}
          </Button>
        </span>
      </header>
      {provider.paused ? (
        <Notice tone="attention">
          This tenant came from another instance, so the provider is paused. Give the provider's
          administrator the addresses under Set up, which belong to this instance, prove the domains
          again, then turn it on.
        </Notice>
      ) : null}
      <Tabs
        label="Provider sections"
        tabs={[
          {
            id: "setup",
            label: "Set up",
            content: <SetUp root={root} provider={provider} onChanged={onChanged} />,
          },
          { id: "domains", label: "Domains", content: <Domains root={root} instance={instance} /> },
          ...(instance
            ? []
            : [
                {
                  id: "groups",
                  label: "Groups",
                  content: <Groups base={base} root={root} audience={provider.audience} />,
                },
              ]),
          {
            id: "settings",
            label: "Settings",
            content: (
              <Settings
                key={provider.id}
                base={base}
                root={root}
                instance={instance}
                provider={provider}
                onChanged={onChanged}
              />
            ),
          },
          { id: "people", label: "People", content: <People root={root} /> },
          {
            id: "provisioning",
            label: "Provisioning",
            content: (
              <Provisioning
                root={`${base}/provisioning/${provider.id}`}
                instance={instance}
                audience={provider.audience}
              />
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
  const [shown, setShown] = useState<IdentityProvider>();

  if (shown) {
    return (
      <ProviderDetail
        base={base}
        instance={instance}
        provider={shown}
        onBack={() => {
          setShown(undefined);
          list.reload();
        }}
        onChanged={setShown}
        onRemoved={() => {
          setShown(undefined);
          list.reload();
          notify.success("The provider was removed.");
        }}
      />
    );
  }
  const connect = (
    <Button variant="primary" onClick={() => setConnecting(true)}>
      Connect a provider
    </Button>
  );
  return (
    <Page
      title="Single sign-on"
      description={
        instance
          ? "Identity providers for the people who run this instance. A tenant connects its own under its settings."
          : "Let people sign in through your organisation's identity provider, over OIDC or SAML: members to this console, end users to the tenant's apps."
      }
      action={connect}
    >
      {list.error ? (
        <Notice tone="danger" action={<Button onClick={list.reload}>Try again</Button>}>
          {list.error.message}
        </Notice>
      ) : list.data ? (
        <Table<IdentityProvider>
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
            { header: "For", cell: (row) => FOR[row.audience] },
            { header: "Protocol", cell: (row) => PROTOCOL[row.protocol] },
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
