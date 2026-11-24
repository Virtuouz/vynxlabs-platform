# Re-walk r-screens (after fix-screens and fix-gating)

Instance localhost:8091, tree at 381a2e0d. Shots: ~/.local/share/volvel-walk/shots29/r-screens/. Scripts: ~/.local/share/volvel-walk/r-screens-scripts/. Walked at 1440 light and dark, 390 dark (some 390 light), 768 light for Members & access, by script and keyboard (Tab loops), with reload. Not every row was walked at every width.

## Fixed
- w-people 1 (description present, own help per tab) and 2 ("access change"; "Gives developer to group x"): fixed for copy; see Not fixed for the inset.
- w-people 6: short password says "Use at least 12 characters.", no banner (addmember-short-1440-light.png, -390-dark).
- w-people 8: `/t/fernhill/members/groups` says "That place was not found."
- w-gov 1: tab change in a provider with an unsaved edit asks "Leave without saving?" (Stay returns focus to the tab). sso-tabswitch-1440-light.png.
- w-gov 2: Groups picker "zzz" lists nothing; empty search is capped at 200 with "Showing the first 200 groups. Load more". sso-groups-zzz-390-dark.png.
- w-gov 7: audit "disabled" is UPDATE (member and hostname). instance-audit-1440-dark.png.
- w-instance 1: All tenants reload keeps ?location=&q= (1440 light/dark, 390 dark). 2: Import check shows only "This tenant is on this instance already" (import-uploaded-390-dark.png). 4: full email in title.
- w-configure 5: bad or empty run limit gives a toast saying why (runlimit-bad-390-dark.png).
- w-words 1: no "Access released" or "tenant release" in tenant or instance audit; filters read "access change". 6: Overview "Review changes", "Deploy".
- w-people 10 padded page seen via /t/slug; operator-minutes not re-walked.
- Gating: viewer sees line and greyed controls on Workspace settings (Give access, Remove), service accounts, table Add row, Events Publish, Triggers New trigger, script page Run (line "needs run:write"), run page Re-run and Edit in Sandbox (390 dark). viewer-*-1440-light.png.

## Not fixed
1. w-people 1: Access changes tab is still inset 32px (table x 320 vs 288 at 1440; 390 h1 x 32 vs 16). members-Access_changes-1440-light.png. AccessReleases.tsx.
2. w-people 4: nav and menu say "Account", but the page h1 is "API keys" above Profile and Password. account-1440-light.png.
3. w-people 9: SideSheet Tab still leaks. In Create group, Tab from the last control reaches a guard span, then BODY and the Skip link (about 1 in 7 presses). Give access dialog holds (0 of 40). `packages/ui/src/SideSheet.tsx:50-66`.
4. w-gov 3: 390 SSO Settings save bar is cut off (Save at y=838 of 844). sso-dirty-390-dark.png.
5. w-readonly viewer: script peek (Scripts list) still offers Open editor, Run and Offer to an agent enabled. viewer-script-1440-light.png.
6. w-readonly/w-operate 5 single-flow grant: workspace and tenant GET now answer 200 and the shell loads, but the flow page fails with "This needs the flow:read permission" though w_readonly_flow_runner holds flow:read on that flow. GET flow `routes/flows.ts:654-657` and `flow-runs` (:795, role lacks flow_run:read) are not behind `reachedFromInside`. Start and Re-run are unreachable. grant-flow-1440-light.png, grant-flow-390-dark.png.

## Not walked
Instance audit deleted-tenant name, CSV UTC note, w-instance 3, Add member layout at 390, 768 dark.
