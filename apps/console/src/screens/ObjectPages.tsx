import { Button, Closing, JsonView } from "@volvel/ui";
import { FileCode2, ListChecks } from "lucide-react";
import { useState } from "react";
import { api, useLoad } from "../api.ts";
import { notify } from "../ask.tsx";
import { CodeEditor } from "../editor/CodeEditor.tsx";
import { AttachedPages, workspaceOf } from "../help/glossary.tsx";
import { Current } from "../kit/current.ts";
import { DataTable } from "../kit/DataTable.tsx";
import { ago } from "../kit/format.ts";
import { ErrorState, Loading, Pending } from "../kit/LoadState.tsx";
import { KeyValues } from "../kit/layout.tsx";
import { ObjectPage } from "../kit/ObjectPage.tsx";
import { kindName, ObjectLink, objectHref, triggerKey } from "../kit/objects.tsx";
import { ReferenceList } from "../kit/references.tsx";
import { SecretField } from "../kit/SecretField.tsx";
import { Mono, StatePill } from "../kit/status.tsx";
import { Time } from "../kit/Time.tsx";
import { when } from "../ListScreen.tsx";
import { Link, navigate, useUrlParam } from "../router.tsx";
import { RecentRuns } from "./Authoring.tsx";
import { CONNECTOR_NAMES, type ConnectionRow, ConnectionWizard } from "./ConnectionWizard.tsx";
import { ConnectionHealth, RunButton, TestConnection } from "./Execution.tsx";
import { NotFound } from "./NotFound.tsx";
import { type Trigger, TriggerState, useTriggerPause } from "./Operate.tsx";
import { NewScheduleSheet } from "./ScheduleForm.tsx";

/**
 * A page of its own for each thing a workspace holds that had only a row in a
 * list: a connection, a variable, a secret, an event, a script. Each can be
 * linked to, and each says what uses it.
 */

/** What a page loaded, or found in a list it loaded. */
interface Loaded<T> {
  data: T | undefined;
  error: { status?: number; message: string } | undefined;
  reload?: () => void;
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
  if (found.error) return <ErrorState error={found.error} onRetry={found.reload} />;
  if (!found.data) return <Loading />;
  return <>{children(found.data)}</>;
}

export function ConnectionPage({ root, link, path }: { root: string; link: string; path: string }) {
  const found = useLoad<ConnectionRow>(`${root}/connection-bindings/${path}`);
  // The same sheet the list opens, here on the page itself.
  const [editing, setEditing] = useState<ConnectionRow | null>(null);
  return (
    <Gate found={found} list={`${link}/connections`} noun="connection">
      {(one) => (
        <>
          <ObjectPage
            back={{ to: `${link}/connections`, label: "Connections" }}
            eyebrow="Connection"
            title={one.path}
            state={
              <>
                <StatePill state={one.bound ? "bound" : "unbound"}>
                  {one.bound ? "Set up here" : "Not set up here"}
                </StatePill>
                <ConnectionHealth root={root} row={one} />
              </>
            }
            actions={
              <>
                {one.bound && (!one.oauth || one.oauth.status === "connected") ? (
                  <TestConnection root={root} path={one.path} onDone={() => found.reload?.()} />
                ) : null}
                <Button onClick={() => setEditing(one)}>
                  {one.bound ? "Change where it points" : "Set up"}
                </Button>
              </>
            }
            meta={
              <KeyValues
                rows={[
                  {
                    label: "Kind",
                    value: CONNECTOR_NAMES[one.connector] ?? one.connector,
                  },
                  ...(one.description ? [{ label: "What it is for", value: one.description }] : []),
                  { label: "Credential", value: one.hasCredential ? "Set" : "None" },
                  {
                    label: "Declared",
                    value: one.defined
                      ? "Deployed"
                      : one.draft === "new"
                        ? "In a draft, never deployed"
                        : "Only set up here",
                  },
                  ...(one.oauth?.connectedAt
                    ? [{ label: "Connected", value: <Time value={one.oauth.connectedAt} /> }]
                    : []),
                  ...(one.updatedAt
                    ? [{ label: "Last changed", value: <Time value={one.updatedAt} /> }]
                    : []),
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
                content: (
                  <ReferenceList root={root} link={link} kind="connection" name={one.path} />
                ),
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
          <Closing subject={editing}>
            {(row, shown) => (
              <ConnectionWizard
                key={row.path}
                root={root}
                open={shown}
                row={row}
                rows={[row]}
                onClose={() => setEditing(null)}
                onSaved={() => found.reload?.()}
              />
            )}
          </Closing>
        </>
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
                ...(one.updatedAt
                  ? [{ label: "Last set", value: <Time value={one.updatedAt} /> }]
                  : []),
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

/** A secret's value, replaced here and never shown. */
function ReplaceSecret({
  root,
  secret,
  onSaved,
}: {
  root: string;
  secret: Secret;
  onSaved: () => void;
}) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="flex max-w-xl flex-col gap-3"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!value) return;
        setBusy(true);
        try {
          await api.put(`${root}/secrets/${encodeURIComponent(secret.name)}`, { value });
          notify.success(
            `Replaced the value of ${secret.name}. What uses it reads the new value from its next run.`,
          );
          setValue("");
          onSaved();
        } catch (error) {
          notify.error(error);
        } finally {
          setBusy(false);
        }
      }}
    >
      <SecretField
        label="Value"
        name="value"
        stored
        setAt={secret.updatedAt}
        setBy={secret.updatedBy}
        value={value}
        onChange={setValue}
      />
      {value ? (
        <Button type="submit" variant="primary" loading={busy} className="w-fit">
          Replace the value
        </Button>
      ) : null}
    </form>
  );
}

export function SecretPage({ root, link, name }: { root: string; link: string; name: string }) {
  const list = useLoad<{ items: Secret[] }>(`${root}/secrets`);
  const one = list.data?.items.find((secret) => secret.name === name);
  const found: Loaded<Secret> = {
    data: one,
    error: list.error ?? (list.data && !one ? { status: 404, message: "Not found" } : undefined),
    reload: list.reload,
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
              id: "value",
              label: "Value",
              content: <ReplaceSecret root={root} secret={secret} onSaved={list.reload} />,
            },
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
  inputSchema?: Record<string, unknown>;
  draft?: boolean;
  deployed?: boolean;
}
/** The triggers that start a script or a flow, each a link to its own. */
export function TriggersOf({
  root,
  link,
  kind,
  path,
  production = false,
}: {
  root: string;
  link: string;
  kind: "script" | "flow";
  path: string;
  /** In production a trigger is not drafted: the server refuses it, so it is not offered. */
  production?: boolean;
}) {
  const triggers = useLoad<{ items: Trigger[] }>(
    `${root}/triggers?${new URLSearchParams({ target: path })}`,
  );
  const rows = triggers.data?.items.filter(
    (one) => one.script === path && (one.targetKind ?? "script") === kind,
  );
  const [adding, setAdding] = useState(false);
  const listPath = `${root}/triggers?${new URLSearchParams({ target: path })}`;
  const { pause, resume } = useTriggerPause({ root, production, listPath });
  return (
    <div className="flex flex-col gap-3">
      {production ? (
        <p className="m-0 text-meta text-ink-muted">
          Triggers change in a dev workspace and reach production by promotion.
        </p>
      ) : (
        <div>
          <Button size="small" onClick={() => setAdding(true)}>
            Add a schedule
          </Button>
        </div>
      )}
      <Closing subject={adding}>
        {(_adding, shown) => (
          <NewScheduleSheet
            root={root}
            link={link}
            open={shown}
            target={{ kind, path }}
            onClose={() => {
              setAdding(false);
              triggers.reload();
            }}
          />
        )}
      </Closing>
      <DataTable<Trigger>
        actions={(one) => [
          ...(one.type === "schedule"
            ? [
                {
                  label: "Run it now",
                  onSelect: () =>
                    void api
                      .post<{ id: string }>(`${root}/schedule-firings`, {
                        path: one.path,
                        ...(one.node ? { node: one.node } : {}),
                      })
                      .then((started) => navigate(`${link}/runs/${started.id}`), notify.error),
                },
              ]
            : []),
          one.paused
            ? { label: "Resume", onSelect: () => void resume(one) }
            : { label: "Pause…", onSelect: () => void pause(one) },
        ]}
        variant="inset"
        label={`Triggers of ${path}`}
        rows={rows}
        rowKey={(one) => `${one.path}:${one.node}`}
        error={triggers.error}
        onRetry={triggers.reload}
        onOpen={(one) => navigate(objectHref(link, "trigger", triggerKey(one)))}
        empty={{ title: "Nothing starts it on its own", text: "It runs when started by hand." }}
        columns={[
          {
            header: "Trigger",
            cell: (one) => (
              <ObjectLink link={link} kind="trigger" path={triggerKey(one)}>
                {one.path}
              </ObjectLink>
            ),
          },
          { header: "Kind", cell: (one) => kindName(one.type) },
          {
            header: "State",
            cell: (one) => (
              <span className="flex flex-col">
                <TriggerState row={one} workspacePaused={false} />
                {one.cron ? (
                  <span className="text-meta text-ink-muted">
                    <Mono>{one.cron}</Mono>
                    {one.timezone ? ` ${one.timezone}` : ""}
                  </span>
                ) : null}
              </span>
            ),
          },
        ]}
      />
    </div>
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
  if (source.error) return <ErrorState error={source.error} onRetry={source.reload} />;
  if (!source.data) return <Pending of={source} />;
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

export function ScriptPage({
  root,
  link,
  path,
  production = false,
}: {
  root: string;
  link: string;
  path: string;
  production?: boolean;
}) {
  const scripts = useLoad<{ items: ScriptSummary[] }>(`${root}/scripts`);
  const one = scripts.data?.items.find((script) => script.path === path);
  const found: Loaded<ScriptSummary> = {
    data: one,
    error:
      scripts.error ?? (scripts.data && !one ? { status: 404, message: "Not found" } : undefined),
    reload: scripts.reload,
  };
  return (
    <Gate found={found} list={`${link}/scripts`} noun="script">
      {(script) => (
        <>
          <Current
            object={{
              heading: "This script",
              commands: [
                {
                  key: "edit",
                  label: "Open the code",
                  icon: FileCode2,
                  run: () => navigate(`${link}/scripts/edit/${script.path}`),
                },
                {
                  key: "runs",
                  label: "See its runs",
                  icon: ListChecks,
                  run: () => navigate(`${link}/runs?target=${encodeURIComponent(script.path)}`),
                },
              ],
              pin: {
                kind: "script",
                ref: script.path,
                id: script.path,
                workspaceId: root.split("/workspaces/")[1] ?? null,
                title: script.path,
              },
            }}
          />
          <ObjectPage
            back={{ to: `${link}/scripts`, label: "Scripts" }}
            eyebrow="Script"
            title={script.path}
            state={
              script.lastRun ? (
                <span className="flex items-center gap-2 text-meta text-ink-muted">
                  Last run <StatePill state={script.lastRun.state} />
                  <Link to={`${link}/runs/${script.lastRun.id}`}>
                    {ago(script.lastRun.createdAt)}
                  </Link>
                </span>
              ) : (
                <span className="text-meta text-ink-muted">Not run yet</span>
              )
            }
            actions={
              <>
                <RunButton
                  root={root}
                  script={script.path}
                  schema={script.inputSchema ?? {}}
                  runsLink={`${link}/runs`}
                  deployed={script.deployed !== false}
                  draft={script.draft === true}
                  size="regular"
                />
                <Button
                  variant="primary"
                  onClick={() => navigate(`${link}/scripts/edit/${script.path}`)}
                >
                  Open the code
                </Button>
              </>
            }
            meta={
              <span className="flex flex-col gap-1.5">
                {script.description ? (
                  <p className="m-0 max-w-measure text-ink-muted">{script.description}</p>
                ) : null}
                <AttachedPages {...workspaceOf(root)} kind="script" path={script.path} />
              </span>
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
                content: (
                  <TriggersOf
                    root={root}
                    link={link}
                    kind="script"
                    path={script.path}
                    production={production}
                  />
                ),
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
        </>
      )}
    </Gate>
  );
}
