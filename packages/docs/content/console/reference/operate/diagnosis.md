---
title: What a diagnosis says
description: "Each failure the run page recognizes, the cause and the next step it gives, and the screen it opens."
subjects: [runs]
---

When a script run fails, its [page](../screens/operate/run-page) may show a **diagnosis** under **Why it failed**: a cause in a sentence, a next step in a sentence, and sometimes a button **Open *section*** that goes to that screen of the workspace. A diagnosis is advice. It never changes anything. A failure that matches none of the kinds below has no diagnosis, and the page shows only the error.

A diagnosis is worked out from the run's own error text and from the run's own version of the script, not from today's. It names a connection only when the error names it. When the run failed on its last attempt and the script retries, the cause ends "It failed on all *N* attempts."

The failure of a flow's step shows the diagnosis of the step's script run in the step's panel. A failed flow run has none of its own.

## The kinds, in the order they are checked

The first row that matches is the one shown. The text in italics is what changes with the run.

| Failure | Cause the page says | Next step it says | Button |
| --- | --- | --- | --- |
| The error names a connection that has nothing set up in this workspace | Connection *names* has nothing bound in this workspace. | Bind *names* under Connections, then run it again. | **Open connections** |
| The script read a table, connection or other resource it does not declare in what it uses | The script reads the *kind* "*name*" without naming it in what it uses. | Name it in the script's Settings under what it uses, or in its code, then deploy again. | **Open settings** |
| A secret, variable, connection or connection group the run asked for is not set | The *kind* *name* is not set in this workspace. | Set it under Secrets, Variables or Connections, then run it again. | **Open secrets**, **Open variables** or **Open connections** |
| The run took longer than its limit of *N* seconds | The run took longer than its limit of *N* seconds. | Raise the script's timeout, or have it do less in one run. | **Open settings** |
| The script used more memory than allowed (*N* MB) | The script used more memory than the *N* MB it is allowed. | Raise the script's memory, or have it hold less at once. | **Open settings** |
| The worker's machine ran low on memory | The worker's machine ran low on memory and stopped the script. | Have the script hold less at once, or run it on a worker with more memory. | none |
| The worker stopped reporting | The worker running it stopped reporting. | Check that the worker is running and can reach the platform, then run it again. | none |
| The worker's own request to Volvel was refused as too large (413) | The platform refused what the worker sent because it was larger than a request may be (413). | Log less in one line, return less, or store it as a file and return its name. | none |
| The output is larger than a run may keep | The script returned more than a run may keep. | Return less, or store it as a file and return its name. | none |
| The error says a connection is not bound, has no binding or is unbound | A connection the script uses has nothing bound here. | Bind it under Connections, then run it again. | **Open connections** |
| The error says a secret is not set | A secret the script reads is not set in this workspace. | Set it under Secrets. | **Open secrets** |
| The error says a variable is not set | A variable the script reads has no value here. | Give it a value under Variables. | **Open variables** |
| The error says the run timed out or hit a time limit | The run took longer than its timeout, "of *N*s" when the run's timeout is known. | Raise the script's timeout, or have it do less in one run. | none |
| The error names a network failure (`ECONNREFUSED`, `ENOTFOUND`, `EAI_AGAIN`, `ECONNRESET`, `ETIMEDOUT`, `getaddrinfo`, "fetch failed") | The service could not be reached from the worker. | Check the connection's address, and that the worker's network can reach it. | **Open connections** |
| The data did not match a schema ("does not match its schema", "does not match the schema", "must have required property") | The data did not match the schema it was checked against. | Compare the run's input with the script's input schema. | none |
| A service answered 401 or 403 | The service refused the request with *status*: the credential was not accepted. | Check the credential set on the connection the script calls, and that it may do this. | **Open connections** |
| A service answered 404 | The service answered 404: the address or the record it names does not exist there. | Check the connection's base address, and the identifier the run sent. | **Open connections** |
| A service answered 413 | The service refused what was sent because it was too large (413). | Send less in one request, in smaller parts, or ask the service's owner for its limit. | none |
| A service answered 400, 409 or 422 | The service refused the data it was sent (*status*). | Compare the run's input with what the service expects; the log shows the service's answer. | none |
| A service answered 429 | The service is limiting how often it is called (429). | A longer wait between tries, or fewer runs at once, give it room. Both are under the script's Settings. | **Open settings** |
| A service answered 500 or above | The service failed on its side (*status*). | Usually passing: run it again later, or ask the service's owner if it keeps failing. | none |

A service's status is read from the error text where a call "answered *status*", or from "status *status*" or "HTTP *status*". An address in the text is ignored, so a word in a URL is not read as the failure.

The buttons open the screens of the same workspace: **Open connections**, **Open secrets**, **Open variables** and **Open settings** (the workspace's settings screen).

## Related

- [The run page](../screens/operate/run-page)
- [How runs work](../../explanation/operate/how-runs-work)
- [Find and stop runs](../../how-to/operate/find-and-stop-runs)
