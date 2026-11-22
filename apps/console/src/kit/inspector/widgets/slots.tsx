/**
 * The `slots` control (board 15, "Each row looks like"): a list's places (Title, Under the title,
 * Right, Badge, Picture) drawn on a sample row, each filled with a column. A slot is chosen by
 * clicking it in the preview or its row in "What goes where": the same picker opens either way.
 *
 * The shell draws a group whose settings use `control: "slots"` with `SlotsGroup`, once for the
 * group; `SlotsControl` draws one setting of it as a single row, for a shell that draws each
 * setting on its own.
 */
import { DrawerBlock, DrawerEditor, DrawerGroup, DrawerRow } from "@volvel/ui";
import { Check, Hash, Image, List, Type } from "lucide-react";
import { useState } from "react";
import { columnOptions, type Env } from "../controls.tsx";
import { type ConfigSetting, configSettings, heading, withConfig } from "../model.ts";
import { type TableSource, useTableData } from "./tableData.ts";

/** The places of a list's row, in the order the board draws them. */
export const SLOTS = ["title", "subtitle", "right", "badge", "picture"] as const;
export type Slot = (typeof SLOTS)[number];

const SLOT_WORDS: Record<Slot, string> = {
  title: "Title",
  subtitle: "Under the title",
  right: "Right",
  badge: "Badge",
  picture: "Picture",
};

const SLOT_ICONS = { title: Type, subtitle: Type, right: Hash, badge: List, picture: Image };

const isSlot = (name: string): name is Slot => (SLOTS as readonly string[]).includes(name);

/** The settings of the list that are slots, as its definition hints them. */
export function slotSettings(env: Env): (ConfigSetting & { name: Slot })[] {
  return configSettings(env.definition, "display").flatMap((one) =>
    one.hint.control === "slots" && isSlot(one.name) ? [{ ...one, name: one.name }] : [],
  );
}

const columnOfSlot = (config: Record<string, unknown>, slot: Slot): string | undefined =>
  typeof config[slot] === "string" && config[slot] !== "" ? (config[slot] as string) : undefined;

/** The choices for one slot: every column, or those of the types the hint names. */
function pickerOptions(env: Env, setting: ConfigSetting) {
  return columnOptions(env, setting.hint.of ?? "rows", setting.hint.types);
}

/** The body of a slot's picker: a column, or None. */
function SlotPicker({
  label,
  options,
  value,
  onPick,
}: {
  label: string;
  options: readonly { value: string; label: string }[];
  value: string | undefined;
  onPick: (column: string | undefined) => void;
}) {
  const row =
    "flex h-9 w-full cursor-pointer items-center justify-between gap-2 rounded-control px-2 text-left text-body-sm hover:bg-selected focus-visible:outline-2 focus-visible:outline-focus";
  return (
    <ul aria-label={`Column for ${label}`} className="m-0 flex list-none flex-col p-0">
      <li>
        <button
          type="button"
          aria-pressed={value === undefined}
          onClick={() => onPick(undefined)}
          className={`${row} text-ink-muted`}
        >
          None
          {value === undefined ? <Check aria-hidden="true" size={14} /> : null}
        </button>
      </li>
      {options.map((one) => (
        <li key={one.value}>
          <button
            type="button"
            aria-pressed={value === one.value}
            onClick={() => onPick(one.value)}
            className={`${row} text-ink`}
          >
            {one.label}
            {value === one.value ? <Check aria-hidden="true" size={14} /> : null}
          </button>
        </li>
      ))}
    </ul>
  );
}

type Opened = { slot: Slot; from: "preview" | "row" } | undefined;

/** The whole group: a sample row with its places, and a row for each. */
export function SlotsGroup({ env, ...source }: { env: Env } & TableSource) {
  const { rows } = useTableData(env, source);
  const sample = rows[0];
  const settings = slotSettings(env);
  const [opened, setOpened] = useState<Opened>();
  const put = (slot: Slot, column: string | undefined) => {
    env.write(withConfig(env.widget, slot, column), `changing ${SLOT_WORDS[slot].toLowerCase()}`);
    setOpened(undefined);
  };
  const shown = (slot: Slot): string => {
    const column = columnOfSlot(env.config, slot);
    if (!column) return "";
    const value = sample?.[column];
    return value === undefined || value === null || value === "" ? heading(column) : String(value);
  };
  const filled = settings.filter((one) => columnOfSlot(env.config, one.name));
  const empty = settings.filter((one) => !columnOfSlot(env.config, one.name));
  const cell = (slot: Slot, wide: boolean) => {
    const setting = settings.find((one) => one.name === slot);
    if (!setting) return null;
    return (
      <DrawerEditor
        key={slot}
        title={SLOT_WORDS[slot]}
        footer={false}
        side="left"
        open={opened?.slot === slot && opened.from === "preview"}
        onOpenChange={(next) => setOpened(next ? { slot, from: "preview" } : undefined)}
        trigger={
          <button
            type="button"
            data-slot={slot}
            aria-label={`${SLOT_WORDS[slot]}: ${shown(slot)}. Choose its column`}
            className={`flex min-w-0 cursor-pointer flex-col items-start rounded-control border border-dashed border-action bg-action-soft/40 px-2 py-1 text-left outline-offset-2 hover:bg-action-soft focus-visible:outline-2 focus-visible:outline-focus ${
              wide ? "flex-1" : "shrink-0"
            }`}
          >
            <span className="text-tag text-action" aria-hidden="true">
              {SLOT_WORDS[slot]}
            </span>
            <span
              className={`max-w-full truncate text-body-sm text-ink ${
                slot === "title" ? "font-mono" : ""
              }`}
            >
              {shown(slot)}
            </span>
          </button>
        }
      >
        <SlotPicker
          label={SLOT_WORDS[slot]}
          options={pickerOptions(env, setting)}
          value={columnOfSlot(env.config, slot)}
          onPick={(column) => put(slot, column)}
        />
      </DrawerEditor>
    );
  };
  const has = (slot: Slot) => filled.some((one) => one.name === slot);
  return (
    <>
      <DrawerGroup label="Each row looks like">
        <DrawerBlock>
          <div className="flex items-stretch gap-2" data-testid="slots-preview">
            {has("picture") ? cell("picture", false) : null}
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <div className="flex gap-2">
                {has("title") ? cell("title", true) : null}
                {has("right") ? cell("right", false) : null}
              </div>
              {has("subtitle") || has("badge") ? (
                <div className="flex gap-2">
                  {has("subtitle") ? cell("subtitle", true) : null}
                  {has("badge") ? cell("badge", false) : null}
                </div>
              ) : null}
            </div>
          </div>
          {empty.length ? (
            <div className="flex flex-wrap gap-1.5">
              {empty.map((one) => (
                <DrawerEditor
                  key={one.name}
                  title={SLOT_WORDS[one.name]}
                  footer={false}
                  side="left"
                  open={opened?.slot === one.name && opened.from === "preview"}
                  onOpenChange={(next) =>
                    setOpened(next ? { slot: one.name, from: "preview" } : undefined)
                  }
                  trigger={
                    <button
                      type="button"
                      data-slot={one.name}
                      className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-control border border-dashed border-line-strong px-2 text-meta text-ink-muted outline-offset-2 hover:border-action hover:text-ink focus-visible:outline-2 focus-visible:outline-focus"
                    >
                      <span aria-hidden="true">+</span>
                      {SLOT_WORDS[one.name]}
                    </button>
                  }
                >
                  <SlotPicker
                    label={SLOT_WORDS[one.name]}
                    options={pickerOptions(env, one)}
                    value={undefined}
                    onPick={(column) => put(one.name, column)}
                  />
                </DrawerEditor>
              ))}
            </div>
          ) : null}
        </DrawerBlock>
      </DrawerGroup>
      <DrawerGroup
        label="What goes where"
        note="Click a slot in the preview or a row here. Empty slots take no space."
      >
        {settings.map((one) => {
          const column = columnOfSlot(env.config, one.name);
          const Icon = SLOT_ICONS[one.name];
          return (
            <DrawerRow
              key={one.name}
              label={SLOT_WORDS[one.name]}
              icon={Icon}
              value={column ? heading(column) : "None"}
              editorTitle={SLOT_WORDS[one.name]}
              editorFooter={false}
              side="left"
              open={opened?.slot === one.name && opened.from === "row"}
              onOpenChange={(next) => setOpened(next ? { slot: one.name, from: "row" } : undefined)}
              editor={
                <SlotPicker
                  label={SLOT_WORDS[one.name]}
                  options={pickerOptions(env, one)}
                  value={column}
                  onPick={(next) => put(one.name, next)}
                />
              }
            />
          );
        })}
      </DrawerGroup>
    </>
  );
}

/** One slot as a row that opens the picker: for a shell that draws each setting by itself. */
export function SlotsControl({ env, setting }: { env: Env; setting: ConfigSetting }) {
  const slot = setting.name;
  if (!isSlot(slot)) return null;
  const column = columnOfSlot(env.config, slot);
  const options = pickerOptions(env, setting);
  return (
    <DrawerRow
      label={setting.hint.label}
      icon={SLOT_ICONS[slot]}
      value={column ? heading(column) : "None"}
      editorTitle={setting.hint.label}
      editorFooter={false}
      editor={
        <SlotPicker
          label={setting.hint.label}
          options={options}
          value={column}
          onPick={(next) =>
            env.write(
              withConfig(env.widget, slot, next),
              `changing ${setting.hint.label.toLowerCase()}`,
            )
          }
        />
      }
    />
  );
}
