import {
  Button,
  CheckboxField,
  ComboboxField,
  Notice,
  type Option,
  Panel,
  SelectField,
  TextAreaField,
  TextField,
} from "@volvel/ui";
import { useEffect, useRef, useState } from "react";
import { type ApiError, api, useLoad } from "../api.ts";
import { ask, failureText, notify } from "../ask.tsx";
import { DeployMenu } from "../kit/DeployMenu.tsx";
import { Loading } from "../kit/LoadState.tsx";
import { ProductionNotice } from "../kit/objects.tsx";
import { PageHeader } from "../kit/PageHeader.tsx";
import { clearRecovery, useKeptCopy, useRecoveryCopy } from "../kit/recovery.ts";
import { StatePill, Tag } from "../kit/status.tsx";
import { navigate, useNavigationGuard, useQueryValue } from "../router.tsx";
import {
  FormDesigner,
  type FormTrigger,
  newForm,
  WebhookSettings,
  type WebhookTrigger,
} from "./FlowSteps.tsx";
import { ResourceIdentity } from "./ResourceIdentity.tsx";
import { ScheduleFields } from "./ScheduleForm.tsx";

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
    says: "Starts a script or a flow at times given as a cron line.",
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
  // A schedule's problems are its form's to say: see ScheduleFields.
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
  const [scheduleProblems, setScheduleProblems] = useState<string[]>([]);
  const [typeAsked] = useQueryValue("type");
  const askedType =
    typeAsked === "webhook" || typeAsked === "event" || typeAsked === "form"
      ? typeAsked
      : undefined;
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
        // A schedule's input is a form of its own.
        ...(next.input && typeof next.input === "object" && about.noun !== "schedule"
          ? { input: JSON.stringify(next.input, null, 2) }
          : {}),
      });
      setState(as);
      setRevision(at);
    };
    if (!opened) {
      // The Triggers page says which kind of trigger it wants.
      open(
        about.noun === "trigger" && askedType ? { ...about.fresh, type: askedType } : about.fresh,
        "new",
      );
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
  }, [root, opened, about, askedType]);

  // Changes not saved are not lost by a click elsewhere, Back, or closing the tab. A draft
  // saves itself a few seconds after the last change; something new waits for its first Save,
  // with a copy kept in this browser until then.
  useNavigationGuard(
    dirty && editable,
    `Your changes to ${path || `this new ${about.noun}`} are not saved. Leave anyway?`,
  );
  const recoveryKey = `${root}:${kind}`;
  const { kept, drop, taken } = useKeptCopy<{
    path: string;
    body: Body;
    json: Record<string, string>;
  }>(recoveryKey, !opened);
  useRecoveryCopy(recoveryKey, { path, body, json }, state === "new" && dirty);
  const autosave = useRef<() => Promise<boolean>>(async () => false);
  const failedFor = useRef<unknown>(undefined);
  // biome-ignore lint/correctness/useExhaustiveDependencies: each change starts the wait again
  useEffect(() => {
    if (!dirty || busy || !editable || (state !== "draft" && state !== "deployed")) return;
    if (failedFor.current === body) return;
    const timer = setTimeout(async () => {
      if (!(await autosave.current())) failedFor.current = body;
    }, 3000);
    return () => clearTimeout(timer);
  }, [dirty, busy, editable, state, body, json]);

  if (problem && !body) return <Notice tone="danger">{problem}</Notice>;
  if (!body) return <Loading />;

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
  const found = [
    ...resourceProblems(kind, body, json),
    ...(kind === "schedule" ? scheduleProblems : []),
  ];

  const save = async (): Promise<boolean> => {
    setProblem(undefined);
    if (!PATH.test(path)) {
      setProblem(
        `Give the ${about.noun} a path: lowercase letters, digits, hyphens and underscores, in folders. For example ${about.example}.`,
      );
      return false;
    }
    if (found.length > 0) {
      // What is missing is listed under the form from now on, until it is put right.
      setTried(true);
      return false;
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
      clearRecovery(recoveryKey);
      if (!opened) navigate(`${link}/resources/edit/${kind}/${path}`, { replace: true });
      return true;
    } catch (error) {
      setProblem(failureText(error));
      return false;
    } finally {
      setBusy(false);
    }
  };

  autosave.current = save;

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
      <PageHeader
        compact
        mono={Boolean(opened)}
        title={opened ? path : `New ${about.noun}`}
        state={
          <>
            <Tag>{about.noun}</Tag>
            <StatePill state={state} />
            {dirty ? <StatePill state="unsaved" /> : null}
          </>
        }
        actions={
          readOnly ? null : (
            <div className="flex items-center gap-2">
              {opened && state !== "new" ? (
                <ResourceIdentity
                  root={root}
                  link={link}
                  label="Name and path"
                  row={{ path: opened, kind, ownership: state === "repository" ? "code" : "ui" }}
                  unsaved={dirty}
                  onDone={(next) => {
                    if (next !== opened) navigate(`${link}/resources/edit/${kind}/${next}`);
                    else setState("draft");
                  }}
                />
              ) : null}
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
              <Button
                variant="primary"
                loading={busy}
                disabled={!dirty && state !== "new"}
                onClick={save}
              >
                Save draft
              </Button>
              {state === "draft" && !dirty && path ? (
                <DeployMenu
                  root={root}
                  link={link}
                  path={path}
                  disabled={busy}
                  onDeployed={() => setState("deployed")}
                />
              ) : null}
            </div>
          )
        }
        after={
          opened ? undefined : (
            <div className="w-72">
              <TextField
                name="path"
                label={`Path of the new ${about.noun}`}
                value={path}
                placeholder={about.example}
                hint="Its name in this workspace. It can be renamed later, and stays the same resource."
                onChange={setPath}
              />
            </div>
          )
        }
      />
      <p className="m-0 max-w-3xl text-ink-muted">{about.says}</p>
      {!editable ? (
        <ProductionNotice
          root={root}
          noun="Resources"
          edit={path ? `resources/edit/${kind}/${path}` : undefined}
        />
      ) : state === "repository" ? (
        <Notice
          tone="attention"
          action={
            <Button size="small" disabled={busy} onClick={save}>
              Move to a file
            </Button>
          }
        >
          This {about.noun} is defined by the code in the tenant's repository. To change it here,
          move it to a file: that saves a draft that takes it over. Once deployed it is{" "}
          <code className="font-mono">{`${path}.${kind}.yaml`}</code>, which the console and the
          repository both edit. Then remove its definition from the code, or the next deploy from
          the repository takes it back.
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
                  setJson(kept.json);
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

      <Panel as="div" className="flex max-w-2xl flex-col gap-3 p-4">
        {kind === "connection" || kind === "connection_group" ? (
          <>
            <ComboboxField
              label="What kind of connection"
              options={[
                { value: "http", label: "HTTP", hint: "An API with an address and a key." },
                { value: "smtp", label: "Mail (SMTP)", hint: "A mail server to send through." },
                // A group's members would each need authorizing in a browser.
                ...(kind === "connection"
                  ? [
                      {
                        value: "oauth2",
                        label: "OAuth 2.0",
                        hint: "An account at a provider such as Google or Microsoft, authorized once.",
                      },
                    ]
                  : []),
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
          <ScheduleFields
            root={root}
            body={body}
            change={change}
            readOnly={readOnly}
            sources={ofKind("trigger_source", "poll")}
            onProblems={setScheduleProblems}
            fresh={state === "new"}
          />
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
      </Panel>
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
