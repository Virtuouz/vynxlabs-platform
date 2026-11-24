# Re-walk: r-narrow (phase 29)

Instance localhost:8091, tree29 at 381a2e0d. Maya (Fernhill sandbox) and the operator. Shots: ~/.local/share/volvel-walk/shots29/r-narrow/ (S/). fix-narrow.md has no "Re-walk" heading; I used its "Screens to walk" list. Widths 390/768/1440, light and dark for the named screens; 23 workspace lists at 390 and 1440 light. Keyboard used for Check again, Load more, Replace/Keep, tab change, End other sessions.

## Fixed
- w-people 3 / w-gov 4 Account API keys (S/acc-390-dark.png): table scrolls in its frame, no overlap, light/dark, 3 widths.
- Sessions, Workers pool and credentials, Provisioning: no cut cells measured at any width (S/gov-workers-390-dark.png). Queue "Never seen" is now clipped with an ellipsis, not overlapping.
- Runs 390: no overlap; State text truncates ("Succeed...", S/op-runs-390-light.png). No waiting runs exist, so "Waiting until" not seen.
- w-configure 4 / SecretField: Replace focuses the field, Keep returns to "Replace the value" (S/secret-replace-1440-light.png).
- Load more (Instance, All members): Enter keeps the line "Showing 91 all members", focus on it (S/loadmore-members.png).
- Check again: stays focused, aria-disabled during the call; 3 fast clicks with a 2 s delay gave one request. End other sessions asks, focus on Cancel (S/acc-endothers-dialog.png; not confirmed, shared sessions).
- Help passage pipes are gone (S/help-search-permissions-1440-light.png).
- Flow canvas at 390/768 is panned and readable (S/flow-canvas-390-light.png). Platform event hints do not cut (no option wider than its box).
- Bonus: SSO tab change with unsaved edits now asks (w-gov 1).

## Not fixed
1. Connections "Used by", Variables "Read by", Secrets "Used by" at 390 and 768, light and dark: path text runs under the next column (S/cfg-secrets-390-dark.png, cfg-variables-390-light.png). Cause: `kit/references.tsx:60` `inline-block min-w-[9rem]` inside a 7rem cell.
2. SSO Settings save bar at 390 (light/dark): bar top 759, bottom 838 in an 800 viewport; Save/Discard still below the fold (S/sso-settings-dirty-390-dark.png). 768 is fine.
3. Access changes with help open at 1440: "Go back to this" cut at the frame edge (S/help-search-permissions-1440-light.png); tab still inset, no description.
4. Readability, new: Resources Path column shows ~8 characters (S/ws-resources-390-light.png); Flows and Triggers lists cut paths with an ellipsis, no full text (S/ws-flows-390-light.png, trigger-new-390-light.png).

## Not walked
Pause-reason sentence, handler link colour, Runs "waiting" rows (no data), Account End others confirm, Provisioning Load more (no tokens).
