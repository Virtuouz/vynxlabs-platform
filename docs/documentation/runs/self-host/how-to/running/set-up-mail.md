# Run log: self-host/how-to/running/set-up-mail.md

- Commit `14f7d5b9`. Instance: the throwaway Compose stack described in [the drill log](../../running-drill) (project `p31host` or `p31restore`, ports 18480 and 18481, never the instance on 8091).
- Who: `ops@example.com`, the first operator, through the API, headless; no browser walk of a screen.

## What was run
`check-config` with `SMTP_URL` alone, then with both (valid). `GET /instance` answered `mail:false` without them.

## What the page got wrong
Not known.

## Not run
Sending mail, the approval mail, `MAIL_CAPTURE_DIR`.

## Second check (2026-11-23)

On the checker's own stack (`-p p31chk`, port 18590, torn down after). Run with a node SMTP sink on the execution network: `check-config`, `mail:true`, a member's password link arrived with the expected subject and text. Page gained the member password link (`member-resets.ts:37`). `MAIL_CAPTURE_DIR` run: file written, SMTP_URL ignored, warning logged. Approval mail not run; 48 h and 50 hold in code. Key screens walked at 390 px and in dark on that stack (Health, Triggers, Database locations): no horizontal overflow, labels as the page says.
