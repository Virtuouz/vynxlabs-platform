# Browser tests

`exit-criterion.spec.ts` walks the exit criterion of phase 7 in a browser, against an instance that is already running. It needs the instance, Postgres, an object store and Keycloak, all reachable at `localhost`, and `git` on the machine that runs the test.

```
pnpm stack:up
docker compose -f deploy/compose/compose.dev.yaml --profile sso up -d --wait keycloak
pnpm build && pnpm start          # or the image, as CI runs it: see .github/workflows/ci.yml
pnpm exec playwright install chromium
pnpm e2e
```

The instance must start managed workers for every tenant, as CI's does: set `MANAGED_WORKER_USER=same`, as `.env.example` does. Without it, the tenant the test makes, whose code is written by a member and not by the operator, gets no worker, and its flows wait forever. `approval-mail.spec.ts` runs only when the instance keeps its mail in a folder (`MAIL_CAPTURE_DIR`) and `E2E_MAIL_DIR` names the same folder.

`E2E_URL` says where the instance is (default `http://localhost:8080`), and `E2E_ADMIN_EMAIL` and `E2E_ADMIN_PASSWORD` who its first operator is. The test makes a tenant of its own each time, and replaces the instance's own identity providers with one on the Keycloak of the development stack. Run it against an instance kept for testing.
