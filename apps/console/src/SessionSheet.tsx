import { Button, Dialog, Notice, TextField } from "@volvel/ui";
import { useEffect, useState } from "react";
import { type ApiError, api, invalidatePrefix, type Me } from "./api.ts";
import { clearSession } from "./clearSession.ts";
import { renewed, sessionHolder } from "./session.ts";

interface Ways {
  providers: { id: string; name: string; url: string }[];
  password: boolean;
}

/** Whoever the cookie names now: the same person resumes the page; another gets a clean one. */
async function resume(): Promise<boolean> {
  const response = await fetch("/api/v1/me", { credentials: "same-origin" });
  if (!response.ok) return false;
  const now = (await response.json()) as Me;
  if (now.principal.id !== sessionHolder()) {
    clearSession();
    window.location.reload();
    return true;
  }
  renewed();
  // Reads that failed while the session was over are asked again.
  invalidatePrefix("");
  return true;
}

/**
 * Offered when the server says the session ended (`session.ts`). It sits over the page, so
 * the page and what it holds stay; the same person signs in again, with a password or their
 * organization's sign-in in another tab, and what waited is sent again. Someone else
 * signing in does not resume the page: it is reloaded for them.
 */
export function SessionSheet({ email, open }: { email: string; open: boolean }) {
  const [password, setPassword] = useState("");
  const [ways, setWays] = useState<Ways>({ providers: [], password: true });
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    api
      .get<Ways>(`/sso/providers?email=${encodeURIComponent(email)}`)
      .then((found) => live && setWays(found))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [email]);

  // Signing in with the organization's provider happens in another tab, so this page keeps its work.
  useEffect(() => {
    const back = () => void resume().catch(() => {});
    window.addEventListener("focus", back);
    return () => window.removeEventListener("focus", back);
  }, []);

  const here = `${window.location.pathname}${window.location.search}`;
  return (
    <Dialog
      open={open}
      onClose={() => {}}
      title="Your session ended"
      description={`Sign in again as ${email} to carry on. Nothing on this page was lost.`}
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError(undefined);
          try {
            await api.post("/auth/sign-in/email", { email, password });
            await resume();
          } catch (caught) {
            const failure = caught as ApiError;
            setError(
              failure.status === 401
                ? "That password does not match this account."
                : failure.message,
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        {ways.providers.map((provider) => (
          <a
            key={provider.id}
            href={`${provider.url}?return=${encodeURIComponent(here)}`}
            target="_blank"
            rel="noreferrer"
            className="flex h-10 items-center justify-center rounded-control bg-action px-3 font-semibold text-action-ink no-underline hover:brightness-110"
          >
            Sign in with {provider.name} in a new tab
          </a>
        ))}
        {ways.password ? (
          <>
            <TextField
              label="Password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              required
              onChange={setPassword}
            />
            <Button type="submit" variant="primary" loading={busy} className="h-10">
              Sign in
            </Button>
          </>
        ) : (
          <p className="m-0 text-ink-muted">
            Your organization requires its own sign-in. Come back to this tab once you have signed
            in there.
          </p>
        )}
        {error ? <Notice tone="danger">{error}</Notice> : null}
      </form>
    </Dialog>
  );
}
