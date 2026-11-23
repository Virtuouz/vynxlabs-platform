/**
 * The Rules tab, designed once (board 9) for every widget. Two questions: when is it shown, and
 * who can see it. A widget that runs an action adds two more for each: when can it be pressed, and
 * who can run it (owner decisions 2 and 3, phase 28).
 *
 * - SHOW THIS WIDGET: Always, or Only when… (`rules.showWhen`), as sentence chips.
 * - WHO CAN SEE IT: everyone who can open the app, or limited to groups (`rules.seenBy`). Drawing
 *   only, and said so.
 * - CAN BE PRESSED WHEN (`action.when`): shown but greyed out otherwise, with the reason.
 * - WHO CAN RUN IT (`action.runBy`): group chips. Checked on the server too.
 *
 * `ActionRules` draws the last two for one action at a config path, so an Action group can give
 * each of its buttons its own Rules.
 */
import type { SeenBy } from "@volvel/manifest";
import {
  AddChip,
  ChipSet,
  DrawerBlock,
  DrawerEditor,
  DrawerGroup,
  SegmentedControl,
} from "@volvel/ui";
import { Shield, User, X } from "lucide-react";
import { Link } from "../../router.tsx";
import { actionContext } from "./actionControls.tsx";
import { type Action, firstCondition } from "./actionModel.ts";
import { actionSlots, writeSlot } from "./actionSlots.ts";
import { ConditionsEditor } from "./conditions.tsx";
import type { Env } from "./controls.tsx";
import { useChosenGroups } from "./groupChoices.tsx";
import { heading, visualOf } from "./model.ts";
import { type GroupChoice, groupKey, groupName } from "./timelineModel.ts";

/** A group chip: its name, and a × that takes it away. */
function GroupChip({
  name,
  gone,
  onRemove,
}: {
  name: string;
  gone?: boolean;
  onRemove: () => void;
}) {
  return (
    <span
      className={`inline-flex h-7 max-w-full items-center rounded-control border bg-sunken text-body-sm text-ink ${
        gone ? "border-danger text-danger" : "border-line-strong"
      }`}
    >
      <span className="inline-flex min-w-0 items-center gap-2 pr-1 pl-3">
        <User aria-hidden="true" size={14} className="shrink-0 text-ink-muted" />
        <span className="truncate">{name}</span>
        {gone ? <span className="text-meta">not found</span> : null}
      </span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${name}`}
        className="grid h-full w-6 shrink-0 cursor-pointer place-items-center rounded-r-control text-ink-muted outline-offset-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-focus"
      >
        <X aria-hidden="true" size={14} />
      </button>
    </span>
  );
}

/** The chip nobody picked: what is so when no group is named. */
function EveryoneChip({ children }: { children: string }) {
  return (
    <span className="inline-flex min-h-7 items-center rounded-control border border-action bg-action-soft px-3 py-0.5 text-body-sm text-action">
      {children}
    </span>
  );
}

/** "+ Group": a small editor that lists the tenant's groups, to be checked. */
function GroupPicker({
  label,
  choices,
  chosen,
  onToggle,
}: {
  /** "Limit to a group", "Group". */
  label: string;
  choices: readonly GroupChoice[];
  chosen: readonly string[];
  onToggle: (path: string, on: boolean) => void;
}) {
  return (
    <DrawerEditor title="Groups" trigger={<AddChip aria-label={label}>{label}</AddChip>}>
      {choices.length === 0 ? (
        <p className="m-0 text-body-sm text-ink-muted">
          This tenant has no groups yet. Make one under Groups.
        </p>
      ) : (
        <fieldset className="m-0 min-w-0 border-0 p-0">
          <legend className="sr-only">Groups</legend>
          <div className="divide-y divide-line rounded-control border border-line">
            {choices.map((choice) => (
              <label
                key={choice.path}
                className="flex min-h-9 cursor-pointer items-center gap-3 px-3 text-body-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus"
              >
                <input
                  type="checkbox"
                  checked={chosen.includes(choice.path)}
                  onChange={(event) => onToggle(choice.path, event.target.checked)}
                  className="size-4 accent-[var(--vx-action)]"
                />
                <span className="min-w-0 flex-1 truncate">{choice.name}</span>
                <span className="text-meta text-ink-muted">
                  {choice.kind === "member" ? "Team" : "End users"}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
    </DrawerEditor>
  );
}

/** The chips of a list of group paths, with "+ Group" to add one. */
function GroupChips({
  paths,
  choices,
  everyone,
  addLabel,
  onChange,
}: {
  paths: readonly string[];
  choices: readonly GroupChoice[];
  /** What is said when none is named. */
  everyone: string;
  addLabel: string;
  onChange: (next: string[]) => void;
}) {
  const known = new Set(choices.map((one) => one.path));
  return (
    <ChipSet label="Groups">
      {paths.length === 0 ? <EveryoneChip>{everyone}</EveryoneChip> : null}
      {paths.map((path) => (
        <GroupChip
          key={path}
          name={groupName(path, choices)}
          gone={!known.has(path) && choices.length > 0}
          onRemove={() => onChange(paths.filter((one) => one !== path))}
        />
      ))}
      <GroupPicker
        label={addLabel}
        choices={choices}
        chosen={paths}
        onToggle={(path, on) =>
          onChange(
            on
              ? [...paths.filter((one) => one !== path), path]
              : paths.filter((one) => one !== path),
          )
        }
      />
    </ChipSet>
  );
}

/**
 * "Can be pressed when" and "Who can run it" for one action. `onChange` gets the action as it
 * should now be. Where the action is kept (an event, a setting, a button of a group) is the
 * caller's.
 */
export function ActionRules({
  env,
  id,
  action,
  onChange,
  groupChoices,
}: {
  env: Env;
  id: string;
  action: Action;
  onChange: (next: Action, key?: string) => void;
  /** Left out: the provider's, else the names the inspector has. */
  groupChoices?: readonly GroupChoice[];
}) {
  const given = useChosenGroups();
  const choices = groupChoices ?? given;
  const ctx = actionContext(env);
  const without = <K extends "when" | "runBy">(key: K): Action => {
    const { [key]: _gone, ...rest } = action;
    return rest as Action;
  };
  const runBy = action.runBy?.groups ?? [];
  return (
    <>
      <DrawerGroup
        label="Can be pressed when"
        note="Shown but greyed out otherwise, with the reason as a tooltip."
      >
        <DrawerBlock className="[&_fieldset]:w-full [&_fieldset]:flex-nowrap [&_label]:flex-1 [&_label]:justify-center">
          <SegmentedControl
            label="Can be pressed when"
            options={[
              { value: "always", label: "Always" },
              { value: "when", label: "Only when…" },
            ]}
            value={action.when ? "when" : "always"}
            onChange={(next) => {
              if (next === "always") onChange(without("when"));
              else if (!action.when) {
                onChange({
                  ...action,
                  when: [
                    firstCondition(
                      ctx,
                      given.map((one) => groupKey(one.path)),
                    ),
                  ],
                });
              }
            }}
          />
          {action.when ? (
            <ConditionsEditor
              id={`${id}-when`}
              conditions={action.when}
              ctx={ctx}
              groups={given}
              addLabel="And"
              onChange={(when, key) => onChange(when ? { ...action, when } : without("when"), key)}
            />
          ) : null}
        </DrawerBlock>
      </DrawerGroup>
      <DrawerGroup
        label="Who can run it"
        note="Checked on the server too: hiding the button is not what stops other people."
      >
        <DrawerBlock>
          <GroupChips
            paths={runBy}
            choices={choices}
            everyone="Anyone who can open the app"
            addLabel="Group"
            onChange={(groups) =>
              onChange(groups.length > 0 ? { ...action, runBy: { groups } } : without("runBy"))
            }
          />
        </DrawerBlock>
      </DrawerGroup>
    </>
  );
}

export function RulesTab({
  env,
  rowRules,
  groupChoices,
}: {
  env: Env;
  /** Where a table's row rules are changed, if the reader may go there. */
  rowRules?: ((table: string) => string) | undefined;
  groupChoices?: readonly GroupChoice[];
}) {
  const given = useChosenGroups();
  const choices = groupChoices ?? given;
  const tables = [
    ...new Set(
      Object.values(env.widget.data ?? {}).flatMap((input) => {
        const visual = visualOf(input);
        return visual?.table ? [visual.table] : [];
      }),
    ),
  ];
  const noun = env.surface === "app" ? "app" : "dashboard";
  // "Show this approvals" reads wrong: a title that is a plural is called a widget.
  const kind = /s$/i.test(env.definition.title) ? "widget" : env.definition.title.toLowerCase();
  // A widget's own rules can read the record its page is open on, and no clicked one.
  const ctx = { ...actionContext(env), eventTable: undefined, defaultRef: "this" as const };
  const showWhen = env.widget.rules?.showWhen;
  const seenBy = env.widget.rules?.seenBy?.groups ?? [];
  const editBy = (env.widget.config?.editBy as { groups?: string[] } | undefined)?.groups ?? [];
  const setRules = (
    patch: { showWhen?: typeof showWhen; seenBy?: SeenBy | undefined },
    key?: string,
  ) => {
    const was = env.widget.rules ?? {};
    const next = {
      showWhen: "showWhen" in patch ? patch.showWhen : was.showWhen,
      seenBy: "seenBy" in patch ? patch.seenBy : was.seenBy,
    };
    const rules: NonNullable<typeof env.widget.rules> = {
      ...(next.showWhen?.length ? { showWhen: next.showWhen } : {}),
      ...(next.seenBy?.groups.length ? { seenBy: next.seenBy } : {}),
    };
    const { rules: _before, ...rest } = env.widget;
    env.write(
      Object.keys(rules).length > 0 ? { ...rest, rules } : rest,
      "changing who sees it",
      key ? `rules:${env.widget.id}` : undefined,
    );
  };
  const runnable = actionSlots(env).filter(
    (slot) => slot.action && (slot.action.steps.length > 0 || slot.action.confirm),
  );

  return (
    <div className="flex flex-col gap-5">
      <DrawerGroup
        label={`Show this ${kind}`}
        note="Conditions can use the current user or the record that is open."
      >
        <DrawerBlock className="[&_fieldset]:w-full [&_fieldset]:flex-nowrap [&_label]:flex-1 [&_label]:justify-center">
          <SegmentedControl
            label={`Show this ${kind}`}
            options={[
              { value: "always", label: "Always" },
              { value: "when", label: "Only when…" },
            ]}
            value={showWhen ? "when" : "always"}
            onChange={(next) => {
              if (next === "always") setRules({ showWhen: undefined });
              else if (!showWhen)
                setRules({
                  showWhen: [
                    firstCondition(
                      ctx,
                      given.map((one) => groupKey(one.path)),
                    ),
                  ],
                });
            }}
          />
          {showWhen ? (
            <ConditionsEditor
              id={`${env.widget.id}-show`}
              noun="rule"
              conditions={showWhen}
              ctx={ctx}
              groups={given}
              addLabel="And"
              onChange={(next, key) => setRules({ showWhen: next }, key)}
            />
          ) : null}
        </DrawerBlock>
      </DrawerGroup>

      <DrawerGroup label="Who can see it">
        <DrawerBlock>
          <GroupChips
            paths={seenBy}
            choices={choices}
            everyone={`Everyone who can open the ${noun}`}
            addLabel={seenBy.length === 0 ? "Limit to a group" : "Group"}
            onChange={(groups) => setRules({ seenBy: groups.length > 0 ? { groups } : undefined })}
          />
        </DrawerBlock>
        <div className="flex gap-2 bg-sunken px-3 py-3 text-body-sm text-ink-muted">
          <Shield aria-hidden="true" size={14} className="mt-0.5 shrink-0" />
          <p className="m-0">
            Hiding a widget isn’t security. What rows each person receives is decided by{" "}
            {tables.length === 0
              ? "the row rules of the tables it reads."
              : `the ${tables.map((table) => heading(table)).join(" and ")} row rules.`}{" "}
            {rowRules
              ? tables.map((table) => (
                  <Link
                    key={table}
                    to={rowRules(table)}
                    className="text-action underline underline-offset-2"
                  >
                    Open row rules{tables.length > 1 ? ` for ${heading(table)}` : ""}
                  </Link>
                ))
              : null}
          </p>
        </div>
      </DrawerGroup>

      {env.widget.type === "core/detail" && env.widget.config?.edit === true ? (
        <DrawerGroup
          label="Who can edit"
          note="Who may change its fields in place. Checked on the server too: hiding the editor is not what stops other people."
        >
          <DrawerBlock>
            <GroupChips
              paths={editBy}
              choices={choices}
              everyone={`Everyone who can open the ${noun}`}
              addLabel={editBy.length === 0 ? "Limit to a group" : "Group"}
              onChange={(groups) => {
                const { editBy: _before, ...config } = env.widget.config ?? {};
                env.write(
                  {
                    ...env.widget,
                    config: groups.length > 0 ? { ...config, editBy: { groups } } : config,
                  },
                  "changing who can edit",
                );
              }}
            />
          </DrawerBlock>
        </DrawerGroup>
      ) : null}

      {runnable.map((slot) => (
        <div key={slot.key} className="flex flex-col gap-5">
          {runnable.length > 1 ? (
            <p className="m-0 border-t border-line pt-4 text-body-sm font-medium text-ink">
              {slot.label}
            </p>
          ) : null}
          <ActionRules
            env={env}
            id={`${env.widget.id}-${slot.key}`}
            action={slot.action as Action}
            groupChoices={choices}
            onChange={(next) => writeSlot(env, slot, next)}
          />
        </div>
      ))}
    </div>
  );
}
