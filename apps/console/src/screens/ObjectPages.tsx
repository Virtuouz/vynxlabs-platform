import { Badge, Button, JsonView, Notice } from "@vynxlabs/ui";
import { useLoad } from "../api.ts";
import { CodeEditor } from "../editor/CodeEditor.tsx";
import { DataTable } from "../kit/DataTable.tsx";
import { KeyValues } from "../kit/layout.tsx";
import { ObjectPage } from "../kit/ObjectPage.tsx";
import { kindName, ObjectLink } from "../kit/objects.tsx";
import { ReferenceList } from "../kit/references.tsx";
import { Mono, StatePill } from "../kit/status.tsx";
import { when } from "../ListScreen.tsx";
import { Link, navigate, useUrlParam } from "../router.tsx";
import { RecentRuns } from "./Authoring.tsx";
import { NotFound } from "./NotFound.tsx";
import { fromNow } from "./Overview.tsx";

/**
 * A page of its own for each thing a workspace holds that had only a row in a
 * list: a connection, a variable, a secret, an event, a script. Each can be
 * linked to, and each says what uses it.
 */

interface Loaded<T> {
  data: T | undefined;
  error: { status?: number; message: string } | undefined;
}

/** Loading, not found, or a failure, said the same way on every page. */
function Gate<T>({
  found,
  list,
  noun,
  children,
}: {
  found: Loaded<T>;
  list: string;
  noun: string;
  children: (data: T) => React.ReactNode;
}) {
  if (found.error?.status === 404) return <NotFound home={list} homeLabel={`Go to the ${noun}s`} />;
  if (found.error) return <Notice tone="danger">{found.error.message}</Notice>;
  if (!found.data) return <p className="text-ink-muted">Loading…</p>;
  return <>{children(found.data)}</>;
}

interface Connection {
  path: string;
  connector: string;
  description: string;
  defined: boolean;
  bound: boolean;
  config: Record<string, unknown> | null;
  hasCredential: boolean;
  updatedAt: string | null;
  health: {
    ok: boolean;
    problem: string | null;
    latencyMs: number | null;
    checkedAt: string;
  } | null;
}

export function ConnectionPage({ root, link, path }: { root: string; link: string; path: string }) {
  const found = useLoad<Connection>(`${root}/connection-bindings/${path}`);
  return (
    <Gate found={found} list={`${link}/connections`} noun="connection">
      {(one) => (
        <ObjectPage
          back={{ to: `${link}/connections`, label: "Connections" }}
          eyebrow="Connection"
          title={one.path}
          state={
            <>
              <Badge tone={one.bound ? "success" : "attention"}>
                {one.bound ? "Set up here" : "Not set up here"}
              </Badge>
              {one.health ? (
                <StatePill state={one.health.ok ? "succeeded" : "failed"}>
                  {one.health.ok ? "Answered" : "Did not answer"}
                </StatePill>
              ) : null}
            </>
          }
          actions={
            <Button
              onClick={() => navigate(`${link}/connections?item=${encodeURIComponent(one.path)}`)}
            >
              Change where it points
            </Button>
          }
          meta={
            <KeyValues
              rows={[
                { label: "Kind", value: one.connector, mono: true },
                ...(one.description ? [{ label: "What it is for", value: one.description }] : []),
                { label: "Credential", value: one.hasCredential ? "Set" : "None" },
                {
                  label: "Declared",
                  value: one.defined ? "Deployed" : "Only set up here, or in a draft",
                },
                ...(one.updatedAt ? [{ label: "Last changed", value: when(one.updatedAt) }] : []),
                ...(one.health && !one.health.ok && one.health.problem
                  ? [{ label: "Last check", value: one.health.problem }]
                  : []),
              ]}
            />
          }
          tabs={[
            {
              id: "used-by",
              label: "Used by",
              content: <ReferenceList root={root} link={link} kind="connection" name={one.path} />,
            },
            {
              id: "settings",
              label: "Where it points",
              content: one.config ? (
                <JsonView label="Settings" value={one.config} />
              ) : (
                <p className="m-0 text-ink-muted">Not set up in this workspace yet.</p>
              ),
            },
          ]}
        />
      )}
    </Gate>
  );
}

interface Variable {
  path: string;
  description: string;
  default: string | null;
  value: string | null;
  updatedAt?: string | null;
}

export function VariablePage({ root, link, path }: { root: string; link: string; path: string }) {
  const found = useLoad<Variable>(`${root}/variable-values/${path}`);
  return (
    <Gate found={found} list={`${link}/variables`} noun="variable">
      {(one) => (
        <ObjectPage
          back={{ to: `${link}/variables`, label: "Variables" }}
          eyebrow="Variable"
          title={one.path}
          meta={
            <KeyValues
              rows={[
                ...(one.description ? [{ label: "What it is for", value: one.description }] : []),
                {
                  label: "Value here",
                  value:
                    one.value ?? (one.default !== null ? `The default: ${one.default}` : "Not set"),
                  mono: one.value !== null,
                },
                ...(one.default !== null
                  ? [{ label: "Default", value: one.default, mono: true }]
                  : []),
                ...(one.updatedAt ? [{ label: "Last set", value: when(one.updatedAt) }] : []),
              ]}
            />
          }
          tabs={[
            {
              id: "used-by",
              label: "Used by",
              content: <ReferenceList root={root} link={link} kind="variable" name={one.path} />,
            },
          ]}
        />
      )}
    </Gate>
  );
}

interface Secret {
  name: string;
  updatedAt: string;
  updatedBy?: string | null;
}

export function SecretPage({ root, link, name }: { root: string; link: string; name: string }) {
  const list = useLoad<{ items: Secret[] }>(`${root}/secrets`);
  const one = list.data?.items.find((secret) => secret.name === name);
  const found: Loaded<Secret> = {
    data: one,
    error: list.error ?? (list.data && !one ? { status: 404, message: "Not found" } : undefined),
  };
  return (
    <Gate found={found} list={`${link}/secrets`} noun="secret">
      {(secret) => (
        <ObjectPage
          back={{ to: `${link}/secrets`, label: "Secrets" }}
          eyebrow="Secret"
          title={secret.name}
          meta={
            <KeyValues
              rows={[
                { label: "Value", value: "Encrypted. It can be replaced, never read back here." },
                {
                  label: "Last set",
                  value: `${when(secret.updatedAt)}${secret.updatedBy ? ` by ${secret.updatedBy}` : ""}`,
                },
              ]}
            />
          }
          tabs={[
            {
              id: "used-by",
              label: "Used by",
              content: <ReferenceList root={root} link={link} kind="secret" name={secret.name} />,
            },
          ]}
        />
      )}
    </Gate>
  );
}

interface Resource {
  kind: string;
  path: string;
  ownership: string;
  version: number;
  body: { description?: string; schema?: unknown; payload?: unknown };
}

export function EventPage({ root, link, path }: { root: string; link: string; path: string }) {
  const found = useLoad<Resource>(`${root}/resources/${path}`);
  return (
    <Gate found={found} list={`${link}/events`} noun="event">
      {(one) => (
        <ObjectPage
          back={{ to: `${link}/events`, label: "Events" }}
          eyebrow="Event"
          title={one.path}
          actions={
            <Button onClick={() => navigate(`${link}/resources/edit/event/${one.path}`)}>
              Change its declaration
            </Button>
          }
          meta={
            <KeyValues
              rows={[
                ...(one.body.description
                  ? [{ label: "What it means", value: one.body.description }]
                  : []),
                { label: "Managed in", value: one.ownership === "code" ? "Repository" : "Console" },
                { label: "Version", value: String(one.version), mono: true },
              ]}
            />
          }
          tabs={[
            {
              id: "used-by",
              label: "Who listens and who sends",
              content: <ReferenceList root={root} link={link} kind="event" name={one.path} />,
            },
            {
              id: "payload",
              label: "Payload",
              content: (
                <JsonView
                  label="Its payload's schema"
                  value={one.body.schema ?? one.body.payload ?? null}
                />
              ),
            },
            {
              id: "recent",
              label: "Recent",
              content: (
                <Link to={`${link}/events?q=${encodeURIComponent(one.path)}`}>
                  See it in the event log
                </Link>
              ),
            },
          ]}
        />
      )}
    </Gate>
  );
}

interface ScriptSummary {
  path: string;
  description: string;
  ownership: string;
  lastRun: { id: string; state: import("../kit/status.tsx").RunState; createdAt: string } | null;
}
interface TriggerRow {
  path: string;
  node: string;
  type: string;
  script: string;
  targetKind: "script" | "flow";
  enabled: boolean;
  cron: string | null;
  timezone: string | null;
  nextFireAt: string | null;
  paused: { at: string } | null;
}

/** The triggers that start a script or a flow, each a link to its own. */
export function TriggersOf({
  root,
  link,
  kind,
  path,
}: {
  root: string;
  link: string;
  kind: "script" | "flow";
  path: string;
}) {
  const triggers = useLoad<{ items: TriggerRow[] }>(
    `${root}/triggers?${new URLSearchParams({ target: path })}`,
  );
  const rows = triggers.data?.items.filter(
    (one) => one.script === path && (one.targetKind ?? "script") === kind,
  );
  return (
    <DataTable<TriggerRow>
      variant="inset"
      label={`Triggers of ${path}`}
      rows={rows}
      rowKey={(one) => `${one.path}:${one.node}`}
      error={triggers.error?.message}
      onRetry={triggers.reload}
      onOpen={(one) => navigate(`${link}/triggers?trigger=${encodeURIComponent(one.path)}`)}
      empty={{ title: "Nothing starts it on its own", text: "It runs when started by hand." }}
      columns={[
        {
          header: "Trigger",
          cell: (one) => <ObjectLink link={link} kind="trigger" path={one.path} />,
        },
        { header: "Kind", cell: (one) => kindName(one.type) },
        {
          header: "When",
          cell: (one) =>
            one.paused ? (
              <span className="text-attention">Paused</span>
            ) : one.cron ? (
              <span>
                <Mono>{one.cron}</Mono>
                {one.timezone ? <span className="text-ink-muted"> {one.timezone}</span> : null}
                {one.nextFireAt ? (
                  <span className="text-ink-muted"> · next {fromNow(one.nextFireAt)}</span>
                ) : null}
              </span>
            ) : (
              <span className="text-ink-muted">When it is called</span>
            ),
        },
      ]}
    />
  );
}

interface SourceAtVersion {
  available: boolean;
  file: string | null;
  line: number | null;
  files: { path: string; content: string }[];
  bundleVersion: number | null;
}

/**
 * The code as a run ran it, read-only, with the line it failed on selected: or,
 * with no run named, as deployed now.
 */
function SourceAt({ root, link, path }: { root: string; link: string; path: string }) {
  const [run] = useUrlParam("run");
  const source = useLoad<SourceAtVersion>(
    `${root}/script-source/${path}${run ? `?run=${encodeURIComponent(run)}` : ""}`,
  );
  const insight = useLoad<{ location?: { file: string; line: number } | null }>(
    run ? `${root}/runs/${run}/insight` : null,
  );
  if (source.error) return <Notice tone="danger">{source.error.message}</Notice>;
  if (!source.data) return <p className="m-0 text-ink-muted">Loading…</p>;
  if (!source.data.available) {
    return (
      <p className="m-0 text-ink-muted">
        This version does not carry its source. A repository build that includes it shows it here.
      </p>
    );
  }
  const failedAt = insight.data?.location;
  const file =
    source.data.files.find((one) => one.path === (failedAt?.file ?? source.data?.file)) ??
    source.data.files[0];
  if (!file) return <p className="m-0 text-ink-muted">No source.</p>;
  return (
    <div className="flex flex-col gap-2">
      <p className="m-0 text-meta text-ink-muted">
        <Mono>{file.path}</Mono> at version {source.data.bundleVersion}
        {run ? (
          <>
            , as <Link to={`${link}/runs/${run}`}>the run</Link> ran it
            {failedAt ? `, failing on line ${failedAt.line}` : ""}
          </>
        ) : (
          ", as deployed now"
        )}
        . <Link to={`${link}/scripts/edit/${path}`}>Open the code to change it</Link>
      </p>
      <CodeEditor
        label={`Source of ${path} at version ${source.data.bundleVersion}`}
        path={`source/${path}@${source.data.bundleVersion}/${file.path}`}
        language="typescript"
        value={file.content}
        readOnly
        height="32rem"
        revealLine={failedAt?.line ?? source.data.line ?? undefined}
      />
    </div>
  );
}

export function ScriptPage({ root, link, path }: { root: string; link: string; path: string }) {
  const scripts = useLoad<{ items: ScriptSummary[] }>(`${root}/scripts`);
  const one = scripts.data?.items.find((script) => script.path === path);
  const found: Loaded<ScriptSummary> = {
    data: one,
    error:
      scripts.error ?? (scripts.data && !one ? { status: 404, message: "Not found" } : undefined),
  };
  return (
    <Gate found={found} list={`${link}/scripts`} noun="script">
      {(script) => (
        <ObjectPage
          back={{ to: `${link}/scripts`, label: "Scripts" }}
          eyebrow="Script"
          title={script.path}
          state={
            script.lastRun ? (
              <span className="flex items-center gap-2 text-meta text-ink-muted">
                Last run <StatePill state={script.lastRun.state} />
                <Link to={`${link}/runs/${script.lastRun.id}`}>
                  {fromNow(script.lastRun.createdAt)}
                </Link>
              </span>
            ) : (
              <span className="text-meta text-ink-muted">Not run yet</span>
            )
          }
          actions={
            <Button
              variant="primary"
              onClick={() => navigate(`${link}/scripts/edit/${script.path}`)}
            >
              Open the code
            </Button>
          }
          meta={
            script.description ? (
              <p className="m-0 max-w-[75ch] text-ink-muted">{script.description}</p>
            ) : null
          }
          tabs={[
            {
              id: "runs",
              label: "Runs",
              content: <RecentRuns root={root} link={link} path={script.path} />,
            },
            {
              id: "triggers",
              label: "Triggers",
              content: <TriggersOf root={root} link={link} kind="script" path={script.path} />,
            },
            {
              id: "used-by",
              label: "Used by",
              content: <ReferenceList root={root} link={link} kind="script" name={script.path} />,
            },
            {
              id: "source",
              label: "Source",
              content: <SourceAt root={root} link={link} path={script.path} />,
            },
          ]}
        />
      )}
    </Gate>
  );
}
