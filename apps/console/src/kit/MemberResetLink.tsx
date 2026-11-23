import { Button, Dialog } from "@volvel/ui";
import { useState } from "react";
import { api } from "../api.ts";
import { ask, notify } from "../ask.tsx";
import { type Needs, useNeeds } from "./Can.tsx";
import { OneTimeSecret } from "./OneTimeSecret.tsx";
import { Time } from "./Time.tsx";

interface Made {
  url: string | null;
  expiresAt: string;
  emailed: boolean;
}

/**
 * "Make a password reset link" for a member: the one way a member's password is reset. It asks
 * first, says what happens, and then either says the link was emailed or shows it once to copy.
 * `path` is the route that makes it: a tenant's for its members, the instance's for any member.
 */
export function MemberResetLink({
  path,
  email,
  needs,
}: {
  path: string;
  email: string;
  needs: Needs;
}) {
  const may = useNeeds(needs);
  const [busy, setBusy] = useState(false);
  const [made, setMade] = useState<Made>();
  const make = async () => {
    const sure = await ask.confirm({
      title: `Make a password reset link for ${email}?`,
      text: "Whoever opens the link chooses a new password for them, once, within two hours. Using it ends all their other sign-ins, and a link made before this one stops working. Nobody sees the password. Where this instance sends mail the link is emailed to them; where it does not, you are shown it once to pass on.",
      action: "Make the link",
    });
    if (!sure) return;
    setBusy(true);
    try {
      setMade(await api.post<Made>(path, {}));
    } catch (error) {
      notify.error(error);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Button
        size="small"
        loading={busy}
        disabled={!may.can}
        {...(may.reason ? { tooltip: may.reason } : {})}
        onClick={() => void make()}
      >
        Make a password reset link
      </Button>
      <Dialog
        open={made !== undefined}
        onClose={() => setMade(undefined)}
        title="Password reset link"
        description={`Whoever opens it chooses a new password for ${email}.`}
      >
        {made ? (
          <div className="flex flex-col gap-3">
            {made.url ? (
              <OneTimeSecret value={made.url} noun="link" focusCopy>
                <p className="m-0">
                  This instance sends no mail, so pass the link on yourself. It works once, until{" "}
                  <Time value={made.expiresAt} mode="stamp" zone />.
                </p>
              </OneTimeSecret>
            ) : (
              <p className="m-0">
                It was emailed to {email}. It works once, until{" "}
                <Time value={made.expiresAt} mode="stamp" zone />. You are not shown it.
              </p>
            )}
            <div className="flex justify-end">
              <Button
                variant="primary"
                {...(made.url ? {} : { "data-autofocus": "" })}
                onClick={() => setMade(undefined)}
              >
                Done
              </Button>
            </div>
          </div>
        ) : null}
      </Dialog>
    </>
  );
}
