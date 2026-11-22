/**
 * Button's drawer (board 17, left and middle): Display is what it says and its icon, its style
 * chosen by looking at the real button in each tone, full width, and where it sits in its cell
 * (a 3 × 3 picker). Actions are the shared step list; Rules the shared tab.
 *
 * `ButtonLabelGroup` and `ToneTiles` are also the Display of each button of an Action group.
 */

import type { Action } from "@volvel/manifest";
import {
  DrawerBlock,
  DrawerRow,
  type Position,
  PositionPicker,
  TextField,
  TilePicker,
  ToggleRow,
} from "@volvel/ui";
import { Type } from "lucide-react";
import { ActionEditor, OpensPages } from "../actionControls.tsx";
import {
  ButtonPreview,
  type Env,
  Group,
  IconRow,
  iconOf,
  setConfig,
  TONE_WORDS,
} from "./recordShared.tsx";

const TONES = ["primary", "default", "quiet", "danger"] as const;
type Tone = (typeof TONES)[number];

/** "Says" and "Icon", as rows. */
export function ButtonLabelGroup({
  id,
  label,
  icon,
  onLabel,
  onIcon,
}: {
  id: string;
  label: string;
  icon: string | undefined;
  onLabel: (next: string) => void;
  onIcon: (next: string | undefined) => void;
}) {
  return (
    <Group label="Label">
      <DrawerRow
        label="Says"
        icon={Type}
        value={label}
        editorTitle="The button says"
        editorFooter={false}
        editor={
          <TextField
            name={`${id}-says`}
            label="Says"
            required={false}
            value={label}
            maxLength={40}
            onChange={onLabel}
          />
        }
      />
      <IconRow value={icon} onChange={onIcon} />
    </Group>
  );
}

/** The four tones, each drawn as the button itself. */
export function ToneTiles({
  tone,
  label,
  icon,
  onChange,
}: {
  tone: string | undefined;
  label: string;
  icon: string | undefined;
  onChange: (next: Tone) => void;
}) {
  const Icon = iconOf(icon)?.Icon;
  return (
    <TilePicker<Tone>
      label="Style"
      // Four across, as the board has them; a label too long for a quarter of the drawer is written in full, two across.
      columns={(label || "Button").length > 12 ? 2 : 4}
      value={(tone as Tone | undefined) ?? "primary"}
      onChange={onChange}
      options={TONES.map((one) => ({
        value: one,
        label: TONE_WORDS[one] ?? one,
        preview: <ButtonPreview tone={one} label={label || "Button"} icon={Icon} />,
      }))}
    />
  );
}

export function ButtonDisplaySection({ env }: { env: Env }) {
  const label = typeof env.config.label === "string" ? env.config.label : "";
  const icon = typeof env.config.icon === "string" ? env.config.icon : undefined;
  const place = (env.config.place as Position | undefined) ?? "middle-left";
  return (
    <>
      <ButtonLabelGroup
        id={env.widget.id}
        label={label}
        icon={icon}
        onLabel={(next) => setConfig(env, "label", next, "what it says", true)}
        onIcon={(next) => setConfig(env, "icon", next, "its icon")}
      />
      <OpensPages env={env} action={env.widget.on?.click} />
      <Group label="Style">
        <DrawerBlock>
          <ToneTiles
            tone={typeof env.config.tone === "string" ? env.config.tone : undefined}
            label={label}
            icon={icon}
            onChange={(next) => setConfig(env, "tone", next, "its style")}
          />
        </DrawerBlock>
        <ToggleRow
          label="Full width"
          checked={env.config.full === true}
          onChange={(next) => setConfig(env, "full", next ? true : undefined, "full width")}
        />
      </Group>
      <Group label="Position" note="Where the button sits when its cell is bigger than it.">
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

/**
 * STAND-IN: the Actions tab's step list, collapsed to a line per step, is B2's. Until it is
 * wired in, the button's click is edited with the console's existing action editor.
 */
export function ButtonActionsSection({ env }: { env: Env }) {
  const setEvent = (action: Action | undefined, key?: string) => {
    const on = { ...(env.widget.on ?? {}) };
    if (action) on.click = action;
    else delete on.click;
    const { on: _before, ...rest } = env.widget;
    env.write(
      Object.keys(on).length > 0 ? { ...rest, on } : rest,
      "changing what it does",
      key ? `on:${env.widget.id}:click` : undefined,
    );
  };
  return (
    <ActionEditor
      env={env}
      id={`${env.widget.id}-on-click`}
      heading="When clicked"
      action={env.widget.on?.click}
      onChange={setEvent}
    />
  );
}
