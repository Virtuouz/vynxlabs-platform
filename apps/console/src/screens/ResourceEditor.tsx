import {
  Badge,
  type BadgeTone,
  Button,
  CheckboxField,
  ComboboxField,
  Notice,
  type Option,
  SelectField,
  TextAreaField,
  TextField,
} from "@vynxlabs/ui";
import { useEffect, useState } from "react";
import { type ApiError, api, useLoad } from "../api.ts";
import { ask, failureText, notify } from "../ask.tsx";
import { Link, navigate } from "../router.tsx";
import {
  FormDesigner,
  type FormTrigger,
  newForm,
  WebhookSettings,
  type WebhookTrigger,
} from "./FlowSteps.tsx";

/** The kinds of resource this editor makes and changes: the ones that are settings, with no code. */
export const EDITED_KINDS = [
  "connection",
  "connection_group",
  "variable",
  "event",
  "schedule",
  "trigger",
] as const;
export type EditedKind = (typeof EDITED_KINDS)[number];
export const isEditedKind = (kind: string): kind is EditedKind =>
  (EDITED_KINDS as readonly string[]).includes(kind);

type Body = Record<string, unknown>;

const ABOUT: Record<EditedKind, { noun: string; example: string; says: string; fresh: Body }> = {
  connection: {
    noun: "connection",
    example: "shop/api",
    says: "An outside system the workspace talks to. Its address and secret are set under Connections, in each workspace.",
    fresh: { connector: "http" },
  },
  connection_group: {
    noun: "connection group",
    example: "customers/shops",
    says: "Connections of one kind whose members are added in each workspace with no deploy, so that a script can choose one by the data.",
    fresh: { connector: "http" },
  },
  variable: {
    noun: "variable",
    example: "orders/batch-size",
    says: "A setting scripts read when they run. Each workspace can give it a value of its own.",
    fresh: {},
  },
  event: {
    noun: "event",
    example: "orders/placed",
    says: "Something that happens, which scripts and flows publish and listen for.",
    fresh: {
      payload: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    },
  },
  schedule: {
    noun: "schedule",
    example: "orders/nightly",
    says: "Starts a script at times given as a cron line.",
    fresh: { script: "", cron: "0 8 * * *" },
  },
  trigger: {
    noun: "trigger",
    example: "hooks/orders",
    says: "Starts a script when an address is called, an event is published, or a form is sent.",
    fresh: { type: "webhook", script: "" },
  },
};

const PATH = /^[a-z0-9][a-z0-9_-]*(\/[a-z0-9][a-z0-9_-]*)*$/;

/** A body with nothing in it that says nothing: no empty text, no undefined. */
function tidy(body: Body): Body {
  return Object.fromEntries(
    Object.entries(body).filter(([, value]) => value !== undefined && value !== ""),
  );
}

/** What is wrong with a body that can be seen before the server is asked. */
export function resourceProblems(kind: EditedKind, body: Body, json: Record<string, string>) {
  const problems: string[] = [];
  const parses = (name: string, label: string) => {
    if (json[name] === undefined || json[name]?.trim() === "") return;
    try {
      const value = JSON.parse(json[name] as string);
      if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error();
    } catch {
      problems.push(`${label} is not a JSON object.`);
    }
  };
  if (kind === "event") parses("payload", "The payload schema");
  if (kind === "schedule") {
    parses("input", "The input");
    if (!body.script) problems.push("Choose the script it starts.");
    if (!String(body.cron ?? "").trim()) problems.push("Say when, as a cron line.");
  }
  if (kind === "trigger") {
    if (!body.script) problems.push("Choose the script it starts.");
    if (body.type === "event" && !body.event) problems.push("Choose the event it listens for.");
    if (body.type === "form" && !body.title) problems.push("Give the form a title.");
    const verify = body.verify as { secret?: string } | undefined;
    if (body.type === "webhook" && verify && !verify.secret) {
      problems.push("Choose the secret the signature is checked against.");
    }
  }
  if ((kind === "connection" || kind === "connection_group") && !body.connector) {
    problems.push("Choose what kind of connection it is.");
  }
  return problems;
}

/**
 * A resource that is settings and no code, made and changed in the console:
 * a connection, a connection group, a variable, an event, a schedule or a
 * trigger. Saving makes a draft, deployed from the Changes screen.
 */
export function ResourceEditor({
  root,
  link,
  kind,
  path: opened,
  editable,
}: {
  root: string;
  link: string;
  kind: EditedKind;
  /** The resource to open, or nothing for a new one. */
  path: string | undefined;
  /** False in a production workspace. */
  editable: boolean;
}) {
  const about = ABOUT[kind];
  const [path, setPath] = useState(opened ?? "");
  const [body, setBody] = useState<Body>();
  /** The parts of the body that are written as JSON, as text. */
  const [json, setJson] = useState<Record<string, string>>({});
  const [revision, setRevision] = useState<number>();
  const [state, setState] = useState<"new" | "draft" | "deployed" | "repository">("new");
  const [dirty, setDirty] = useState(false);
  const [problem, setProblem] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const resources = useLoad<{ items: { path: string; kind: string; body: { mode?: string } }[] }>(
    `${root}/resources`,
  );
  const drafts = useLoad<{ items: { path: string; kind: string; deleted: boolean }[] }>(
    `${root}/drafts`,
  );
  const secrets = useLoad<{ items: { name: string }[] }>(`${root}/secrets`);

  useEffect(() => {
    let current = true;
    const open = (next: Body, as: typeof state, at?: number) => {
      if (!current) return;
      setBody(next);
      setJson({
        ...(next.payload ? { payload: JSON.stringify(next.payload, null, 2) } : {}),
        ...(next.input && typeof next.input === "object"
          ? { input: JSON.stringify(next.input, null, 2) }
          : {}),
      });
      setState(as);
      setRevision(at);
    };
    if (!opened) {
      open(about.fresh, "new");
      return;
    }
    (async () => {
      try {
        const draft = await api.get<{ body: Body; revision: number }>(`${root}/drafts/${opened}`);
        open(draft.body, "draft", draft.revision);
      } catch (error) {
        if ((error as ApiError).status !== 404) throw error;
        const resource = await api.get<{ ownership: string; body: Body }>(
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

  const readOnly = !editable;
  const change = (next: Body) => {
    setBody(tidy({ ...body, ...next }));
    setDirty(true);
  };
  const text = (name: string) => (body[name] as string | undefined) ?? "";
  /** What the workspace has of a kind, deployed or still a draft. */
  const ofKind = (wanted: string, mode?: string): Option[] => {
    const known = new Map<string, string | undefined>();
    for (const one of resources.data?.items ?? []) {
      if (one.kind === wanted && (!mode || one.body.mode === mode)) known.set(one.path, undefined);
    }
    for (const draft of drafts.data?.items ?? []) {
      if (draft.kind === wanted && !draft.deleted && !known.has(draft.path) && !mode) {
        known.set(draft.path, "A draft, not yet deployed.");
      }
    }
    return [...known].map(([value, hint]) => ({ value, label: value, ...(hint ? { hint } : {}) }));
  };
  const found = resourceProblems(kind, body, json);

  const save = async () => {
    setProblem(undefined);
    if (!PATH.test(path)) {
      setProblem(
        `Give the ${about.noun} a path: lowercase letters, digits, hyphens and underscores, in folders. For example ${about.example}.`,
      );
      return;
    }
    if (found.length > 0) {
      // What is missing is listed under the form from now on, until it is put right.
      setTried(true);
      return;
    }
    const written: Body = { ...body };
    for (const [name, value] of Object.entries(json)) {
      if (value.trim() === "") delete written[name];
      else written[name] = JSON.parse(value);
    }
    setBusy(true);
    try {
      const saved = await api.put<{ body: Body; revision: number }>(`${root}/drafts/${path}`, {
        kind,
        schemaVersion: 1,
        body: written,
        ...(revision ? { revision } : {}),
      });
      setBody(saved.body);
      setRevision(saved.revision);
      setState("draft");
      setDirty(false);
      drafts.reload();
      if (!opened) navigate(`${link}/resources/edit/${kind}/${path}`, { replace: true });
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
  const jsonField = (name: string, label: string, hint: string, rows = 6) => (
    <TextAreaField
      name={name}
      label={label}
      rows={rows}
      value={json[name] ?? ""}
      required={false}
      disabled={readOnly}
      hint={hint}
      onChange={(value) => {
        setJson({ ...json, [name]: value });
        setDirty(true);
      }}
    />
  );
  const description = (
    <TextField
      name="description"
      label="What it is for"
      value={text("description")}
      required={false}
      disabled={readOnly}
      onChange={(value) => change({ description: value })}
    />
  );
  const script = (
    <ComboboxField
      label="The script it starts"
      options={ofKind("script")}
      value={text("script") || undefined}
      disabled={readOnly}
      empty="This workspace has no scripts yet."
      onChange={(value) => change({ script: value ?? "" })}
    />
  );
  const enabled = (
    <CheckboxField
      name="enabled"
      label="Turned on"
      checked={body.enabled !== false}
      disabled={readOnly}
      onChange={(on) => change({ enabled: on ? undefined : false })}
    />
  );

  return (
    <section className="flex flex-col gap-4">
      <Link to={`${link}/resources`} className="text-[13px] text-action">
        All resources
      </Link>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          {opened ? (
            <h1 className="m-0 truncate font-mono text-lg font-semibold">{path}</h1>
          ) : (
            <div className="w-72">
              <TextField
                name="path"
                label={`Path of the new ${about.noun}`}
                value={path}
                placeholder={about.example}
                hint="Its name in this workspace. It cannot be changed later."
                onChange={setPath}
              />
            </div>
          )}
          <Badge>{about.noun}</Badge>
          <Badge tone={STATE[state][0]}>{STATE[state][1]}</Badge>
          {dirty ? <Badge>Unsaved changes</Badge> : null}
        </div>
        {readOnly ? null : (
          <div className="flex items-center gap-2">
            {opened && state !== "new" ? (
              <Button
                variant="danger"
                disabled={busy}
                onClick={async () => {
                  const draft = state === "draft";
                  const sure = await ask.confirm({
                    title: draft ? "Discard this draft?" : `Remove this ${about.noun}?`,
                    text: draft
                      ? `The ${about.noun} goes back to how it was last deployed. One that was never deployed is gone.`
                      : "This saves a draft that removes it. Nothing changes until that draft is deployed.",
                    action: draft ? "Discard" : "Remove",
                    danger: true,
                  });
                  if (!sure) return;
                  await (draft
                    ? api.delete(`${root}/drafts/${opened}`)
                    : api.put(`${root}/drafts/${opened}`, {
                        kind,
                        schemaVersion: 1,
                        body: {},
                        deleted: true,
                      })
                  ).then(
                    () => navigate(`${link}/${draft ? "resources" : "changes"}`),
                    notify.error,
                  );
                }}
              >
                {state === "draft" ? "Discard draft" : "Remove"}
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
      <p className="m-0 max-w-3xl text-ink-muted">{about.says}</p>
      {!editable ? (
        <Notice tone="attention">
          This is a production workspace. Resources are changed in a dev workspace and reach
          production by promotion.
        </Notice>
      ) : state === "repository" ? (
        <Notice tone="attention">
          This {about.noun} is managed in the tenant's repository. Saving a draft of it takes it
          over.
        </Notice>
      ) : null}
      {problem ? <Notice tone="danger">{problem}</Notice> : null}

      <div className="flex max-w-2xl flex-col gap-3 rounded-panel border border-line bg-surface p-4">
        {kind === "connection" || kind === "connection_group" ? (
          <>
            <ComboboxField
              label="What kind of connection"
              options={[
                { value: "http", label: "HTTP", hint: "An API with an address and a key." },
                { value: "smtp", label: "Mail (SMTP)", hint: "A mail server to send through." },
                ...ofKind("connector").map((one) => ({
                  ...one,
                  hint: one.hint ?? "A connector of this workspace.",
                })),
              ]}
              value={text("connector") || undefined}
              disabled={readOnly}
              onChange={(value) => change({ connector: value ?? "" })}
            />
            {description}
          </>
        ) : null}
        {kind === "variable" ? (
          <>
            {description}
            <TextAreaField
              name="default"
              label="Value when a workspace sets none (optional)"
              rows={2}
              value={text("default")}
              required={false}
              disabled={readOnly}
              onChange={(value) => change({ default: value })}
            />
          </>
        ) : null}
        {kind === "event" ? (
          <>
            {description}
            {jsonField(
              "payload",
              "What it carries, as JSON Schema",
              "Every published payload must match. A payload that does not is refused.",
              10,
            )}
          </>
        ) : null}
        {kind === "schedule" ? (
          <>
            {script}
            <TextField
              name="cron"
              label="When, as a cron line"
              value={text("cron")}
              disabled={readOnly}
              hint="Minute, hour, day of month, month, day of week. 0 8 * * * is every day at 8."
              onChange={(value) => change({ cron: value })}
            />
            <TextField
              name="timezone"
              label="Time zone (optional)"
              value={text("timezone")}
              required={false}
              disabled={readOnly}
              placeholder="UTC"
              hint="An IANA name, such as America/Chicago."
              onChange={(value) => change({ timezone: value })}
            />
            {ofKind("trigger_source", "poll").length > 0 || body.source ? (
              <ComboboxField
                label="Trigger source (optional)"
                options={ofKind("trigger_source", "poll")}
                value={text("source") || undefined}
                disabled={readOnly}
                hint="Each tick runs it, and the script starts once for each thing it finds."
                onChange={(value) => change({ source: value })}
              />
            ) : null}
            {jsonField("input", "Input for the script (optional), as JSON", "A JSON object.", 4)}
            {enabled}
          </>
        ) : null}
        {kind === "trigger" ? (
          <>
            <SelectField
              name="trigger-type"
              label="It starts the script"
              value={text("type") || "webhook"}
              disabled={readOnly || state !== "new"}
              options={[
                { value: "webhook", label: "When its address is called" },
                { value: "event", label: "When an event is published" },
                { value: "form", label: "When someone fills in its form" },
              ]}
              {...(state === "new"
                ? {}
                : { hint: "What a trigger is cannot be changed once it is saved. Make another." })}
              onChange={(type) => {
                const kept = { script: text("script") };
                setBody(
                  type === "event"
                    ? { type, ...kept, event: "" }
                    : type === "form"
                      ? { ...newForm(), ...kept }
                      : { type: "webhook", ...kept },
                );
                setDirty(true);
              }}
            />
            {script}
            {body.type === "webhook" ? (
              <WebhookSettings
                canRespond={false}
                trigger={body as unknown as WebhookTrigger}
                sources={ofKind("trigger_source", "webhook")}
                secrets={(secrets.data?.items ?? []).map((one) => ({
                  value: one.name,
                  label: one.name,
                }))}
                onChange={(trigger) => {
                  setBody(tidy({ ...trigger, script: text("script"), enabled: body.enabled }));
                  setDirty(true);
                }}
              />
            ) : null}
            {body.type === "event" ? (
              <>
                <ComboboxField
                  label="Event"
                  options={ofKind("event")}
                  value={text("event") || undefined}
                  disabled={readOnly}
                  onChange={(value) => change({ event: value ?? "" })}
                />
                <TextAreaField
                  name="filter"
                  label="Only when (optional)"
                  rows={2}
                  value={text("filter")}
                  required={false}
                  disabled={readOnly}
                  hint="An expression over event. The script starts only when it is true."
                  onChange={(value) => change({ filter: value })}
                />
              </>
            ) : null}
            {body.type === "form" ? (
              <FormDesigner
                trigger={body as unknown as FormTrigger}
                onChange={(trigger) => {
                  setBody(tidy({ ...trigger, script: text("script"), enabled: body.enabled }));
                  setDirty(true);
                }}
              />
            ) : null}
            {enabled}
          </>
        ) : null}
      </div>
      {found.length > 0 && tried ? (
        <Notice tone="attention">
          <ul className="m-0 pl-5">
            {found.map((one) => (
              <li key={one}>{one}</li>
            ))}
          </ul>
        </Notice>
      ) : null}
    </section>
  );
}
