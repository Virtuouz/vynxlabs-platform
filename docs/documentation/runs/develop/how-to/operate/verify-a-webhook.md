# Run log: develop/how-to/operate/verify-a-webhook.md

- Instance: http://localhost:8091, the throwaway instance seeded by `examples/fernhill/setup/setup.mjs`, commit `5ebf1c80` (branch phase-31-write-the-docs).
- Signed in as Maya Brooks (`maya.brooks@fernhill.example`, tenant admin), in Fernhill's Sandbox workspace, at 1440 px, light theme, Playwright headless. No other width, no dark theme, no keyboard-only pass, no reload test.
- Other writers share the Sandbox, so its Runs list holds runs that are not mine.

## The steps as followed
1. In Clinics (production) opened the trigger `payments/payfern` (a webhook with `verify`): the address is shown under **WEBHOOK ADDRESS**.
2. `curl -X POST <address> -H 'x-payfern-signature: sha256=00' -d '{"id":"op-docs"}'` answered `401` with `code: signature_invalid` and `detail: "The signature does not match."`.
3. The same without the header answered `401` with `detail: "The x-payfern-signature header is missing."`.
4. Computed `openssl dgst -sha256 -hmac topsecret -hex` over `{"id":"evt_1"}` and the same with node's `createHmac`: identical (`52e22fab…ab9d`).
5. No request with a good signature was sent: the secret's value is not readable, and the webhook starts `billing/record-payment` in the demo's production workspace.

## The page got wrong (and was corrected)
- No correction was needed from the run.

## Not run
A request with a good signature (202), the Slack form with its timestamp, a paused webhook (503) and the sender-side headers of GitHub and Slack, which the page takes from what those senders document.
