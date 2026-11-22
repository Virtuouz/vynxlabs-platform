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
} from "@volvel/ui";
import type { WidgetDefinition } from "@volvel/widgets";
import { ChevronLeft } from "lucide-react";
import { clampPlace, settleOnGrid } from "./model.ts";

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
  const { widget, definition, onChange, onChangeWidgets, widgets } = props;
  const { min, max } = definition.layout;
  const at = widget.at;
  const name = widget.title || definition.title;

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
          <div className="grid grid-cols-4 gap-2">
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
    <div className="flex min-w-0 flex-col gap-5">
      <DrawerHeader
        {...(props.icon ? { icon: props.icon } : {})}
        name={name}
        kind={`${props.kind} · Layout`}
      />
      <div>
        <button
          type="button"
          onClick={props.onBack}
          className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-control px-1 text-body-sm text-ink-muted outline-offset-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-focus"
        >
          <ChevronLeft aria-hidden="true" size={14} /> Back to settings
        </button>
      </div>
      <DrawerGroup
        label="On desktop"
        note={`Usually you drag. These are for exact placement and for keyboards: arrow keys move, Shift+arrow resizes. A ${definition.title.toLowerCase()} is ${min.w} to ${maxW} wide and ${min.h} to ${maxH} high, on twelve columns.`}
      >
        <DrawerBlock>
          <div className="grid grid-cols-4 gap-2">
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
              onChange={(n) => n !== undefined && setDesktop({ w: n })}
            />
            <NumberField
              name={`${widget.id}-height`}
              label="Height"
              min={min.h}
              max={maxH}
              step={1}
              value={at.h}
              onChange={(n) => n !== undefined && setDesktop({ h: n })}
            />
          </div>
        </DrawerBlock>
      </DrawerGroup>
      <DrawerGroup label="Smaller screens">
        <DrawerBlock>
          {deviceBlock("tablet", "Tablet")}
          {deviceBlock("phone", "Phone")}
          <div className="flex flex-col gap-2">
            <span className="text-body-sm text-ink">On narrow screens</span>
            <div>
              <SegmentedControl
                label="On narrow screens"
                options={[
                  { value: "full", label: "Full width" },
                  { value: "stack", label: "Stack" },
                  { value: "hide", label: "Hide" },
                ]}
                value={widget.layout?.narrow ?? "full"}
                onChange={(next) =>
                  setLayout(
                    { narrow: next as "full" | "stack" | "hide" },
                    "setting what narrow screens do",
                  )
                }
              />
            </div>
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
