import {
  Badge,
  type BadgeTone,
  Button,
  EmptyState,
  MultiSelectField,
  Notice,
  NumberField,
  type Option,
  SelectField,
  Table,
  Tabs,
  TextAreaField,
  TextField,
} from "@vynxlabs/ui";
import { useEffect, useState } from "react";
import { type ApiError, api, useLoad } from "../api.ts";
import { ask, failureText, notify } from "../ask.tsx";
import { CodeEditor } from "../editor/CodeEditor.tsx";
import { Page, when } from "../ListScreen.tsx";
import { Link, navigate } from "../router.tsx";
import { RunDetail } from "./Execution.tsx";
import { GitPanel } from "./Git.tsx";
import { isEditedKind } from "./ResourceEditor.tsx";

const STARTER = `import type { ScriptContext } from "@vynxlabs/sdk";

/** What runs. The input is checked against the schema under Settings before this is called. */
export default async function (input: { name?: string }, ctx: ScriptContext) {
  ctx.log.info("Started", { by: ctx.run.trigger.type });
  return { hello: input.name ?? "world" };
}
`;

const CONNECTOR_STARTER = `/**
 * Builds what a script is given for a connection of this kind: whatever the
 * outside system needs, as methods a script calls. \`config\` fits the schema
 * under Settings, and \`credential\` is the connection's secret, when it has one.
 */
export default (
  config: { baseUrl: string },
  credential: string | undefined,
  signal: AbortSignal,
) => ({
  async get(path: string): Promise<unknown> {
    const response = await fetch(new URL(path, config.baseUrl), {
      signal,
      headers: credential ? { authorization: \`Bearer \${credential}\` } : {},
    });
    if (!response.ok) throw new Error(\`GET \${path} answered \${response.status}.\`);
    return response.json();
  },
});
`;

const WEBHOOK_SOURCE_STARTER = `import type { ScriptContext, WebhookRequest, WebhookSourceResult } from "@vynxlabs/sdk";

/**
 * Handed each request to a webhook that names this source. What it returns
 * decides what starts: nothing, one run, or one for each of several inputs.
 */
export default async function (
  request: WebhookRequest,
  ctx: ScriptContext,
): Promise<WebhookSourceResult> {
  if (request.headers["x-example"] === undefined) {
    return { accept: false, reason: "The request has no x-example header." };
  }
  ctx.log.info("Let through");
  return { input: request.body };
}
`;

const POLL_SOURCE_STARTER = `import type { PollResult, PollTick, ScriptContext } from "@vynxlabs/sdk";

/**
 * Run on each tick of a schedule that names this source. It gives back what
 * is new, and a cursor: where to pick up from next time.
 */
export default async function (
  tick: PollTick<number>,
  ctx: ScriptContext,
): Promise<PollResult<number>> {
  const from = tick.cursor ?? 0;
  ctx.log.info("Looking for what is new", { from });
  return { items: [], cursor: from };
}
`;

/** The kinds of resource that are code, each written in the same editor. */
export type CodeKind = "script" | "connector" | "trigger_source";

interface ScriptBody {
  description?: string;
  /** A script's. */
  input?: unknown;
  output?: unknown;
  timeoutSeconds?: number;
  retries?: { limit: number; delaySeconds: number; backoff: boolean };
  uses?: {
    connections: string[];
    secrets: string[];
    variables: string[];
    [more: string]: string[];
  };
  /** A connector's: what a connection's configuration must fit. */
  configSchema?: unknown;
  /** A trigger source's: whether it takes a webhook's requests or a schedule's ticks. */
  mode?: "webhook" | "poll";
  source?: { language: "typescript"; code: string };
  [more: string]: unknown;
}

const NO_USES = { connections: [], secrets: [], variables: [] };

const CODE_KINDS: Record<
  CodeKind,
  {
    noun: string;
    /** Where its list is, and where its editor is, under the workspace. */
    list: string;
    edit: string;
    all: string;
    example: string;
    /** The field of the body that holds the schema edited as JSON, and what it is called. */
    schema?: { field: "input" | "configSchema"; label: string; hint: string };
    fresh: () => ScriptBody;
  }
> = {
  script: {
    noun: "script",
    list: "scripts",
    edit: "scripts/edit",
    all: "All scripts",
    example: "orders/sync",
    schema: {
      field: "input",
      label: "Input schema, as JSON Schema",
      hint: "What the script takes. A run with input that does not match is refused.",
    },
    fresh: () => NEW_BODY,
  },
  connector: {
    noun: "connector",
    list: "extensions",
    edit: "extensions/connector/edit",
    all: "All extensions",
    example: "connectors/shop",
    schema: {
      field: "configSchema",
      label: "What a connection is set up with, as JSON Schema",
      hint: "The form for a connection of this kind is drawn from this. The secret is not part of it.",
    },
    fresh: () => ({
      description: "",
      configSchema: {
        type: "object",
        properties: { baseUrl: { type: "string", title: "Address", format: "uri" } },
        required: ["baseUrl"],
        additionalProperties: false,
      },
      source: { language: "typescript", code: CONNECTOR_STARTER },
    }),
  },
  trigger_source: {
    noun: "trigger source",
    list: "extensions",
    edit: "extensions/trigger_source/edit",
    all: "All extensions",
    example: "sources/payments",
    fresh: () => ({
      description: "",
      mode: "webhook",
      timeoutSeconds: 30,
      uses: NO_USES,
      source: { language: "typescript", code: WEBHOOK_SOURCE_STARTER },
    }),
  },
};
const NEW_BODY: ScriptBody = {
  description: "",
  input: { type: "object", properties: { name: { type: "string" } } },
  output: { type: "object" },
  timeoutSeconds: 60,
  retries: { limit: 0, delaySeconds: 0, backoff: false },
  uses: { connections: [], secrets: [], variables: [] },
  source: { language: "typescript", code: STARTER },
};

interface DraftDetail {
  path: string;
  kind: string;
  revision: number;
  change: "create" | "update" | "delete" | "take_over";
  deleted: boolean;
  body: ScriptBody;
}
interface DraftRow extends Omit<DraftDetail, "body"> {
  updatedAt: string;
}

const PATH = /^[a-z0-9][a-z0-9_-]*(\/[a-z0-9][a-z0-9_-]*)*$/;

/** Reads the names a workspace offers for a script's `uses`. */
function useChoices(root: string, list: string, key: string): Option[] {
  const loaded = useLoad<{ items: Record<string, string>[] }>(`${root}/${list}`);
  return (loaded.data?.items ?? []).map((item) => ({
    value: item[key] as string,
    label: item[key] as string,
    ...(item.description ? { hint: item.description } : {}),
  }));
}

/**
 * Code written in the console: its source, its settings, and for a script a
 * way to try it. Saving makes a draft. Nothing that runs changes until the
 * draft is deployed. A connector and a trigger source are written the same way.
 */
export function ScriptEditor({
  root,
  link,
  path: opened,
  editable,
  kind = "script",
}: {
  root: string;
  link: string;
  /** The resource to open, or nothing for a new one. */
  path: string | undefined;
  /** False in a production workspace, where code is only read. */
  editable: boolean;
  kind?: CodeKind;
}) {
  const about = CODE_KINDS[kind];
  const uses = (of: ScriptBody) => of.uses ?? NO_USES;
  const [path, setPath] = useState(opened ?? "");
  const [body, setBody] = useState<ScriptBody>();
  const [revision, setRevision] = useState<number>();
  const [state, setState] = useState<"new" | "draft" | "deployed" | "repository">("new");
  const [dirty, setDirty] = useState(false);
  const [problem, setProblem] = useState<string>();
  const [fields, setFields] = useState<ApiError["fields"]>([]);
  const [busy, setBusy] = useState(false);
  const [schemaText, setSchemaText] = useState("");
  const [testInput, setTestInput] = useState("{}");
  const [testRun, setTestRun] = useState<string>();
  const connections = useChoices(root, "connection-bindings", "path");
  const secrets = useChoices(root, "secrets", "name");
  const variables = useChoices(root, "variable-values", "path");

  useEffect(() => {
    let current = true;
    const open = (next: ScriptBody, as: typeof state, at?: number) => {
      if (!current) return;
      setBody(next);
      setSchemaText(
        JSON.stringify((about.schema ? next[about.schema.field] : undefined) ?? {}, null, 2),
      );
      setState(as);
      setRevision(at);
    };
    if (!opened) {
      open(about.fresh(), "new");
      return;
    }
    (async () => {
      try {
        const draft = await api.get<DraftDetail>(`${root}/drafts/${opened}`);
        open(draft.body, "draft", draft.revision);
      } catch (error) {
        if ((error as ApiError).status !== 404) throw error;
        const resource = await api.get<{ ownership: string; body: ScriptBody }>(
          `${root}/resources/${opened}`,
        );
        open(resource.body, resource.ownership === "ui" ? "deployed" : "repository");
      }
    })().catch((error) => current && setProblem(failureText(error)));
    return () => {
      current = false;
    };
  }, [root, opened, about]);

  if (problem && !body) return <Notice tone="danger">{problem}</Notice>;
  if (!body) return <p className="text-ink-muted">Loading…</p>;

  const fromRepository = state === "repository" && !body.source;
  /** A step that comes with the platform. It is the platform's to change. */
  const core = (opened ?? "").startsWith("core/");
  const readOnly = !editable || fromRepository || core;
  const change = (next: Partial<ScriptBody>) => {
    setBody({ ...body, ...next });
    setDirty(true);
  };
  const fieldError = (pointer: string) =>
    fields.find((field) => field.path.startsWith(pointer))?.message;

  const save = async (): Promise<boolean> => {
    setProblem(undefined);
    setFields([]);
    if (!PATH.test(path)) {
      setProblem(
        `Give the ${about.noun} a path: lowercase letters, digits, hyphens and underscores, in folders. For example ${about.example}.`,
      );
      return false;
    }
    let schema: unknown;
    try {
      schema = about.schema ? JSON.parse(schemaText) : undefined;
    } catch {
      setProblem("The schema is not valid JSON.");
      return false;
    }
    setBusy(true);
    try {
      const saved = await api.put<DraftDetail>(`${root}/drafts/${path}`, {
        kind,
        schemaVersion: 1,
        body: about.schema ? { ...body, [about.schema.field]: schema } : body,
        ...(revision ? { revision } : {}),
      });
      setBody(saved.body);
      setRevision(saved.revision);
      setState("draft");
      setDirty(false);
      if (!opened) navigate(`${link}/${about.edit}/${path}`, { replace: true });
      return true;
    } catch (error) {
      setProblem(failureText(error));
      setFields((error as ApiError).fields ?? []);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    let input: unknown;
    try {
      input = JSON.parse(testInput);
    } catch {
      setProblem("The test input is not valid JSON.");
      return;
    }
    if ((dirty || state === "new") && !(await save())) return;
    setBusy(true);
    try {
      const started = await api.post<{ runId: string }>(`${root}/test-runs`, {
        script: path,
        input,
      });
      setTestRun(started.runId);
    } catch (error) {
      setProblem(failureText(error));
    } finally {
      setBusy(false);
    }
  };

  const STATE: Record<typeof state, [BadgeTone, string]> = {
    new: ["neutral", "Not saved"],
    draft: ["attention", "Draft"],
    deployed: ["success", "Deployed"],
    repository: ["action", "From the repository"],
  };

  const settings = (
    <div className="flex flex-col gap-3">
      <TextField
        name="description"
        label="What it does"
        value={body.description ?? ""}
        required={false}
        disabled={readOnly}
        onChange={(description) => change({ description })}
      />
      {kind === "trigger_source" ? (
        <SelectField
          name="mode"
          label="It is handed"
          value={body.mode ?? "webhook"}
          disabled={readOnly}
          options={[
            { value: "webhook", label: "Each request to a webhook" },
            { value: "poll", label: "Each tick of a schedule" },
          ]}
          hint="A webhook or a schedule names the source, and must be of the kind it takes."
          onChange={(mode) => {
            // A source nobody has written in yet gets the starting point for what it now takes.
            const code = body.source?.code;
            const untouched = code === WEBHOOK_SOURCE_STARTER || code === POLL_SOURCE_STARTER;
            change({
              mode: mode === "poll" ? "poll" : "webhook",
              ...(untouched
                ? {
                    source: {
                      language: "typescript",
                      code: mode === "poll" ? POLL_SOURCE_STARTER : WEBHOOK_SOURCE_STARTER,
                    },
                  }
                : {}),
            });
          }}
        />
      ) : null}
      {kind === "connector" ? null : (
        <div className="grid grid-cols-2 gap-3">
          <NumberField
            name="timeout"
            label="Give up after (seconds)"
            value={body.timeoutSeconds}
            min={1}
            max={kind === "script" ? 3600 : 300}
            disabled={readOnly}
            error={fieldError("/body/timeoutSeconds")}
            onChange={(value) => change({ timeoutSeconds: value ?? (kind === "script" ? 60 : 30) })}
          />
          {body.retries ? (
            <NumberField
              name="retries"
              label="Try again (times)"
              value={body.retries.limit}
              min={0}
              max={10}
              disabled={readOnly}
              onChange={(value) =>
                change({
                  retries: {
                    delaySeconds: 0,
                    backoff: false,
                    ...body.retries,
                    limit: value ?? 0,
                  },
                })
              }
            />
          ) : null}
        </div>
      )}
      {kind === "connector" ? null : (
        <>
          <MultiSelectField
            label="Connections it uses"
            options={connections}
            value={uses(body).connections}
            disabled={readOnly}
            placeholder="None"
            hint={`A ${about.noun} reaches only what it names here.`}
            onChange={(value) => change({ uses: { ...uses(body), connections: value } })}
          />
          <MultiSelectField
            label="Secrets it reads"
            options={secrets}
            value={uses(body).secrets}
            disabled={readOnly}
            placeholder="None"
            onChange={(value) => change({ uses: { ...uses(body), secrets: value } })}
          />
          <MultiSelectField
            label="Variables it reads"
            options={variables}
            value={uses(body).variables}
            disabled={readOnly}
            placeholder="None"
            onChange={(value) => change({ uses: { ...uses(body), variables: value } })}
          />
        </>
      )}
      {about.schema ? (
        <TextAreaField
          name="schema"
          label={about.schema.label}
          value={schemaText}
          rows={kind === "connector" ? 14 : 7}
          disabled={readOnly}
          hint={about.schema.hint}
          error={fieldError(`/body/${about.schema.field}`)}
          onChange={(text) => {
            setSchemaText(text);
            setDirty(true);
          }}
        />
      ) : null}
      {kind === "trigger_source" ? (
        <p className="m-0 text-[13px] text-ink-muted">
          Nobody starts a trigger source by hand. To try it, deploy it and name it in a webhook or a
          schedule.
        </p>
      ) : null}
      {kind === "connector" ? (
        <p className="m-0 text-[13px] text-ink-muted">
          A connection names this connector by its path. To try it, deploy it, set up a connection
          of this kind, and use the connection from a script.
        </p>
      ) : null}
    </div>
  );

  const trying = (
    <div className="flex flex-col gap-3">
      <TextAreaField
        name="test"
        label="Input, as JSON"
        value={testInput}
        rows={5}
        onChange={setTestInput}
      />
      <div>
        <Button variant="primary" disabled={busy || readOnly} onClick={test}>
          {dirty || state === "new" ? "Save and run" : "Run the draft"}
        </Button>
      </div>
      <p className="m-0 text-[13px] text-ink-muted">
        Runs the script as its draft has it, on a worker, without deploying anything.
      </p>
    </div>
  );

  return (
    <section className="flex flex-col gap-4">
      <Link to={`${link}/${about.list}`} className="text-[13px] text-action">
        {about.all}
      </Link>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          {opened ? (
            <h1 className="m-0 truncate font-mono text-lg font-semibold">{path}</h1>
          ) : (
            <div className="w-72">
              <TextField
                name="path"
                label="Path"
                value={path}
                placeholder={about.example}
                hint="Its name in this workspace. It cannot be changed later."
                onChange={setPath}
              />
            </div>
          )}
          <Badge tone={STATE[state][0]}>{STATE[state][1]}</Badge>
          {dirty ? <Badge>Unsaved changes</Badge> : null}
        </div>
        {readOnly ? null : (
          <div className="flex items-center gap-2">
            {state === "draft" && opened ? (
              <Button
                variant="danger"
                disabled={busy}
                onClick={async () => {
                  const sure = await ask.confirm({
                    title: "Discard this draft?",
                    text: `The ${about.noun} goes back to how it was last deployed. One that was never deployed is gone.`,
                    action: "Discard",
                    danger: true,
                  });
                  if (!sure) return;
                  await api
                    .delete(`${root}/drafts/${opened}`)
                    .then(() => navigate(`${link}/${about.list}`), notify.error);
                }}
              >
                Discard draft
              </Button>
            ) : null}
            <Button variant="primary" disabled={busy || (!dirty && state !== "new")} onClick={save}>
              Save draft
            </Button>
            {state === "draft" && !dirty ? (
              <Link to={`${link}/changes`} className="text-action">
                Review and deploy
              </Link>
            ) : null}
          </div>
        )}
      </header>
      {core ? (
        <Notice tone="plain">
          This step comes with the platform, and is added to the workspace because a flow uses it.
          It can be read here and not changed. To do something else, write a script of your own and
          give it a label, and it joins the flow editor's steps.
        </Notice>
      ) : !editable ? (
        <Notice tone="attention">
          This is a production workspace. Code is edited in a dev workspace and reaches production
          by promotion.
        </Notice>
      ) : fromRepository ? (
        <Notice tone="attention">
          This {about.noun} is managed in the tenant's repository, and its source is not kept here.
          Change it there, or write one of the same path here to take it over.
        </Notice>
      ) : state === "repository" ? (
        <Notice tone="attention">
          Saving a draft of this {about.noun} takes it over from the repository.
        </Notice>
      ) : null}
      {problem ? <Notice tone="danger">{problem}</Notice> : null}
      <div className="grid gap-4 xl:grid-cols-[1fr_22rem]">
        <div className="min-w-0">
          {fromRepository ? (
            <EmptyState title="The source is in the repository" />
          ) : (
            <CodeEditor
              label={`Source of ${path || `the new ${about.noun}`}`}
              path={`${about.list}/${kind}/${opened ?? "new"}.ts`}
              language="typescript"
              value={body.source?.code ?? ""}
              readOnly={readOnly}
              height="34rem"
              onChange={(code) => {
                if (code === body.source?.code) return;
                change({ source: { language: "typescript", code } });
              }}
            />
          )}
        </div>
        <div className="min-w-0 rounded-panel border border-line bg-surface p-4">
          <Tabs
            label="Beside the source"
            tabs={[
              { id: "settings", label: "Settings", content: settings },
              ...(kind === "script" ? [{ id: "try", label: "Try it", content: trying }] : []),
            ]}
          />
        </div>
      </div>
      {testRun ? (
        <RunDetail key={testRun} root={root} runId={testRun} backLink={`${link}/runs`} />
      ) : null}
    </section>
  );
}

const CHANGE: Record<DraftRow["change"], [BadgeTone, string]> = {
  create: ["success", "New"],
  update: ["attention", "Changed"],
  delete: ["danger", "Removed"],
  take_over: ["action", "Taken over from the repository"],
};

interface Preview {
  possible: boolean;
  refusal: { code: string; detail: string; errors: { path: string; message: string }[] } | null;
  summary: {
    created: number;
    updated: number;
    deleted: number;
    data: string[];
    changes: { change: string; kind: string; path: string }[];
  } | null;
}

/** The drafts of a workspace, what deploying them would do, and the button that does it. */
export function Changes({
  root,
  link,
  editable,
}: {
  root: string;
  link: string;
  editable: boolean;
}) {
  const drafts = useLoad<{ items: DraftRow[] }>(`${root}/drafts`);
  const count = drafts.data?.items.length ?? 0;
  const preview = useLoad<Preview>(count > 0 ? `${root}/changes/preview` : null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string>();

  if (!editable) {
    return (
      <Page title="Changes" description="What has been saved in the console and not yet deployed.">
        <Notice tone="attention">
          A production workspace has no drafts. Change a dev workspace, then promote it.
        </Notice>
      </Page>
    );
  }
  const reload = () => {
    drafts.reload();
    preview.reload();
  };
  const editLink = (row: DraftRow) =>
    row.deleted
      ? undefined
      : row.kind === "script" || row.kind === "connector" || row.kind === "trigger_source"
        ? `${link}/${CODE_KINDS[row.kind].edit}/${row.path}`
        : row.kind === "flow"
          ? `${link}/flows/edit/${row.path}`
          : isEditedKind(row.kind)
            ? `${link}/resources/edit/${row.kind}/${row.path}`
            : undefined;

  return (
    <Page
      title="Changes"
      description="What has been saved in the console and not yet deployed. Nothing here runs until you deploy it."
    >
      {drafts.error ? <Notice tone="danger">{drafts.error.message}</Notice> : null}
      {done ? <Notice tone="success">{done}</Notice> : null}
      {drafts.data ? (
        <Table
          rows={drafts.data.items}
          rowKey={(row) => row.path}
          empty={
            <EmptyState title="Nothing waiting to be deployed">
              Save a script or another resource in this workspace and it appears here.
            </EmptyState>
          }
          columns={[
            {
              header: "Resource",
              cell: (row) => {
                const to = editLink(row);
                return to ? (
                  <Link to={to} className="font-mono text-[13px] text-action">
                    {row.path}
                  </Link>
                ) : (
                  <code className="font-mono text-[13px]">{row.path}</code>
                );
              },
            },
            { header: "Kind", cell: (row) => row.kind },
            {
              header: "Change",
              cell: (row) => <Badge tone={CHANGE[row.change][0]}>{CHANGE[row.change][1]}</Badge>,
            },
            {
              header: "Saved",
              cell: (row) => <span className="text-ink-muted">{when(row.updatedAt)}</span>,
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
                      title: `Discard the draft of ${row.path}?`,
                      text: "It goes back to how it was last deployed.",
                      action: "Discard",
                      danger: true,
                    });
                    if (!sure) return;
                    await api.delete(`${root}/drafts/${row.path}`).then(reload, notify.error);
                  }}
                >
                  Discard
                </Button>
              ),
            },
          ]}
        />
      ) : (
        <p className="text-ink-muted">Loading…</p>
      )}
      {count > 0 ? (
        <section className="flex flex-col gap-3 rounded-panel border border-line bg-surface p-4">
          <h2 className="m-0 text-base font-semibold">Deploy</h2>
          {preview.error ? <Notice tone="danger">{preview.error.message}</Notice> : null}
          {preview.data?.refusal ? (
            <Notice tone="danger">
              <strong>These changes cannot be deployed yet.</strong> {preview.data.refusal.detail}
              <ul className="mt-2 mb-0 pl-5">
                {preview.data.refusal.errors.map((error) => (
                  <li key={`${error.path} ${error.message}`}>
                    <code className="font-mono text-[13px]">{error.path}</code> {error.message}
                  </li>
                ))}
              </ul>
            </Notice>
          ) : preview.data?.summary ? (
            <p className="m-0 text-ink-muted">
              Deploying creates {preview.data.summary.created}, changes{" "}
              {preview.data.summary.updated} and removes {preview.data.summary.deleted}.
              {preview.data.summary.data.length > 0
                ? ` ${preview.data.summary.data.join(" ")}`
                : ""}
            </p>
          ) : (
            <p className="m-0 text-ink-muted">Checking what a deploy would do…</p>
          )}
          <TextField
            name="message"
            label="What changed"
            value={message}
            required={false}
            placeholder="Send large orders for approval"
            hint="Kept with the deployment, and used as the commit message when the workspace is connected to a repository."
            onChange={setMessage}
          />
          <div>
            <Button
              variant="primary"
              disabled={busy || !preview.data?.possible}
              onClick={async () => {
                setBusy(true);
                try {
                  const result = await api.post<{ bundleVersion: number; applied: string[] }>(
                    `${root}/changes/deploy`,
                    message ? { message } : {},
                  );
                  setDone(
                    `Deployed as version ${result.bundleVersion}: ${result.applied.join(", ")}.`,
                  );
                  setMessage("");
                  drafts.reload();
                } catch (error) {
                  notify.error(error);
                  preview.reload();
                } finally {
                  setBusy(false);
                }
              }}
            >
              Deploy {count} {count === 1 ? "change" : "changes"}
            </Button>
          </div>
        </section>
      ) : null}
      <GitPanel
        root={root}
        tenantLink={link.split("/workspaces/")[0] as string}
        onPulled={drafts.reload}
        key={done}
      />
    </Page>
  );
}

interface ExtensionRow {
  path: string;
  kind: CodeKind;
  description: string;
  detail: string;
  state: "deployed" | "draft" | "repository";
}

/**
 * The workspace's own connectors and trigger sources: the code that lets
 * connections and triggers reach outside systems the platform does not know.
 */
export function Extensions({
  root,
  link,
  editable,
}: {
  root: string;
  link: string;
  /** Whether code can be written here: true in a dev workspace. */
  editable: boolean;
}) {
  const resources = useLoad<{
    items: {
      path: string;
      kind: string;
      ownership: "code" | "ui";
      body: { description?: string; mode?: string };
    }[];
  }>(`${root}/resources`);
  const drafts = useLoad<{ items: DraftRow[] }>(`${root}/drafts`);
  const isExtension = (kind: string): kind is "connector" | "trigger_source" =>
    kind === "connector" || kind === "trigger_source";
  const rows = new Map<string, ExtensionRow>();
  for (const one of resources.data?.items ?? []) {
    if (!isExtension(one.kind)) continue;
    rows.set(one.path, {
      path: one.path,
      kind: one.kind,
      description: one.body.description ?? "",
      detail:
        one.kind === "connector"
          ? "Connector"
          : `Trigger source for ${one.body.mode === "poll" ? "a schedule" : "a webhook"}`,
      state: one.ownership === "ui" ? "deployed" : "repository",
    });
  }
  for (const draft of drafts.data?.items ?? []) {
    if (!isExtension(draft.kind) || draft.deleted) continue;
    const known = rows.get(draft.path);
    rows.set(draft.path, {
      path: draft.path,
      kind: draft.kind,
      description: known?.description ?? "",
      detail: known?.detail ?? (draft.kind === "connector" ? "Connector" : "Trigger source"),
      state: "draft",
    });
  }
  const STATE: Record<ExtensionRow["state"], [BadgeTone, string]> = {
    draft: ["attention", "Draft"],
    deployed: ["success", "Deployed"],
    repository: ["action", "From the repository"],
  };
  const error = resources.error ?? drafts.error;
  return (
    <Page
      title="Extensions"
      description="Connectors and trigger sources of this workspace's own. A connector says how a kind of connection reaches an outside system. A trigger source stands between the outside and what a trigger starts."
      action={
        editable ? (
          <span className="flex gap-2">
            <Button onClick={() => navigate(`${link}/extensions/trigger_source/new`)}>
              New trigger source
            </Button>
            <Button variant="primary" onClick={() => navigate(`${link}/extensions/connector/new`)}>
              New connector
            </Button>
          </span>
        ) : undefined
      }
    >
      {error ? <Notice tone="danger">{error.message}</Notice> : null}
      {resources.data && drafts.data ? (
        <Table
          rows={[...rows.values()].sort((a, b) => a.path.localeCompare(b.path))}
          rowKey={(row) => row.path}
          empty={
            <EmptyState title="No extensions yet">
              HTTP and mail connections need none. Write a connector when an outside system wants
              more than an address and a key, and a trigger source when a sender signs its requests
              in a way of its own, or has to be asked what is new.
            </EmptyState>
          }
          columns={[
            {
              header: "Extension",
              cell: (row) => (
                <Link
                  to={`${link}/${CODE_KINDS[row.kind].edit}/${row.path}`}
                  className="font-mono text-[13px] text-action"
                >
                  {row.path}
                </Link>
              ),
            },
            { header: "What it is", cell: (row) => row.detail },
            {
              header: "What it does",
              cell: (row) => <span className="text-ink-muted">{row.description}</span>,
            },
            {
              header: "State",
              cell: (row) => <Badge tone={STATE[row.state][0]}>{STATE[row.state][1]}</Badge>,
            },
          ]}
        />
      ) : error ? null : (
        <p className="text-ink-muted">Loading…</p>
      )}
    </Page>
  );
}
