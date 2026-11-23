# Fact-check: self-host/how-to/running/use-your-own-object-store.md

Written at commit `14f7d5b9`. Lines are those of that commit. Checked by: the writer; the second agent's column is open.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| `HeadBucket`, `GetObject`, `PutObject`, `DeleteObject`; `CreateBucket` only on 404; other answers stop boot. | `apps/control-plane/src/storage.ts:38-50` | writer, 2026-11-23 | holds |
| Timeouts connect 5 s, request 60 s. | `storage.ts:30` | writer, 2026-11-23 | holds |
| `S3_REGION` us-east-1, `S3_FORCE_PATH_STYLE` true by default. | generated settings (Files) | writer, 2026-11-23 | holds |
| For Amazon's S3 set `S3_ENDPOINT=` empty and path style false. | generated settings text: "Left out, Amazon's own for the region"; "false puts it in the hostname" | writer, 2026-11-23 | holds for the text; not run against Amazon |
