---
title: Start a run from a webhook
description: Send a request to a webhook's address, sign it so that only the sender can start the run, and see what is refused.
subjects: [api, runs]
---

## Start a run from a webhook

By the end you will have started a script by sending a signed request to its webhook address, and seen the refusals of a wrong signature and a stale timestamp.

## Before you start

- A script and a webhook trigger that starts it, deployed in a workspace. The trigger's address is shown with the trigger to those who may manage it; through the API it is `url` in `GET /api/v1/tenants/<t>/workspaces/<w>/triggers`. It ends in a token that begins `vxh_`. See [the webhook address and its key](../../explanation/flows/webhook-address-and-key).
- The sender's shared secret, saved as a secret of the workspace, and its name in the trigger's `verify`. The example trigger is:

  ```json
  {
    "type": "webhook",
    "script": "hooks/echo",
    "verify": {
      "scheme": "hmac-sha256",
      "header": "X-Signature",
      "secret": "HOOK_SECRET",
      "prefix": "sha256=",
      "timestampHeader": "X-Timestamp",
      "signed": "{timestamp}.{body}",
      "toleranceSeconds": 300
    }
  }
  ```

- The triggers of the workspace are not paused. A dev workspace starts with them paused.

## Send a signed request

:::steps
1. Read the address, and keep it as secret as a password: whoever holds the token can call it.

   ```bash
   curl -s -H "authorization: Bearer $VOLVEL_KEY" "$WS/triggers"
   ```

2. Sign the request the way the trigger's `verify` says. Here the signature is the HMAC-SHA256, in hex, of the timestamp, a dot and the exact body, with `sha256=` before it. Send the timestamp in seconds since 1970 in `X-Timestamp`.

   ```js title=sign.mjs
   import { createHmac } from "node:crypto";

   const [url, secret] = process.argv.slice(2);
   const body = JSON.stringify({ order: "A-1001", total: 42 });
   const timestamp = String(Math.floor(Date.now() / 1000));
   const signature = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
   const response = await fetch(url, {
     method: "POST",
     headers: {
       "content-type": "application/json",
       "x-timestamp": timestamp,
       "x-signature": `sha256=${signature}`,
       "idempotency-key": "order-A-1001",
     },
     body,
   });
   console.log(response.status, await response.text());
   ```

3. Run it with the address and the secret.

   ```bash
   node sign.mjs "$HOOK_URL" "$HOOK_SECRET"
   ```

   ```text
   202 {"runId":"01a20a4b-cd30-72e8-9f55-fca0ba7687c6"}
   ```

4. Read the run. Its input is the body, and its trigger is the webhook.

   ```bash
   curl -s -H "authorization: Bearer $VOLVEL_KEY" "$WS/runs/<run id>"
   ```

   The run shows `"trigger": {"type": "webhook", "trigger": "hooks/orders"}` and `"input": {"order": "A-1001", "total": 42}`.
:::

## What the address takes

- The body is JSON, a form (`application/x-www-form-urlencoded`) or text. It becomes the script's input. A trigger set to hand over the whole request gives the script the method, the headers, the query and the raw body as well. `authorization`, `cookie` and `proxy-authorization` are not passed on.
- The signature is checked on the raw bytes you sent, so sign the same string you send. `hmac-sha256` and `hmac-sha1` are supported, written in `hex` (the default) or `base64`. `prefix` is what comes before the signature in the header, and `signed` says what was signed: `{body}` and `{timestamp}` stand for the raw body and the timestamp header, and `{body}` is the default.
- With `timestampHeader` set, a request whose timestamp is further from now than `toleranceSeconds` (300 if left out, at most 86,400) is refused, so that a captured request cannot be sent again later.
- The `idempotency-key` header (1 to 200 characters) makes a repeated delivery harmless: it answers 202 with the same `runId`. See [Start a run safely twice](start-a-run-safely-twice).
- A flow whose trigger says `respond: flow` holds the request open for up to 25 seconds so that the flow can answer it, and answers 202 if the flow has said nothing by then. A flow's answer carries the flow run's ID in `x-flow-run`.
- The address is limited to 120 requests a minute for each caller address: see [how rate limits work](../../explanation/api/how-rate-limits-work).

## The result

The webhook answers 202 and a `runId`. The run is queued and starts on a worker.

## If it does not work

- **401 `signature_invalid`, with a `detail` that says why.** "The X-Signature header is missing."; "The X-Timestamp header is missing or is not a time."; "The request's timestamp is too far from now."; or "The signature does not match." Check the secret, the prefix, the encoding, the signed text and that the clock of the sender is right.
- **404 "The webhook was not found."** The token is wrong, or the trigger was removed or renamed without a `key`. A renamed trigger takes a new address unless it has a `key`.
- **503 `trigger_paused`.** This webhook is paused, or every trigger in the instance is. Resume it. A sender that retries gets through then.
- **503 `workspace_paused`.** The workspace's triggers are paused. A dev workspace starts that way.
- **400.** The body could not be read, for example JSON that does not parse.
- **429 `rate_limited`.** More than 120 requests a minute from one address. Wait for `retry-after`.
