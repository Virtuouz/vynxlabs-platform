import { Button, Notice, TextField } from "@vynxlabs/ui";
import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { ApiError, api } from "../api.ts";
import { BrandMark, useBrand } from "../kit/brand.tsx";
import { Junction } from "../kit/motifs.tsx";

interface Ways {
  providers: { id: string; name: string; url: string }[];
  password: boolean;
}

/** Why single sign-on sent someone back here, in words for the person it happened to. */
const SSO_ERRORS: Record<string, string> = {
  provider_off: "That way of signing in is turned off. Ask your administrator.",
  provider_error: "The identity provider did not sign you in. Try again.",
  invalid_answer:
    "The identity provider's answer could not be accepted. Try again, and if it happens again tell your administrator.",
  replayed: "That sign-in was already used. Start again.",
  expired: "That sign-in took too long or was already used. Start again.",
  no_subject:
    "The identity provider did not say who you are. Tell your administrator: the provider's settings need a look.",
  no_email:
    "The identity provider did not send your email address. Tell your administrator: the provider's settings need a look.",
  email_unverified:
    "The identity provider says your email address is not verified. Verify it there, then try again.",
  domain_not_proved:
    "Your email address is not in a domain this sign-in is set up for. Ask your administrator.",
  email_not_trusted:
    "Your account is tied to a different identity at the provider. Ask your administrator to untie it.",
  no_account: "There is no account here for you yet. Ask your administrator for one.",
  not_in_tenant: "Your account has not been added here yet. Ask your administrator to add you.",
  disabled: "Your account has been turned off.",
};

/** Takes the reason single sign-on failed out of the address, so a reload does not show it again. */
function takeSsoError(): string | undefined {
  const url = new URL(window.location.href);
  const reason = url.searchParams.get("sso_error");
  if (reason === null) return undefined;
  url.searchParams.delete("sso_error");
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  return SSO_ERRORS[reason] ?? "You could not be signed in. Try again.";
}

/**
 * Signs in with a password and a recovery code, which the server takes in a
 * header while single sign-on is required. The code is spent on the attempt.
 */
async function signInWithCode(email: string, password: string, code: string) {
  const response = await fetch("/api/v1/auth/sign-in/email", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json", "x-recovery-code": code.trim() },
    body: JSON.stringify({ email, password }),
  });
  if (response.ok) return;
  const text = await response.text();
  throw new ApiError(response.status, text === "" ? {} : JSON.parse(text));
}

export function SignIn({ onSignedIn }: { onSignedIn: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  /** How this email signs in. Unknown until the email has been given. */
  const [ways, setWays] = useState<Ways>();
  const [error, setError] = useState<string | undefined>(takeSsoError);
  const [busy, setBusy] = useState(false);
  const back = new URLSearchParams(window.location.search).get("return");
  const withReturn = (url: string) => (back ? `${url}?return=${encodeURIComponent(back)}` : url);
  const [reveal, setReveal] = useState(false);
  /** An owner signing in with a recovery code while their organisation's sign-in is required. */
  const [recovering, setRecovering] = useState(false);
  const [code, setCode] = useState("");
  const brand = useBrand();
  const asksPassword = ways ? ways.password || recovering : false;

  const step = ways ? 1 : 0;
  return (
    <main className="flex min-h-full flex-col items-center justify-center bg-structure px-4 py-10">
      <div className="flex w-full max-w-[25rem] flex-col gap-6">
        <div className="flex items-center gap-2.5">
          <BrandMark size={30} decorative />
          <span className="text-base font-semibold tracking-tight">{brand.productName}</span>
          <span className="text-ink-subtle">Console</span>
        </div>
        <div className="flex flex-col gap-4 rounded-panel border border-line bg-canvas p-6 sm:p-7">
          <ol
            aria-label="Steps"
            className="m-0 flex list-none items-center gap-2 p-0 text-meta text-ink-subtle"
          >
            <li className="flex items-center gap-2" aria-current={step === 0 ? "step" : undefined}>
              <Junction kind="here" />
              <span className={step === 0 ? "text-ink" : ""}>Email</span>
            </li>
            <li aria-hidden="true" className="h-px flex-1 bg-line-strong" />
            <li className="flex items-center gap-2" aria-current={step === 1 ? "step" : undefined}>
              <Junction kind={step === 1 ? "here" : "pending"} />
              <span className={step === 1 ? "text-ink" : ""}>How you sign in</span>
            </li>
          </ol>
          <h1 className="m-0 text-display">Sign in</h1>
          <form
            className="flex flex-col gap-3"
            onSubmit={async (event) => {
              event.preventDefault();
              setBusy(true);
              setError(undefined);
              try {
                if (!ways) {
                  // A password is asked for only once it is known that one is any use.
                  const found = await api
                    .get<Ways>(`/sso/providers?email=${encodeURIComponent(email.trim())}`)
                    .catch((): Ways => ({ providers: [], password: true }));
                  setWays(found);
                  return;
                }
                if (recovering) await signInWithCode(email, password, code);
                else await api.post("/auth/sign-in/email", { email, password });
                onSignedIn();
              } catch (caught) {
                const failure = caught as ApiError;
                setError(
                  failure.status === 401
                    ? "That email and password do not match an account."
                    : recovering && failure.status === 403
                      ? "That recovery code is not right, or was already used. Each code works once."
                      : failure.message,
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            {ways ? (
              <div className="flex items-center justify-between gap-2 rounded-control border border-line bg-structure px-3 py-2">
                <span className="min-w-0 truncate">{email}</span>
                <button
                  type="button"
                  className="shrink-0 text-meta text-action hover:underline"
                  onClick={() => {
                    setWays(undefined);
                    setPassword("");
                    setRecovering(false);
                    setCode("");
                    setError(undefined);
                  }}
                >
                  Change
                </button>
              </div>
            ) : (
              <TextField
                label="Email"
                name="email"
                type="email"
                autoComplete="username"
                value={email}
                required
                onChange={(value) => setEmail(value)}
              />
            )}
            {ways?.providers.map((provider) => (
              <a
                key={provider.id}
                href={withReturn(provider.url)}
                className="flex h-10 items-center justify-center rounded-control bg-action px-3 font-semibold text-action-ink no-underline hover:brightness-110"
              >
                Sign in with {provider.name}
              </a>
            ))}
            {asksPassword ? (
              <div className="relative">
                <TextField
                  label="Password"
                  name="password"
                  type={reveal ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  required
                  onChange={setPassword}
                />
                <button
                  type="button"
                  aria-label={reveal ? "Hide what you typed" : "Show what you typed"}
                  aria-pressed={reveal}
                  onClick={() => setReveal((shown) => !shown)}
                  className="absolute right-1 bottom-0.5 flex size-8 items-center justify-center rounded-control text-ink-subtle hover:text-ink"
                >
                  {reveal ? (
                    <EyeOff aria-hidden="true" size={15} />
                  ) : (
                    <Eye aria-hidden="true" size={15} />
                  )}
                </button>
              </div>
            ) : null}
            {recovering ? (
              <TextField
                label="Recovery code"
                name="recovery-code"
                autoComplete="one-time-code"
                value={code}
                required
                hint="One of the codes you made on your account page. It works once."
                onChange={setCode}
              />
            ) : null}
            {ways && !ways.password && !recovering ? (
              <p className="m-0 text-ink-muted">
                Your organisation requires its own sign-in. There is no password to enter here.
              </p>
            ) : null}
            {error ? <Notice tone="danger">{error}</Notice> : null}
            {!ways ? (
              <Button type="submit" variant="primary" disabled={busy} className="h-10">
                {busy ? "Checking…" : "Continue"}
              </Button>
            ) : recovering ? (
              <Button type="submit" variant="primary" disabled={busy} className="h-10">
                Sign in with the recovery code
              </Button>
            ) : ways.password ? (
              <Button
                type="submit"
                {...(ways.providers.length > 0 ? {} : { variant: "primary" as const })}
                disabled={busy}
                className="h-10"
              >
                {ways.providers.length > 0 ? "Sign in with a password" : "Sign in"}
              </Button>
            ) : null}
            {ways && !ways.password ? (
              <button
                type="button"
                className="self-start text-meta text-action hover:underline"
                onClick={() => {
                  setRecovering((on) => !on);
                  setCode("");
                  setError(undefined);
                }}
              >
                {recovering ? "Back to your organisation's sign-in" : "Use a recovery code"}
              </button>
            ) : null}
            <p className="m-0 text-meta text-ink-subtle">
              {ways
                ? "Use the account your administrator created for you, or your organisation's sign-in."
                : "We check which ways of signing in your address has. Nothing is sent to you yet."}
            </p>
          </form>
        </div>
        <p className="m-0 flex items-center gap-2 font-mono text-tag text-ink-subtle">
          <Junction kind="plain" size={5} />
          {window.location.host}
        </p>
      </div>
    </main>
  );
}
