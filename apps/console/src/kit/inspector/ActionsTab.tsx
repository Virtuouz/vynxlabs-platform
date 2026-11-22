/**
 * The Actions tab, designed once (board 9) for every widget that can be clicked: a trigger
 * sentence, the steps as a timeline, "If it fails", and, at the end, a summary of the widget's
 * rules that opens the Rules tab (board 4).
 */
import { ChevronRight, Lock } from "lucide-react";
import { ActionEditor, actionContext } from "./actionControls.tsx";
import type { Action } from "./actionModel.ts";
import { actionSlots } from "./actionSlots.ts";
import { ConfigControl, type Env } from "./controls.tsx";
import { useChosenGroups } from "./groupChoices.tsx";
import { configSettings, isShown } from "./model.ts";
import { type GroupChoice, groupName, rulesSummary, withSlot } from "./timelineModel.ts";

/** The widget's rules in a card, with a link to the Rules tab (board 4). Nothing while no action has steps. */
export function RulesSummary({
  env,
  onOpenRules,
  groupChoices,
}: {
  env: Env;
  onOpenRules?: (() => void) | undefined;
  groupChoices?: readonly GroupChoice[];
}) {
  const given = useChosenGroups();
  const choices = groupChoices ?? given;
  const slots = actionSlots(env).filter(
    (slot) => slot.action && (slot.action.steps.length > 0 || slot.action.confirm),
  );
  if (slots.length === 0) return null;
  const unique = <T,>(list: T[]) => [...new Set(list)];
  const noun = env.surface === "app" ? "app" : "dashboard";
  const summary = rulesSummary({
    showWhen: env.widget.rules?.showWhen,
    seenBy: env.widget.rules?.seenBy?.groups.map((path) => groupName(path, choices)),
    pressedBy: slots.map((slot) => ({ label: slot.label, when: slot.action?.when ?? [] })),
    ctx: actionContext(env),
    runBy: unique(
      slots
        .flatMap((slot) => slot.action?.runBy?.groups ?? [])
        .map((path) => groupName(path, choices)),
    ),
    noun,
  });
  return (
    <div className="flex items-center gap-3 rounded-panel border border-line px-3 py-3 text-body-sm text-ink-muted">
      <Lock aria-hidden="true" size={14} className="shrink-0" />
      <p className="m-0 min-w-0 flex-1" data-testid="rules-summary">
        {summary}
      </p>
      {onOpenRules ? (
        <button
          type="button"
          onClick={onOpenRules}
          className="inline-flex shrink-0 cursor-pointer items-center gap-0.5 rounded-inner text-ink outline-offset-2 hover:text-action focus-visible:outline-2 focus-visible:outline-focus"
        >
          Rules <ChevronRight aria-hidden="true" size={14} />
        </button>
      ) : null}
    </div>
  );
}

export function ActionsTab({
  env,
  onOpenRules,
  groupChoices,
}: {
  env: Env;
  /** Switches the drawer to its Rules tab: the summary card's "Rules ›". Left out: the card has no link. */
  onOpenRules?: (() => void) | undefined;
  groupChoices?: readonly GroupChoice[];
}) {
  const events = Object.entries(env.definition.events);
  const settings = configSettings(env.definition, "actions").filter((one) =>
    isShown(one.hint, env.config),
  );
  const setEvent = (name: string, action: Action | undefined, key?: string) => {
    env.write(
      withSlot(env.widget, { kind: "event", name }, action),
      "changing what it does",
      key ? `on:${env.widget.id}:${name}` : undefined,
    );
  };
  return (
    <div className="flex flex-col gap-4">
      {events.map(([name, event]) => (
        <ActionEditor
          key={name}
          env={env}
          id={`${env.widget.id}-on-${name}`}
          heading={event.label}
          named={
            env.widget.type === "core/button"
              ? String(env.widget.config?.label ?? env.widget.title ?? "")
              : undefined
          }
          action={env.widget.on?.[name]}
          onChange={(next, key) => setEvent(name, next, key)}
        />
      ))}
      {settings.map((setting) => (
        <ConfigControl key={setting.name} env={env} setting={setting} />
      ))}
      <RulesSummary
        env={env}
        onOpenRules={onOpenRules}
        {...(groupChoices ? { groupChoices } : {})}
      />
    </div>
  );
}
