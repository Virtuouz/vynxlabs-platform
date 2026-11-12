import { Button, Notice, TextField } from "@vynxlabs/ui";
import { useState } from "preact/hooks";
import { type ApiError, api } from "../api.ts";

export function SignIn({ onSignedIn }: { onSignedIn: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  return (
    <main class="mx-auto mt-[14vh] w-full max-w-sm px-4">
      <h1 class="m-0 text-2xl font-semibold tracking-tight">Sign in</h1>
      <p class="mt-1 mb-6 text-ink-muted">Use the account your administrator created for you.</p>
      <form
        class="flex flex-col gap-3"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError(undefined);
          try {
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
          onInput={setEmail}
        />
        <TextField
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          required
          onInput={setPassword}
        />
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <Button type="submit" variant="primary" disabled={busy}>
          Sign in
        </Button>
      </form>
    </main>
  );
}
