import { Badge, Button, Notice, SelectField } from "@vynxlabs/ui";
import { useEffect, useState } from "react";
import { api, useLoad } from "../api.ts";
import { failureText, notify } from "../ask.tsx";
import { StatePill, Tag } from "../kit/status.tsx";
import { Page } from "../ListScreen.tsx";
import { Link } from "../router.tsx";
import { type TaskState, useTaskEnd } from "../tasks.ts";
import { fromNow } from "./Overview.tsx";

interface AlertRow {
  kind: "run" | "flow_run";
  id: string;
  name: string;
  at: string;
  error: string | null;
  notified: boolean | null;
  notifyError: string | null;
  handlerRunId: string | null;
  handlerError: string | null;
  repeats: number;
}
interface Settings {
  default: { script?: string; notify?: string };
  overrides: { path: string; ownership: string; script?: string; notify?: string }[];
}

/**
 * Failure alerts: who is told when a run fails for the last time, and what was
 * sent. A script's own `onFailure` wins over the workspace's default. Failures
 * of one script within ten minutes of an alert are counted on it, not sent.
 */
export function Alerts({
  root,
  link,
  workspaceRoot,
  editable,
}: {
  root: string;
  link: string;
  /** The workspace itself, where its default is changed. */
  workspaceRoot: string;
  editable: boolean;
}) {
  const settings = useLoad<Settings>(`${root}/alert-settings`);
  const scripts = useLoad<{ items: { path: string }[] }>(`${root}/scripts`);
  const connections = useLoad<{ items: { path: string; connector: string; bound: boolean }[] }>(
    `${root}/connection-bindings`,
  );
  const [script, setScript] = useState("");
  const [notifyPath, setNotifyPath] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string>();
  const [tested, setTested] = useState<{ tone: "success" | "danger"; text: string }>();
  const [before, setBefore] = useState<string>();
  const alerts = useLoad<{ items: AlertRow[]; nextBefore: string | null }>(
    `${root}/alerts${before ? `?before=${encodeURIComponent(before)}` : ""}`,
  );
  const [shown, setShown] = useState<AlertRow[]>([]);
  useEffect(() => {
    if (!alerts.data) return;
    const page = alerts.data.items;
    setShown((held) =>
      before ? [...held.filter((one) => !page.some((p) => p.id === one.id)), ...page] : page,
    );
  }, [alerts.data, before]);
  useEffect(() => {
    setScript(settings.data?.default.script ?? "");
    setNotifyPath(settings.data?.default.notify ?? "");
  }, [settings.data]);
  const following = useTaskEnd(root, testing, (task: TaskState) => {
    setTesting(undefined);
    setTested(
      task.status === "succeeded"
        ? { tone: "success", text: "The test alert was posted." }
        : { tone: "danger", text: task.error?.message ?? "The test alert was not posted." },
    );
  });

  const changed =
    script !== (settings.data?.default.script ?? "") ||
    notifyPath !== (settings.data?.default.notify ?? "");
  const save = async () => {
    setSaving(true);
    try {
      await api.patch(workspaceRoot, {
        failureAlert: {
          ...(script ? { script } : {}),
          ...(notifyPath ? { notify: notifyPath } : {}),
        },
      });
      settings.reload();
      notify.success("Alerts will go there from the next failure.");
    } catch (error) {
      notify.error(error);
    } finally {
      setSaving(false);
    }
  };
  const httpConnections = (connections.data?.items ?? []).filter(
    (one) => one.connector === "http" && one.bound,
  );

  return (
    <Page
      title="Alerts"
      description="Who is told when a script or a flow fails for the last time. A script's own onFailure wins over this workspace's default. More failures of one script within ten minutes of an alert are counted on it, not sent again."
    >
      <section aria-label="Default" className="flex max-w-2xl flex-col gap-3">
        <h2 className="m-0 text-title font-semibold">This workspace's default</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField
            name="handler"
            label="Start a script"
            value={script}
            disabled={!editable}
            options={[
              { value: "", label: "None" },
              ...(scripts.data?.items ?? []).map((one) => ({ value: one.path, label: one.path })),
            ]}
            onChange={setScript}
          />
          <SelectField
            name="notify"
            label="Post to a connection"
            value={notifyPath}
            disabled={!editable}
            options={[
              { value: "", label: "None" },
              ...httpConnections.map((one) => ({ value: one.path, label: one.path })),
            ]}
            onChange={setNotifyPath}
          />
        </div>
        <p className="m-0 text-body-sm text-ink-muted">
          The script is given the failed run. The connection is posted a summary as JSON, with a
          line of text a chat webhook shows as it is.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {editable ? (
            <Button variant="primary" disabled={!changed || saving} onClick={save}>
              Save
            </Button>
          ) : null}
          {notifyPath ? (
            <Button
              disabled={following.waiting}
              onClick={async () => {
                setTested(undefined);
                try {
                  const task = await api.post<{ id: string }>(`${root}/alert-tests`, {
                    connection: notifyPath,
                  });
                  setTesting(task.id);
                } catch (error) {
                  setTested({ tone: "danger", text: failureText(error) });
                }
              }}
            >
              {following.waiting
                ? following.slow
                  ? "Waiting for a worker…"
                  : "Sending…"
                : "Send a test alert"}
            </Button>
          ) : null}
          {tested ? <Badge tone={tested.tone}>{tested.text}</Badge> : null}
        </div>
      </section>

      {(settings.data?.overrides.length ?? 0) > 0 ? (
        <section aria-label="Set by scripts" className="flex flex-col gap-2">
          <h2 className="m-0 text-title font-semibold">Set by scripts themselves</h2>
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {settings.data?.overrides.map((one) => (
              <li key={one.path} className="flex flex-wrap items-center gap-2 text-body">
                <Link to={`${link}/scripts/edit/${one.path}`} className="font-mono text-code">
                  {one.path}
                </Link>
                <span className="text-ink-muted">
                  {[
                    one.script ? `starts ${one.script}` : null,
                    one.notify ? `posts to ${one.notify}` : null,
                  ]
                    .filter(Boolean)
                    .join(", ")}
                </span>
                {one.ownership === "code" ? <Tag tone="repository">From the repository</Tag> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-label="Recent alerts" className="flex flex-col gap-2">
        <h2 className="m-0 text-title font-semibold">Recent alerts</h2>
        {alerts.error ? (
          <Notice tone="danger">{alerts.error.message}</Notice>
        ) : shown.length === 0 ? (
          <p className="m-0 text-ink-muted">
            {alerts.data ? "No alert has been sent from this workspace." : "Loading…"}
          </p>
        ) : (
          <ul className="m-0 flex list-none flex-col divide-y divide-line p-0">
            {shown.map((one) => (
              <li key={one.id} className="flex flex-col gap-0.5 py-2">
                <span className="flex flex-wrap items-center gap-2">
                  <Link to={`${link}/runs/${one.id}`} className="font-mono text-code">
                    {one.name}
                  </Link>
                  <span className="text-meta text-ink-muted">{fromNow(one.at)}</span>
                  {one.notified === true ? (
                    <StatePill state="posted" />
                  ) : one.notified === false ? (
                    <StatePill state="not_posted" />
                  ) : null}
                  {one.repeats > 0 ? <Badge>+{one.repeats} more</Badge> : null}
                </span>
                {one.error ? (
                  <span className="text-body-sm text-ink-muted">{one.error}</span>
                ) : null}
                {one.notifyError ? (
                  <span className="text-body-sm text-danger">{one.notifyError}</span>
                ) : null}
                {one.handlerRunId ? (
                  <Link to={`${link}/runs/${one.handlerRunId}`} className="text-meta">
                    The script it started
                  </Link>
                ) : one.handlerError ? (
                  <span className="text-body-sm text-danger">{one.handlerError}</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {alerts.data?.nextBefore ? (
          <div>
            <Button size="small" onClick={() => setBefore(alerts.data?.nextBefore ?? undefined)}>
              Older alerts
            </Button>
          </div>
        ) : null}
      </section>
    </Page>
  );
}
