/**
 * The drawer of the Approvals widget (board 8's shell). Data is which requests: the workflows
 * asked of, as chips with their real titles, and whose. Display is how they look (tiles), what
 * each shows (the step's own details, as the Table's columns are: a list to reorder and hide),
 * and the decided ones. Actions is how deciding goes. Who may decide is not set here but on the
 * workflow's step, and the note says so and links there.
 *
 * Each section is one component of the shell's groups, so it is drawn as a group of its own
 * whichever way the shell asks for it (`bare` is only its rows).
 */
import type { DataInput, PageWidget } from "@volvel/manifest";
import {
  CheckChip,
  ChipSet,
  DrawerBlock,
  DrawerEditor,
  RadioCards,
  SegmentedControl,
  SortableRows,
  TextField,
  ToggleRow,
} from "@volvel/ui";
import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { Link } from "../../../router.tsx";
import type { Env } from "../controls.tsx";
import { withConfig, withInput } from "../model.ts";
import { type ApprovalFlow, flowTitle, useApprovalFlows } from "./approvalFlows.tsx";
import { FullSegments } from "./FullSegments.tsx";
import { dashedFace, Group, LabelledBlock } from "./recordShared.tsx";

const INPUT = "requests";

/** The source as the page stores it, or what a new widget starts with. */
function sourceOf(widget: PageWidget): { flows?: string[]; whose?: "mine" | "all" } {
  const input = widget.data?.[INPUT];
  return input && "approvals" in input.source ? input.source.approvals : {};
}

/** One field of the list: a name the step's details may hold, as the widget shows it. */
interface FieldSetting {
  name: string;
  label?: string;
  hidden?: boolean;
}

/** The first four names are the ones shown when the widget names none. */
const SHOWN_WHEN_UNNAMED = 4;

/** The fields as set, or the names the workflows' steps offer when none are set yet. */
export function fieldsOf(env: Env, offered: readonly string[]): FieldSetting[] {
  const stored = env.config.fields;
  if (Array.isArray(stored) && stored.length > 0) return stored as FieldSetting[];
  return offered.map((name, at) => ({
    name,
    ...(at >= SHOWN_WHEN_UNNAMED ? { hidden: true } : {}),
  }));
}

/** The names the step details of the workflows asked of offer, in the order written, once each. */
export function offeredNames(
  flows: readonly ApprovalFlow[] | undefined,
  listed: readonly string[] | undefined,
): string[] {
  const names: string[] = [];
  for (const flow of flows ?? []) {
    if (listed && listed.length > 0 && !listed.includes(flow.path)) continue;
    for (const step of flow.steps) {
      for (const name of step.fields) if (!names.includes(name)) names.push(name);
    }
  }
  return names;
}

const words = (name: string) => {
  const text = name.replace(/[._-]+/g, " ").trim();
  return text === "" ? name : (text[0] as string).toUpperCase() + text.slice(1);
};

// ---------------------------------------------------------------------------
// Data

/** WHICH REQUESTS: the workflows as chips, and whose. */
export function ApprovalsDataSection({ env }: { env: Env }) {
  const { flows: known, link } = useApprovalFlows();
  const source = sourceOf(env.widget);
  const listed = source.flows ?? [];
  const everyOne = listed.length === 0;
  const paths = (known ?? []).map((flow) => flow.path);
  // A workflow the widget names that is no longer there is still shown, so it can be taken off.
  const missing = listed.filter((path) => known !== undefined && !paths.includes(path));
  const chips: { path: string; title: string; missing: boolean; titled: boolean }[] = [
    ...(known ?? []).map((flow) => ({
      path: flow.path,
      title: flow.title,
      missing: false,
      titled: flow.titled !== false,
    })),
    ...(known === undefined
      ? listed.map((path) => ({ path, title: flowTitle(path), missing: false, titled: false }))
      : missing.map((path) => ({ path, title: flowTitle(path), missing: true, titled: false }))),
  ];
  const write = (next: { flows?: string[] | undefined; whose?: "mine" | "all" }, label: string) => {
    const flows = next.flows && next.flows.length > 0 ? next.flows : undefined;
    const input: DataInput = {
      source: {
        approvals: {
          ...(flows ? { flows } : {}),
          whose: next.whose ?? source.whose ?? "mine",
        },
      },
    };
    env.write(withInput(env.widget, INPUT, input), label);
  };
  const toggle = (path: string, on: boolean) => {
    const base = everyOne ? paths : listed;
    const next = on ? [...base, path] : base.filter((one) => one !== path);
    // Every workflow chosen is "every workflow": new ones with an approval step join it. Never none.
    if (next.length === 0) return;
    const all =
      paths.length > 0 && paths.every((one) => next.includes(one)) && missing.length === 0;
    write({ flows: all ? undefined : next }, "choosing the workflows");
  };
  const open = listed.length === 1 ? listed[0] : undefined;
  return (
    <Group
      label="Which requests"
      note={
        <>
          Who may decide is set on the workflow's step.{" "}
          {link ? (
            <Link
              to={open ? `${link}/flows/edit/${open}` : `${link}/flows`}
              className="inline-flex items-center gap-0.5 text-ink hover:text-action"
            >
              {open ? "Open the workflow" : "Open the workflows"}
              <ChevronRight aria-hidden="true" size={14} />
            </Link>
          ) : null}
        </>
      }
    >
      <DrawerBlock label="Workflows">
        {chips.length > 0 ? (
          <ChipSet label="Workflows">
            {chips.map((chip) => (
              <CheckChip
                key={chip.path}
                checked={everyOne || listed.includes(chip.path)}
                onChange={(on) => toggle(chip.path, on)}
              >
                <span className="flex flex-col">
                  <span>
                    {chip.title}
                    {chip.missing ? " (not found)" : ""}
                  </span>
                  {/* The path under the title: two workflows may share one, and an untitled one is only its path. */}
                  {chip.path.toLowerCase() !== chip.title.toLowerCase() ? (
                    <span className="text-meta opacity-70">{chip.path}</span>
                  ) : null}
                </span>
              </CheckChip>
            ))}
          </ChipSet>
        ) : (
          <p className="m-0 text-body-sm text-ink-muted">
            {known === undefined
              ? "Every workflow with an approval step."
              : "No workflow of this workspace has an approval step yet."}
          </p>
        )}
        <p className="m-0 text-meta text-ink-muted">
          {everyOne
            ? "Every workflow with an approval step, including those made later."
            : "Only these. A workflow with no approval step has nothing to show."}
        </p>
      </DrawerBlock>
      <DrawerBlock label="Whose">
        <RadioCards<"mine" | "all">
          label="Which requests are shown"
          value={source.whose === "all" ? "all" : "mine"}
          options={[
            {
              value: "mine",
              title: "Theirs to decide",
              line: "Only the requests the viewer may approve or reject",
            },
            {
              value: "all",
              title: "Every one, theirs or not",
              line: "The others are shown with their buttons greyed",
            },
          ]}
          onChange={(whose) => write({ flows: source.flows, whose }, "choosing whose requests")}
        />
      </DrawerBlock>
    </Group>
  );
}

// ---------------------------------------------------------------------------
// Display

const writeFields = (env: Env, next: FieldSetting[]) =>
  env.write(withConfig(env.widget, "fields", next), "changing what each shows");

/** WHAT EACH SHOWS: the step's own details as a list to reorder, hide and rename. */
export function ApprovalsFieldsSection({ env }: { env: Env }) {
  const { flows: known } = useApprovalFlows();
  const listed = sourceOf(env.widget).flows;
  const offered = offeredNames(known, listed);
  const fields = fieldsOf(env, offered);
  const [adding, setAdding] = useState("");
  const left = offered.filter((name) => !fields.some((one) => one.name === name));
  const shown = fields.filter((one) => one.hidden !== true).length;
  const set = (next: FieldSetting[]) => writeFields(env, next);
  const add = (name: string) => {
    const clean = name.trim();
    if (clean === "" || fields.some((one) => one.name === clean)) return;
    set([...fields, { name: clean }]);
    setAdding("");
  };
  return (
    <Group
      label="What each shows"
      aside={`${shown} of ${fields.length} shown`}
      note="The step's own details. Drag to reorder, the eye to hide. Left alone, the first four are shown."
    >
      {fields.length > 0 ? (
        <SortableRows
          label="What each shows"
          items={fields.map((one) => ({
            id: one.name,
            label: one.label || words(one.name),
            ...(one.label ? { sub: `from ${words(one.name)}` } : {}),
            hidden: one.hidden === true,
          }))}
          onReorder={(ids) =>
            set(
              ids.flatMap((id) => {
                const found = fields.find((one) => one.name === id);
                return found ? [found] : [];
              }),
            )
          }
          onToggleHidden={(id, hidden) =>
            set(fields.map((one) => (one.name === id ? { ...one, hidden } : one)))
          }
        />
      ) : (
        <p className="m-0 px-3 py-3 text-body-sm text-ink-muted">
          The step's details appear here once a workflow with an approval step is chosen, or add one
          by name.
        </p>
      )}
      <div className="flex flex-col gap-2 px-3 py-3">
        {left.length > 0 ? (
          <ChipSet label="More details these workflows give">
            {left.map((name) => (
              <button key={name} type="button" onClick={() => add(name)} className={dashedFace}>
                <span aria-hidden="true">+</span>
                {words(name)}
              </button>
            ))}
          </ChipSet>
        ) : null}
        <div>
          <DrawerEditor
            title="Add a detail by its name"
            doneLabel="Add"
            side="left"
            onDone={() => add(adding)}
            trigger={
              <button type="button" className={dashedFace}>
                <span aria-hidden="true">+</span>
                Detail
              </button>
            }
          >
            <TextField
              name={`${env.widget.id}-detail-name`}
              label="Add a detail by its name"
              hint="As the workflow's step names it: total, on_hand."
              required={false}
              maxLength={80}
              value={adding}
              onChange={setAdding}
            />
          </DrawerEditor>
        </div>
      </div>
    </Group>
  );
}

/** What each tile of "Looks like" draws: the arrangement, as a few shapes. */
export function LookPreview({ look }: { look: string }) {
  const bar = "rounded-inner bg-line-strong";
  if (look === "cards") {
    return (
      <span aria-hidden="true" className="grid h-9 w-full grid-cols-2 gap-1">
        {[0, 1, 2, 3].map((one) => (
          <span key={one} className="rounded-inner border border-line-strong bg-sunken" />
        ))}
      </span>
    );
  }
  if (look === "queue") {
    return (
      <span aria-hidden="true" className="grid h-9 w-full grid-cols-[1fr_2fr] gap-1">
        <span className="flex flex-col gap-1">
          <span className={`h-2 ${bar} bg-action`} />
          <span className={`h-2 ${bar}`} />
          <span className={`h-2 ${bar}`} />
        </span>
        <span className="rounded-inner border border-line-strong bg-sunken" />
      </span>
    );
  }
  return (
    <span aria-hidden="true" className="flex h-9 w-full flex-col justify-between gap-1">
      {[0, 1, 2].map((one) => (
        <span key={one} className={`h-2 ${bar}`} />
      ))}
    </span>
  );
}

/** The Display tab's own pieces: what each shows. (Looks like and Decided ones are the shell's rows.) */
export function ApprovalsDisplay({ env }: { env: Env }) {
  return <ApprovalsFieldsSection env={env} />;
}

// ---------------------------------------------------------------------------
// Actions

/** DECIDING: what the buttons say, whether it asks why, whether it confirms, whether it moves on. */
export function ApprovalsActionsSection({ env }: { env: Env }) {
  const set = (name: string, value: unknown, label: string) =>
    env.write(withConfig(env.widget, name, value), label, `config:${env.widget.id}:${name}`);
  const text = (name: "approveLabel" | "rejectLabel", label: string, fallback: string) => (
    <DrawerBlock>
      <TextField
        name={`${env.widget.id}-${name}`}
        label={label}
        required={false}
        maxLength={30}
        value={typeof env.config[name] === "string" ? String(env.config[name]) : fallback}
        onChange={(next) => set(name, next === fallback ? undefined : next, "changing a button")}
      />
    </DrawerBlock>
  );
  const askWhy =
    env.config.askWhy === "never" || env.config.askWhy === "always"
      ? env.config.askWhy
      : "rejecting";
  return (
    <Group label="Deciding" note="Who may decide is set on the workflow's step.">
      {text("approveLabel", "Approve says", "Approve")}
      {text("rejectLabel", "Reject says", "Reject")}
      <LabelledBlock label="Ask why">
        <FullSegments>
          <SegmentedControl<"never" | "rejecting" | "always">
            label="Ask why"
            value={askWhy}
            options={[
              { value: "never", label: "Never" },
              { value: "rejecting", label: "Rejecting" },
              { value: "always", label: "Always" },
            ]}
            onChange={(next) =>
              set("askWhy", next === "rejecting" ? undefined : next, "asking why")
            }
          />
        </FullSegments>
      </LabelledBlock>
      <ToggleRow
        label="Ask before approving"
        checked={env.config.confirm === true}
        onChange={(on) => set("confirm", on ? true : undefined, "asking before approving")}
      />
      <ToggleRow
        label="Go to the next one"
        help="Open the next request once one is decided."
        checked={env.config.advance !== false}
        onChange={(on) => set("advance", on ? undefined : false, "going to the next one")}
      />
    </Group>
  );
}
