# Lane reset (phase 30): a member's password reset link (D4)

The owner's decision D4: a member's password is reset with a one-time link that an operator or a tenant admin makes, mailed where mail is set up and copyable where not. Nobody learns the password. It also settles the case left out in `gov.md` under GOV-09: an imported member with no password gets one this way.

## What was built

- Migration `packages/db/migrations/0098_reset_member_password_token.sql` (locked): the end users' table (`end_user_token`) belongs to a tenant and an end user, so a member's tokens are kept in `member_password_token` (hash only, `expires_at`, `used_at`). It is an instance table in `kernel/tenancy/tables.ts` (`INSTANCE_TABLES`), not carried by an export. The token, mail and page pieces are the same in shape as the end users' (`createPasswordToken`, `link`, `/set-password`).
- `apps/control-plane/src/kernel/member-reset.ts`: `makeMemberResetLink`, `readMemberResetToken`, `setMemberPasswordWithToken`. Two hours, one use, a new link replaces an unused one, using it ends every console and app session of the member (`endSessions`), and sets or makes the credential account, so an imported member with none gets a password.
- `apps/control-plane/src/routes/member-resets.ts`, registered in `app.ts`:
  - `POST /tenants/:t/members/:memberId/password-link` (`member:write` at the tenant);
  - `POST /members/:memberId/password-link` (`member:write` at the instance);
  - `GET` and `POST /member-password-links/:token` (public, rate limited, the token is the credential).
- Refusals, in words: a member who signs in only through a provider (409, names the provider; operators keep passwords and are not refused); a disabled account; yourself (use Account). From a tenant: a member not in the tenant (404), and a member who also belongs to another tenant or holds a role at the instance (409: an operator makes it). The last rule is mine, not stated in D4: without it an admin of one tenant could take over an account that reaches other tenants or runs the instance. Please confirm or lift it.
- Mail: sent when `kernel.mail.configured`; then the answer carries `url: null` and the admin is not shown the link. Otherwise the answer carries the link, shown once in the shared `OneTimeSecret`.
- Audit: `member.password_link_created` (actor, member, tenant when made from one, email in details) and `member.password_reset` (anonymous, the link is the credential). Never the token or the password.
- Console: `kit/MemberResetLink.tsx` (button behind `useNeeds` / `Can.tsx`, confirmation, result dialog), used in the tenant member inspector (`screens/Members.tsx`) and the instance All members row actions (`screens/Instance.tsx`, not for a disabled member). Public page `screens/ResetPassword.tsx` at `/reset-password/:token` (route in `App.tsx`).

## Tests

- `apps/control-plane/src/member-reset.test.ts` (seen failing with 404 before the routes existed): "a tenant admin makes one; it works once, ends the sessions, and is audited without the token", "a second link replaces the first, and an expired one does not work", "a short password is refused and the link stays good", "with mail set up the link is mailed and not shown", "an admin of another tenant, and a member who belongs elsewhere, are refused", "a member who signs in only through a provider is refused with words", "a member with no password (imported) gets one this way".
- `apps/control-plane/src/kernel.test.ts`: the write-path guard names the new routes as exercised in `member-reset.test.ts`.
- `apps/console/src/MemberReset.test.tsx` (6 tests): tenant member makes the link and is told what happens; mailed; refusal in words; read-only is off; instance row; the public page.
- `apps/console/src/enforce.test.ts`: the password link page stands outside the shell like sign-in.

## Siblings looked at (POLISH-013)

End users' links (`routes/endusers.ts`, `kernel/endusers.ts`, `screens/EndUsers.tsx`) are unchanged. The Account screen's own password change and `auth.ts` are untouched. Disabling or removing a member still ends sessions through the same `endSessions`.

## Screens to walk (390, 768, 1440; light and dark; keyboard; reload)

1. Tenant, Members & access, Members: open a member (inspector footer): "Make a password reset link" beside View access, Suspend, Remove; the confirmation says what happens; the result dialog (link to copy on an instance without mail; "emailed" with mail); Escape and focus return; the footer wraps at 390.
2. Instance, All members: the row's button next to Disable; not shown for a disabled member; at 390 the row actions wrap.
3. As a member who only reads (`member:read`): the button is off with the permission in its tooltip.
4. A member who signs in through a provider that is required: the refusal text. A member of two tenants from a tenant admin: the refusal says an operator makes it.
5. `/reset-password/<token>`, signed out: the form (mismatch, too short, loading), the done state, a used or expired link, 390 px, dark; reload after use shows the expired state.

## Polish gate answers

- States: loading (button), refused (words), saving (button loading), failed (toast), empty n/a; the page has loading, gone, done.
- Lifecycle: make, replace, use, expire; the sessions end on use.
- Keyboard: buttons and dialog only; the form submits with Enter.
- Copy: American spelling, "flow" not used; says who can give a new link.

## For the docs and CHANGELOG (not edited here)

- Members: "A member's password is reset with a one-time link, made from the member's row by an operator or, for a person who belongs only to their tenant, by a tenant admin. It works once for two hours and ends the member's other sign-ins. Where the instance sends mail the link goes to the member; elsewhere you copy it once. Nobody sees the password."
- CHANGELOG: new routes above, table `member_password_token`, audit actions `member.password_link_created` and `member.password_reset`.

## Left out

- A link for a member whose provider is optional is allowed: they keep both ways.
- No "send again" for a mailed link: make a new one.
- The browser walk was not run in this lane (no throwaway instance started): the phase is not presented as walked.

## Found

None.
