/**
 * Action group's drawer (board 17, right): its buttons as rows that open their own Display,
 * Actions and Rules (a sub-view with "‹ Back"), and how they line up. A button's Actions and
 * Actions and Rules are the shared editors (`ActionEditor`, `ActionRules`).
 */
import type { Action, Condition } from "@volvel/manifest";
import {
  Button,
  DrawerBlock,
  DrawerPanel,
  DrawerRow,
  DrawerTabs,
  type Position,
  PositionPicker,
  SegmentedControl,
  SelectField,
  type SortableItem,
  SortableRows,
} from "@volvel/ui";
import { Ellipsis } from "lucide-react";
import { useState } from "react";
import { actionContext, ActionEditor } from "../actionControls.tsx";
import { ActionRules } from "../RulesTab.tsx";
import { ConditionsEditor } from "../conditions.tsx";
import { uniqueName } from "../model.ts";
import { ButtonLabelGroup, ToneTiles } from "./buttonDrawer.tsx";
import {
  BackHead,
  dashedFace,
  type Env,
  Group,
  LabelledBlock,
  reorderBy,
  setConfig,
  TONE_WORDS,
} from "./recordShared.tsx";

export interface GroupButton {
  id: string;
  label: string;
  tone?: string;
  icon?: string;
  action: Action;
}

const MAX_BUTTONS = 8;

export const buttonsOf = (env: Env): GroupButton[] =>
  Array.isArray(env.config.actions) ? (env.config.actions as GroupButton[]) : [];

export const showUpToOf = (env: Env): number =>
  typeof env.config.showUpTo === "number" ? env.config.showUpTo : 3;

/** "only when Unpaid": what the first condition of a button says, in a few words. */
export function onlyWhen(action: Action): string | undefined {
  const [first] = action.when ?? [];
  if (!first) return undefined;
  const one: Condition = first;
  if ("field" in one && one.test === "is" && one.value !== undefined) {
    return `only when ${String(one.value)}`;
  }
  return "only when it applies";
}

/** The line under a button's name: "Main · only when Unpaid", "Danger · in the ⋯ menu". */
export function buttonLine(button: GroupButton, at: number, showUpTo: number): string {
  return [
    TONE_WORDS[button.tone ?? "default"] ?? "Normal",
    onlyWhen(button.action),
    at >= showUpTo ? "in the ⋯ menu" : undefined,
  ]
    .filter(Boolean)
    .join(" · ");
}

type SubTab = "display" | "actions" | "rules";

export function ActionsDisplaySection({ env }: { env: Env }) {
  const buttons = buttonsOf(env);
  const showUpTo = showUpToOf(env);
  const [open, setOpen] = useState<string | undefined>();
  const [tab, setTab] = useState<SubTab>("display");
  const write = (next: GroupButton[], label = "the buttons") =>
    setConfig(env, "actions", next, label);
  const current = buttons.find((one) => one.id === open);

  if (current) {
    const replace = (next: GroupButton, label = "a button", key?: string) =>
      env.write(
        {
          ...env.widget,
          config: {
            ...(env.widget.config ?? {}),
            actions: buttons.map((one) => (one.id === current.id ? next : one)),
          },
        },
        `changing ${label}`,
        key ? `config:${env.widget.id}:actions:${current.id}:${key}` : undefined,
      );
    const patch = (change: Partial<GroupButton>, key?: string) =>
      replace({ ...current, ...change }, "a button", key);
    const prefix = `${env.widget.id}-${current.id}`;
    const action = current.action;
    return (
      <div className="flex flex-col gap-4">
        <BackHead onBack={() => setOpen(undefined)} title={current.label} kind="Button" />
        <DrawerTabs
          idPrefix={prefix}
          label="Button settings"
          value={tab}
          onChange={(next) => setTab(next as SubTab)}
          tabs={[
            { id: "display", label: "Display", dot: true },
            { id: "actions", label: "Actions", dot: action.steps.length > 0 },
            { id: "rules", label: "Rules", dot: (action.when?.length ?? 0) > 0 },
          ]}
        />
        <DrawerPanel idPrefix={prefix} tab={tab}>
          {tab === "display" ? (
            <>
              <ButtonLabelGroup
                id={prefix}
                label={current.label}
                icon={current.icon}
                onLabel={(label) => patch({ label }, "label")}
                onIcon={(icon) => {
                  const { icon: _before, ...rest } = current;
                  replace(icon ? { ...rest, icon } : rest, "a button\u2019s icon");
                }}
              />
              <Group label="Style">
                <DrawerBlock>
                  <ToneTiles
                    tone={current.tone}
                    label={current.label}
                    icon={current.icon}
                    onChange={(tone) => patch({ tone })}
                  />
                </DrawerBlock>
              </Group>
            </>
          ) : null}
          {tab === "actions" ? (
            <ActionEditor
              env={env}
              id={`${prefix}-action`}
              heading="When clicked"
              action={action}
              onChange={(next, key) =>
                replace(
                  { ...current, action: next ?? { steps: [] } },
                  "what a button does",
                  key ? "action" : undefined,
                )
              }
            />
          ) : null}
          {tab === "rules" ? (
            <ActionRules
              env={env}
              id={`${prefix}-rules`}
              action={action}
              onChange={(next, key) =>
                replace({ ...current, action: next }, "who can run a button", key ? "rules" : undefined)
              }
            />
          ) : null}
        </DrawerPanel>
        {buttons.length > 1 ? (
          <div>
            <Button
              size="small"
              variant="quiet"
              onClick={() => {
                write(
                  buttons.filter((one) => one.id !== current.id),
                  "the buttons",
                );
                setOpen(undefined);
              }}
            >
              Remove {current.label}
            </Button>
          </div>
        ) : null}
      </div>
    );
  }

  const items: SortableItem[] = buttons.map((one, at) => ({
    id: one.id,
    label: one.label,
    sub: buttonLine(one, at, showUpTo),
  }));
  const add = () => {
    const id = uniqueName(
      "button",
      buttons.map((one) => one.id),
      "button",
      "-",
    );
    write([...buttons, { id, label: "Button", tone: "default", action: { steps: [] } }]);
    setTab("display");
    setOpen(id);
  };
  const lineUp = (env.config.lineUp as "left" | "right" | "spread" | undefined) ?? "left";
  const place = (env.config.place as Position | undefined) ?? "middle-left";
  return (
    <>
      <Group
        label="Buttons"
        note="Each button opens its own Display, Actions and Rules. Drag to reorder."
      >
        <SortableRows
          label="Buttons"
          items={items}
          onReorder={(ids) => write(reorderBy(buttons, ids), "the order of the buttons")}
          onOpen={(id) => {
            setTab("display");
            setOpen(id);
          }}
        />
        {buttons.length < MAX_BUTTONS ? (
          <div className="px-3 py-2">
            <button type="button" onClick={add} className={dashedFace}>
              <span aria-hidden="true">+</span>
              Button
            </button>
          </div>
        ) : null}
      </Group>
      <Group label="Look">
        <LabelledBlock label="Line up">
          <SegmentedControl<"left" | "right" | "spread">
            label="Line up"
            value={lineUp}
            options={[
              { value: "left", label: "Left" },
              { value: "right", label: "Right" },
              { value: "spread", label: "Spread" },
            ]}
            onChange={(next) => setConfig(env, "lineUp", next, "how the buttons line up")}
          />
        </LabelledBlock>
        <DrawerRow
          label="Show up to"
          icon={Ellipsis}
          value={`${showUpTo} button${showUpTo === 1 ? "" : "s"}, the rest in ⋯`}
          editorTitle="Show up to"
          editorFooter={false}
          editor={
            <SelectField
              name={`${env.widget.id}-show-up-to`}
              label="Buttons shown before the ⋯ menu"
              value={String(showUpTo)}
              options={Array.from({ length: MAX_BUTTONS }, (_, n) => ({
                value: String(n + 1),
                label: String(n + 1),
              }))}
              onChange={(next) => setConfig(env, "showUpTo", Number(next), "how many show")}
            />
          }
        />
        <DrawerBlock label="Where it sits in its place">
          <PositionPicker
            label="Where it sits in its place"
            value={place}
            onChange={(next) => setConfig(env, "place", next, "its position")}
          />
        </DrawerBlock>
      </Group>
    </>
  );
}
