import {
  Button,
  CheckboxField,
  ComboboxField,
  checkValue,
  type JsonSchema,
  Notice,
  type Option,
  SchemaForm,
  SelectField,
  SideSheet,
  TextField,
} from "@vynxlabs/ui";
import { useEffect, useState } from "react";
import { api, useLoad } from "../api.ts";
import { failureText, notify } from "../ask.tsx";
import { Link } from "../router.tsx";

/** A schedule's body, as the manifest has it. */
export interface ScheduleBody {
  script?: string | undefined;
  flow?: string | undefined;
  cron?: string | undefined;
  timezone?: string | undefined;
  input?: unknown;
  overlap?: "allow" | "skip" | undefined;
  enabled?: boolean | undefined;
  source?: string | undefined;
  [more: string]: unknown;
}

const PRESETS = [
  { value: "0 * * * *", label: "Every hour" },
  { value: "0 9 * * *", label: "Every day at 9:00" },
  { value: "0 9 * * 1-5", label: "Weekdays at 9:00" },
  { value: "0 9 * * 1", label: "Mondays at 9:00" },
  { value: "0 0 1 * *", label: "The first of each month" },
];

/** The time zones the browser knows, UTC first. */
function timeZones(): Option[] {
  const known =
    typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
  return ["UTC", ...known.filter((zone) => zone !== "UTC")].map((zone) => ({
    value: zone,
    label: zone.replace(/_/g, " "),
  }));
}

const when = (instant: string, zone: string) =>
  new Date(instant).toLocaleString(undefined, {
    timeZone: zone,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

/**
 * A schedule's settings: what it starts, when, in which time zone, and with
 * what input, drawn from what it starts. The next five times are shown as the
 * scheduler works them out. `onProblems` hears what would stop it being saved.
 */
export function ScheduleFields({
  root,
  body,
  change,
  readOnly,
  onProblems,
  sources = [],
  fresh = false,
}: {
  root: string;
  body: ScheduleBody;
  change: (next: Partial<ScheduleBody>) => void;
  readOnly: boolean;
  onProblems: (problems: string[]) => void;
  /** Trigger sources a schedule can run on each tick, when the workspace has any. */
  sources?: Option[];
  /** A schedule being made: it starts in the workspace's time zone. */
  fresh?: boolean;
}) {
  const scripts = useLoad<{ items: { path: string; inputSchema?: JsonSchema }[] }>(
    `${root}/scripts`,
  );
  const flows = useLoad<{
    items: { path: string; triggers: string[]; manualInput: JsonSchema | null }[];
  }>(`${root}/flows`);
  const targets: Option[] = [
    ...(scripts.data?.items ?? []).map((one) => ({
      value: `script:${one.path}`,
      label: one.path,
      hint: "Script",
    })),
    ...(flows.data?.items ?? [])
      .filter((one) => one.triggers.includes("manual"))
      .map((one) => ({ value: `flow:${one.path}`, label: one.path, hint: "Flow" })),
  ];
  const chosen = body.flow
    ? `flow:${body.flow}`
    : body.script
      ? `script:${body.script}`
      : undefined;
  const schema: JsonSchema | undefined = body.flow
    ? (flows.data?.items.find((one) => one.path === body.flow)?.manualInput ?? undefined)
    : body.script
      ? scripts.data?.items.find((one) => one.path === body.script)?.inputSchema
      : undefined;

  const cron = (body.cron ?? "").trim();
  const [cronProblem, setCronProblem] = useState<string>();

  // With no schema the input is JSON, and only has to be that.
  const inputErrors = checkValue(schema ?? { type: "object" }, body.input ?? {});
  const problems = [
    ...(chosen ? [] : ["Choose the script or flow it starts."]),
    ...(cron ? [] : ["Say when, as a cron line."]),
    ...(cron && cronProblem ? [cronProblem] : []),
    ...(Object.keys(inputErrors).length > 0
      ? [`The input does not fit what it starts: ${Object.values(inputErrors)[0]}`]
      : []),
  ];
  const said = JSON.stringify(problems);
  // biome-ignore lint/correctness/useExhaustiveDependencies: what is said is compared as text
  useEffect(() => onProblems(problems), [said]);

  return (
    <div className="flex flex-col gap-4">
      <ComboboxField
        label="What it starts"
        options={targets}
        value={chosen}
        disabled={readOnly}
        empty="This workspace has no scripts, and no flows with a manual trigger."
        hint="A flow starts from its manual trigger."
        onChange={(value) => {
          const [kind, ...rest] = (value ?? "").split(":");
          const path = rest.join(":");
          change({
            script: kind === "script" ? path : undefined,
            flow: kind === "flow" ? path : undefined,
            input: undefined,
          });
        }}
      />
      <WhenFields
        root={root}
        value={body}
        change={change}
        readOnly={readOnly}
        fresh={fresh}
        overlapDefault="allow"
        onCronProblem={setCronProblem}
      />
      {sources.length > 0 || body.source ? (
        <ComboboxField
          label="Trigger source (optional)"
          options={sources}
          value={body.source || undefined}
          disabled={readOnly}
          hint="Each tick runs it, and what it starts starts once for each thing it finds."
          onChange={(value) => change({ source: value })}
        />
      ) : null}
      {chosen ? (
        <div className="flex flex-col gap-1">
          <span className="text-body-sm font-medium text-ink">Input</span>
          <SchemaForm
            // A new target, or its schema arriving, starts a new form.
            key={`${chosen}:${JSON.stringify(schema ?? null)}`}
            schema={schema ?? { type: "object" }}
            value={body.input ?? {}}
            disabled={readOnly}
            errors={inputErrors}
            onChange={(value) => change({ input: value })}
          />
        </div>
      ) : null}
      <CheckboxField
        name="enabled"
        label="Turned on"
        checked={body.enabled !== false}
        disabled={readOnly}
        onChange={(on) => change({ enabled: on ? undefined : false })}
      />
    </div>
  );
}

/** The zone a workspace's schedules are written in unless they say otherwise. */
export function useWorkspaceZone(root: string): string | undefined {
  const workspace = useLoad<{ timeZone?: string }>(root);
  return workspace.data ? (workspace.data.timeZone ?? "UTC") : undefined;
}

/**
 * When a schedule fires, the same wherever a schedule is made: presets, a cron
 * line, the time zone always shown, the next five times as the scheduler works
 * them out, and whether a time is skipped while the last run goes. A schedule
 * being made starts in the workspace's zone, and that zone is written into it,
 * so what is saved is what was shown; one that exists keeps its own.
 */
export function WhenFields({
  root,
  value,
  change,
  readOnly,
  fresh = false,
  overlapDefault,
  onCronProblem,
}: {
  root: string;
  value: {
    cron?: string | undefined;
    timezone?: string | undefined;
    overlap?: "allow" | "skip" | undefined;
  };
  change: (next: {
    cron?: string;
    timezone?: string;
    overlap?: "allow" | "skip" | undefined;
  }) => void;
  readOnly: boolean;
  fresh?: boolean;
  /** What this kind of schedule does when overlap is not set. */
  overlapDefault: "allow" | "skip";
  onCronProblem?: (problem: string | undefined) => void;
}) {
  const workspaceZone = useWorkspaceZone(root);
  const cron = (value.cron ?? "").trim();
  const zone = value.timezone || (fresh ? (workspaceZone ?? "UTC") : "UTC");
  // A new schedule takes the workspace's zone as its own, once it is known.
  useEffect(() => {
    if (fresh && !readOnly && !value.timezone && workspaceZone) change({ timezone: workspaceZone });
  }, [fresh, readOnly, value.timezone, workspaceZone, change]);
  // The preview is asked for once typing stops.
  const [asked, setAsked] = useState({ cron, zone });
  useEffect(() => {
    const timer = setTimeout(() => setAsked({ cron, zone }), 300);
    return () => clearTimeout(timer);
  }, [cron, zone]);
  const preview = useLoad<{ times: string[] }>(
    asked.cron
      ? `${root}/schedule-preview?cron=${encodeURIComponent(asked.cron)}&timezone=${encodeURIComponent(asked.zone)}`
      : null,
  );
  const cronProblem = preview.error?.fields[0]?.message ?? preview.error?.message;
  useEffect(
    () => onCronProblem?.(cron ? cronProblem : undefined),
    [cron, cronProblem, onCronProblem],
  );
  const preset = PRESETS.find((one) => one.value === cron)?.value ?? "";
  const skips = (value.overlap ?? overlapDefault) === "skip";

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField
          name="preset"
          label="Often used"
          value={preset}
          disabled={readOnly}
          options={[{ value: "", label: "Your own" }, ...PRESETS]}
          onChange={(next) => {
            if (next) change({ cron: next });
          }}
        />
        <TextField
          name="cron"
          label="When, as a cron line"
          value={value.cron ?? ""}
          disabled={readOnly}
          hint="Minute, hour, day of month, month, day of week."
          onChange={(next) => change({ cron: next })}
        />
      </div>
      <ComboboxField
        label="Time zone"
        options={timeZones()}
        value={zone}
        disabled={readOnly}
        hint={
          zone === workspaceZone
            ? "This workspace's zone."
            : workspaceZone
              ? `This workspace's zone is ${workspaceZone}.`
              : undefined
        }
        onChange={(next) => change({ timezone: next ?? "UTC" })}
      />
      <div className="flex flex-col gap-1" aria-live="polite">
        <span className="text-body-sm font-medium text-ink">Next times, in {zone}</span>
        {!cron ? (
          <p className="m-0 text-body-sm text-ink-muted">Shown once there is a cron line.</p>
        ) : cronProblem ? (
          <p role="alert" className="m-0 text-body-sm text-danger">
            {cronProblem}
          </p>
        ) : (
          <ol className="m-0 flex list-none flex-col gap-0.5 p-0 font-mono text-code">
            {(preview.data?.times ?? []).map((time) => (
              <li key={time}>{when(time, zone)}</li>
            ))}
          </ol>
        )}
      </div>
      <CheckboxField
        name="overlap"
        label="Skip a time while the run it started last is still going"
        {...(overlapDefault === "skip" ? { hint: "On unless turned off." } : {})}
        checked={skips}
        disabled={readOnly}
        onChange={(on) => {
          const next = on ? "skip" : "allow";
          change({ overlap: next === overlapDefault ? undefined : next });
        }}
      />
    </>
  );
}

const PATH = /^[a-z0-9][a-z0-9_-]*(\/[a-z0-9][a-z0-9_-]*)*$/;

/** Drops what says nothing, so that the manifest holds only what was set. */
function tidy(body: ScheduleBody): ScheduleBody {
  return Object.fromEntries(
    Object.entries(body).filter(([, value]) => value !== undefined && value !== ""),
  ) as ScheduleBody;
}

/**
 * A new schedule, made as a draft: from the Triggers page, or from the script
 * or flow it starts, with that filled in.
 */
export function NewScheduleSheet({
  root,
  link,
  open,
  onClose,
  target,
}: {
  root: string;
  link: string;
  open: boolean;
  onClose: () => void;
  /** What it starts, when made from that thing's own page. */
  target?: { kind: "script" | "flow"; path: string } | undefined;
}) {
  const [path, setPath] = useState(() => (target ? `${target.path}-schedule` : ""));
  // Its time zone is the workspace's, filled in once known, and shown.
  const [body, setBody] = useState<ScheduleBody>(() => ({
    cron: "0 9 * * *",
    ...(target ? { [target.kind]: target.path } : {}),
  }));
  const [problems, setProblems] = useState<string[]>([]);
  const [failure, setFailure] = useState<string>();
  const [busy, setBusy] = useState(false);
  const pathProblem =
    path && !PATH.test(path)
      ? "Lowercase letters, digits, hyphens and underscores, in folders, such as reports/daily."
      : undefined;
  const ready = PATH.test(path) && problems.length === 0;

  const save = async () => {
    setFailure(undefined);
    setBusy(true);
    try {
      await api.put(`${root}/drafts/${path}`, {
        kind: "schedule",
        schemaVersion: 1,
        body: tidy(body),
      });
      notify.success(`${path} is saved as a draft. Deploy it from Changes.`);
      onClose();
    } catch (error) {
      setFailure(failureText(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SideSheet
      open={open}
      onClose={onClose}
      title="New schedule"
      description="Starts a script or a flow at the times you set. It is saved as a draft and runs once it is deployed."
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-body-sm text-ink-muted">
            {problems[0] ?? (path ? "" : "Give it a path.")}
          </span>
          <span className="flex gap-2">
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" disabled={!ready || busy} onClick={save}>
              Save draft
            </Button>
          </span>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {failure ? <Notice tone="danger">{failure}</Notice> : null}
        <TextField
          name="path"
          label="Path"
          value={path}
          placeholder="reports/daily"
          hint="Its name in this workspace. It cannot be changed later."
          error={pathProblem}
          onChange={setPath}
        />
        <ScheduleFields
          root={root}
          body={body}
          change={(next) => setBody((before) => tidy({ ...before, ...next }))}
          readOnly={false}
          onProblems={setProblems}
          fresh
        />
        <p className="m-0 text-body-sm text-ink-muted">
          Drafts are deployed from <Link to={`${link}/changes`}>Changes</Link>.
        </p>
      </div>
    </SideSheet>
  );
}
