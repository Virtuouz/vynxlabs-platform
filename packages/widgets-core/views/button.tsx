import { Button } from "@volvel/ui";
import type { WidgetViewProps } from "@volvel/widgets";
import { NamedIcon, placeOf, type Tone, VARIANT } from "./look.tsx";
import { CANNOT_NOW, useRunning } from "./press.tsx";

interface ButtonConfig {
  label?: string;
  tone?: Tone;
  icon?: string;
  full?: boolean;
  place?: string;
}

/**
 * One action. It runs `on/click` through the host and shows it is under way. Disabled, with
 * the reason, when the action's conditions do not hold or the person is outside the groups that
 * may run it. While building it is only drawn. It stands in its cell where `place` says (a
 * 3 x 3 position), or fills the cell's width when `full`.
 */
export function ButtonView({
  config,
  act,
  can,
  why,
  building,
  viewing,
}: WidgetViewProps<ButtonConfig>) {
  const { running, run } = useRunning();
  const label = config.label ?? "Do it";
  const variant = VARIANT[config.tone ?? "primary"];
  const { items, justify } = placeOf(config.place);
  const wrap = `flex h-full w-full ${items} ${justify}`;
  const width = config.full ? "w-full" : "";
  const content = (
    <>
      <NamedIcon name={config.icon} />
      {label}
    </>
  );
  if (!viewing && (building || !act)) {
    // Inert: pressing it in the builder selects the widget, and it never shows pending.
    return (
      <div className={wrap} data-place={config.place ?? "middle-left"}>
        <Button
          variant={variant}
          tabIndex={-1}
          aria-disabled="true"
          className={`cursor-default ${width}`}
        >
          {content}
        </Button>
      </div>
    );
  }
  const allowed = can?.("on/click") ?? true;
  return (
    <div className={wrap} data-place={config.place ?? "middle-left"}>
      <Button
        variant={variant}
        disabled={!allowed}
        loading={running !== undefined}
        tooltip={allowed ? undefined : (why?.("on/click") ?? CANNOT_NOW)}
        onClick={() => act && void run("click", () => act("on/click"))}
        className={width}
      >
        {content}
      </Button>
    </div>
  );
}
