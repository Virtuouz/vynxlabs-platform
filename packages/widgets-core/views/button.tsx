import { Button } from "@volvel/ui";
import type { WidgetViewProps } from "@volvel/widgets";
import { CANNOT_NOW, useRunning } from "./press.tsx";

interface ButtonConfig {
  label?: string;
  tone?: "primary" | "default" | "danger";
}

const VARIANT = { primary: "primary", default: "secondary", danger: "danger-solid" } as const;

/**
 * One action. It runs `on/click` through the host and shows it is under way. Disabled, with
 * the reason, when the action's conditions do not hold. While building it is only drawn.
 */
export function ButtonView({ config, act, can, why, building }: WidgetViewProps<ButtonConfig>) {
  const { running, run } = useRunning();
  const label = config.label ?? "Do it";
  const variant = VARIANT[config.tone ?? "primary"];
  if (building || !act) {
    // Inert: pressing it in the builder selects the widget, and it never shows pending.
    return (
      <div>
        <Button variant={variant} tabIndex={-1} aria-disabled="true" className="cursor-default">
          {label}
        </Button>
      </div>
    );
  }
  const allowed = can?.("on/click") ?? true;
  return (
    <div>
      <Button
        variant={variant}
        disabled={!allowed}
        loading={running !== undefined}
        tooltip={allowed ? undefined : (why?.("on/click") ?? CANNOT_NOW)}
        onClick={() => void run("click", () => act("on/click"))}
      >
        {label}
      </Button>
    </div>
  );
}
