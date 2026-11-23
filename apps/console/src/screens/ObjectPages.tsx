import { Button, Closing, JsonView } from "@volvel/ui";
import { FileCode2, ListChecks } from "lucide-react";
import { useState } from "react";
import { api, useLoad } from "../api.ts";
import { notify } from "../ask.tsx";
import { CodeEditor } from "../editor/CodeEditor.tsx";
import { AttachedPages, workspaceOf } from "../help/glossary.tsx";
import { useMay, useNeeds } from "../kit/Can.tsx";
import { Current } from "../kit/current.ts";
import { DataTable } from "../kit/DataTable.tsx";
import { ago } from "../kit/format.ts";
import { ErrorState, Loading, Pending } from "../kit/LoadState.tsx";
import { KeyValues } from "../kit/layout.tsx";
import { ObjectPage } from "../kit/ObjectPage.tsx";
import { kindName, ObjectLink, objectHref, triggerKey } from "../kit/objects.tsx";
import { ReferenceList, useReferences, usersOf } from "../kit/references.tsx";
import { SecretField } from "../kit/SecretField.tsx";
import { Mono, StatePill } from "../kit/status.tsx";
import { Time } from "../kit/Time.tsx";
import { RemoveButton, when } from "../ListScreen.tsx";
import { Link, navigate, TEXT_LINK, useUrlParam } from "../router.tsx";
import { RecentRuns } from "./Authoring.tsx";
import { CONNECTOR_NAMES, type ConnectionRow, ConnectionWizard } from "./ConnectionWizard.tsx";
import { ConnectionHealth, RunButton, TestConnection } from "./Execution.tsx";
import { NotFound } from "./NotFound.tsx";
import { type Trigger, TriggerState, useTriggerPause } from "./Operate.tsx";
import { PublishEventButton } from "./PublishEvent.tsx";
import { NewScheduleSheet } from "./ScheduleForm.tsx";
import { VariableSheet } from "./VariableSheet.tsx";

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
  const uses = useReferences(root, "connection");
  const may = useMay(root, "connection:write", "run:read");
  const mayWrite = may("connection:write");
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
                <StatePill state={one.bound ? "bound" : "unbound"} />
                <ConnectionHealth root={root} row={one} mayConnect={mayWrite} />
              </>
            }
            actions={
              <>
                {one.bound &&
                (!one.oauth || one.oauth.status === "connected") &&
                may("run:read") &&
                mayWrite ? (
                  <TestConnection root={root} path={one.path} onDone={() => found.reload?.()} />
                ) : null}
                {mayWrite ? (
                  <Button onClick={() => setEditing(one)}>
                    {one.bound ? "Change where it points" : "Set up"}
                  </Button>
                ) : null}
                {one.bound && mayWrite ? (
                  <RemoveButton
                    label="Unbind"
                    confirm={`Unbind ${one.path}? Scripts that use it will fail until it is bound again.`}
                    affected={usersOf(uses(one.path))}
                    usesUnread={uses.failed || !uses.loaded}
                    run={() => api.delete(`${root}/connection-bindings/${one.path}`)}
                    onDone={() => found.reload?.()}
                  />
                ) : null}
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
  const [editing, setEditing] = useState<Variable | null>(null);
  const mayWrite = useMay(root, "variable:write")("variable:write");
  return (
    <Gate found={found} list={`${link}/variables`} noun="variable">
      {(one) => (
        <>
          <ObjectPage
            back={{ to: `${link}/variables`, label: "Variables" }}
            eyebrow="Variable"
            title={one.path}
            actions={
              mayWrite ? (
                <Button onClick={() => setEditing(one)}>
                  {one.value !== null ? "Change value" : "Set value"}
                </Button>
              ) : null
            }
            meta={
              <KeyValues
                rows={[
                  ...(one.description ? [{ label: "What it is for", value: one.description }] : []),
                  {
                    label: "Value here",
                    value:
                      one.value === ""
                        ? "Empty"
                        : (one.value ??
                          (one.default !== null ? `The default: ${one.default}` : "Not set")),
                    mono: one.value !== null && one.value !== "",
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
          <Closing subject={editing}>
            {(variable, shown) => (
              <VariableSheet
                root={root}
                variable={variable}
                open={shown}
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
  const mayReplace = useMay(root, "secret:write")("secret:write");
  if (!mayReplace) {
    return (
      <p className="m-0 max-w-xl text-ink-muted">
        Replacing the value needs the secret:write permission: ask an administrator of this
        workspace.
      </p>
    );
  }
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

export function EventPage({
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
  const found = useLoad<Resource>(`${root}/resources/${path}`);
  const may = useNeeds({ base: root, permission: "resource:write", what: "this event" });
  const mayPublish = useNeeds({
    base: root,
    permission: "event:write",
    what: "this event",
    resource: { kind: "event", path },
  });
  return (
    <Gate found={found} list={`${link}/events`} noun="event">
      {(one) => (
        <ObjectPage
          back={{ to: `${link}/events`, label: "Events" }}
          eyebrow="Event"
          title={one.path}
          actions={
            <>
              <fieldset disabled={!mayPublish.can} className="contents">
                <PublishEventButton
                  root={root}
                  production={production}
                  event={one.path}
                  label="Publish it"
                />
              </fieldset>
              <Button
                disabled={!may.can}
                {...(may.reason ? { tooltip: may.reason } : {})}
                onClick={() => navigate(`${link}/resources/edit/event/${one.path}`)}
              >
                Change its declaration
              </Button>
            </>
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
                <Link
                  to={`${link}/events?name=${encodeURIComponent(one.path)}`}
                  className={TEXT_LINK}
                >
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
  const may = useNeeds({ base: root, permission: "resource:write", what: "its triggers" });
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
          <Button
            size="small"
            disabled={!may.can}
            {...(may.reason ? { tooltip: may.reason } : {})}
            onClick={() => setAdding(true)}
          >
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
          // A schedule that is turned off may be run to try it; one that is held may not.
          ...(one.type === "schedule" && !one.paused && !one.pausedBy
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
                <TriggerState row={one} />
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
  const mayRun = useNeeds({
    base: root,
    permission: "run:write",
    what: "this script",
    resource: { kind: "script", path },
  });
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
                <fieldset disabled={!mayRun.can} className="contents" title={mayRun.reason}>
                  <RunButton
                    root={root}
                    script={script.path}
                    schema={script.inputSchema ?? {}}
                    runsLink={`${link}/runs`}
                    deployed={script.deployed !== false}
                    draft={script.draft === true}
                    size="regular"
                  />
                </fieldset>
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
                id: "settings",
                label: "Settings",
                content: <ScriptSettings root={root} link={link} path={script.path} />,
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

interface ScriptSettingsBody {
  timeoutSeconds?: number;
  memoryMb?: number;
  concurrency?: number | { key: string; limit: number };
  worker?: string;
  onFailure?: { script?: string; notify?: string };
  retries?: { limit: number; delaySeconds: number; backoff: boolean };
  uses?: Record<string, string[] | undefined>;
}

/** What a script runs with, as the editor's Settings set it: read here, changed in the editor. */
function ScriptSettings({ root, link, path }: { root: string; link: string; path: string }) {
  const found = useLoad<{ kind: string; body: ScriptSettingsBody }>(`${root}/resources/${path}`);
  if (found.error) {
    return (
      <ErrorState what="the settings of this script" error={found.error} onRetry={found.reload} />
    );
  }
  if (!found.data) return <Loading />;
  const body = found.data.body;
  const list = (names: string[] | undefined) =>
    names && names.length > 0 ? names.join(", ") : undefined;
  const concurrency =
    typeof body.concurrency === "object"
      ? `${body.concurrency.limit} for each value of ${body.concurrency.key}`
      : body.concurrency !== undefined
        ? String(body.concurrency)
        : undefined;
  const rows: { label: string; value: string | undefined; mono?: boolean }[] = [
    {
      label: "Stops after",
      value: body.timeoutSeconds !== undefined ? `${body.timeoutSeconds} seconds` : undefined,
    },
    {
      label: "Tries again",
      value: body.retries
        ? `${body.retries.limit} time${body.retries.limit === 1 ? "" : "s"}, ${body.retries.delaySeconds} seconds apart${body.retries.backoff ? ", waiting longer each time" : ""}`
        : undefined,
    },
    { label: "Memory", value: body.memoryMb !== undefined ? `${body.memoryMb} MB` : undefined },
    { label: "Runs at once", value: concurrency },
    { label: "Worker pool", value: body.worker },
    { label: "Connections", value: list(body.uses?.connections) },
    { label: "Secrets", value: list(body.uses?.secrets) },
    { label: "Variables", value: list(body.uses?.variables) },
    { label: "Tables", value: list(body.uses?.tables) },
    { label: "Data sources", value: list(body.uses?.sources) },
    { label: "Events it may publish", value: list(body.uses?.events) },
    { label: "Connection groups", value: list(body.uses?.connectionGroups) },
    { label: "Starts, when it fails for the last time", value: body.onFailure?.script },
    {
      label: "Sends a summary through, when it fails for the last time",
      value: body.onFailure?.notify,
    },
  ];
  const set = rows.filter((row) => row.value !== undefined);
  return (
    <div className="flex max-w-2xl flex-col gap-3">
      {set.length === 0 ? (
        <p className="m-0 text-ink-muted">
          Nothing is set: it runs with the workspace's defaults and uses nothing it has not been
          given.
        </p>
      ) : (
        <KeyValues rows={set.map((row) => ({ label: row.label, value: row.value }))} />
      )}
      <p className="m-0 text-meta text-ink-subtle">
        These are changed in the editor's Settings.{" "}
        <Link to={`${link}/scripts/edit/${path}`}>Open the code</Link>
      </p>
    </div>
  );
}
