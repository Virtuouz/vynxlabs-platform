# Lane t3-flow-ops-sdk: fixed

No migration.

## FLW-MP15, FLW-MP16, FLW-MP17 (SDK)
- `packages/sdk/src/index.ts`: `step.foreach` takes exactly one of `script`, `flow`, or `flowFrom` with `allow` (a type union); `step.subflow` takes a flow or `{ flowFrom, allow, input }`; `allow` takes paths or definitions (`pathOf`). `trigger.schedule`, `trigger.webhook`, `trigger.event` take `tags`. `FlowOptions.layout` (typed by node names) is written to the flow body.
- Test: `packages/sdk/src/flows.test.ts` "a flow's choice of flow, tags and layout" (3 tests), seen failing before.
- Siblings: `defineSchedule` and the trigger kinds already had `tags`; `FlowBody` already accepts `layout`, `flowFrom`, `allow` and `tags` (manifest `flow.ts`), so no contract changed.
- A person sees nothing; code authors see the new options.
