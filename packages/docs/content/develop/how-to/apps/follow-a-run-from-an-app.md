---
title: Follow a run from an app
description: Start a flow or a script from a page of a code app, show how it is going while it runs, and handle how it ends.
subjects: [apps, app-client]
---

## Follow a run from an app

By the end you will have a button on a page that starts a flow, shows its status as it changes, and reloads a table when it ends, and a button that starts a script and waits for its answer.

## Before you start

- The app and the flow or script it starts are deployed to the workspace. This page uses the Desk app of [Write an app as code](write-an-app), a flow `welcome` with a manual trigger that takes `{pet}`, and the script `check-in`.
- The people who use the app are signed in, and bound to start what the page starts: a role with `flow_run:write` at the flow, or `run:write` at the script. A flow run and a script run can be read by the person who started it. The built-in portal roles do not hold either permission: define one, as in [Write an app as code](write-an-app).
- Whoever opens the app has to be signed in. A guest who starts a flow or a script, where a binding lets guests start it, gets 403, "Sign in to start a flow. A run started by someone who is not signed in cannot be read back." Where no binding does, the call is refused as not signed in (401). A form on a page can still start a run for a guest.

## Start a flow and follow it

:::steps
1. Start the flow with `startFlow`. It returns at once with the flow run's ID, because a flow can wait for hours, for an approval or a delay. Keep the ID in state.

   ```tsx
   import { startFlow } from "@volvel/app";

   const run = await startFlow("welcome", { pet });
   setRunId(run.id);
   ```

   Pass `{ idempotencyKey }` as the third argument so that a second press with the same key does not start a second run.

2. Follow it with `useFlowRun(id)`. It returns `{ data, error, ended, live }`, and `data` is `undefined` until the first answer. `data.status` is `running`, `succeeded`, `failed` or `cancelled` (the stored value; the word is "canceled"). `ended` is true when nothing more will change. `live` says whether changes arrive as they happen. When they do not, the hook looks again every two seconds until the run ends.

   ```tsx
   import { useFlowRun } from "@volvel/app";

   const followed = useFlowRun<{ id: string }>(runId);

   <p>Check-in {followed.data?.status ?? "starting"}</p>
   {followed.data?.error ? <p role="alert">{followed.data.error.message}</p> : null}
   ```

3. Do what ends it. When `ended` turns true, reload what the flow changed.

   ```tsx
   const { ended } = followed;
   useEffect(() => {
     if (ended) found.reload();
   }, [ended]);
   ```
:::

## Start a script and wait

For a script that ends in seconds, `runScript` starts it and waits for what it returns. It throws a `RunError` when the run fails or has not ended after `timeoutMs` (60,000 by default); in the second case the run goes on.

```tsx
import { RunError, runScript } from "@volvel/app";

try {
  await runScript("check-in", { pet: "Biscuit" });
  found.reload();
} catch (error) {
  setProblem(error instanceof RunError ? error.message : String(error));
}
```

`runFlow` does the same for a flow and throws a `FlowRunError`. `useRun(id)` follows a script run the way `useFlowRun` follows a flow run. To read a run once, without following it, call `scriptRun(id)` or `flowRun(id)`.

## How the page hears about a change

The page opens one stream to the instance (`/tenants/<tenant>/stream`) for every run it follows, and closes it five seconds after the last one is dropped. A change reaches the hook as it happens, and the hook reads the run again.

- A person who may read runs in the workspace gets those, and their own runs wherever they are. Someone who may read no runs follows only their own, on at most 2 streams per replica; everyone else on at most 5 per replica of the instance. Beyond that, the stream answers 429 `too_many_streams`, and the page falls back to looking every two seconds.
- A guest has no stream: it answers 401, and the page looks every two seconds.
- A stream the instance refuses is not tried again on that page. One that drops is retried by the browser.
- There is no subscription to row changes. After a run ends, read the rows again, as step 3 does.

## The result

The page shows the run's status as it changes, shows the failure's own words when it fails, and reloads its rows when it ends.

## If it does not work

| What you see | Why and what to do |
| --- | --- |
| 403 when you start: "Sign in to start a flow." | The person is a guest. Make the page ask for a sign-in (`signInUrl()`), or use a form. |
| 403 without that text | The person holds no `flow_run:write` at the flow, or `run:write` at the script. Bind a role that holds it there. |
| The status stays on "starting". | `useFlowRun` has not had its first answer, or the ID is wrong. Look at `error` in the hook's result. |
| The run fails and the page shows the step's message. | Read it as the run's own error. A script that writes a table lists it in `tables`. |
| The page never shows "live" and looks every two seconds. | The stream is refused, or the person is a guest. The status still arrives. |

## Related

- [The app client](../../reference/apps/app-client)
- [How access to an app works](../../explanation/apps/app-access)
