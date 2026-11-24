# Fixed by lane voc-access (tier 3, vocabulary: access changes, publish words)

Tests: `packages/cli/src/vocabulary-access.test.ts`, `packages/manifest/src/vocabulary-access.test.ts`, `apps/console/src/vocabulary-access.test.tsx` (new); updated for the new words: `AccessReleases.test.tsx`, `AccessT3.test.tsx`, `SingleSignOn.test.tsx`, `builder-frame.test.tsx`, `packages/cli/src/access.test.ts`, `apps/control-plane/src/access-releases.test.ts`, `access-lane2.test.ts`. Each was seen failing against the old words (the updated expectations fail on the code before). No migration, no schema or contract change. `Interfaces.test.tsx` has two tests that time out at 5 s with or without this change (checked by reversing the diff); left.

## Done

- **VOC-52 / D54** "release" of a tenant's access is "access change" in: the Members & access tab (`Members.tsx` ACCESS_TABS label; slug `releases` and the path stay), the screen (`AccessReleases.tsx`: title, dialogs, toasts, empty state, aria-labels), the "waits for approval" toast link (`ask.tsx`), the single sign-on read-only note and tag (`SingleSignOn.tsx`), `volvel tenant …` output, errors and help (`packages/cli/src/access.ts`, `commands.ts`; command names `release`, `releases`, `approve`... stay), the API's summaries, descriptions and error details (`routes/access-releases.ts`, `routes/shared.ts`, `routes/sso.ts`, `routes/git.ts:48`, `kernel/tenant/releases.ts`), the error entries `own_release` and `release_stale` (`manifest/src/errors.ts`; codes stay), the role editor's permission label "Access changes" (`manifest/src/permissions.ts`), and the Git commit message (`kernel/git.ts`: "Access change N", trailer "Access change: N"). "Release again" became "ask again". Kept: route paths, table `tenant_release`, `managed_by: "release"`, audit action names, `?release=<id>`, `release` in API response fields.
- **VOC-57** the manifest error family: after the above, no code in `errors.ts` says release; deploy and promote are used for the rest. Test in `manifest/src/vocabulary-access.test.ts`.
- **VOC-49** App Builder's commit message is "Deploy <title>" (`AppBuilder.tsx`). **VOC-55** "Deploys to W. The live app keeps working until then." (`PublishCheck.tsx`); the button stays Publish. **VOC-50** `title` on the state tag in `Interfaces.tsx`: "Published means deployed here" (and for Not published). **VOC-51** toast "will be a site once deployed" (`Docs.tsx`). **VOC-56** nav item and Apps title are "Apps" (`nav.ts`, `Apps.tsx`).
- **D55 follow-up**: `docs/self-hosting.md` has no `platform_` metric names left; nothing to change outside `packages/docs/content` and `CHANGELOG.md` (not mine).

## Siblings looked at (POLISH-013)

Every other use of "release" in the console and API: the workspace Release screen, Git sync's "release branch", promotion's `release` field, the CLI's promote message, are the deploy sense and stay for lane voc-state. `permissions.ts`/`tenants.ts`/`endusers.ts` only name the stored value `release`; their descriptions now say "an access change made it".

## Docs content that now differs (phase 31)

- `packages/docs/content/tenant/members.md:13-15` "Going back to an access release": now "access change"; the tab is "Access changes".
- `packages/docs/content/build/index.md:30`, `build/published-apps.md` title, `build/app-builder.md:9`: "Published apps" is now "Apps" in the navigation.
- `operate/releases.md` is the deploy screen (voc-state).
- Any CLI page listing `volvel tenant` summaries and the errors page (`own_release`, `release_stale`, `delete_not_allowed` texts).

## Screens to walk

Members & access > Access changes (list, open one, approve/decline/withdraw dialogs, go back, empty state; 390 px; dark; keyboard; reload on `?release=<id>`); Single sign-on with a mapping an access change made; role editor's "Access changes" permission; Apps nav item and page title; App Builder > Publish check (header sentence); Interfaces state tag tooltip; Docs "Publish as a site" toast. Polish gate: states, lifecycle, keyboard unchanged (words only).

## Found

- `Interfaces.test.tsx` "widgets are added and removed…" and "sharing an app…" time out at 5 s in this lane's environment before and after.
