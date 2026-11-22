/**
 * ⋯ › Layout (board 9, right): where the widget is on the desktop as four numbers, how it is
 * placed on a tablet and on a phone (Automatic, or Custom with a place of its own), what narrow
 * screens do with it, and its priority. It writes `at` and `layout`; the phone preview draws them.
 */
import type { PageWidget, WidgetLayout, WidgetPlace } from "@volvel/manifest";
import {
  DrawerBlock,
  DrawerGroup,
  DrawerHeader,
  type DrawerIcon,
  NumberField,
  SegmentedControl,
  TextField,
} from "@volvel/ui";
import type { WidgetDefinition } from "@volvel/widgets";
import { ChevronLeft } from "lucide-react";
import { useState } from "react";
import { clampPlace, settleOnGrid, withText } from "./model.ts";
import { useTakesFocus } from "./widgets/recordShared.tsx";

export type Device = "tablet" | "phone";

/**
 * What a device's place is while it is Automatic: the desktop's, on a tablet; one full-width
 * row at the same height, on a phone. The phone preview passes the real arrangement as
 * `automaticAt`, so what Custom starts from is what the person was looking at.
 */
export function defaultAutomatic(widget: PageWidget, device: Device): WidgetPlace {
  return device === "tablet" ? { ...widget.at } : { ...widget.at, x: 0, w: 12 };
}

const COLUMNS = 12;

/**
 * The four numbers of a place, as board 9 draws them: the labels small and muted over the
 * boxes, the numbers at the left of them.
 */
const NUMBERS =
  "grid grid-cols-2 gap-2 @[17rem]:grid-cols-4 [&_div>div>label]:font-normal [&_div>div>label]:text-meta [&_div>div>label]:text-ink-muted [&_input]:text-left";

/** What a number typed past its limit is told: said, since the page keeps it within. */
function limitWords(
  what: string,
  n: number | undefined,
  min: number,
  max: number,
  noun: string,
): string | undefined {
  if (n === undefined) return undefined;
  if (n > max) return `${what} is at most ${max} for ${noun}. It is kept at ${max}.`;
  if (n < min) return `${what} is at least ${min} for ${noun}. It is kept at ${min}.`;
  return undefined;
}

/** What each choice for narrow screens does, said under the choice. */
const NARROW_WORDS: Record<string, string> = {
  automatic: "A small widget shares a row with the next small one; another takes the row.",
  keep: "Keeps its share of the row: half the desktop's or less sits two to a row.",
  full: "Takes the whole row where it comes.",
  stack: "Takes the whole row, after everything that is not stacked.",
  hide: "Left out on narrow screens.",
};

/** A widget with its layout changed; a layout with nothing in it is left out. */
export function withLayout(
  widget: PageWidget,
  patch: { [K in keyof WidgetLayout]?: WidgetLayout[K] | undefined },
): PageWidget {
  const layout: Record<string, unknown> = { ...(widget.layout ?? {}) };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete layout[key];
    else layout[key] = value;
  }
  const { layout: _before, ...rest } = widget;
  return Object.keys(layout).length > 0 ? { ...rest, layout: layout as WidgetLayout } : rest;
}

export interface LayoutPanelProps {
  widget: PageWidget;
  definition: WidgetDefinition;
  icon?: DrawerIcon | undefined;
  /** The widget's kind, "Chart": the header says "Chart · Layout". */
  kind: string;
  onBack: () => void;
  onChange: (next: PageWidget, label: string, key?: string) => void;
  /** The page's widgets, and how to write them: a place typed settles as a drag on the canvas does. */
  widgets?: readonly PageWidget[] | undefined;
  onChangeWidgets?: ((next: PageWidget[], label: string, key?: string) => void) | undefined;
  /** What the automatic placement of a device is now, for Custom to start from. */
  automaticAt?: ((widget: PageWidget, device: Device) => WidgetPlace) | undefined;
}

export function LayoutPanel(props: LayoutPanelProps) {
  const back = useTakesFocus<HTMLButtonElement>();
  const { widget, definition, onChange, onChangeWidgets, widgets } = props;
  const { min, max } = definition.layout;
  const at = widget.at;
  const name = widget.title || definition.title;
  const noun = `a ${definition.title.toLowerCase()}`;
  // What was typed past a limit, said until the next number typed.
  const [told, setTold] = useState<string>();

  const setDesktop = (patch: Partial<WidgetPlace>) => {
    const next = { ...widget, at: clampPlace(definition, { ...at, ...patch }) };
    if (onChangeWidgets && widgets) {
      const all = widgets.map((one) => (one.id === next.id ? next : one));
      onChangeWidgets(settleOnGrid(all, next.id), "placing the widget", `layout:${widget.id}`);
    } else onChange(next, "placing the widget", `layout:${widget.id}`);
  };
  const setLayout = (
    patch: { [K in keyof WidgetLayout]?: WidgetLayout[K] | undefined },
    label: string,
    key?: string,
  ) => onChange(withLayout(widget, patch), label, key);

  const automatic = props.automaticAt ?? defaultAutomatic;
  const deviceBlock = (device: Device, title: string) => {
    const place = widget.layout?.[device]?.at;
    return (
      <div className="flex flex-col gap-2">
        <span className="text-body-sm text-ink">{title}</span>
        <div>
          <SegmentedControl
            label={title}
            options={[
              { value: "automatic", label: "Automatic" },
              { value: "custom", label: "Custom" },
            ]}
            value={place ? "custom" : "automatic"}
            onChange={(next) => {
              if (next === "custom") {
                if (!place) {
                  setLayout(
                    { [device]: { at: clampPlace(definition, automatic(widget, device)) } },
                    `placing the widget by hand on a ${device}`,
                  );
                }
              } else {
                setLayout(
                  { [device]: undefined },
                  `placing the widget automatically on a ${device}`,
                );
              }
            }}
          />
        </div>
        {place ? (
          <div className={NUMBERS}>
            {(
              [
                ["x", "column", 1],
                ["y", "row", 1],
                ["w", "width", 0],
                ["h", "height", 0],
              ] as const
            ).map(([key, word, base]) => (
              <NumberField
                key={key}
                name={`${widget.id}-${device}-${word}`}
                label={`${title} ${word}`}
                min={1}
                step={1}
                value={place[key] + base}
                onChange={(n) =>
                  n !== undefined &&
                  setLayout(
                    { [device]: { at: clampPlace(definition, { ...place, [key]: n - base }) } },
                    `placing the widget on a ${device}`,
                    `layout-${device}:${widget.id}`,
                  )
                }
              />
            ))}
          </div>
        ) : null}
      </div>
    );
  };

  const maxW = Math.min(max?.w ?? COLUMNS, COLUMNS);
  const maxH = max?.h ?? 40;
  return (
    <div className="@container flex min-w-0 flex-col gap-5 [&_fieldset]:w-full [&_fieldset]:flex-nowrap [&_fieldset_label]:flex-1 [&_fieldset_label]:justify-center">
      <DrawerHeader
        {...(props.icon ? { icon: props.icon } : {})}
        name={name}
        kind={`${props.kind} · Layout`}
      />
      <div>
        <button
          ref={back}
          type="button"
          onClick={props.onBack}
          className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-control px-1 text-body-sm text-ink-muted outline-offset-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-focus"
        >
          <ChevronLeft aria-hidden="true" size={14} /> Back to settings
        </button>
      </div>
      {definition.layout.frame === "none" ? (
        <DrawerGroup label="Name">
          <DrawerBlock>
            <TextField
              name={`${widget.id}-outline-name`}
              label="Name in the outline"
              hint="It isn't drawn on the page: a button says what its label says."
              required={false}
              maxLength={100}
              value={widget.title ?? ""}
              onChange={(text) =>
                props.onChange(
                  withText(widget, "title", text),
                  "renaming the widget",
                  `title:${widget.id}`,
                )
              }
            />
          </DrawerBlock>
        </DrawerGroup>
      ) : null}
      <DrawerGroup
        label="On desktop"
        note={`Usually you drag. These are for exact placement and for keyboards: arrow keys move, Shift+arrow resizes. A ${definition.title.toLowerCase()} is ${min.w} to ${maxW} wide and ${min.h} to ${maxH} high, on twelve columns${widget.in ? " (of the section's columns, inside a section)" : ""}.`}
      >
        <DrawerBlock>
          <div className={NUMBERS}>
            <NumberField
              name={`${widget.id}-column`}
              label="Column"
              min={1}
              max={COLUMNS - at.w + 1}
              step={1}
              value={at.x + 1}
              onChange={(n) => n !== undefined && setDesktop({ x: n - 1 })}
            />
            <NumberField
              name={`${widget.id}-row`}
              label="Row"
              min={1}
              step={1}
              value={at.y + 1}
              onChange={(n) => n !== undefined && setDesktop({ y: n - 1 })}
            />
            <NumberField
              name={`${widget.id}-width`}
              label="Width"
              min={min.w}
              max={maxW}
              step={1}
              value={at.w}
              onChange={(n) => {
                setTold(limitWords("Width", n, min.w, maxW, noun));
                if (n !== undefined) setDesktop({ w: n });
              }}
            />
            <NumberField
              name={`${widget.id}-height`}
              label="Height"
              min={min.h}
              max={maxH}
              step={1}
              value={at.h}
              onChange={(n) => {
                setTold(limitWords("Height", n, min.h, maxH, noun));
                if (n !== undefined) setDesktop({ h: n });
              }}
            />
          </div>
          {told ? (
            <p role="status" className="m-0 text-body-sm text-attention">
              {told}
            </p>
          ) : null}
        </DrawerBlock>
      </DrawerGroup>
      <DrawerGroup label="Smaller screens">
        <DrawerBlock>
          {deviceBlock("tablet", "Tablet")}
          {deviceBlock("phone", "Phone")}
          <div className="flex flex-col gap-2">
            <span className="text-body-sm text-ink">On narrow screens</span>
            <div>
              {/* Five short words fit the drawer's width (362px) in one row: no select is needed. */}
              <SegmentedControl
                label="On narrow screens"
                size="small"
                options={[
                  { value: "automatic", label: "Automatic" },
                  { value: "keep", label: "Keep" },
                  { value: "full", label: "Full" },
                  { value: "stack", label: "Stack" },
                  { value: "hide", label: "Hide" },
                ]}
                value={widget.layout?.narrow ?? "automatic"}
                onChange={(next) =>
                  setLayout(
                    {
                      narrow:
                        next === "automatic"
                          ? undefined
                          : (next as "keep" | "full" | "stack" | "hide"),
                    },
                    "setting what narrow screens do",
                  )
                }
              />
            </div>
            <p className="m-0 text-body-sm text-ink-muted">
              {NARROW_WORDS[widget.layout?.narrow ?? "automatic"]}
            </p>
          </div>
        </DrawerBlock>
      </DrawerGroup>
      <DrawerGroup
        label="Priority"
        note="Higher stays nearer the top when the page stacks on a phone."
      >
        <DrawerBlock>
          <div className="w-28">
            <NumberField
              name={`${widget.id}-priority`}
              label="Priority"
              step={1}
              placeholder="Automatic"
              value={widget.layout?.priority}
              onChange={(n) =>
                setLayout({ priority: n }, "setting its priority", `layout-priority:${widget.id}`)
              }
            />
          </div>
        </DrawerBlock>
      </DrawerGroup>
    </div>
  );
}
