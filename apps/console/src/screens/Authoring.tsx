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
  Tabs,
  TextAreaField,
  TextField,
} from "@vynxlabs/ui";
import { useEffect, useRef, useState } from "react";
import { type ApiError, api, useLoad } from "../api.ts";
import { ask, failureText, notify } from "../ask.tsx";
import { CodeEditor, type Marker } from "../editor/CodeEditor.tsx";
import { InputForm } from "../InputDialog.tsx";
import { DataTable } from "../kit/DataTable.tsx";
import { Elapsed } from "../kit/Elapsed.tsx";
import { clearRecovery, useKeptCopy, useRecoveryCopy } from "../kit/recovery.ts";
import { SplitPane } from "../kit/SplitPane.tsx";
import { type RunState, StatePill } from "../kit/status.tsx";
import { Page } from "../ListScreen.tsx";
import { Link, navigate, useNavigationGuard } from "../router.tsx";
import { useTaskEnd } from "../tasks.ts";
import { OfferButton } from "./OfferToAgent.tsx";
import { fromNow } from "./Overview.tsx";
import { ScriptRunPanel } from "./Runs.tsx";

const STARTER = `import { type ScriptContext, z } from "@vynxlabs/sdk";

/** What it takes. Saving reads it, so a run's input is checked against it, and forms ask for it. */
export const input = z.object({
  name: z.string().describe("Who to greet"),
});

/** What runs. */
export default async function (given: z.infer<typeof input>, ctx: ScriptContext) {
  ctx.log.info("Started", { by: ctx.run.trigger.type });
  return { hello: given.name };
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
  /** `code` when the input and output were read from the script's own exports. */
  schemaSource?: "code";
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
  /** For a script: the task in which a worker reads its schemas from the code. */
  schemaTaskId?: string;
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
  // The last input it was tried with, kept while the editor is open.
  const [testInput, setTestInput] = useState<unknown>({});
  const [testRun, setTestRun] = useState<string>();
  // The test pane's tab, and the run's own tab, stay as chosen from one run to the next.
  const [paneTab, setPaneTab] = useKeptChoice("vx-editor-pane", "result");
  const [runTab, setRunTab] = useKeptChoice("vx-editor-run", "logs");
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [buildIssues, setBuildIssues] = useState<{ file: string; line: number; message: string }[]>(
    [],
  );
  const [reveal, setReveal] = useState<{ line: number; column?: number; at: number }>();
  const [reading, setReading] = useState<string>();
  const [readingFailed, setReadingFailed] = useState<string>();
  const connections = useChoices(root, "connection-bindings", "path");
  const secrets = useChoices(root, "secrets", "name");
  const variables = useChoices(root, "variable-values", "path");
  const schemaReading = useTaskEnd(root, reading, (task) => {
    setReading(undefined);
    if (task.status === "failed") {
      setReadingFailed(task.error?.message ?? "The worker could not read it.");
      return;
    }
    // What the worker read is on the draft now, if nobody saved since.
    void api
      .get<DraftDetail>(`${root}/drafts/${path}`)
      .then((draft) => {
        if (draft.revision !== revisionRef.current || dirtyRef.current) return;
        setBody(draft.body);
        setSchemaText(JSON.stringify(draft.body.input ?? {}, null, 2));
      })
      .catch(() => {});
  });
  const revisionRef = useRef<number>(undefined);
  const dirtyRef = useRef(false);
  // The path this editor saved a new one as. Opening it again would reload what is already on screen.
  const savedAs = useRef<string>(undefined);
  // Where the code lives in the editor, fixed for the editor's life, so a first save keeps its undo history.
  const [modelPath] = useState(() => `${about.list}/${kind}/${opened ?? "new"}.ts`);

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
    if (opened === savedAs.current) return;
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

  // ⌘S or Ctrl+S saves the draft, from anywhere on the page.
  const saveShortcut = useRef<() => void>(() => {});
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        saveShortcut.current();
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);
  // ⌘↵ or Ctrl+Enter runs the draft, from anywhere in the editor.
  const runShortcut = useRef<() => void>(() => {});
  useEffect(() => {
    if (kind !== "script") return;
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        runShortcut.current();
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [kind]);

  // Changes not saved are not lost by a click elsewhere, Back, or closing the tab.
  useNavigationGuard(
    dirty && editable,
    `Your changes to ${path || `this new ${about.noun}`} are not saved. Leave anyway?`,
  );
  // A draft saves itself a few seconds after the last change. Something new waits for
  // its first Save, so that a path half typed never becomes a draft of its own; until
  // then a copy is kept in this browser.
  const recoveryKey = `${root}:${kind}`;
  const { kept, drop, taken } = useKeptCopy<{ path: string; body: ScriptBody; schemaText: string }>(
    recoveryKey,
    !opened,
  );
  useRecoveryCopy(recoveryKey, { path, body, schemaText }, state === "new" && dirty);
  const autosave = useRef<() => Promise<boolean>>(async () => false);
  const failedFor = useRef<unknown>(undefined);
  // biome-ignore lint/correctness/useExhaustiveDependencies: each change starts the wait again
  useEffect(() => {
    if (!dirty || busy || !editable || (state !== "draft" && state !== "deployed")) return;
    // One that failed is tried again once something changes, not in a loop.
    if (failedFor.current === body) return;
    const timer = setTimeout(async () => {
      if (!(await autosave.current())) failedFor.current = body;
    }, 3000);
    return () => clearTimeout(timer);
  }, [dirty, busy, editable, state, body, schemaText]);

  revisionRef.current = revision;
  dirtyRef.current = dirty;
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
        // A schema read from the code is the code's: what was read is sent back as it is.
        body:
          about.schema && body.schemaSource !== "code"
            ? { ...body, [about.schema.field]: schema }
            : body,
        ...(revision ? { revision } : {}),
      });
      setBody(saved.body);
      setRevision(saved.revision);
      setState("draft");
      setDirty(false);
      setReadingFailed(undefined);
      setReading(saved.schemaTaskId);
      clearRecovery(recoveryKey);
      if (!opened) {
        savedAs.current = path;
        navigate(`${link}/${about.edit}/${path}`, { replace: true });
      }
      return true;
    } catch (error) {
      setProblem(failureText(error));
      setFields((error as ApiError).fields ?? []);
      setBuildIssues(buildIssuesOf(error));
      return false;
    } finally {
      setBusy(false);
    }
  };

  autosave.current = save;
  saveShortcut.current =
    readOnly || busy || (!dirty && state !== "new") ? () => {} : () => void save();

  /** Runs the draft with this input. What the server refuses is thrown, for the form to place. */
  const test = async (input: unknown) => {
    setTestInput(input);
    if ((dirty || state === "new") && !(await save())) return;
    setBusy(true);
    try {
      const started = await api.post<{ runId: string }>(`${root}/test-runs`, {
        script: path,
        input,
      });
      setBuildIssues([]);
      setTestRun(started.runId);
      setPaneTab("result");
    } catch (error) {
      const issues = buildIssuesOf(error);
      if (issues.length > 0) {
        setBuildIssues(issues);
        setPaneTab("problems");
      }
      throw error;
    } finally {
      setBusy(false);
    }
  };

  // The shortcut runs it again with the last input.
  runShortcut.current = readOnly
    ? () => {}
    : () => void test(testInput).catch((error) => setProblem(failureText(error)));

  /** The schema the input form is drawn from: the one read from the code, or the one written. */
  const inputSchema = (() => {
    if (body.schemaSource === "code") return body.input as Record<string, unknown> | undefined;
    try {
      return JSON.parse(schemaText) as Record<string, unknown>;
    } catch {
      return undefined;
    }
  })();

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
      {kind === "script" && body.schemaSource === "code" ? (
        <div className="flex flex-col gap-1">
          <TextAreaField
            name="schema"
            label="Input schema, read from your code"
            value={JSON.stringify(body.input ?? {}, null, 2)}
            rows={7}
            disabled
            hint="From the input export in the code. Change it there, and save."
            onChange={() => {}}
          />
        </div>
      ) : about.schema ? (
        <TextAreaField
          name="schema"
          label={about.schema.label}
          value={schemaText}
          rows={kind === "connector" ? 14 : 7}
          disabled={readOnly}
          hint={
            kind === "script"
              ? `${about.schema.hint} Export an input schema made with z from the code, and it is read from there instead.`
              : about.schema.hint
          }
          error={fieldError(`/body/${about.schema.field}`)}
          onChange={(text) => {
            setSchemaText(text);
            setDirty(true);
          }}
        />
      ) : null}
      {kind === "script" && schemaReading.waiting ? (
        <p className="m-0 text-[13px] text-ink-muted" role="status">
          {schemaReading.slow
            ? "Your schema will be read from the code once a worker is available."
            : "Reading the schema from your code…"}
        </p>
      ) : null}
      {kind === "script" && readingFailed ? (
        <Notice tone="attention">
          The schema could not be read from the code: {readingFailed}
        </Notice>
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
      {readOnly ? (
        <p className="m-0 text-ink-muted">This script is not run from here.</p>
      ) : (
        <InputForm
          // Drawn again when the schema changes, starting from the last input.
          key={JSON.stringify(inputSchema ?? null)}
          schema={inputSchema}
          initial={testInput}
          action={dirty || state === "new" ? "Save and run" : "Run the draft"}
          onSubmit={test}
        />
      )}
      <p className="m-0 text-[13px] text-ink-muted">
        Runs the script as its draft has it, on a worker, without deploying anything.{" "}
        <kbd className="rounded-[4px] border border-line px-1 font-mono text-tag">⌘↵</kbd>
      </p>
    </div>
  );

  const problemCount =
    markers.filter((marker) => marker.severity === "error").length +
    buildIssues.filter((issue) => issue.file === `${path}.script.ts`).length;
  const codeArea = (height: string) =>
    fromRepository ? (
      <RepositorySource root={root} path={path} />
    ) : (
      <CodeEditor
        label={`Source of ${path || `the new ${about.noun}`}`}
        path={modelPath}
        language="typescript"
        value={body.source?.code ?? ""}
        readOnly={readOnly}
        height={height}
        onRun={kind === "script" ? () => runShortcut.current() : undefined}
        onSave={readOnly ? undefined : () => saveShortcut.current()}
        onMarkers={setMarkers}
        reveal={reveal}
        onChange={(code) => {
          if (code === body.source?.code) return;
          change({ source: { language: "typescript", code } });
        }}
      />
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
        <div className="flex flex-wrap items-center gap-2">
          {/* Something deployed can be given to an agent; a draft cannot, until it is. */}
          {kind === "script" && opened && (state === "deployed" || state === "repository") ? (
            <OfferButton root={root} kind="script" path={opened} />
          ) : null}
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
              <Button
                variant="primary"
                disabled={busy || (!dirty && state !== "new")}
                onClick={save}
              >
                Save draft
              </Button>
              {state === "draft" && !dirty ? (
                <Link to={`${link}/changes`} className="text-action">
                  Review and deploy
                </Link>
              ) : null}
            </div>
          )}
        </div>
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
          This {about.noun} is managed in the tenant's repository. Its source is shown here
          read-only: change it there, or write one of the same path here to take it over.
        </Notice>
      ) : state === "repository" ? (
        <Notice tone="attention">
          Saving a draft of this {about.noun} takes it over from the repository.
        </Notice>
      ) : null}
      {kept && state === "new" && !dirty ? (
        <Notice
          tone="attention"
          action={
            <span className="flex gap-2">
              <Button
                size="small"
                onClick={() => {
                  setPath(kept.path);
                  setBody(kept.body);
                  setSchemaText(kept.schemaText);
                  setDirty(true);
                  taken();
                }}
              >
                Restore it
              </Button>
              <Button size="small" variant="quiet" onClick={drop}>
                Discard
              </Button>
            </span>
          }
        >
          A new {about.noun}
          {kept.path ? ` (${kept.path})` : ""} that was not saved is kept in this browser.
        </Notice>
      ) : null}
      {problem ? <Notice tone="danger">{problem}</Notice> : null}
      <details
        className="rounded-panel border border-line bg-surface"
        open={!opened || kind !== "script"}
      >
        <summary className="cursor-pointer px-4 py-2 font-medium">
          Settings
          <span className="ml-2 font-normal text-meta text-ink-muted">
            {kind === "script" ? "What it does, its limits, what it uses and its input" : ""}
          </span>
        </summary>
        <div className="border-line border-t p-4">{settings}</div>
      </details>
      {kind === "script" && !fromRepository ? (
        <SplitPane
          id="script-editor"
          label="Resize the code and the test pane"
          initial={70}
          className="h-[calc(100dvh-13rem)] min-h-[30rem]"
          first={codeArea("100%")}
          second={
            <section
              aria-label="Test pane"
              className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto rounded-panel border border-line bg-surface p-4"
            >
              {trying}
              <Tabs
                label="What the test run gave"
                value={paneTab}
                onChange={setPaneTab}
                tabs={[
                  {
                    id: "result",
                    label: "Result",
                    content: testRun ? (
                      <div className="flex flex-col gap-4">
                        <ScriptRunPanel
                          key={testRun}
                          root={root}
                          link={link}
                          runId={testRun}
                          tab={runTab}
                          onTab={setRunTab}
                          onLocation={(at) =>
                            setReveal({ line: at.line, column: at.column, at: Date.now() })
                          }
                        />
                        <PublishedEvents root={root} runId={testRun} />
                      </div>
                    ) : (
                      <p className="m-0 text-ink-muted">
                        Run the draft to see what it returns, and its log, here.
                      </p>
                    ),
                  },
                  {
                    id: "problems",
                    label: problemCount > 0 ? `Problems (${problemCount})` : "Problems",
                    content: (
                      <ProblemList
                        markers={markers}
                        build={buildIssues.filter((issue) => issue.file === `${path}.script.ts`)}
                        onShow={(line, column) => setReveal({ line, column, at: Date.now() })}
                      />
                    ),
                  },
                  {
                    id: "runs",
                    label: "Runs",
                    content: opened ? (
                      <RecentRuns root={root} link={link} path={opened} />
                    ) : (
                      <p className="m-0 text-ink-muted">
                        A script that is saved lists its runs here.
                      </p>
                    ),
                  },
                ]}
              />
            </section>
          }
        />
      ) : (
        codeArea("34rem")
      )}
    </section>
  );
}

/** A choice kept in this browser, such as which tab of the test pane was last open. */
function useKeptChoice(key: string, fallback: string): [string, (value: string) => void] {
  const [value, setValue] = useState(() => {
    try {
      return localStorage.getItem(key) ?? fallback;
    } catch {
      return fallback;
    }
  });
  return [
    value,
    (next: string) => {
      setValue(next);
      try {
        localStorage.setItem(key, next);
      } catch {
        // Storage that cannot be reached keeps the choice for this visit only.
      }
    },
  ];
}

/** Build errors the server named by file and line, from a refused save or test run. */
function buildIssuesOf(error: unknown): { file: string; line: number; message: string }[] {
  return ((error as ApiError).fields ?? []).flatMap((field) => {
    const found = /^(.+\.ts):(\d+)$/.exec(field.path);
    return found
      ? [{ file: found[1] as string, line: Number(found[2]), message: field.message }]
      : [];
  });
}

/** What is wrong with the code, as a list: each item shows its line in the editor. */
function ProblemList({
  markers,
  build,
  onShow,
}: {
  markers: Marker[];
  build: { line: number; message: string }[];
  onShow: (line: number, column: number) => void;
}) {
  const items = [
    ...build.map((issue) => ({ ...issue, column: 1, severity: "error" as const, from: "build" })),
    ...markers.map((marker) => ({ ...marker, from: "editor" })),
  ].sort((a, b) => a.line - b.line || a.column - b.column);
  if (items.length === 0) return <p className="m-0 text-ink-muted">No problems found.</p>;
  return (
    <ul aria-label="Problems in the code" className="m-0 flex list-none flex-col gap-1 p-0">
      {items.map((item) => (
        <li key={`${item.from}:${item.line}:${item.column}:${item.message}`}>
          <button
            type="button"
            onClick={() => onShow(item.line, item.column)}
            className="flex w-full items-start gap-2 rounded-control px-2 py-1 text-left hover:bg-sunken"
          >
            <span
              className={`shrink-0 font-mono text-telemetry ${
                item.severity === "error" ? "text-danger" : "text-attention"
              }`}
            >
              {item.line}:{item.column}
            </span>
            <span className="min-w-0 flex-1">{item.message}</span>
            {item.from === "build" ? <Badge tone="danger">Build</Badge> : null}
          </button>
        </li>
      ))}
    </ul>
  );
}

interface ScriptRunRow {
  id: string;
  state: RunState;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  trigger: { type: string; draft?: boolean };
}

/** The latest runs of this script, tests and real ones together. */
export function RecentRuns({ root, link, path }: { root: string; link: string; path: string }) {
  const runs = useLoad<{ items: ScriptRunRow[] }>(
    `${root}/runs?${new URLSearchParams({ script: path, limit: "20" })}`,
  );
  return (
    <DataTable<ScriptRunRow>
      variant="inset"
      label={`Runs of ${path}`}
      rows={runs.data?.items}
      rowKey={(run) => run.id}
      error={runs.error?.message}
      onRetry={runs.reload}
      onOpen={(run) => navigate(`${link}/runs/${run.id}`)}
      href={(run) => `${link}/runs/${run.id}`}
      empty={{ title: "No runs yet" }}
      columns={[
        { header: "State", cell: (run) => <StatePill state={run.state} /> },
        {
          header: "Started",
          cell: (run) => (
            <span className="text-ink-muted">
              {fromNow(run.startedAt ?? run.createdAt)}
              {run.trigger.draft ? " · test" : ""}
            </span>
          ),
        },
        {
          header: "Took",
          align: "end",
          cell: (run) => (
            <Elapsed from={run.startedAt} to={run.finishedAt} className="text-ink-muted" />
          ),
        },
      ]}
    />
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
        <DataTable
          variant="static"
          framed
          label="Extensions"
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

/** What one test run published, as it publishes it. */
function PublishedEvents({ root, runId }: { root: string; runId: string }) {
  const [tick, setTick] = useState(0);
  const events = useLoad<{ items: { id: string; name: string; occurredAt: string }[] }>(
    `${root}/events?run=${runId}&limit=20&tick=${tick}`,
  );
  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), 3000);
    const stop = setTimeout(() => clearInterval(timer), 60_000);
    return () => {
      clearInterval(timer);
      clearTimeout(stop);
    };
  }, []);
  return (
    <div className="flex flex-col gap-2">
      <span className="text-label text-ink-subtle uppercase">Events it published</span>
      {(events.data?.items ?? []).length === 0 ? (
        <span className="text-meta text-ink-subtle">None.</span>
      ) : (
        events.data?.items.map((event) => (
          <span key={event.id} className="font-mono text-telemetry">
            {event.name}
          </span>
        ))
      )}
    </div>
  );
}

/**
 * The TypeScript a repository script was built from, read-only, when its bundle
 * carries it. The file that defines the script comes first.
 */
function RepositorySource({ root, path }: { root: string; path: string }) {
  const source = useLoad<{
    available: boolean;
    file: string | null;
    line: number | null;
    files: { path: string; content: string }[];
  }>(`${root}/script-source/${path}`);
  const [chosen, setChosen] = useState<string>();
  if (source.error) return <Notice tone="danger">{source.error.message}</Notice>;
  if (!source.data) return <p className="text-ink-muted">Loading the source…</p>;
  if (!source.data.available)
    return (
      <EmptyState title="The source is in the repository">
        The bundle that runs here was built without its TypeScript. Deploy it again with a newer CLI
        to read it here.
      </EmptyState>
    );
  const file = chosen ?? source.data.file ?? source.data.files[0]?.path;
  const content = source.data.files.find((one) => one.path === file)?.content ?? "";
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="w-72 max-w-full">
          <SelectField
            label="File"
            name="file"
            value={file ?? ""}
            options={source.data.files.map((one) => ({ value: one.path, label: one.path }))}
            onChange={setChosen}
          />
        </div>
        {source.data.file === file && source.data.line ? (
          <span className="text-meta text-ink-muted">Defined at line {source.data.line}</span>
        ) : null}
      </div>
      <CodeEditor
        label={`Source of ${file ?? path}`}
        path={`repository/${file ?? "source.ts"}`}
        language="typescript"
        value={content}
        readOnly
        height="34rem"
        onChange={() => {}}
        revealLine={source.data.file === file ? (source.data.line ?? undefined) : undefined}
      />
    </div>
  );
}
