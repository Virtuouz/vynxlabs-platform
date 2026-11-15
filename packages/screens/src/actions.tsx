import type { InterfacePage, WidgetAction } from "@vynxlabs/manifest";
import { Button, Dialog, type JsonSchema, Notice, SchemaForm, useDialogs } from "@vynxlabs/ui";
import { type ReactNode, useState } from "react";
import { type DataClient, failure, type Row, type StartedRun, type TargetInfo } from "./data.ts";

/** What a path into a page can read: the rows chosen, the row in hand, the filters set. */
export interface PageScope {
  selection: Record<string, Row>;
  row?: Row | undefined;
  filters: Record<
    string,
    { from?: string | undefined; to?: string | undefined; value?: string | undefined }
  >;
}

/** The value a path names, or undefined when the page holds nothing there. */
export function readPath(path: string, scope: PageScope): unknown {
  const [root, first, second] = path.split(".") as [string, string, string | undefined];
  if (root === "row") return scope.row?.[first];
  if (root === "selection") return scope.selection[first]?.[second as string];
  if (root === "filters") {
    const set = scope.filters[first];
    return set?.[second as "from" | "to" | "value"];
  }
  return undefined;
}

const present = (value: unknown) => value !== undefined && value !== null && value !== "";

/** The input an action maps from the page. What is not there is left out, to be asked for. */
export function mappedInput(action: WidgetAction, scope: PageScope): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  for (const [name, mapped] of Object.entries(action.input ?? {})) {
    const value = typeof mapped === "string" ? readPath(mapped, scope) : mapped.value;
    if (present(value)) input[name] = value;
  }
  return input;
}

/** Whether an action may be pressed now: what it waits for is there. */
export function actionReady(action: WidgetAction, scope: PageScope): boolean {
  return !action.enabledWhen || present(readPath(action.enabledWhen, scope));
}

/** A confirmation with the page's values put in. They are text: nothing in them is markup. */
export function fillText(text: string, scope: PageScope): string {
  return text.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, path: string) => {
    const value = readPath(path, scope);
    return present(value) ? String(value) : "—";
  });
}

/** Widgets whose chosen row an action reads: they must let a row be chosen. */
export function selectedBy(page: InterfacePage): Set<string> {
  const ids = new Set<string>();
  const note = (path: string | undefined) => {
    const [root, widget] = (path ?? "").split(".");
    if (root === "selection" && widget) ids.add(widget);
  };
  for (const widget of page.widgets) {
    for (const action of [...(widget.action ? [widget.action] : []), ...(widget.actions ?? [])]) {
      for (const mapped of Object.values(action.input ?? {})) {
        if (typeof mapped === "string") note(mapped);
      }
      note(action.enabledWhen);
      for (const match of (action.confirm ?? "").matchAll(/\{\{\s*([^}]+?)\s*\}\}/g)) {
        note(match[1]);
      }
    }
  }
  return ids;
}

/** How long a page waits on a run before it says the run goes on without it. */
const WAIT_MS = 30_000;
const TERMINAL = new Set(["succeeded", "failed", "cancelled"]);

/** What pressing an action came to, as the page says it. */
export interface ActionOutcome {
  tone: "success" | "danger" | "attention";
  text: string;
  output?: unknown;
  run?: StartedRun;
}

export interface ActionHost {
  client: DataClient;
  targets: Record<string, TargetInfo>;
  /** Where a run's page is, for someone who may open it. Without it, runs are not linked. */
  runLink?: ((run: StartedRun) => string) | undefined;
  /** Called once an action succeeds, so the page reads its rows again. */
  onDone: () => void;
  /** Says it does not start anything: the builder's preview outside a dev workspace. */
  dryRun?: boolean;
  /** Whether the person is staff, who are told a failure's reason; end users are not. */
  member?: boolean;
}

/**
 * Runs actions for a page: asks for what the page does not map, confirms,
 * starts it as the person looking, waits a while for it, and says how it went.
 */
export function useActions(host: ActionHost) {
  const dialogs = useDialogs();
  const [asking, setAsking] = useState<{
    action: WidgetAction;
    schema: JsonSchema;
    value: Record<string, unknown>;
    answer: (input: Record<string, unknown> | null) => void;
  }>();
  const [outcome, setOutcome] = useState<ActionOutcome & { label: string }>();
  const [busy, setBusy] = useState<string>();

  const info = (action: WidgetAction) =>
    host.targets[`${action.target.kind}:${action.target.path}`];
  const canStart = (action: WidgetAction) => info(action)?.canStart === true;

  const ask = (action: WidgetAction, schema: JsonSchema, value: Record<string, unknown>) =>
    new Promise<Record<string, unknown> | null>((answer) =>
      setAsking({ action, schema, value, answer }),
    );

  const run = async (action: WidgetAction, scope: PageScope) => {
    const target = info(action);
    if (!target?.canStart) return;
    let input = mappedInput(action, scope);
    const schema = target.inputSchema as JsonSchema | null;
    const required = (schema?.required as string[] | undefined) ?? [];
    if (schema && required.some((name) => !(name in input))) {
      const answered = await ask(action, schema, input);
      if (!answered) return;
      input = answered;
    }
    if (action.confirm) {
      const sure = await dialogs.confirm({
        title: action.label,
        text: fillText(action.confirm, scope),
        action: action.label,
      });
      if (!sure) return;
    }
    if (host.dryRun || !host.client.start) {
      setOutcome({
        label: action.label,
        tone: "attention",
        text: `Not started here. It would send: ${JSON.stringify(input)}`,
      });
      return;
    }
    setBusy(action.label);
    setOutcome(undefined);
    try {
      const started = await host.client.start(action.target, input);
      let state = { status: "queued" } as Awaited<ReturnType<NonNullable<DataClient["run"]>>>;
      const until = Date.now() + WAIT_MS;
      while (host.client.run && !TERMINAL.has(state.status) && Date.now() < until) {
        await new Promise((resolve) => setTimeout(resolve, 800));
        state = await host.client.run(started);
      }
      const member = host.member ?? host.runLink !== undefined;
      if (state.status === "succeeded" || !host.client.run) {
        setOutcome({
          label: action.label,
          tone: "success",
          text: target.description && !member ? target.description : `${action.label}: done.`,
          ...(action.result?.show === "output" ? { output: state.output } : {}),
          run: started,
        });
        host.onDone();
      } else if (TERMINAL.has(state.status)) {
        setOutcome({
          label: action.label,
          tone: "danger",
          text: member
            ? `${action.label} failed: ${state.error?.message ?? state.status}`
            : `Something went wrong. Quote run ${started.id} if you ask for help.`,
          run: started,
        });
      } else {
        setOutcome({
          label: action.label,
          tone: "attention",
          text: `${action.label} is still running.`,
          run: started,
        });
      }
    } catch (error) {
      setOutcome({ label: action.label, tone: "danger", text: failure(error).message });
    } finally {
      setBusy(undefined);
    }
  };

  const shown: ReactNode = (
    <>
      {outcome ? (
        <div className="mb-3" role="status">
          <Notice tone={outcome.tone}>
            <span className="flex flex-col gap-1">
              <span>
                {outcome.text}
                {outcome.run && host.runLink ? (
                  <>
                    {" "}
                    <a href={host.runLink(outcome.run)} className="text-action underline">
                      Open run
                    </a>
                  </>
                ) : outcome.run && host.member && outcome.tone !== "success" ? (
                  ` Run ${outcome.run.id}.`
                ) : null}
              </span>
              {outcome.output !== undefined ? (
                <pre className="m-0 max-h-60 overflow-auto font-mono text-[12px] whitespace-pre-wrap">
                  {JSON.stringify(outcome.output, null, 2)}
                </pre>
              ) : null}
            </span>
          </Notice>
        </div>
      ) : null}
      {asking ? (
        <Dialog
          open
          title={asking.action.label}
          onClose={() => {
            asking.answer(null);
            setAsking(undefined);
          }}
        >
          <SchemaForm
            schema={asking.schema}
            value={asking.value}
            submitLabel={asking.action.label}
            onCancel={() => {
              asking.answer(null);
              setAsking(undefined);
            }}
            onSubmit={(value) => {
              asking.answer((value ?? {}) as Record<string, unknown>);
              setAsking(undefined);
            }}
          />
        </Dialog>
      ) : null}
    </>
  );

  return { run, canStart, busy, shown };
}

/** An action widget: one button, pressed when what it waits for is there. */
export function ActionButton({
  action,
  scope,
  actions,
}: {
  action: WidgetAction;
  scope: PageScope;
  actions: ReturnType<typeof useActions>;
}) {
  const ready = actionReady(action, scope);
  return (
    <div className="flex h-full flex-col items-start justify-center gap-1">
      <Button
        variant="primary"
        disabled={!ready || actions.busy !== undefined}
        onClick={() => void actions.run(action, scope)}
      >
        {actions.busy === action.label ? `${action.label}…` : action.label}
      </Button>
      {!ready ? <span className="text-[13px] text-ink-muted">Choose a row first.</span> : null}
    </div>
  );
}
