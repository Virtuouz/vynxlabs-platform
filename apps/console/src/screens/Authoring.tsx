import {
  Button,
  CheckboxField,
  EmptyState,
  MultiSelectField,
  Notice,
  Panel,
  SelectField,
  Tabs,
  TextAreaField,
  TextField,
} from "@volvel/ui";
import { useEffect, useRef, useState } from "react";
import { type ApiError, api, useLoad } from "../api.ts";
import { failureText, takenText } from "../ask.tsx";
import { CodeEditor, type Marker } from "../editor/CodeEditor.tsx";
import { plainEditorOnly } from "../editor/plain.ts";
import { InputForm, withoutMasked } from "../InputDialog.tsx";
import { DataTable } from "../kit/DataTable.tsx";
import { DeployMenu } from "../kit/DeployMenu.tsx";
import { DraftClash } from "../kit/DraftClash.tsx";
import { putDraft } from "../kit/draftApi.ts";
import { useDraftSave } from "../kit/draftSave.ts";
import { Elapsed } from "../kit/Elapsed.tsx";
import { ago } from "../kit/format.ts";
import { formatCombo, useShortcut } from "../kit/keys.ts";
import { ErrorState, Loading } from "../kit/LoadState.tsx";
import { ProductionNotice } from "../kit/objects.tsx";
import { PageHeader } from "../kit/PageHeader.tsx";
import { RemoveDraftButton } from "../kit/RemoveDraftButton.tsx";
import { clearRecovery, useKeptCopy, useRecoveryCopy } from "../kit/recovery.ts";
import { SplitPane } from "../kit/SplitPane.tsx";
import { type RunState, StatePill, Tag } from "../kit/status.tsx";
import { Page } from "../ListScreen.tsx";
import { usePreference } from "../prefs.ts";
import { Link, navigate, useNavigationGuard, useUrlParam } from "../router.tsx";
import { useTaskEnd } from "../tasks.ts";
import { STEP_ICONS } from "./builder/widgetIcons.ts";
import { LimitsFields, NO_USES, type Uses, useCodeChoices } from "./CodeSettings.tsx";
import { OfferButton } from "./OfferToAgent.tsx";
import { ResourceIdentity } from "./ResourceIdentity.tsx";
import { ScriptRunPanel } from "./Runs.tsx";
import { SCRIPT_STARTERS, untouchedStarter } from "./starters.ts";

const STARTER = `import { type ScriptContext, z } from "@volvel/sdk";

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

/**
 * Optional. What the Test button on a connection of this kind runs: reach the
 * outside system without doing anything with it, and say what was found.
 * Without it, Test only builds the client above.
 */
export async function test(
  config: { baseUrl: string },
  credential: string | undefined,
  signal: AbortSignal,
) {
  const response = await fetch(config.baseUrl, {
    method: "HEAD",
    signal,
    headers: credential ? { authorization: \`Bearer \${credential}\` } : {},
  });
  return { status: response.status };
}
`;

const WEBHOOK_SOURCE_STARTER = `import type { ScriptContext, WebhookRequest, WebhookSourceResult } from "@volvel/sdk";

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

const POLL_SOURCE_STARTER = `import type { PollResult, PollTick, ScriptContext } from "@volvel/sdk";

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
  /** A script's: the most memory a run may use, in MB. */
  memoryMb?: number | undefined;
  /** A script's: runs at once, or runs at once for each value found at `key` in the input. */
  concurrency?: number | { key: string; limit: number } | undefined;
  /** The worker pool it runs on. Without one, the default pool. */
  worker?: string | undefined;
  /** A script's: what to do when a run fails for the last time. */
  onFailure?: { script?: string; notify?: string } | undefined;
  retries?: { limit: number; delaySeconds: number; backoff: boolean };
  uses?: Uses;
  /** A connector's: what a connection's configuration must fit. */
  configSchema?: unknown;
  /** A script's: set, it is a step people pick in the flow editor, under this label. */
  node?: { label: string; icon?: string; category?: string; takes?: string[] };
  /** A trigger source's: whether it takes a webhook's requests or a schedule's ticks. */
  mode?: "webhook" | "poll";
  source?: { language: "typescript"; code: string };
  [more: string]: unknown;
}

const CODE_KINDS: Record<
  CodeKind,
  {
    noun: string;
    /** Where its list is, and where its editor is, under the workspace. */
    list: string;
    edit: string;
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
  retries: { limit: 0, delaySeconds: 30, backoff: true },
  uses: { connections: [], secrets: [], variables: [] },
  source: { language: "typescript", code: SCRIPT_STARTERS[0]?.code ?? STARTER },
};

/** What a save sends: the three things the editor holds. */
interface Unsaved {
  path: string;
  body: ScriptBody;
  schemaText: string;
}

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
  const [path, setPath] = useState(opened ?? "");
  const [body, setBody] = useState<ScriptBody>();
  const [state, setState] = useState<"new" | "draft" | "deployed" | "repository" | "removed">(
    "new",
  );
  const [problem, setProblem] = useState<string>();
  const [pathTaken, setPathTaken] = useState<string>();
  const [fields, setFields] = useState<ApiError["fields"]>([]);
  const [busy, setBusy] = useState(false);
  // Bumped to read the resource again, as when a removal is taken back.
  const [again, setAgain] = useState(0);
  const [schemaText, setSchemaText] = useState("");
  // What is saved and what is on screen go through one hook: a save sends the newest text, and
  // what is typed while one is in flight is saved after it.
  const draft = useDraftSave<Unsaved, DraftDetail>({
    send: (snap, at) => {
      if (!PATH.test(snap.path)) {
        throw new Error(
          `Give the ${about.noun} a path: lowercase letters, digits, hyphens and underscores, in folders. For example ${about.example}.`,
        );
      }
      let schema: unknown;
      try {
        schema = about.schema ? JSON.parse(snap.schemaText) : undefined;
      } catch {
        throw new Error("The schema is not valid JSON.");
      }
      return putDraft<DraftDetail>(
        root,
        snap.path,
        {
          kind,
          schemaVersion: 1,
          // A schema read from the code is the code's: what was read is sent back as it is.
          body:
            about.schema && snap.body.schemaSource !== "code"
              ? { ...snap.body, [about.schema.field]: schema }
              : snap.body,
        },
        // A new one is a create: a path that is taken is refused, never overwritten.
        at ? { revision: at } : opened ? { first: true } : { create: true },
      );
    },
    applied: (saved, sent, current) => {
      // What the server sends back replaces the screen only if nothing was typed since.
      if (current) {
        draft.adopt({ ...sent, body: saved.body });
        setBody(saved.body);
      }
      setState("draft");
      setReadingFailed(undefined);
      setReading(saved.schemaTaskId);
      clearRecovery(recoveryKey);
      if (!opened && savedAs.current !== sent.path) {
        savedAs.current = sent.path;
        navigate(`${link}/${about.edit}/${sent.path}`, { replace: true });
      }
    },
    failed: (error) => {
      const refused = takenText(error);
      if (refused) setPathTaken(refused);
      else setProblem(failureText(error));
      setFields((error as ApiError).fields ?? []);
      setBuildIssues(buildIssuesOf(error));
    },
  });
  const { dirty } = draft;
  // The last input it was tried with, kept while the editor is open.
  const [testInput, setTestInput] = useState<unknown>({});
  const [testAll, setTestAll] = useState(false);
  const [testRun, setTestRun] = useState<string>();
  // The test pane holds the input form above the result: a new run brings its result into view.
  const resultTop = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (testRun) resultTop.current?.scrollIntoView?.({ block: "start", behavior: "smooth" });
  }, [testRun]);
  // The test pane's tab, and the run's own tab, stay as chosen from one run to the next.
  const [paneTab, setPaneTab] = useKeptChoice("editor.pane", "result");
  const [runTab, setRunTab] = useKeptChoice("editor.run", "logs");
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [buildIssues, setBuildIssues] = useState<{ file: string; line: number; message: string }[]>(
    [],
  );
  const [reveal, setReveal] = useState<{ line: number; column?: number; at: number }>();
  const [reading, setReading] = useState<string>();
  const [readingFailed, setReadingFailed] = useState<string>();
  const choices = useCodeChoices(root);
  const schemaReading = useTaskEnd(root, reading, (task) => {
    setReading(undefined);
    if (task.status === "failed") {
      setReadingFailed(task.error?.message ?? "The worker could not read it.");
      return;
    }
    // What the worker read is on the draft now, if nobody saved since.
    void api
      .get<DraftDetail>(`${root}/drafts/${path}`)
      .then((read) => {
        if (read.revision !== draft.known() || draft.isDirty()) return;
        setBody(read.body);
        setSchemaText(JSON.stringify(read.body.input ?? {}, null, 2));
      })
      .catch(() => {});
  });
  // The path this editor saved a new one as. Opening it again would reload what is already on screen.
  const savedAs = useRef<string>(undefined);
  // The icon and group of a step whose name was cleared to be typed again: the manifest wants a
  // name of at least one character, so the step is dropped while it is empty, and given back.
  const clearedStep = useRef<ScriptBody["node"]>(undefined);
  // Where the code lives in the editor, fixed for the editor's life, so a first save keeps its undo history.
  const [modelPath] = useState(() => `${about.list}/${kind}/${opened ?? "new"}.ts`);
  // The workspace's own names for the editor, so `ctx.table("orders")` completes and is checked.
  // The editor works without them, so a failure to read them is not shown.
  const [declarations, setDeclarations] = useState<string>();
  useEffect(() => {
    if (plainEditorOnly()) return;
    let live = true;
    api.text(`${root}/types.d.ts`).then(
      (text) => live && setDeclarations(text),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [root]);

  useEffect(() => {
    let current = true;
    const schemaOf = (next: ScriptBody) =>
      JSON.stringify((about.schema ? next[about.schema.field] : undefined) ?? {}, null, 2);
    const open = (next: ScriptBody, as: typeof state, at?: number) => {
      if (!current) return;
      setBody(next);
      setSchemaText(schemaOf(next));
      setState(as);
      draft.reset({ body: next, schemaText: schemaOf(next), path: opened ?? "" }, at);
    };
    if (!opened) {
      open(about.fresh(), "new");
      return;
    }
    if (opened === savedAs.current && again === 0) return;
    (async () => {
      try {
        const found = await api.get<DraftDetail>(`${root}/drafts/${opened}`);
        if (found.deleted) {
          // A draft that removes it holds no code: what is shown is what is deployed. Nothing is
          // saved from here, so a removal decided earlier is never undone by an autosave.
          const resource = await api.get<{ body: ScriptBody }>(`${root}/resources/${opened}`);
          open(resource.body, "removed", found.revision);
        } else open(found.body, "draft", found.revision);
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
  }, [root, opened, about, draft.reset, again]);

  // ⌘S or Ctrl+S saves the draft, from anywhere on the page. It saves what was typed a moment
  // ago too: the text is read from the hook, not from the last render.
  const saveShortcut = useRef<() => void>(() => {});
  useShortcut("save", () => saveShortcut.current());
  // ⌘↵ or Ctrl+Enter runs the draft, from anywhere in the editor.
  const runShortcut = useRef<() => void>(() => {});
  const inputPane = useRef<HTMLDivElement>(null);
  useShortcut("run", () => runShortcut.current(), { enabled: kind === "script" });

  // Changes not saved are not lost by a click elsewhere, Back, or closing the tab.
  useNavigationGuard(
    dirty && editable,
    `Your changes to ${path || `this new ${about.noun}`} are not saved. Leave anyway?`,
  );
  // A draft saves itself a few seconds after the last change. Something new waits for
  // its first Save, so that a path half typed never becomes a draft of its own; until
  // then a copy is kept in this browser.
  // Opened from a failed run, as "Edit in dev": its input is carried into the test pane.
  const [fromRun] = useUrlParam("fromRun");
  const [carried, setCarried] = useState<{
    workspace: string;
    version: number;
    run: string;
    masked: string[];
  }>();
  const [formKey, setFormKey] = useState(0);
  useEffect(() => {
    if (!fromRun || kind !== "script") return;
    const [workspaceId, runId] = fromRun.split(":");
    if (!workspaceId || !runId) return;
    const tenantRoot = root.split("/workspaces/")[0] as string;
    let live = true;
    Promise.all([
      api.get<{ input: unknown; bundleVersion: number }>(
        `${tenantRoot}/workspaces/${workspaceId}/runs/${runId}`,
      ),
      api.get<{ name: string }>(`${tenantRoot}/workspaces/${workspaceId}`),
    ]).then(
      ([run, workspace]) => {
        if (!live) return;
        const { value, masked } = withoutMasked(run.input);
        setTestInput(value);
        setFormKey((n) => n + 1);
        setCarried({
          workspace: workspace.name,
          version: run.bundleVersion,
          run: `${tenantRoot.replace(/^\/tenants\//, "/t/")}/workspaces/${workspaceId}/runs/${runId}`,
          masked,
        });
      },
      (error) => live && setProblem(failureText(error)),
    );
    return () => {
      live = false;
    };
  }, [fromRun, kind, root]);
  const recoveryKey = `${root}:${kind}`;
  const { kept, drop, taken } = useKeptCopy<{ path: string; body: ScriptBody; schemaText: string }>(
    recoveryKey,
    !opened,
  );
  useRecoveryCopy(recoveryKey, { path, body, schemaText }, state === "new" && dirty);
  const working = busy || draft.saving;
  const autosave = useRef<() => Promise<boolean>>(async () => false);
  const failedFor = useRef<unknown>(undefined);
  // biome-ignore lint/correctness/useExhaustiveDependencies: each change starts the wait again
  useEffect(() => {
    if (!dirty || working || !editable || (state !== "draft" && state !== "deployed")) return;
    // One that failed is tried again once something changes, not in a loop.
    if (failedFor.current === body) return;
    const timer = setTimeout(async () => {
      if (!(await autosave.current())) failedFor.current = body;
    }, 3000);
    return () => clearTimeout(timer);
  }, [dirty, working, editable, state, body, schemaText]);

  if (problem && !body) return <Notice tone="danger">{problem}</Notice>;
  if (!body) return <Loading />;

  const fromRepository = state === "repository" && !body.source;
  /** A step that comes with the platform. It is the platform's to change. */
  const core = (opened ?? "").startsWith("core/");
  const removed = state === "removed";
  const readOnly = !editable || fromRepository || core || removed;
  const change = (next: Partial<ScriptBody>) => {
    // On top of the newest, not of this render's: two changes before a render both stay.
    const now = draft.value();
    const merged = { ...(now?.body ?? body), ...next };
    setBody(merged);
    draft.edit({
      path: now?.path ?? path,
      schemaText: now?.schemaText ?? schemaText,
      body: merged,
    });
  };
  /** Sets what a failing run does, and drops `onFailure` when nothing is left in it. */
  const changeFailure = (next: { script?: string | undefined; notify?: string | undefined }) => {
    const now = draft.value();
    const merged = { ...((now?.body ?? body).onFailure ?? {}), ...next };
    const kept = Object.fromEntries(Object.entries(merged).filter(([, value]) => value));
    change({ onFailure: Object.keys(kept).length > 0 ? kept : undefined });
  };
  /** Sets or, given nothing, clears the script's place among the flow editor's steps. */
  const changeNode = (node: ScriptBody["node"]) => {
    const now = draft.value();
    const { node: _was, ...rest } = now?.body ?? body;
    const merged: ScriptBody = node ? { ...rest, node } : rest;
    setBody(merged);
    draft.edit({
      path: now?.path ?? path,
      schemaText: now?.schemaText ?? schemaText,
      body: merged,
    });
  };
  const changePath = (next: string) => {
    setPath(next);
    const now = draft.value();
    draft.edit({ body: now?.body ?? body, schemaText: now?.schemaText ?? schemaText, path: next });
  };
  const changeSchema = (text: string) => {
    setSchemaText(text);
    const now = draft.value();
    draft.edit({ body: now?.body ?? body, path: now?.path ?? path, schemaText: text });
  };
  const fieldError = (pointer: string) =>
    fields.find((field) => field.path.startsWith(pointer))?.message;

  const save = async (): Promise<boolean> => {
    setProblem(undefined);
    setPathTaken(undefined);
    setFields([]);
    return draft.save(state === "new");
  };

  autosave.current = save;
  saveShortcut.current =
    readOnly || busy || (!draft.isDirty() && state !== "new") ? () => {} : () => void save();

  /** Runs the draft with this input. What the server refuses is thrown, for the form to place. */
  const test = async (input: unknown) => {
    setTestInput(input);
    if ((dirty || state === "new") && !(await save())) return;
    setBusy(true);
    try {
      const started = await api.post<{ runId: string }>(`${root}/test-runs`, {
        script: path,
        input,
        ...(testAll ? { withAllDrafts: true } : {}),
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

  // The shortcut is the Run button: one path, with what the test pane holds now, validated and
  // saved first as the button does. Where the form is not drawn there is nothing to press, and the
  // last input is used.
  runShortcut.current = readOnly
    ? () => {}
    : () => {
        const press = inputPane.current?.querySelector<HTMLButtonElement>('button[type="submit"]');
        if (press) press.click();
        else void test(testInput).catch((error) => setProblem(failureText(error)));
      };

  /** The schema the input form is drawn from: the one read from the code, or the one written. */
  const inputSchema = (() => {
    if (body.schemaSource === "code") return body.input as Record<string, unknown> | undefined;
    try {
      return JSON.parse(schemaText) as Record<string, unknown>;
    } catch {
      return undefined;
    }
  })();

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
      <LimitsFields
        kind={kind}
        noun={about.noun}
        body={body}
        change={change}
        changeFailure={changeFailure}
        readOnly={readOnly}
        fieldError={fieldError}
        choices={choices}
      />
      {kind === "script" ? (
        <fieldset className="m-0 flex flex-col gap-3 border-0 p-0">
          <legend className="mb-1 text-body-sm font-medium">Use as a flow step</legend>
          <TextField
            name="stepLabel"
            label="Step name"
            value={body.node?.label ?? ""}
            required={false}
            maxLength={60}
            disabled={readOnly}
            hint="Give the script a name and it joins the flow editor's steps under it. Leave it empty to keep the script out of them."
            onChange={(label) => {
              if (label === "") {
                clearedStep.current = body.node ?? clearedStep.current;
                return changeNode(undefined);
              }
              changeNode({ ...(body.node ?? clearedStep.current), label });
            }}
          />
          {body.node ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <SelectField
                  name="stepIcon"
                  label="Icon"
                  value={body.node.icon ?? ""}
                  disabled={readOnly}
                  options={[{ value: "", label: "None" }, ...STEP_ICONS]}
                  onChange={(icon) => {
                    const { icon: _gone, ...rest } = body.node as NonNullable<ScriptBody["node"]>;
                    changeNode(icon === "" ? rest : { ...rest, icon });
                  }}
                />
                <TextField
                  name="stepCategory"
                  label="Group"
                  value={body.node.category ?? ""}
                  placeholder="This workspace's"
                  required={false}
                  maxLength={40}
                  disabled={readOnly}
                  hint="The heading it is listed under."
                  onChange={(category) => {
                    const { category: _gone, ...rest } = body.node as NonNullable<
                      ScriptBody["node"]
                    >;
                    changeNode(category === "" ? rest : { ...rest, category });
                  }}
                />
              </div>
              <MultiSelectField
                label="A step may hand it"
                options={[
                  { value: "connection", label: "A connection" },
                  { value: "table", label: "A table" },
                  { value: "event", label: "An event" },
                ]}
                value={body.node.takes ?? []}
                disabled={readOnly}
                placeholder="None"
                hint="What a flow may give the script that it does not name itself."
                onChange={(takes) => {
                  const { takes: _gone, ...rest } = body.node as NonNullable<ScriptBody["node"]>;
                  changeNode(takes.length === 0 ? rest : { ...rest, takes });
                }}
              />
            </>
          ) : null}
        </fieldset>
      ) : null}
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
          onChange={changeSchema}
        />
      ) : null}
      {kind === "script" && schemaReading.waiting ? (
        <p className="m-0 text-body-sm text-ink-muted" role="status">
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
        <p className="m-0 text-body-sm text-ink-muted">
          Nobody starts a trigger source by hand. To try it, deploy it and name it in a webhook or a
          schedule.
        </p>
      ) : null}
      {kind === "connector" ? (
        <p className="m-0 text-body-sm text-ink-muted">
          A connection names this connector by its path. To try it, deploy it and set up a
          connection of this kind: Test on the connection runs the code's <code>test</code> export,
          or only builds its client when there is none.
        </p>
      ) : null}
    </div>
  );

  const trying = (
    <div className="flex flex-col gap-3">
      {readOnly ? (
        <p className="m-0 text-ink-muted">
          This script is not run from here. Run it from{" "}
          <Link to={`${link}/scripts/${path}`}>its page</Link>, or edit it in the dev workspace.
        </p>
      ) : (
        <div ref={inputPane} className="flex flex-col gap-3">
          <InputForm
            // Drawn again when the schema changes, starting from the last input.
            key={`${JSON.stringify(inputSchema ?? null)}:${formKey}`}
            schema={inputSchema}
            initial={testInput}
            action={dirty || state === "new" ? "Save and run" : "Run the draft"}
            onSubmit={test}
          />
          <CheckboxField
            name="with-all-drafts"
            label="Build with all drafts"
            checked={testAll}
            onChange={setTestAll}
            hint="Off: this script's draft and the drafts it names. On: every draft of the workspace, so another draft that does not build stops the test."
          />
          <p className="m-0 text-body-sm text-ink-muted">
            Runs the script as its draft has it, on a worker, without deploying anything.{" "}
            <kbd className="rounded-inner border border-line px-1 font-mono text-tag">
              {formatCombo("Mod+Enter")}
            </kbd>
          </p>
        </div>
      )}
    </div>
  );

  // The server names a build error by the file the code is in: `<path>.<kind>.ts`.
  const ownIssues = buildIssues.filter((issue) => issue.file === `${path}.${kind}.ts`);
  const problemCount =
    markers.filter((marker) => marker.severity === "error").length + ownIssues.length;
  const codeArea = (height: string) =>
    fromRepository ? (
      <RepositorySource root={root} path={path} />
    ) : (
      <CodeEditor
        label={`Source of ${path || `the new ${about.noun}`}`}
        path={modelPath}
        language="typescript"
        declarations={declarations}
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
      <PageHeader
        compact
        mono={Boolean(opened)}
        title={opened ? path : `New ${about.noun}`}
        state={
          <>
            {removed ? <StatePill state="draft">Removing</StatePill> : <StatePill state={state} />}
            {dirty ? <StatePill state="unsaved" /> : null}
          </>
        }
        actions={
          <>
            {/* Something deployed can be given to an agent; a draft cannot, until it is. */}
            {kind === "script" && opened ? (
              <OfferButton
                root={root}
                kind="script"
                path={opened}
                deployed={state === "deployed" || state === "repository"}
              />
            ) : null}
            {removed && editable && opened ? (
              <RemoveDraftButton
                root={root}
                kind={kind}
                path={opened}
                noun={about.noun}
                state="removed"
                disabled={working}
                onDone={() => setAgain((n) => n + 1)}
              />
            ) : null}
            {readOnly ? null : (
              <div className="flex items-center gap-2">
                {opened && state !== "new" ? (
                  <ResourceIdentity
                    root={root}
                    link={link}
                    label="Name and path"
                    row={{ path: opened, kind, ownership: state === "repository" ? "code" : "ui" }}
                    unsaved={dirty}
                    onDone={(next) => {
                      if (next !== opened) navigate(`${link}/${about.edit}/${next}`);
                      else setState("draft");
                    }}
                  />
                ) : null}
                {opened && state !== "new" ? (
                  <RemoveDraftButton
                    root={root}
                    kind={kind}
                    path={opened}
                    noun={about.noun}
                    state={state}
                    disabled={working}
                    onDone={(did) =>
                      navigate(`${link}/${did === "discarded" ? about.list : "changes"}`)
                    }
                  />
                ) : null}
                <Button
                  variant="primary"
                  loading={working}
                  disabled={!dirty && state !== "new"}
                  onClick={save}
                >
                  Save draft
                </Button>
                {state === "draft" && !dirty && opened ? (
                  <DeployMenu
                    root={root}
                    link={link}
                    path={opened}
                    disabled={working}
                    onDeployed={() => {
                      setState("deployed");
                      draft.know(undefined);
                    }}
                  />
                ) : null}
              </div>
            )}
          </>
        }
        after={
          opened ? undefined : (
            <div className="flex flex-col gap-3">
              <div className="w-72">
                <TextField
                  name="path"
                  label="Path"
                  value={path}
                  placeholder={about.example}
                  hint="Its name in this workspace. It can be renamed later, and stays the same resource."
                  {...(pathTaken ? { error: pathTaken } : {})}
                  onChange={(value) => {
                    setPathTaken(undefined);
                    changePath(value);
                  }}
                />
              </div>
              {kind === "script" ? (
                <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
                  <legend className="mb-1 text-body-sm font-medium">Start from</legend>
                  <div className="flex flex-wrap gap-2">
                    {SCRIPT_STARTERS.map((starter) => {
                      const chosen = body?.source?.code === starter.code;
                      return (
                        <button
                          key={starter.id}
                          type="button"
                          aria-pressed={chosen}
                          disabled={!untouchedStarter(body?.source?.code) && !chosen}
                          onClick={() =>
                            change({
                              input: starter.input,
                              source: { language: "typescript", code: starter.code },
                            })
                          }
                          className={`flex max-w-64 flex-col items-start gap-0.5 rounded-control border px-3 py-2 text-left disabled:opacity-50 ${
                            chosen ? "border-action bg-selected" : "border-line hover:bg-sunken"
                          }`}
                        >
                          <span className="font-medium">{starter.label}</span>
                          <span className="text-meta text-ink-muted">{starter.about}</span>
                        </button>
                      );
                    })}
                  </div>
                  {untouchedStarter(body?.source?.code) ? null : (
                    <span className="text-meta text-ink-muted">
                      The code has been changed, so starting again from another is off.
                    </span>
                  )}
                </fieldset>
              ) : null}
            </div>
          )
        }
      />
      {removed ? (
        <Notice tone="attention">
          This {about.noun} is removed in your drafts. Nothing changes until that draft is deployed.
          The code shown is what is deployed now. Keep this {about.noun} to take the removal back.
        </Notice>
      ) : core ? (
        <Notice tone="plain">
          This step comes with Volvel, and is added to the workspace because a flow uses it. It can
          be read here and not changed. To do something else, write a script of your own and give it
          a label, and it joins the flow editor's steps.
        </Notice>
      ) : !editable ? (
        <ProductionNotice
          root={root}
          noun={`${about.noun.charAt(0).toUpperCase()}${about.noun.slice(1)}`}
          edit={opened ? `${about.edit}/${opened}` : undefined}
        />
      ) : fromRepository ? (
        <Notice tone="attention">
          This {about.noun} is defined by the code in the tenant's repository, and is changed there.
          It cannot be turned into one the console edits: its code leans on the rest of the
          repository's, and one written here stands alone. Its source is shown read-only. To replace
          it, make a new {about.noun} here at the same path: deployed, that takes its place, with
          its history and what is bound to it.
        </Notice>
      ) : state === "repository" ? (
        <Notice tone="attention">
          Saving a draft of this {about.noun} takes it over from the repository.
        </Notice>
      ) : null}
      {draft.clashed ? (
        <DraftClash
          what={about.noun}
          mine={() => draft.value()?.body.source?.code}
          onTake={() => setAgain((n) => n + 1)}
        />
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
                  draft.edit({ path: kept.path, body: kept.body, schemaText: kept.schemaText });
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
      {carried ? (
        <Notice tone="attention">
          The input of <Link to={carried.run}>the run in {carried.workspace}</Link> is in the test
          pane
          {carried.masked.length > 0
            ? ` (masked when shown, enter again: ${carried.masked.join(", ")})`
            : ""}
          . You are editing the draft here; {carried.workspace} runs version {carried.version}.{" "}
          <Link to={`${link}/release`}>See what would change</Link>
        </Notice>
      ) : null}
      {/* panel-allowed: a disclosure, drawn as a panel. */}
      <details
        className="rounded-panel border border-line bg-surface"
        open={!opened || kind !== "script"}
      >
        <summary className="cursor-pointer px-4 py-2 font-medium">
          Settings
          <span className="ml-2 font-normal text-meta text-ink-muted">
            {kind === "script"
              ? "What it does, its limits, what it uses, its input and whether flows can pick it"
              : ""}
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
            <Panel
              aria-label="Test pane"
              className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto  p-4"
            >
              {trying}
              <div ref={resultTop} className="scroll-mt-2">
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
                          build={ownIssues}
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
              </div>
            </Panel>
          }
        />
      ) : (
        <>
          {codeArea("34rem")}
          {fromRepository ? null : (
            <section aria-label="Problems" className="flex flex-col gap-2">
              <h2 className="m-0 text-label text-ink-subtle uppercase">
                {problemCount > 0 ? `Problems (${problemCount})` : "Problems"}
              </h2>
              <ProblemList
                markers={markers}
                build={ownIssues}
                onShow={(line, column) => setReveal({ line, column, at: Date.now() })}
              />
            </section>
          )}
        </>
      )}
    </section>
  );
}

/** A choice kept with the member's settings, such as which tab of the test pane was last open. */
function useKeptChoice(key: string, fallback: string): [string, (value: string) => void] {
  const [value, keep] = usePreference<string>(key, fallback);
  return [value, (next: string) => keep(next)];
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
              className={`shrink-0 font-mono text-code ${
                item.severity === "error" ? "text-danger" : "text-attention"
              }`}
            >
              {item.line}:{item.column}
            </span>
            <span className="min-w-0 flex-1">{item.message}</span>
            {item.from === "build" ? <Tag tone="danger">Build</Tag> : null}
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
      error={runs.error}
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
              {ago(run.startedAt ?? run.createdAt)}
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

/** What kind of extension it is, in a word or a few. */
function extensionDetail(kind: "connector" | "trigger_source", mode: string | undefined): string {
  return kind === "connector"
    ? "Connector"
    : `Trigger source for ${mode === "poll" ? "a schedule" : "a webhook"}`;
}

/**
 * A row's text. A draft's is read from the draft itself: what is deployed under the
 * same path may be older, or absent, and says nothing of what a draft is now.
 */
function DraftText({
  root,
  row,
  part,
}: {
  root: string;
  row: ExtensionRow;
  part: "detail" | "description";
}) {
  const draft = useLoad<DraftDetail>(row.state === "draft" ? `${root}/drafts/${row.path}` : null);
  const body = row.state === "draft" ? draft.data?.body : undefined;
  if (!body) return <>{row[part]}</>;
  return (
    <>
      {part === "detail"
        ? extensionDetail(row.kind as "connector" | "trigger_source", body.mode)
        : (body.description ?? "")}
    </>
  );
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
      detail: extensionDetail(one.kind, one.body.mode),
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
                  className="font-mono text-code text-action"
                >
                  {row.path}
                </Link>
              ),
            },
            {
              header: "What it is",
              priority: 3,
              cell: (row) => <DraftText root={root} row={row} part="detail" />,
            },
            {
              header: "What it does",
              priority: 2,
              cell: (row) => (
                <span className="text-ink-muted">
                  <DraftText root={root} row={row} part="description" />
                </span>
              ),
            },
            {
              header: "State",
              cell: (row) => <StatePill state={row.state} />,
            },
          ]}
        />
      ) : error ? null : (
        <Loading />
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
          <span key={event.id} className="font-mono text-code">
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
  if (source.error) return <ErrorState error={source.error} onRetry={source.reload} />;
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
