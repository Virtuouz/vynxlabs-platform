import { Button } from "@volvel/ui";
import type { ActOutcome, WidgetViewProps } from "@volvel/widgets";
import { type KeyboardEvent, useState } from "react";

/** A host that knows which record's sheet is open says so as `selectedRecord`; a view marks that row. */
export type WithSelected<Config> = WidgetViewProps<Config> & { selectedRecord?: string };

/** What a table's or list's `rowActions` hold. */
export interface RowAction {
  id: string;
  label: string;
  tone?: "default" | "danger";
  action: unknown;
}

/** Why a button that may not be pressed now is not. The host says only that it may not. */
export const CANNOT_NOW = "It can't be done right now.";

/**
 * Whether the page does something when `event` is raised. A host that cannot say
 * (it has no `listens`) draws nothing as pressable: nothing looks pressable that is not.
 */
export const listensTo = (props: Pick<WidgetViewProps, "listens" | "building">, event: string) =>
  !props.building && props.listens?.(event) === true;

/** The look every pressable row, point, cell and stat shares: a pointer, a hover, a focus ring. */
export const PRESSABLE =
  "cursor-pointer hover:bg-sunken focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-action data-[selected]:bg-action-soft";

/**
 * What to spread onto an element so it is pressable when `on`: focusable, pressed with Enter
 * (or Space), marked when it is the open one. When not `on` it is only clickable, as before.
 */
export function press(on: boolean, onPress: (() => void) | undefined, selected = false) {
  if (!onPress) return {};
  if (!on) return { onClick: onPress };
  return {
    tabIndex: 0,
    "data-selected": selected ? "" : undefined,
    "aria-current": selected ? ("true" as const) : undefined,
    onClick: onPress,
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      // A key meant for a button inside it is not the row's.
      if (event.target !== event.currentTarget) return;
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onPress();
      }
    },
  };
}

/** Runs an action and says which is running: for a button's pending state. */
export function useRunning() {
  const [running, setRunning] = useState<string | undefined>();
  const run = async (key: string, go: () => Promise<ActOutcome> | undefined) => {
    setRunning(key);
    try {
      await go();
    } finally {
      setRunning(undefined);
    }
  };
  return { running, run };
}

/**
 * A row's actions, at the end of the row. Shown on hover and focus of the row, and always
 * when `always` (a phone, a touch screen). Each is disabled by `can` and runs with the row.
 * The row must be a `group/row`.
 */
export function RowActionButtons({
  actions,
  row,
  record,
  props,
  always,
}: {
  actions: readonly RowAction[];
  row: Readonly<Record<string, unknown>>;
  record: string;
  props: Pick<WidgetViewProps, "act" | "can" | "building">;
  always: boolean;
}) {
  const { running, run } = useRunning();
  if (actions.length === 0) return null;
  return (
    <span
      className={`inline-flex items-center gap-1 transition-opacity motion-fast ${
        always
          ? ""
          : "opacity-0 group-focus-within/row:opacity-100 group-hover/row:opacity-100 [@media(hover:none)]:opacity-100"
      }`}
    >
      {actions.map((item, at) => {
        const where = `config/rowActions/${at}/action`;
        const allowed = props.building ? false : (props.can?.(where, row) ?? true);
        return (
          <Button
            key={item.id}
            size="small"
            variant={item.tone === "danger" ? "danger" : "quiet"}
            disabled={!allowed || running !== undefined}
            loading={running === item.id}
            tooltip={!allowed && !props.building ? CANNOT_NOW : undefined}
            onClick={(event) => {
              // Not the row's own press.
              event.stopPropagation();
              void run(item.id, () => props.act?.(where, { record }));
            }}
          >
            {item.label}
          </Button>
        );
      })}
    </span>
  );
}
