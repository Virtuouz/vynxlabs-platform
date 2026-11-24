# Walk w-flows (phase 29)

Instance localhost:8091, as Devi (sandbox drafts wflows/walk, two, scripts, app w-flows-app) and Maya (own dev workspace w-flows-dev). Shots: ~/.local/share/volvel-walk/shots29/w-flows/.

## Walked and right
- t3 manual start (MP8 and sweep-build form): form and JSON in step both ways at 1440 light/dark; invalid JSON says so and survives a step switch, Save off; reload keeps; min/max, required, type work; Test panel Fields/JSON shows them.
- Approval (MP4/5): 31 days refused "most allowed, 30 days"; groups and roles load; hint on expiry. Foreach (MP1): 21 and 0 refused, 3 fine. Event filter and tags (MP6/7): 11 tags refused. Webhook signature (MP9): timestamp needs a header, tolerance as amount+unit. Script reach and change of script (MP3/12). Error handle on Set/Branch (MP10). FLW-23 title capped at 200; 21+ cases flagged; FLW-31 webhook signature survives switching start kind and back.
- MP13 "On another version..." and MP14 "Cancel by age...": both work, ask twice, say the count ("3 flow runs canceled"), Esc returns focus. 390 dark fine.
- voc-flow: picker search "workflow" and "flow" finds Approvals; no "workflow" in the inspector or Run a flow.
- 768 and 390, light and dark: no horizontal overflow.

## Wrong or rough
1. Run a flow, new step with no flow chosen: "When click: it starts , which can't be started by hand." (1440 light, z-runflow-1440-light.png). Cause publishCheck.ts:109 prints an empty path.
2. Removing a field with Enter drops focus to the page (d.mjs run, 1440). Duplicate field names: no message, JSON keeps the old name.
3. Schema with `title` shows "The form cannot show this schema" (common key).
4. Pasting garbage, or steps with a bad name or unknown type, drops them silently (FlowEditor.tsx:1297).
5. At 390 and 768 the canvas fits everything in view, nodes unreadable (l-walk-start-390-dark.png).
6. Event filter accepts `trigger.x` with no problem listed.
7. Role picker lists each custom role twice (seed data, two roles of one name).

## Not walked
Approvals drawer in a published app, Cancel by age on script runs, viewer gating (t4 not in my rows), F1 (nothing opened). A test run in sandbox fails on another lane's draft (screens/operations, labs/goal widget), not mine.
