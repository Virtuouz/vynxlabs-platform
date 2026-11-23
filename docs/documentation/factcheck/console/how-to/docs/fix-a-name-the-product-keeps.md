# Fact-check record: console/how-to/docs/fix-a-name-the-product-keeps.md

Lines are current at commit `14f7d5b9` (branch phase-31-write-the-docs). Paths are under `apps/console/src/screens/docs` (`D/`) unless they start with `apps/`, `packages/`. Written by the writer of the docs area; "Checked by" is for the second agent.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Notice text and its plural. | D/Docs.tsx:613-620 | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |
| Editor errors term_reserved and topic_reserved texts. | packages/docs-engine/src/set.ts:422-442 | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |
| A `volvel-` prefixed id is refused with the same words. | packages/docs-engine/src/set.ts:422, 437 (`prefixed`); docs/documentation/fixed/p30-m4.md; run | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |
| Deploy refused: "The bundle's manifests are not valid." naming page and problem. | run (HTTP 400 `validation_failed`); apps/control-plane/src/kernel/docs/product.ts:49-64 | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |
| A page deployed before the product took the name loses it silently; `issues` on GET …/docs. | apps/control-plane/src/routes/docs.ts:116-135, 250-262 | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |
| Notes on the product's help: Add this page's notes to; shown under "From your team". | D/PageDetails.tsx:387-426; docs/sdk-guide.md:262 | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |
| Term id in Terms it defines (Id) and `:term{id=}` uses. | D/PageDetails.tsx:264-336 | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |
