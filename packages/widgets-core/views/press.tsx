import { Button, Menu } from "@volvel/ui";
import { Ellipsis, LoaderCircle } from "@volvel/ui/icons";
import type { ActOutcome, WidgetViewProps } from "@volvel/widgets";
import { type KeyboardEvent, useState } from "react";

/** A host that knows which record's sheet is open says so as `selectedRecord`; a view marks that row. */
/** A view of the contract: `selectedRecord` is now one of its props. */
export type WithSelected<Config> = WidgetViewProps<Config>;

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
export function press(
  on: boolean,
  onPress: (() => void) | undefined,
  selected = false,
  /** The record the element stands for: a sheet closing on it gives the focus back here. */
  record?: string,
) {
  if (!onPress) return {};
  // A row that is only clickable (the builder's canvas) still says which record it stands for.
  if (!on) return { onClick: onPress, "data-record": record };
  return {
    tabIndex: 0,
    "data-selected": selected ? "" : undefined,
    "aria-current": selected ? ("true" as const) : undefined,
    "data-record": record,
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
 * A row's actions, at the end of the row. Shown on hover and focus of the row on a screen that
 * points. On a phone (`always`) or a touch screen they are not three buttons on every row: several
 * are one ⋯ that opens them, each grayed with its reason (the person is outside its group, or its
 * `when` does not hold for this row), and one is its own button. Each runs with the row. The row
 * must be a `group/row`.
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
  props: Pick<WidgetViewProps, "act" | "can" | "why" | "building" | "viewing">;
  always: boolean;
}) {
  const { running, run } = useRunning();
  if (actions.length === 0) return null;
  const state = actions.map((item, at) => {
    const where = `config/rowActions/${at}/action`;
    const decides = !props.building || props.viewing === true;
    const allowed = decides ? (props.can?.(where, row) ?? true) : false;
    return {
      item,
      where,
      allowed,
      reason: !allowed && decides ? (props.why?.(where, row) ?? CANNOT_NOW) : undefined,
    };
  });
  const go = (item: RowAction, where: string) =>
    void run(item.id, () => props.act?.(where, { record }));
  const buttons = (
    <span className="inline-flex items-center gap-1">
      {state.map(({ item, where, allowed, reason }) => (
        <Button
          key={item.id}
          size="small"
          variant={item.tone === "danger" ? "danger" : "quiet"}
          disabled={!allowed || running !== undefined}
          loading={running === item.id}
          tooltip={reason}
          onClick={(event) => {
            // Not the row's own press.
            event.stopPropagation();
            go(item, where);
          }}
        >
          {item.label}
        </Button>
      ))}
    </span>
  );
  const several = actions.length > 1;
  const menu = (
    // Not the row's own press either: a tap on the ⋯ opens the menu and does no more.
    // biome-ignore lint/a11y/noStaticElementInteractions: stops the row's click, the menu inside is the control
    // biome-ignore lint/a11y/useKeyWithClickEvents: the menu inside takes the keys
    <span className="inline-flex" onClick={(event) => event.stopPropagation()}>
      <Menu
        align="end"
        ariaLabel="Row actions"
        triggerClassName="inline-flex size-8 items-center justify-center rounded-control text-ink-muted hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-action"
        label={
          running !== undefined ? (
            <LoaderCircle aria-hidden="true" size={14} className="animate-spin" />
          ) : (
            <Ellipsis aria-hidden="true" size={16} />
          )
        }
        items={state.map(({ item, where, allowed, reason }) => ({
          label: item.label,
          danger: item.tone === "danger",
          // An action that may not be run says why beside it, and does nothing.
          ...(allowed
            ? {}
            : {
                detail: <span className="text-meta text-ink-muted">{reason ?? CANNOT_NOW}</span>,
              }),
          onSelect: () => {
            if (allowed && running === undefined) go(item, where);
          },
        }))}
      />
    </span>
  );
  // A phone: one ⋯ (or the single button). A screen that points: buttons on hover. A touch
  // screen wider than a phone: the same ⋯, as hover does not exist there.
  if (always) return several ? menu : buttons;
  return (
    <span className="inline-flex items-center">
      <span
        className={`transition-opacity motion-fast opacity-0 group-focus-within/row:opacity-100 group-hover/row:opacity-100 ${
          several ? "[@media(hover:none)]:hidden" : "[@media(hover:none)]:opacity-100"
        }`}
      >
        {buttons}
      </span>
      {several ? <span className="hidden [@media(hover:none)]:inline-flex">{menu}</span> : null}
    </span>
  );
}
