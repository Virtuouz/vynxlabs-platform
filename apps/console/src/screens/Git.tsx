import { Badge, type BadgeTone, Button, Notice, SelectField, TextField } from "@vynxlabs/ui";
import { useEffect, useState } from "react";
import { type ApiError, api, useLoad } from "../api.ts";
import { ask, failureText, notify } from "../ask.tsx";
import { Page } from "../ListScreen.tsx";
import { Link } from "../router.tsx";

interface Repository {
  url: string;
  defaultBranch: string;
  folder: string;
  paused: boolean;
}
type State = "never" | "synced" | "ahead" | "behind" | "conflict" | "error";
interface Status {
  repository: Repository | null;
  branch: string | null;
  state: State | null;
  syncedCommit: string | null;
  lastError: string | null;
}

/** The tenant's repository: where it is, and the token the server reaches it with. */
export function RepositorySettings({ base }: { base: string }) {
  const loaded = useLoad<{ repository: Repository | null }>(`${base}/git-repository`);
  const [url, setUrl] = useState("");
  const [defaultBranch, setDefaultBranch] = useState("main");
  const [folder, setFolder] = useState("platform");
  const [token, setToken] = useState("");
  const [problem, setProblem] = useState<string>();
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const repository = loaded.data?.repository;

  useEffect(() => {
    if (!repository) return;
    setUrl(repository.url);
    setDefaultBranch(repository.defaultBranch);
    setFolder(repository.folder);
  }, [repository]);

  if (loaded.error) return <Notice tone="danger">{loaded.error.message}</Notice>;
  if (!loaded.data) return <p className="text-ink-muted">Loading…</p>;

  return (
    <Page
      title="Repository"
      description="The git repository this tenant's work is kept in. Resources written in the console are committed to it as files in one folder, on a branch per dev workspace. Nothing else in it is touched."
    >
      {repository?.paused ? (
        <Notice tone="attention">
          <strong>Sync is paused.</strong> This tenant was imported from another instance, which may
          still push to the same branches. Check the details below and save to turn sync on.
        </Notice>
      ) : null}
      <form
        className="flex max-w-xl flex-col gap-3 rounded-panel border border-line bg-surface p-4"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setProblem(undefined);
          setSaved(false);
          try {
            await api.put(`${base}/git-repository`, {
              url,
              defaultBranch,
              folder,
              ...(token ? { token } : {}),
            });
            setToken("");
            setSaved(true);
            loaded.reload();
          } catch (error) {
            setProblem(failureText(error));
          } finally {
            setBusy(false);
          }
        }}
      >
        <TextField
          name="url"
          label="Address"
          value={url}
          placeholder="https://github.com/acme/platform.git"
          hint="An HTTPS address, with no user name or token in it."
          onChange={setUrl}
        />
        <div className="grid grid-cols-2 gap-3">
          <TextField
            name="defaultBranch"
            label="Default branch"
            value={defaultBranch}
            hint="Never written to. Changes reach it by a pull request."
            onChange={setDefaultBranch}
          />
          <TextField
            name="folder"
            label="Folder"
            value={folder}
            hint="The one folder the console writes."
            onChange={setFolder}
          />
        </div>
        <TextField
          name="token"
          label="Access token"
          type="password"
          value={token}
          required={!repository}
          autoComplete="off"
          placeholder={repository ? "Leave empty to keep the stored one" : ""}
          hint="It needs to read and write the repository's contents: a fine-grained personal access token on GitHub, a project access token on GitLab. It is stored encrypted and never shown again."
          onChange={setToken}
        />
        {problem ? <Notice tone="danger">{problem}</Notice> : null}
        {saved ? (
          <Notice tone="success">Connected. The repository was reached with the token.</Notice>
        ) : null}
        <div className="flex items-center justify-between gap-2">
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? "Reaching the repository…" : repository ? "Save" : "Connect"}
          </Button>
          {repository ? (
            <Button
              variant="danger"
              disabled={busy}
              onClick={async () => {
                const sure = await ask.confirm({
                  title: "Disconnect the repository?",
                  text: "Workspaces stop following their branches. Nothing in the repository is changed.",
                  action: "Disconnect",
                  danger: true,
                });
                if (!sure) return;
                await api.delete(`${base}/git-repository`).then(() => {
                  setUrl("");
                  setSaved(false);
                  loaded.reload();
                }, notify.error);
              }}
            >
              Disconnect
            </Button>
          ) : null}
        </div>
      </form>
    </Page>
  );
}

const STATE: Record<State, [BadgeTone, string, string]> = {
  never: [
    "neutral",
    "Not pushed yet",
    "Push to create the branch with what this workspace has deployed.",
  ],
  synced: ["success", "In sync", "The branch has what this workspace runs."],
  ahead: [
    "attention",
    "Ahead of the branch",
    "This workspace has deployed something the branch does not have. Push it.",
  ],
  behind: [
    "attention",
    "Behind the branch",
    "Someone changed the folder on the branch. Pull before pushing.",
  ],
  conflict: [
    "danger",
    "Conflict",
    "A resource was changed here and on the branch. Choose which to keep.",
  ],
  error: ["danger", "Last sync failed", ""],
};

interface PullResult {
  status: string;
  state: State;
  conflicts: string[];
  applied: string[];
  problem?: string;
}

/** How a workspace stands against its branch, with the buttons to push and pull. */
export function GitPanel({
  root,
  tenantLink,
  onPulled,
}: {
  root: string;
  /** Where the tenant's screens are, to link to the repository's settings. */
  tenantLink: string;
  /** Called after a pull deployed something, so the screen around this can load again. */
  onPulled?: () => void;
}) {
  const status = useLoad<Status>(`${root}/git`);
  const [branch, setBranch] = useState("");
  const [busy, setBusy] = useState<"push" | "pull" | "branch">();
  const [conflicts, setConflicts] = useState<string[]>([]);
  const [choices, setChoices] = useState<Record<string, "mine" | "theirs">>({});
  const [said, setSaid] = useState<{ tone: "success" | "danger" | "attention"; text: string }>();

  if (status.error) return <Notice tone="danger">{status.error.message}</Notice>;
  if (!status.data) return null;
  const { repository, state } = status.data;
  const frame = "flex flex-col gap-3 rounded-panel border border-line bg-surface p-4";

  if (!repository) {
    return (
      <section className={frame}>
        <h2 className="m-0 text-base font-semibold">Repository</h2>
        <p className="m-0 text-ink-muted">
          No repository is connected, so what is deployed here lives in this workspace only.{" "}
          <Link to={`${tenantLink}/repository`} className="text-action">
            Connect the tenant's repository
          </Link>{" "}
          to keep it in git.
        </p>
      </section>
    );
  }
  if (!status.data.branch || !state) {
    return (
      <section className={frame}>
        <h2 className="m-0 text-base font-semibold">Repository</h2>
        <p className="m-0 text-ink-muted">
          Choose the branch this workspace keeps its console-written resources on. It is created
          from <code className="font-mono text-[13px]">{repository.defaultBranch}</code> by the
          first push.
        </p>
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy("branch");
            await api.put(`${root}/git`, { branch }).then(status.reload, notify.error);
            setBusy(undefined);
          }}
        >
          <div className="w-64">
            <TextField
              name="branch"
              label="Branch"
              value={branch}
              placeholder="console/dev"
              onChange={setBranch}
            />
          </div>
          <Button type="submit" variant="primary" disabled={busy !== undefined}>
            Follow this branch
          </Button>
        </form>
      </section>
    );
  }

  const run = async (kind: "push" | "pull", body: object) => {
    setBusy(kind);
    setSaid(undefined);
    try {
      const result = await api.post<PullResult & { changedOnBranch?: string[] }>(
        `${root}/git/${kind}`,
        body,
      );
      if (result.status === "failed")
        setSaid({ tone: "danger", text: result.problem ?? "It failed." });
      else if (kind === "push" && result.status === "refused") {
        setSaid({
          tone: "attention",
          text: `The branch changed: ${(result.changedOnBranch ?? []).join(", ")}. Pull first.`,
        });
      } else if (kind === "pull" && result.status === "refused") {
        setConflicts(result.conflicts);
        setChoices(Object.fromEntries(result.conflicts.map((stem) => [stem, "mine" as const])));
      } else {
        setConflicts([]);
        setSaid({
          tone: "success",
          text:
            result.status === "nothing"
              ? kind === "push"
                ? "The branch already has everything."
                : "Nothing new on the branch."
              : kind === "push"
                ? "Pushed."
                : `Pulled and deployed: ${result.applied.join(", ")}.`,
        });
        if (kind === "pull" && result.status === "done") onPulled?.();
      }
    } catch (error) {
      setSaid({ tone: "danger", text: failureText(error as ApiError) });
    } finally {
      setBusy(undefined);
      status.reload();
    }
  };

  return (
    <section className={frame}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h2 className="m-0 text-base font-semibold">Repository</h2>
          <code className="truncate font-mono text-[13px] text-ink-muted">
            {status.data.branch}
          </code>
          <Badge tone={STATE[state][0]}>{STATE[state][1]}</Badge>
          {status.data.syncedCommit ? (
            <code className="font-mono text-[12.5px] text-ink-muted">
              {status.data.syncedCommit.slice(0, 7)}
            </code>
          ) : null}
        </div>
        <div className="flex gap-2">
          <Button
            disabled={busy !== undefined || repository.paused}
            onClick={() => run("pull", {})}
          >
            {busy === "pull" ? "Pulling…" : "Pull"}
          </Button>
          <Button
            variant="primary"
            disabled={busy !== undefined || repository.paused}
            onClick={async () => {
              const message = await ask.prompt({
                title: "Push to the branch",
                label: "Commit message",
                initial: "Deploy from the console",
                action: "Push",
              });
              if (message) await run("push", { message });
            }}
          >
            {busy === "push" ? "Pushing…" : "Push"}
          </Button>
        </div>
      </div>
      <p className="m-0 text-ink-muted">
        {repository.paused
          ? "Sync is paused for this tenant. Save its repository settings to turn it on."
          : state === "error"
            ? (status.data.lastError ?? "The last push or pull failed.")
            : STATE[state][2]}
      </p>
      {said ? <Notice tone={said.tone}>{said.text}</Notice> : null}
      {conflicts.length > 0 ? (
        <div className="flex flex-col gap-3 rounded-control border border-danger/40 bg-danger-soft p-3">
          <p className="m-0">
            <strong>These were changed here and on the branch.</strong> Choose which version of each
            to keep. Nothing is deployed until you do.
          </p>
          {conflicts.map((stem) => (
            <div key={stem} className="max-w-md">
              <SelectField
                name={stem}
                label={stem}
                value={choices[stem] ?? "mine"}
                options={[
                  { value: "mine", label: "Keep this workspace's version" },
                  { value: "theirs", label: "Take the branch's version" },
                ]}
                onChange={(value) =>
                  setChoices((before) => ({ ...before, [stem]: value as "mine" | "theirs" }))
                }
              />
            </div>
          ))}
          <div>
            <Button
              variant="primary"
              disabled={busy !== undefined}
              onClick={() => run("pull", { resolutions: choices })}
            >
              Pull with these choices
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
