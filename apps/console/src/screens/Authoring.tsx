import {
  Badge,
  type BadgeTone,
  Button,
  EmptyState,
  MultiSelectField,
  Notice,
  NumberField,
  type Option,
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

const STARTER = `import type { ScriptContext } from "@vynxlabs/sdk";

/** What runs. The input is checked against the schema under Settings before this is called. */
export default async function (input: { name?: string }, ctx: ScriptContext) {
  ctx.log.info("Started", { by: ctx.run.trigger.type });
  return { hello: input.name ?? "world" };
}
`;

interface ScriptBody {
  description?: string;
  input: unknown;
  output: unknown;
  timeoutSeconds: number;
  retries: { limit: number; delaySeconds: number; backoff: boolean };
  uses: { connections: string[]; secrets: string[]; variables: string[]; [more: string]: string[] };
  source?: { language: "typescript"; code: string };
  [more: string]: unknown;
}
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
 * A script written in the console: its source, its settings, and a way to try
 * it. Saving makes a draft. Nothing that runs changes until the draft is deployed.
 */
export function ScriptEditor({
  root,
  link,
  path: opened,
  editable,
}: {
  root: string;
  link: string;
  /** The script to open, or nothing for a new one. */
  path: string | undefined;
  /** False in a production workspace, where a script is only read. */
  editable: boolean;
}) {
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
      setSchemaText(JSON.stringify(next.input ?? {}, null, 2));
      setState(as);
      setRevision(at);
    };
    if (!opened) {
      open(NEW_BODY, "new");
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
  }, [root, opened]);

  if (problem && !body) return <Notice tone="danger">{problem}</Notice>;
  if (!body) return <p className="text-ink-muted">Loading…</p>;

  const fromRepository = state === "repository" && !body.source;
  const readOnly = !editable || fromRepository;
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
        "Give the script a path: lowercase letters, digits, hyphens and underscores, in folders. For example orders/sync.",
      );
      return false;
    }
    let input: unknown;
    try {
      input = JSON.parse(schemaText);
    } catch {
      setProblem("The input schema is not valid JSON.");
      return false;
    }
    setBusy(true);
    try {
      const saved = await api.put<DraftDetail>(`${root}/drafts/${path}`, {
        kind: "script",
        schemaVersion: 1,
        body: { ...body, input },
        ...(revision ? { revision } : {}),
      });
      setBody(saved.body);
      setRevision(saved.revision);
      setState("draft");
      setDirty(false);
      if (!opened) navigate(`${link}/scripts/edit/${path}`, { replace: true });
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
      <div className="grid grid-cols-2 gap-3">
        <NumberField
          name="timeout"
          label="Give up after (seconds)"
          value={body.timeoutSeconds}
          min={1}
          max={3600}
          disabled={readOnly}
          error={fieldError("/body/timeoutSeconds")}
          onChange={(value) => change({ timeoutSeconds: value ?? 60 })}
        />
        <NumberField
          name="retries"
          label="Try again (times)"
          value={body.retries.limit}
          min={0}
          max={10}
          disabled={readOnly}
          onChange={(value) => change({ retries: { ...body.retries, limit: value ?? 0 } })}
        />
      </div>
      <MultiSelectField
        label="Connections it uses"
        options={connections}
        value={body.uses.connections}
        disabled={readOnly}
        placeholder="None"
        hint="A script reaches only what it names here."
        onChange={(value) => change({ uses: { ...body.uses, connections: value } })}
      />
      <MultiSelectField
        label="Secrets it reads"
        options={secrets}
        value={body.uses.secrets}
        disabled={readOnly}
        placeholder="None"
        onChange={(value) => change({ uses: { ...body.uses, secrets: value } })}
      />
      <MultiSelectField
        label="Variables it reads"
        options={variables}
        value={body.uses.variables}
        disabled={readOnly}
        placeholder="None"
        onChange={(value) => change({ uses: { ...body.uses, variables: value } })}
      />
      <TextAreaField
        name="input"
        label="Input schema, as JSON Schema"
        value={schemaText}
        rows={7}
        disabled={readOnly}
        hint="What the script takes. A run with input that does not match is refused."
        onChange={(text) => {
          setSchemaText(text);
          setDirty(true);
        }}
      />
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
      <Link to={`${link}/scripts`} className="text-[13px] text-action">
        All scripts
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
                placeholder="orders/sync"
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
                    text: "The script goes back to how it was last deployed. A script that was never deployed is gone.",
                    action: "Discard",
                    danger: true,
                  });
                  if (!sure) return;
                  await api
                    .delete(`${root}/drafts/${opened}`)
                    .then(() => navigate(`${link}/scripts`), notify.error);
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
      {!editable ? (
        <Notice tone="attention">
          This is a production workspace. Scripts are edited in a dev workspace and reach production
          by promotion.
        </Notice>
      ) : fromRepository ? (
        <Notice tone="attention">
          This script is managed in the tenant's repository, and its source is not kept here. Change
          it there, or write a script of the same path here to take it over.
        </Notice>
      ) : state === "repository" ? (
        <Notice tone="attention">
          Saving a draft of this script takes it over from the repository.
        </Notice>
      ) : null}
      {problem ? <Notice tone="danger">{problem}</Notice> : null}
      <div className="grid gap-4 xl:grid-cols-[1fr_22rem]">
        <div className="min-w-0">
          {fromRepository ? (
            <EmptyState title="The source is in the repository" />
          ) : (
            <CodeEditor
              label={`Source of ${path || "the new script"}`}
              path={`scripts/${opened ?? "new"}.ts`}
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
              { id: "try", label: "Try it", content: trying },
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
      : row.kind === "script"
        ? `${link}/scripts/edit/${row.path}`
        : row.kind === "flow"
          ? `${link}/flows/edit/${row.path}`
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
