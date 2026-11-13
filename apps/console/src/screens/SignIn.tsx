import { Button, Notice, TextField } from "@vynxlabs/ui";
import { useState } from "react";
import { type ApiError, api } from "../api.ts";

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

export function SignIn({ onSignedIn }: { onSignedIn: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  /** How this email signs in. Unknown until the email has been given. */
  const [ways, setWays] = useState<Ways>();
  const [error, setError] = useState<string | undefined>(takeSsoError);
  const [busy, setBusy] = useState(false);
  const back = new URLSearchParams(window.location.search).get("return");
  const withReturn = (url: string) => (back ? `${url}?return=${encodeURIComponent(back)}` : url);

  return (
    <main className="mx-auto mt-[14vh] w-full max-w-sm px-4">
      <h1 className="m-0 text-2xl font-semibold tracking-tight">Sign in</h1>
      <p className="mt-1 mb-6 text-ink-muted">
        Use the account your administrator created for you, or your organisation's sign-in.
      </p>
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
            await api.post("/auth/sign-in/email", { email, password });
            onSignedIn();
          } catch (caught) {
            const failure = caught as ApiError;
            setError(
              failure.status === 401
                ? "That email and password do not match an account."
                : failure.message,
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <TextField
          label="Email"
          name="email"
          type="email"
          autoComplete="username"
          value={email}
          required
          onChange={(value) => {
            setEmail(value);
            setWays(undefined);
          }}
        />
        {ways?.providers.map((provider) => (
          <a
            key={provider.id}
            href={withReturn(provider.url)}
            className="rounded-control bg-action px-3 py-2 text-center font-semibold text-action-ink no-underline"
          >
            Sign in with {provider.name}
          </a>
        ))}
        {ways?.password ? (
          <TextField
            label="Password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            required
            onChange={setPassword}
          />
        ) : null}
        {ways && !ways.password ? (
          <p className="m-0 text-ink-muted">
            Your organisation requires its own sign-in. There is no password to enter here.
          </p>
        ) : null}
        {error ? <Notice tone="danger">{error}</Notice> : null}
        {!ways ? (
          <Button type="submit" variant="primary" disabled={busy}>
            Continue
          </Button>
        ) : ways.password ? (
          <Button
            type="submit"
            {...(ways.providers.length > 0 ? {} : { variant: "primary" as const })}
            disabled={busy}
          >
            {ways.providers.length > 0 ? "Sign in with a password" : "Sign in"}
          </Button>
        ) : null}
      </form>
    </main>
  );
}
