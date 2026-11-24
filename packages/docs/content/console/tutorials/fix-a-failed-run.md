---
title: Find and fix a failed run
description: Make Fernhill's reminders script fail while its text service is down, find the failed run, read why it failed, compare it with the last success and run it again.
subjects: [runs, scripts]
---

You will have a run that failed because an outside service was down, you will know why from the run's own page, and you will have run it again to a success. It takes about 20 minutes.

## Before you start

- You can sign in to the console as Maya Brooks, `maya.brooks@fernhill.example`, a tenant admin of Fernhill. The seeded password is `fernhill-demo-2026`. Starting a run needs `run:write`, and running one again needs the same.
- Fernhill is set up, its Sandbox has the script `reminders/send`, and Fernhill's outside systems, its stand-ins, are running on the machine where you work. They answer at `http://127.0.0.1:4020`. TextLine is the one that sends texts. A command line on that machine can make it fail, and the page gives the two commands. See [Set up the Fernhill example](../../start/how-to/example/set-up-the-fernhill-example).
- A browser at least as wide as a laptop screen.

:::steps
1. **Run the script once while all is well.** Sign in as Maya in the Sandbox. Press **Build**, then choose **Scripts** in the menu beside it. Press `reminders/send`, which says "Texts every owner whose pet has a visit in the next day, once.". Press **Run**, leave **Start** at **Now**, and press **Run** in the dialog. The run page opens and says **Succeeded**. Its log reads "Reminders done" with the counts `due`, `sent` and `failed`. A run that texts an owner whose number cannot receive texts logs a warning, "A reminder was refused", and still succeeds.

2. **Take TextLine down.** In a terminal on the machine, run:

   ```bash
   curl -X POST http://127.0.0.1:4020/control/outage -d '{"on":true}'
   ```

   The answer is `{"outage":true}`. TextLine now answers every text with a 503.

3. **Run the script again.** Go back to the script and press **Run**, then **Run**. The run page says **Failed**. The line "#1 failed" and "nothing logged" are under **ATTEMPTS**.

4. **Bring TextLine back.** In the terminal run:

   ```bash
   curl -X POST http://127.0.0.1:4020/control/outage -d '{"on":false}'
   ```

   The answer is `{"outage":false}`. From here on nothing is wrong with the service. The run is still failed.

5. **Find the failed run as a person on call would.** Choose **Overview**. Under **NEEDS ATTENTION** it says how many runs failed in the last 24 hours, and "Open the failed runs to see which step and which log line." Press **Open failed runs**. The list of runs is narrowed to **Failed**. Find the top row for `reminders/send` whose **Result** reads "TextLine answered 503: the gateway is down. 0 reminders went out first." (the column is cut short on a narrow window; the newest run is first). Press the row. A panel opens at the side with the same **Why it failed** text. Press **Open full view**.

6. **Read why it failed.** On the run page, under **Why it failed**, read "TextLine answered 503: the gateway is down. 0 reminders went out first." Under it are what the 503 means, "The service failed on its side (503).", and what to do, "Usually passing: run it again later, or ask the service's owner if it keeps failing." The log says "The script logged nothing."

7. **Compare it with the last success.** Under **Since it last worked** the page says when it last succeeded and which version it ran. It lists **Input**, which says "The same as the last success", **Version**, which says "The same," and the version, and **Took**, the time of this run and of that one. The input and the version are the same, so nothing in the script changed. When the version differs, **Version** reads, for example, "v53 then, v54 now", and the button **Compare the source** opens **Compare runs**. Here the version is the same, so that button is not shown.

8. **Run it again.** Go back to the failed run. Press **Re-run** and choose **With the same input**. A dialog asks "Run reminders/send again?", "With the same input, on version …, the one it ran." Press **Run again**. A new run page opens and says **Succeeded**. It says "Re-run of a run" beside its version, and that link goes back to the failed run.
:::

## What you built

- A failed run of `reminders/send` and its re-run, which succeeded. Both are under **Operate**, **Runs**. The failed one stays as it was: a re-run is a new run, and it does not change the old one.
- A way to read a failure: the sentence under **Why it failed** and the comparison under **Since it last worked**.

A run of a flow has **Retry from the failed step** where a script's run has **Re-run**; it runs the failed step and what follows, and keeps the steps that worked.
