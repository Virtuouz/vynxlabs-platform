# S6: SchemaForm everywhere, and schemas from zod in console code

Roadmap item (the 2026 roadmap, in volvel-internal): P1-5. Priority P1. Complexity M.

## Problem (verified and observed)

- `InputDialog` (`apps/console/src/InputDialog.tsx:8-27`) draws a form only for flat objects of string, number, integer and boolean. Anything else falls back to JSON.
- These all take raw JSON:
  - the script editor's **Try it**
  - **Start flow** (`Flows.tsx:399`, which passes no schema)
  - schedule **input**
  - the trigger forms
- The flow editor's **Run by hand** always sends `{}` (`FlowEditor.tsx:668`).
- A console-authored script declares its input twice: once as a TypeScript type, and once as hand-written JSON Schema in Settings (observed: the template comment says input "is checked against the schema under Settings").

## Design

### `SchemaForm` in `@vynxlabs/ui`

It replaces the kit `Form`'s internals and keeps its export.

**Coverage, a subset of JSON Schema 2020-12 that zod's `toJSONSchema` emits:**
- `object` (nested, as a fieldset);
- `array` of scalars (chips input) or of objects (repeatable rows with add, remove and reorder);
- `enum` (select, or segmented control when there are 4 options or fewer);
- `string` with `format` `date`, `date-time`, `email`, `uri`, plus `minLength`, `maxLength` and `pattern`;
- `number`/`integer` with min and max;
- `boolean`;
- `oneOf`/`anyOf` of objects with a `const` discriminator (select, then subform);
- `default`, `description` (help text), `title`;
- nullable fields (a "None" toggle).

**Unsupported constructs** render that subtree as a JSON field with inline validation, not the whole form.

**Behavior:**
- A **JSON** toggle for the whole form, with a two-way sync.
- Validation with Ajv, which the manifest package already uses. Errors are mapped to fields.
- Initial values come from `default`, a supplied value (re-run, a recent run) or empty.

**Used by:**
- `InputDialog`
- Try it
- Start flow (the manual trigger's schema)
- the flow editor's test and Run by hand
- schedule input (target's schema)
- App Builder action inputs (S7)
- re-run edit (S3)
- Agent access "Try a tool" (P2-12)

### Schema from zod in console code

- **Supported source:** console script source may `export const input = z.object({...})` and `export const output = ...`, next to `export default async function`.
- **Build:** `packages/compose` already compiles console code with esbuild. After compiling, it imports the module in an isolated `worker_thread` with no network, the same way `platform build` loads definitions (`packages/cli/src/build.ts`). It reads `input` and `output`, runs `z.toJSONSchema`, and writes the result to the manifest's `input` and `output`.
- **Fallback:** if `input` is not exported, the Settings JSON schema is used as today, so existing drafts keep working.
- **Settings tab:** shows the generated schema read-only, with "Generated from `input` in the code".
- **Starter template:** changed to the zod form.

## Acceptance criteria

1. A schema with a nested object, an array of objects and an enum renders as fields, validates, and submits the right JSON. Switching to JSON and back keeps the values.
2. Start flow on Fernhill's `inventory/reorder` shows a form from its manual trigger's schema.
3. The flow editor's Run by hand opens the form, and the run receives the typed input.
4. The schedule form's input section shows fields for the chosen script's schema and refuses invalid input before saving.
5. A console script with `export const input = z.object({ name: z.string() })` deploys with that schema. Its Try it form shows a required "name" field. The Settings tab says it is generated.
6. Kit tests cover each supported construct and the JSON fallback for an unsupported subtree.
7. No console screen keeps a JSON-only input where a schema is known. Check by grepping for `as JSON` labels in screens.

## Dependencies and risks

- **Dependencies:** none.
- **Risk: evaluating console code at compose time on the control plane.** It runs in a `worker_thread` with no `node:` network or fs modules allowed, a 2 s time limit and 64 MB. Compose already restricts imports to `@vynxlabs/sdk` and `node:`. The fs and network modules are additionally blocked through a loader hook.
