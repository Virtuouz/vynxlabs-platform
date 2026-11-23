import { Button, ContainedArea, Notice, TextField } from "@volvel/ui";
import { useEffect, useState } from "react";
import { type ApiError, api } from "../api.ts";
import { failureText } from "../ask.tsx";
import { BrandMark, useBrand } from "../kit/brand.tsx";
import { Loading } from "../kit/LoadState.tsx";
import { Time } from "../kit/Time.tsx";

const MIN_PASSWORD = 12;

/**
 * Where a member's password link leads. No sign-in: the link is the member's own, and it works
 * once. Opening it changes nothing; choosing a password ends the member's other sign-ins.
 */
export function ResetPassword({ token }: { token: string }) {
  const brand = useBrand();
  const [who, setWho] = useState<{ email: string; name: string; expiresAt: string }>();
  const [gone, setGone] = useState<string>();
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string>();
  const [done, setDone] = useState(false);

  useEffect(() => {
    api
      .get<{ email: string; name: string; expiresAt: string }>(
        `/member-password-links/${encodeURIComponent(token)}`,
      )
      .then(setWho)
      .catch((error: ApiError) =>
        setGone(
          error.status === 410 || error.status === 400
            ? "This link has been used or has run out. Ask the person who gave it to you for a new one."
            : failureText(error),
        ),
      );
  }, [token]);

  const short = next !== "" && next.length < MIN_PASSWORD;
  const mismatch = again !== "" && next !== again;
  const ready = next.length >= MIN_PASSWORD && next === again;

  return (
    <main className="flex min-h-full flex-col items-center justify-center bg-structure px-4 py-10">
      <div className="flex w-full max-w-[25rem] flex-col gap-6">
        <div className="flex items-center gap-2">
          <BrandMark size={30} decorative />
          <span className="text-title font-semibold">{brand.productName}</span>
          <span className="text-ink-subtle">Console</span>
        </div>
        <div className="flex min-w-0 flex-col gap-4 rounded-panel border border-line bg-canvas p-6 sm:p-8">
          <ContainedArea>
            {gone ? (
              <>
                <h1 className="m-0 text-display-lg">Nothing to set here</h1>
                <p className="m-0 text-ink-muted">{gone}</p>
                <p className="m-0">
                  <a href="/" className="text-action">
                    Go to sign in
                  </a>
                </p>
              </>
            ) : done ? (
              <>
                <h1 className="m-0 text-display-lg">Your password is set</h1>
                <p className="m-0 text-ink-muted">
                  Every other sign-in you had has ended. Sign in with the new password.
                </p>
                <p className="m-0">
                  <a href="/" className="text-action">
                    Go to sign in
                  </a>
                </p>
              </>
            ) : !who ? (
              <Loading />
            ) : (
              <form
                className="flex flex-col gap-3"
                onSubmit={async (event) => {
                  event.preventDefault();
                  if (!ready) return;
                  setBusy(true);
                  setProblem(undefined);
                  try {
                    await api.post(`/member-password-links/${encodeURIComponent(token)}`, {
                      password: next,
                    });
                    setDone(true);
                  } catch (error) {
                    const failure = error as ApiError;
                    if (failure.status === 410) {
                      setGone(
                        "This link has been used or has run out. Ask the person who gave it to you for a new one.",
                      );
                    } else setProblem(failureText(error));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <h1 className="m-0 text-display-lg">Choose a new password</h1>
                <p className="m-0 text-ink-muted">
                  For {who.email}. The link works once, until{" "}
                  <Time value={who.expiresAt} mode="stamp" zone />. Choosing a password signs you
                  out everywhere else.
                </p>
                <TextField
                  label="New password"
                  name="newPassword"
                  type="password"
                  value={next}
                  required
                  autoComplete="new-password"
                  hint={`At least ${MIN_PASSWORD} characters.`}
                  error={short ? `Use at least ${MIN_PASSWORD} characters.` : undefined}
                  onChange={setNext}
                />
                <TextField
                  label="New password again"
                  name="again"
                  type="password"
                  value={again}
                  required
                  autoComplete="new-password"
                  error={mismatch ? "The two do not match." : undefined}
                  onChange={setAgain}
                />
                {problem ? <Notice tone="danger">{problem}</Notice> : null}
                <div>
                  <Button type="submit" variant="primary" loading={busy} disabled={!ready}>
                    Set password
                  </Button>
                </div>
              </form>
            )}
          </ContainedArea>
        </div>
      </div>
    </main>
  );
}
