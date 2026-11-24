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

## Pictures and accessibility

`redesign.spec.ts` and `tenant-apps.spec.ts` compare each screen with its reviewed picture in `e2e/snapshots/`, and check it with axe (serious and critical problems fail; colour contrast is checked against the tokens by `packages/ui`'s own test). Times, IDs, values set in mono and anything marked `data-volatile` are masked. A change that is meant makes new pictures:

```
pnpm e2e redesign tenant-apps --update-snapshots
```

Look at the new pictures before committing them: the commit that changes how something looks carries its pictures. Screens that list what the whole instance holds (tenants, audit, workers, API keys) are checked for fit and axe, not compared.

## Running it fast

`pnpm e2e` is `e2e/run.mjs`: two runs of Playwright, the projects that can run beside each other and then `alone`, each given what follows the command (a file, `--grep`, `--only-changed`), because Playwright runs a project's dependencies and the setup in full. The suite runs in projects (`playwright.config.ts`), beside each other on `E2E_WORKERS` workers (default 4; `E2E_WORKERS=1` runs it as one line):

| Project | Specs | How they run |
|---|---|---|
| `setup` | `auth.setup.ts` | Signs in the operator and Fernhill's Maya, Rowan, Devi, Amara and Jess once, into `e2e/.auth/<who>.json` (not in git) |
| `parallel` | everything that makes a tenant of its own | files side by side, the tests of one file in order |
| `fernhill` (and `fernhill-phase-23`, `fernhill-phase-24`) | `phase-22` to `phase-28*`, `approvals-mine`, `screenshots`: they need the seed | as `parallel`; each writes only names of its own into the Sandbox. 23 and 24 share the workspace's one `docs-feedback` table, so 24 runs after 23 |
| `alone` | `exit-criterion`, `redesign`, `favicon`, `polish-behaviour`: they change the whole instance (identity providers, branding, the logo) or what the operator keeps | one worker, in a second go (`run.mjs`) once the rest is done, whether or not it passed |

A spec that is not about signing in does not use the form. `as.ts` gives a person already signed in: `asPerson(browser, "maya")` is a new context with their saved session, `signInAs(page, "operator")` puts it into a page a spec made itself, and `ownMember(...)` makes a member of a tenant for a spec that changes what a member keeps (a pane's width, a shortcut setting), so it never changes the operator's, which the specs beside it are signed in as. Keep the form where a spec tests it, and for members a spec makes itself. Each worker sends an address of its own (`X-Forwarded-For`, set in `test.ts`), so the instance's limit of twenty sign-ins a minute is not shared, and `sign-in.ts` waits the `Retry-After` it is given.

Write a new spec so that it can run beside the others: its own stamped tenant or its own names, nothing it changes that another spec reads, and its own member for anything the signed-in person keeps. If it cannot (it changes the instance), add it to `ALONE` in the config.

### Which to run

- **While building:** `pnpm e2e:changed`. It runs the specs that import a file changed since `main` (`E2E_BASE=<branch>` for another base). It sees the specs and the helpers they import, not the product's code: a change to a screen needs its area.
- **An area:** `pnpm e2e --grep @builder`. Every test's title carries one or two tags: `@builder`, `@docs`, `@data`, `@access`, `@operate`, `@instance`, `@polish`, and `@fernhill` for the specs that need the seed. A new test takes the tag of its spec.
- **One spec:** `pnpm e2e phase-27`. The `setup` project runs first by itself.
- **The whole suite:** once at the end of a phase, and in CI. `E2E_GROUP=a|b|c` runs one of CI's three groups.

Every worker needs memory: a browser, and a managed worker for each tenant its test makes, which the instance holds back when the machine's free memory is low (`RUN_MEMORY_FLOOR_MB`), so runs wait. Four workers want about 6 GB free beside the instance; on a smaller machine lower `E2E_WORKERS`.

In CI a failed test is run once more (`retries: 1`; locally there are none), and the tests that passed only on their retry are listed at the end of the run and in the job's summary: they are findings, not passes.
