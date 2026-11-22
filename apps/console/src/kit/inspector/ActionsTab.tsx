/**
 * The Actions tab's body. Moved out of `Inspector.tsx` so the agent that rebuilds it (board 9,
 * left) owns one file; the drawer shell draws the tab, the header and the dot around it.
 */
import { ActionEditor } from "./actionControls.tsx";
import type { Action } from "./actionModel.ts";
import { ConfigControl, type Env } from "./controls.tsx";
import { configSettings, isShown } from "./model.ts";

export function ActionsTab({ env }: { env: Env }) {
  const events = Object.entries(env.definition.events);
  const settings = configSettings(env.definition, "actions").filter((one) =>
    isShown(one.hint, env.config),
  );
  const setEvent = (name: string, action: Action | undefined, key?: string) => {
    const on = { ...(env.widget.on ?? {}) };
    if (action) on[name] = action;
    else delete on[name];
    const { on: _before, ...rest } = env.widget;
    env.write(
      Object.keys(on).length > 0 ? { ...rest, on } : rest,
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
          action={env.widget.on?.[name]}
          onChange={(next, key) => setEvent(name, next, key)}
        />
      ))}
      {settings.map((setting) => (
        <ConfigControl key={setting.name} env={env} setting={setting} />
      ))}
    </div>
  );
}
