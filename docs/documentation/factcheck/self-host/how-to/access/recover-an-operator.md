# Fact-check: self-host/how-to/access/recover-an-operator

Commit: 5ebf1c80 plus the working tree, 2026-11-23. Written by the access writer.

Checked by: second agent, 2026-11-23.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Command | `apps/control-plane/src/commands.ts:30-44` | writer, 2026-11-23; second agent, 2026-11-23 | holds as read |
| Effects | `apps/control-plane/src/kernel/bootstrap.ts:68-135` | writer, 2026-11-23; second agent, 2026-11-23 | holds as read |
| Command, texts, effect | `apps/control-plane/src/main.ts:113-137`; `kernel/bootstrap.ts:68-140` | second agent, 2026-11-23 | holds; run on a throwaway operator (acc2-op), not the instance's own; the new password signed in and showed Instance |
