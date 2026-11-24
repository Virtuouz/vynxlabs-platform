# Run log: administer/how-to/sso/brand-the-portal.md

- Instance: http://localhost:8091, the throwaway instance seeded by `examples/fernhill/setup/setup.mjs`, commit `5ebf1c80` plus the uncommitted work of this wave (branch phase-31-write-the-docs).
- Tenant of my own: `sso-wave` (name "SSO Wave"), made as the operator admin with `addCreator`, so the operator admin is its tenant admin. A first tenant `sso-docs` was made by mistake without a creator, and could not be entered or deleted; it is left empty. No Fernhill person or resource was touched.
- Browser: Playwright headless, 1440 px wide, light theme, signed in as the operator admin. Identity provider: the dev stack's Keycloak 26.4, realm `acme` (people `ada`, `ben`), at http://localhost:8180, with two clients of my own made through its admin API (`sso-docs-oidc` for OIDC, with a groups mapper, and one SAML client made from the instance's own metadata, with email, name and groups mappers). The shared `volvel` client was not changed.
- Only 1440 px and light were run. A script drove the screens; no page was followed by a person reading it.

## The steps as followed
1. **Tenant > Branding**: Portal link `http://localhost:8091/portal/sso-wave/`, the mail note ("This instance sends mail, so invitations and password reset links are emailed to them."), **People may create their own account** (off), **Theme** with 27 fields under Light and 27 under Dark, **Clear back to the kit's values**, **Preview**, **Logo** ("No logo yet.").
2. Typed `#cccccc` in **ink-muted, light** and `notacolor` in **action, light**. The light preview listed "4 pairs are hard to read: ink-muted on canvas: 1.47, needs 4.5 / on surface 1.61 / on sunken 1.42 / on structure 1.38", and "3 pairs could not be checked ... action on surface: action is “notacolor”" (and on canvas, and action-ink on action). Dark said "Every pair checked is easy to read."
3. **Save** with `url(x)` in **action**: refused, "action must be a plain color, length or font list" under the field and "That is not a theme." above. With `action` emptied, **Save**: "Branding saved. The portal and apps show it from their next page." After a reload `ink-muted` read `#cccccc`.
4. **Clear back to the kit's values**: "Go back to the kit's values? Every value set here is cleared, for light and for dark. Nothing changes until the page is saved." **Clear them**, **Save**: the tenant's theme came back empty.

## What the run could not do
- A logo was not uploaded (no image file in the walk): types, size and the icons the browser makes were not run.
- The portal and the apps were not opened to see the colors; only the saved values were read back.
- A workspace `theme` resource overriding the tenant's was not made.
- The 60 s and 300 s cache times are from the code.

## Second check, 2026-11-23 (second agent)
- Walked the Branding screen at 390 px in dark and at 1440 px in light, as the operator admin, in tenant `sso-wave` (own names: hostname `p31.sso-wave.example`, pool `compose-pool`). No horizontal scroll at 390 px.
- Run now: **Upload a logo** with a 128 px PNG: the notice "The logo is replaced." and the label becomes **Replace the logo** and **Remove logo** is there; an SVG: "Choose a PNG, JPEG or WebP image."; a 600 KB file: "That image is 600.2 KB. A logo can be 512 KB at most."; the logo answers 200 `image/png` with `cache-control: public, max-age=300`; after a reload it is still there; **Remove logo** asks "Remove the logo? The sign-in pages show the tenant's name alone." and the screen returns to "No logo yet." The browser's icons were not read.
- The page got wrong: nothing in the logo step except it did not say the notice or the removal; added.
