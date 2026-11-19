import {
  Button,
  type JsonSchema,
  Notice,
  SchemaForm,
  SelectField,
  SideSheet,
  TextField,
} from "@volvel/ui";
import { useEffect, useRef, useState } from "react";
import { api, useLoad } from "../api.ts";
import { failureText } from "../ask.tsx";
import { Loading } from "../kit/LoadState.tsx";
import { SectionLabel } from "../kit/layout.tsx";
import { SecretField } from "../kit/SecretField.tsx";
import { StatePill } from "../kit/status.tsx";
import { CopyButton } from "../ListScreen.tsx";
import { type TaskState, useTaskEnd } from "../tasks.ts";

/** A connection as the list shows it. */
export interface ConnectionRow {
  path: string;
  connector: string;
  description: string;
  defined: boolean;
  bound: boolean;
  config: { baseUrl?: string; host?: string; [more: string]: unknown } | null;
  configSchema: Record<string, unknown>;
  hasCredential: boolean;
  credentialSetAt?: string | null;
  credentialSetBy?: string | null;
  health: {
    ok: boolean;
    problem: string | null;
    latencyMs: number | null;
    checkedAt: string;
  } | null;
  oauth: {
    status: "not_connected" | "connected" | "needs_reconnect";
    expiresAt: string | null;
    scopes: string[];
    connectedAt: string | null;
    problem: string | null;
  } | null;
}

interface ConnectorKind {
  name: string;
  builtin: boolean;
  configSchema: Record<string, unknown>;
}

export const CONNECTOR_NAMES: Record<string, string> = {
  http: "HTTP",
  smtp: "Mail (SMTP)",
  oauth2: "OAuth 2.0",
};

/** What the stored secret is called, by kind. */
const CREDENTIAL: Record<string, { label: string; hint: string }> = {
  http: {
    label: "Token or key",
    hint: "Sent the way the settings say. Leave it empty for an API that needs none.",
  },
  smtp: { label: "Password", hint: "The mail server's password for the user above." },
  oauth2: {
    label: "Client secret",
    hint: "From the app you registered with the provider. Kept on the platform: workers never receive it.",
  },
};

/** Settings to start from, for providers whose addresses are known. */
export const OAUTH_PRESETS: Record<
  "google" | "microsoft" | "other",
  { label: string; settings: (tenant: string) => Record<string, unknown> }
> = {
  google: {
    label: "Google",
    settings: () => ({
      baseUrl: "https://www.googleapis.com",
      authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      scopes: ["openid", "email"],
      // Without both, Google gives a refresh token only the first time.
      authorizeParams: { access_type: "offline", prompt: "consent" },
      testPath: "/oauth2/v3/userinfo",
    }),
  },
  microsoft: {
    label: "Microsoft",
    settings: (tenant) => ({
      baseUrl: "https://graph.microsoft.com/v1.0",
      authorizeUrl: `https://login.microsoftonline.com/${tenant || "common"}/oauth2/v2.0/authorize`,
      tokenUrl: `https://login.microsoftonline.com/${tenant || "common"}/oauth2/v2.0/token`,
      // offline_access is what makes Microsoft give a refresh token.
      scopes: ["offline_access", "User.Read"],
      testPath: "/me",
    }),
  },
  other: { label: "Another provider", settings: () => ({}) },
};

const NEW = "__new";
const PATH = /^[a-z0-9][a-z0-9-]*(\/[a-z0-9][a-z0-9-]*)*$/;

/** Where a provider sends the member back, which the app registered with it must list. */
export const callbackAddress = () => `${location.origin}/api/v1/oauth/connections/callback`;

/** Sends the browser to the provider to authorize a connection, and back here after. */
export async function startConnect(root: string, path: string) {
  const back = new URL(location.href);
  for (const name of ["oauth", "oauth_error", "connection"]) back.searchParams.delete(name);
  const { url } = await api.post<{ url: string }>(`${root}/connection-oauth`, {
    path,
    returnTo: `${back.pathname}${back.search}`,
  });
  location.assign(url);
}

/** What a Test found, said for people. */
export function testText(task: TaskState): { ok: boolean; text: string } {
  const result = task.result as {
    ok: boolean;
    status?: number;
    message?: string;
    latencyMs?: number;
  } | null;
  if (task.status === "failed" || !result) {
    return {
      ok: false,
      text: (task.error?.message ?? "The test did not finish.").replace(
        /^(GET|POST) \S+ answered \d+: /,
        "",
      ),
    };
  }
  if (result.ok) {
    return {
      ok: true,
      text: `Reached${result.status ? ` (${result.status})` : ""}${result.latencyMs !== undefined ? ` in ${result.latencyMs} ms` : ""}.`,
    };
  }
  return {
    ok: false,
    text: [result.status ? `HTTP ${result.status}` : null, result.message]
      .filter(Boolean)
      .join(": "),
  };
}

/**
 * One place to set up a connection: what it is, its settings, its secret, and
 * a Test from one of the workspace's workers. An OAuth connection is connected
 * at its provider before it is tested.
 */
export function ConnectionWizard({
  root,
  open,
  row,
  rows,
  returned,
  onClose,
  onSaved,
}: {
  root: string;
  open: boolean;
  /** The connection being changed. None for a new one. */
  row: ConnectionRow | undefined;
  rows: ConnectionRow[];
  /** Back from the provider: what it said. */
  returned?: { connected: boolean; problem?: string | undefined } | undefined;
  onClose: () => void;
  onSaved: () => void;
}) {
  const kinds = useLoad<{ items: ConnectorKind[] }>(open ? `${root}/connectors` : null);
  const [choice, setChoice] = useState<string>(
    row?.path ?? rows.find((candidate) => !candidate.bound)?.path ?? NEW,
  );
  // The one chosen stays among the choices once it is bound.
  const declared = rows.filter((candidate) => !candidate.bound || candidate.path === choice);
  const [newPath, setNewPath] = useState("");
  const [newKind, setNewKind] = useState("http");
  // One already set up keeps its own addresses: no provider is assumed for it.
  const [preset, setPreset] = useState<keyof typeof OAUTH_PRESETS>(
    row?.config ? "other" : "google",
  );
  const [msTenant, setMsTenant] = useState("common");
  const [config, setConfig] = useState<Record<string, unknown>>(row?.config ?? {});
  const [formKey, setFormKey] = useState(0);
  const [credential, setCredential] = useState("");
  const [saved, setSaved] = useState<ConnectionRow | undefined>(row?.bound ? row : undefined);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string>();
  const [taskId, setTaskId] = useState<string>();
  const [found, setFound] = useState<{ ok: boolean; text: string }>();
  const credentialRef = useRef<HTMLDivElement>(null);

  const chosen = row ?? rows.find((candidate) => candidate.path === choice);
  const path = chosen?.path ?? newPath;
  const connector = chosen?.connector ?? newKind;
  const schema = (chosen?.configSchema ??
    kinds.data?.items.find((kind) => kind.name === connector)?.configSchema) as
    | JsonSchema
    | undefined;
  const isOAuth = connector === "oauth2";
  const credentialSays = CREDENTIAL[connector] ?? {
    label: "Secret",
    hint: "The password or key, when the system asks for one.",
  };
  const hasCredential = saved?.hasCredential ?? chosen?.hasCredential ?? false;

  // A preset fills in what it knows, and keeps the client the member typed.
  const applyPreset = (which: keyof typeof OAUTH_PRESETS, tenant = msTenant) => {
    setPreset(which);
    setConfig((held) => ({
      ...(which === "other" ? {} : OAUTH_PRESETS[which].settings(tenant)),
      ...(typeof held.clientId === "string" ? { clientId: held.clientId } : {}),
    }));
    setFormKey((key) => key + 1);
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: only when the kind becomes OAuth
  useEffect(() => {
    if (!row && isOAuth && Object.keys(config).length === 0) applyPreset("google");
  }, [isOAuth]);

  const following = useTaskEnd(root, taskId, (task) => {
    setTaskId(undefined);
    setFound(testText(task));
    onSaved();
  });
  const test = async (at = path) => {
    setFound(undefined);
    try {
      const task = await api.post<{ id: string }>(`${root}/connection-tests`, { path: at });
      setTaskId(task.id);
    } catch (error) {
      setFound({ ok: false, text: failureText(error) });
    }
  };
  // Back from the provider and connected: test it at once.
  const tested = useRef(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: once per return
  useEffect(() => {
    if (open && returned?.connected && row && !tested.current) {
      tested.current = true;
      void test(row.path);
    }
  }, [open, returned?.connected, row]);

  const save = async () => {
    setProblem(undefined);
    setFound(undefined);
    if (!chosen && !PATH.test(newPath)) {
      setProblem(
        "Name it with lowercase letters, digits and dashes, such as crm or google/sheets.",
      );
      return;
    }
    setBusy(true);
    try {
      // A connection nothing declares yet is declared in a draft, deployed with the next change.
      if (!chosen) {
        await api.put(`${root}/drafts/${path}`, {
          kind: "connection",
          schemaVersion: 1,
          body: { connector },
        });
      }
      await api.put(`${root}/connection-bindings/${path}`, {
        config,
        ...(credential ? { credential } : {}),
      });
      setCredential("");
      const list = await api.get<{ items: ConnectionRow[] }>(`${root}/connection-bindings`);
      setSaved(
        list.items.find((item) => item.path === path) ?? {
          path,
          connector,
          description: "",
          defined: false,
          bound: true,
          config,
          configSchema: (schema ?? {}) as Record<string, unknown>,
          hasCredential: hasCredential || credential !== "",
          health: null,
          oauth: isOAuth
            ? {
                status: "not_connected",
                expiresAt: null,
                scopes: [],
                connectedAt: null,
                problem: null,
              }
            : null,
        },
      );
      onSaved();
      // An OAuth connection is tested once it is connected; anything else, now.
      if (!isOAuth) await test(path);
    } catch (error) {
      setProblem(failureText(error));
    } finally {
      setBusy(false);
    }
  };

  const oauth = saved?.oauth ?? chosen?.oauth ?? null;
  const connected = oauth?.status === "connected";

  return (
    <SideSheet
      open={open}
      onClose={onClose}
      size="wide"
      title={row ? `Set up ${row.path}` : "New connection"}
      description="What is set here applies to this workspace only: dev and production can point to different places."
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button onClick={onClose}>Close</Button>
          <Button variant="primary" loading={busy} disabled={!schema || !path} onClick={save}>
            {busy ? "Saving…" : saved ? "Save again" : "Save"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-6">
        <section className="flex flex-col gap-3">
          <SectionLabel>1 · What it is</SectionLabel>
          {row ? (
            <p className="m-0">
              <code className="font-mono text-code">{row.path}</code> ·{" "}
              {CONNECTOR_NAMES[row.connector] ?? row.connector}
              {row.description ? (
                <span className="text-ink-muted"> · {row.description}</span>
              ) : null}
            </p>
          ) : (
            <>
              <SelectField
                label="Connection"
                name="connection"
                value={choice}
                hint="One the workspace's resources declare and nothing has bound yet, or a new one."
                options={[
                  ...declared.map((candidate) => ({
                    value: candidate.path,
                    label: `${candidate.path} (${CONNECTOR_NAMES[candidate.connector] ?? candidate.connector})`,
                  })),
                  { value: NEW, label: "A new connection…" },
                ]}
                onChange={(value) => {
                  setChoice(value);
                  setConfig({});
                  setFormKey((key) => key + 1);
                }}
              />
              {chosen ? null : (
                <div className="grid gap-3 sm:grid-cols-2">
                  <TextField
                    label="Name"
                    name="path"
                    value={newPath}
                    placeholder="crm"
                    hint="What scripts call it by."
                    onChange={setNewPath}
                  />
                  <SelectField
                    label="Kind"
                    name="kind"
                    value={newKind}
                    options={(kinds.data?.items ?? [])
                      .filter((kind) => kind.builtin)
                      .map((kind) => ({
                        value: kind.name,
                        label: CONNECTOR_NAMES[kind.name] ?? kind.name,
                      }))}
                    onChange={(value) => {
                      setNewKind(value);
                      setConfig({});
                      setFormKey((key) => key + 1);
                    }}
                  />
                </div>
              )}
            </>
          )}
          {isOAuth ? (
            <div className="flex flex-col gap-3 rounded-control border border-line bg-sunken p-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <SelectField
                  label="Provider"
                  name="preset"
                  value={preset}
                  options={Object.entries(OAUTH_PRESETS).map(([value, known]) => ({
                    value,
                    label: known.label,
                  }))}
                  onChange={(value) => applyPreset(value as keyof typeof OAUTH_PRESETS)}
                />
                {preset === "microsoft" ? (
                  <TextField
                    label="Directory (tenant)"
                    name="msTenant"
                    value={msTenant}
                    hint="Its ID or domain, or common for any account."
                    onChange={(value) => {
                      setMsTenant(value);
                      applyPreset("microsoft", value);
                    }}
                  />
                ) : null}
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-body-sm font-medium">Redirect address</span>
                <span className="flex min-w-0 items-center gap-2">
                  <code className="min-w-0 font-mono text-code break-all">{callbackAddress()}</code>
                  <CopyButton value={callbackAddress()} />
                </span>
                <span className="text-body-sm text-ink-muted">
                  Add it to the app you register with the provider, which gives you the client ID
                  and secret.
                </span>
              </div>
            </div>
          ) : null}
        </section>

        <section className="flex flex-col gap-3">
          <SectionLabel>2 · Settings</SectionLabel>
          {schema ? (
            <SchemaForm
              key={`${path}:${connector}:${formKey}`}
              schema={schema}
              value={config}
              onChange={(value) => setConfig((value ?? {}) as Record<string, unknown>)}
            />
          ) : (
            <Loading />
          )}
        </section>

        <section className="flex flex-col gap-3" ref={credentialRef} tabIndex={-1}>
          <SectionLabel>3 · {credentialSays.label}</SectionLabel>
          <SecretField
            label={credentialSays.label}
            name="credential"
            stored={hasCredential}
            setAt={chosen?.credentialSetAt}
            setBy={chosen?.credentialSetBy}
            value={credential}
            {...(hasCredential
              ? {}
              : { hint: `${credentialSays.hint} Stored encrypted and never shown again.` })}
            onChange={setCredential}
          />
        </section>

        <section className="flex flex-col gap-3">
          <SectionLabel>4 · {isOAuth ? "Connect and test" : "Save and test"}</SectionLabel>
          {problem ? <Notice tone="danger">{problem}</Notice> : null}
          {returned?.problem ? <Notice tone="danger">{returned.problem}</Notice> : null}
          {!saved ? (
            <p className="m-0 text-ink-muted">
              Save, and one of this workspace's workers tries it from where scripts run.
              {chosen
                ? ""
                : " A new connection is declared in a draft, deployed with your next change."}
            </p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-2 p-0" role="status">
              <li>
                <StatePill state="ok">Saved</StatePill>
              </li>
              {isOAuth ? (
                <li className="flex flex-wrap items-center gap-2">
                  {connected ? (
                    <StatePill state="ok" detail={oauth?.scopes.join(" ")}>
                      Connected
                    </StatePill>
                  ) : (
                    <StatePill state={oauth?.status === "needs_reconnect" ? "failed" : "waiting"}>
                      {oauth?.status === "needs_reconnect"
                        ? "Needs connecting again"
                        : "Not connected yet"}
                    </StatePill>
                  )}
                  <Button
                    size="small"
                    variant={connected ? "secondary" : "primary"}
                    onClick={() =>
                      startConnect(root, path).catch((error) => setProblem(failureText(error)))
                    }
                  >
                    {connected ? "Connect again" : "Connect"}
                  </Button>
                </li>
              ) : null}
              <li className="flex flex-wrap items-center gap-2">
                {following.waiting ? (
                  <StatePill state="running">
                    {following.slow ? "Waiting for a worker…" : "Testing…"}
                  </StatePill>
                ) : found ? (
                  <StatePill state={found.ok ? "ok" : "failed"}>{found.text}</StatePill>
                ) : (
                  <StatePill state="queued">Not tested</StatePill>
                )}
                <Button
                  size="small"
                  disabled={following.waiting || (isOAuth && !connected)}
                  onClick={() => test()}
                >
                  {found ? "Test again" : "Test"}
                </Button>
              </li>
            </ul>
          )}
          {found && !found.ok && !isOAuth ? (
            <Button
              size="small"
              onClick={() => {
                credentialRef.current?.scrollIntoView({ block: "center" });
                credentialRef.current?.querySelector("input")?.focus();
              }}
            >
              Change the {credentialSays.label.toLowerCase()}
            </Button>
          ) : null}
        </section>
      </div>
    </SideSheet>
  );
}
