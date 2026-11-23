import { Button, Notice, Panel, TextField } from "@volvel/ui";
import { useEffect, useState } from "react";
import { api, useLoad } from "../api.ts";
import { ask, failureText, notify } from "../ask.tsx";
import { ErrorState, Loading, Pending } from "../kit/LoadState.tsx";
import { SecretField } from "../kit/SecretField.tsx";
import { Page } from "../ListScreen.tsx";
import { Link } from "../router.tsx";

interface Repository {
  url: string;
  defaultBranch: string;
  folder: string;
  paused: boolean;
  credentialSetAt?: string | null;
  credentialSetBy?: string | null;
}
type State = "never" | "synced" | "ahead" | "behind" | "conflict" | "error";
interface Status {
  repository: Repository | null;
  branch: string | null;
  state: State | null;
  syncedCommit: string | null;
  lastError: string | null;
}

/** Whether two addresses are at different hosts: the stored token is not sent to the new one. */
function otherHost(before: string, after: string): boolean {
  try {
    return new URL(before).origin !== new URL(after).origin;
  } catch {
    return false;
  }
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

  if (loaded.error) return <ErrorState error={loaded.error} onRetry={loaded.reload} />;
  if (!loaded.data) return <Pending of={loaded} />;

  return (
    <Page
      title="Repository"
      description="The git repository this tenant's work is kept in. Resources are committed to it as files, on a branch per dev workspace: each where the repository keeps it, and those made in the console in one folder. Nothing else in it is touched."
    >
      {repository?.paused ? (
        <Notice tone="attention">
          <strong>Sync is paused.</strong> This tenant was imported from another instance, which may
          still push to the same branches. Check the details below and save to turn sync on.
        </Notice>
      ) : null}
      {/* panel-allowed: a form, drawn as a panel; what it holds is marked as inside one. */}
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
          hint={
            repository && !token && otherHost(repository.url, url)
              ? "This is another host than the stored token was given for. Enter the access token again."
              : "An HTTPS address, with no user name or token in it."
          }
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
            hint="Where resources made in the console are written."
            onChange={setFolder}
          />
        </div>
        <SecretField
          name="token"
          label="Access token"
          stored={Boolean(repository)}
          setAt={repository?.credentialSetAt}
          setBy={repository?.credentialSetBy}
          value={token}
          required
          autoComplete="off"
          hint="It needs to read and write the repository's contents: a fine-grained personal access token on GitHub, a project access token on GitLab. It is stored encrypted and never shown again."
          onChange={setToken}
        />
        {problem ? <Notice tone="danger">{problem}</Notice> : null}
        {saved ? (
          <Notice tone="success">Connected. The repository was reached with the token.</Notice>
        ) : null}
        <div className="flex items-center justify-between gap-2">
          <Button type="submit" variant="primary" loading={busy}>
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

/**
 * What a workspace needs before it can sync: a repository, and a branch to follow.
 * Once it has both, the Git sync page's own controls push and pull, and this shows nothing.
 */
export function GitPanel({
  root,
  tenantLink,
  onFollowed,
}: {
  root: string;
  /** Where the tenant's screens are, to link to the repository's settings. */
  tenantLink: string;
  /** Called after a branch is chosen, so the screen around this can load again. */
  onFollowed?: () => void;
}) {
  const status = useLoad<Status>(`${root}/git`);
  const [branch, setBranch] = useState("");
  const [busy, setBusy] = useState<"branch">();

  if (status.error) return <ErrorState error={status.error} onRetry={status.reload} />;
  if (!status.data) return <Loading />;
  const { repository, state } = status.data;

  if (!repository) {
    return (
      <Panel className="flex flex-col gap-3 p-4">
        <h2 className="m-0 text-title font-semibold">Repository</h2>
        <p className="m-0 text-ink-muted">
          No repository is connected, so what is deployed here lives in this workspace only.{" "}
          <Link to={`${tenantLink}/repository`} className="text-action">
            Connect the tenant's repository
          </Link>{" "}
          to keep it in git.
        </p>
      </Panel>
    );
  }
  if (!status.data.branch || !state) {
    return (
      <Panel className="flex flex-col gap-3 p-4">
        <h2 className="m-0 text-title font-semibold">Repository</h2>
        <p className="m-0 text-ink-muted">
          Choose the branch this workspace keeps its console-written resources on. It is created
          from <code className="font-mono text-code">{repository.defaultBranch}</code> by the first
          push.
        </p>
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy("branch");
            await api.put(`${root}/git`, { branch }).then(() => {
              notify.success(`This workspace now syncs with ${branch}.`);
              status.reload();
              onFollowed?.();
            }, notify.error);
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
      </Panel>
    );
  }

  return null;
}
