---
title: Verify a signed webhook
description: Make a webhook refuse requests that were not signed with a shared secret, for senders such as GitHub and Slack, and send it a signed request to prove it.
subjects: [triggers]
---

## Verify a signed webhook

By the end you will have a webhook that starts its script only for a request signed with a secret you share with the sender, refuses all others with 401, and you will have sent it one of each.

## Before you start

- A script for the webhook to start, in a dev workspace you may change (`resource:write`) and a secret holding the shared value, set under **Configure**, then **Secrets** (`secret:write`). The secret's value is never shown again.
- The sender signs each request body with HMAC and puts the signature in a header. The names below, such as `x-hub-signature-256`, are the ones the senders document. Check them against the sender's own page.

## Add `verify` to the webhook

:::steps
1. Add the secret under **Configure**, then **Secrets**. Name it as the webhook will, for example `PAYFERN_SIGNING_SECRET`.
2. Declare the webhook with `verify`:

   ```ts title="src/flows.ts"
   export const paymentNotice = defineWebhook({
     path: "payments/payfern",
     script: recordPayment,
     verify: {
       scheme: "hmac-sha256",
       header: "x-payfern-signature",
       secret: "PAYFERN_SIGNING_SECRET",
       prefix: "sha256=",
     },
   });
   ```

3. Deploy it. In the console you can choose **By a signature in a header** under **Each request is checked** in a webhook's editor, then fill in the scheme, header, secret, encoding and prefix. The fields `signed`, `timestampHeader` and `toleranceSeconds` are set in code.
4. Open **Operate**, then **Triggers**, and choose the webhook. Under **Webhook address**, press **Copy address**. The address is shown to those who hold `trigger:write`.
:::

## Set it for GitHub or Slack

A request is checked in this order: the header is there; if `timestampHeader` is set, the timestamp is a number within `toleranceSeconds` of now; the header starts with `prefix`; the HMAC of what was signed equals the rest of the header. The comparison takes the same time whatever differs.

:::tabs
::::tab{label=GitHub}
```ts
verify: {
  scheme: "hmac-sha256",
  header: "x-hub-signature-256",
  secret: "GITHUB_WEBHOOK_SECRET",
  prefix: "sha256=",
},
```
::::
::::tab{label=Slack}
Slack signs the text `v0:{timestamp}:{body}` and sends the time of the request in a header.

```ts
verify: {
  scheme: "hmac-sha256",
  header: "x-slack-signature",
  secret: "SLACK_SIGNING_SECRET",
  prefix: "v0=",
  signed: "v0:{timestamp}:{body}",
  timestampHeader: "x-slack-request-timestamp",
  toleranceSeconds: 300,
},
```
::::
:::

| Field | Takes |
| --- | --- |
| `scheme` | `hmac-sha256` or `hmac-sha1` |
| `header` | The header the signature is in: letters, digits and hyphens, up to 100 characters. |
| `secret` | The name of a workspace secret. |
| `encoding` | `hex` (the default) or `base64`. |
| `prefix` | Text before the signature, up to 20 characters. |
| `signed` | What was signed, up to 100 characters: `{body}` is the raw body, `{timestamp}` the timestamp header. The default is `{body}`. |
| `timestampHeader` | A header holding when the request was sent, in seconds since 1970. |
| `toleranceSeconds` | How old a request may be, from 1 to 86,400. The default is 300. |

## Send a signed request

:::steps
1. Keep the secret in a shell variable and the address in another. Sign the exact bytes you send:

   ```bash
   BODY='{"id":"evt_1"}'
   SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SECRET" -hex | sed 's/^.* //')
   curl -i -X POST "$URL" \
     -H 'content-type: application/json' \
     -H "x-payfern-signature: sha256=$SIG" \
     -d "$BODY"
   ```

2. Read the answer. A good signature answers `202` with `{"runId": "…"}`.
3. Send it again with a wrong signature, for example `-H 'x-payfern-signature: sha256=00'`. It answers `401`.
:::

An `idempotency-key` header of up to 200 characters makes a repeated delivery start one run, not two. The webhook takes 120 requests a minute. The sender's own `authorization`, `cookie` and `proxy-authorization` headers are not passed to the script.

## The result

A signed request starts a run, under the trigger's name, which you can open from **Open the last run it started** on the trigger. A refused one starts nothing and is recorded on the trigger: **Last refused** says "the signature did not match" with the reason, and the sender is told only what it is told for a wrong signature.

## If it does not work

| Answer | Cause and fix |
| --- | --- |
| `401` `signature_invalid`, "The *header* header is missing." | The sender did not send the header you named. Check `header`. |
| `401`, "The signature does not match." | The body was changed after signing (a tool re-formatted the JSON), the secret differs from the sender's, `prefix` or `encoding` is wrong, or `signed` does not match what the sender signs. Sign the exact bytes you send. |
| `401`, "The *timestampHeader* header is missing or is not a time." or "The request's timestamp is too far from now." | The timestamp header is absent, or is older or newer than `toleranceSeconds`. Send the current time in seconds. |
| `401` while the secret is not set | The sender is told "The signature does not match." The trigger's **Last refused** says "The secret *name* is not set in this workspace." Set it under **Secrets**. |
| `503` `workspace_paused` or `trigger_paused` | The workspace, the trigger or the instance is paused. A sender that retries gets through once it is resumed. See [Pause triggers](../../../console/how-to/operate/pause-triggers). |
| `404` | The address is wrong, or the trigger was removed. |
| `400` | The body could not be read. |

## Related

- [Triggers](../../../console/reference/screens/operate/triggers)
- [Pause triggers](../../../console/how-to/operate/pause-triggers)
