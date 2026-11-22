/**
 * Every action a widget holds, wherever it is kept: an event (`on.click`), a setting that is one
 * action (a form's "When it is sent"), or a setting that is a list of them (a table's row
 * actions, an Action group's buttons). The Rules tab asks of each one who may run it.
 */

import type { Action } from "./actionModel.ts";
import type { Env } from "./controls.tsx";
import { heading } from "./model.ts";
import { type ActionSlot, withSlot } from "./timelineModel.ts";

export function actionSlots(env: Env): ActionSlot[] {
  const out: ActionSlot[] = [];
  for (const [name, event] of Object.entries(env.definition.events)) {
    const action = env.widget.on?.[name] as Action | undefined;
    out.push({ key: `on-${name}`, label: event.label, at: { kind: "event", name }, action });
  }
  for (const [name, schema] of Object.entries(env.definition.config.properties)) {
    const hint = schema["x-volvel"];
    if (!hint) continue;
    const value = env.config[name];
    if (hint.control === "action") {
      out.push({
        key: `config-${name}`,
        label: hint.label,
        at: { kind: "config", name },
        action: value as Action | undefined,
      });
    } else if (hint.control === "actions" && Array.isArray(value)) {
      for (const one of value as { id: string; label: string; action?: Action }[]) {
        out.push({
          key: `list-${name}-${one.id}`,
          label: one.label || heading(one.id),
          at: { kind: "list", name, id: one.id },
          action: one.action,
        });
      }
    }
  }
  return out;
}

/** The widget with the action of `slot` replaced. */
export function writeSlot(env: Env, slot: ActionSlot, next: Action | undefined): void {
  env.write(withSlot(env.widget, slot.at, next, env.config), "changing what it does");
}
