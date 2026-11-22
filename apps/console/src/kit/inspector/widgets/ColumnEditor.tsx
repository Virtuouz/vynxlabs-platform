/**
 * One column of a table, edited (boards 12 and 13, "Column · Total", "Column · Status"): its
 * heading, how it is shown, alignment and width, sorting, a total, and a colour for each value
 * of a choice shown as a badge. It opens from a row of the Display tab, and from a click on the
 * heading on the canvas, where it is drawn beside that heading.
 */
import type { ValueFormat } from "@volvel/manifest";
import {
  DrawerEditor,
  type NumberFormat,
  NumberFormatRow,
  SegmentedControl,
  TextField,
  ToggleRow,
} from "@volvel/ui";
import { type ReactElement, type ReactNode, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  type ColumnFacts,
  type ColumnSetting,
  headingOf,
  isDateType,
  isNumberType,
  TONE_WORDS,
  TONES,
  type Tone,
} from "./columnModel.ts";
import { FullSegments } from "./FullSegments.tsx";

/** A badge as the table draws one: a dot and the value, on its tone. */
const TONE_CLASS: Record<Tone, string> = {
  neutral: "bg-sunken text-ink-muted",
  action: "bg-action-soft text-action",
  attention: "bg-attention-soft text-attention",
  danger: "bg-danger-soft text-danger",
  success: "bg-success-soft text-success",
};

export function ToneChip({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-meta font-medium ${TONE_CLASS[tone]}`}
    >
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}

const asNumberFormat = (format: ValueFormat | undefined): NumberFormat | undefined =>
  format as NumberFormat | undefined;

/** The fields of one column. `onChange` gets only what changed. */
export function ColumnEditorBody({
  spec,
  facts,
  onChange,
}: {
  spec: ColumnSetting;
  facts: ColumnFacts | undefined;
  onChange: (patch: Partial<ColumnSetting>) => void;
}) {
  const type = facts?.type ?? "text";
  const number = isNumberType(type);
  const badge = spec.as === "badge";
  const values = [...new Set([...(facts?.choices ?? []), ...Object.keys(spec.badges ?? {})])];
  const field = `column-${spec.column}`;
  return (
    <div className="flex flex-col gap-4">
      <TextField
        name={`${field}-heading`}
        label="Heading"
        required={false}
        placeholder={headingOf({ column: spec.column })}
        value={spec.label ?? ""}
        maxLength={60}
        onChange={(text) => onChange({ label: text })}
      />
      <div className="flex flex-col gap-1.5">
        <span className="text-body-sm text-ink-muted">Shown as</span>
        {number ? (
          <div className="overflow-hidden rounded-control border border-line-control">
            <NumberFormatRow
              label="Format"
              value={asNumberFormat(spec.format)}
              sample={123.45}
              onChange={(next) => onChange({ format: next as ValueFormat })}
            />
          </div>
        ) : isDateType(type) ? (
          <p className="m-0 text-body-sm text-ink">Date, as the table writes dates</p>
        ) : (
          <FullSegments>
            <SegmentedControl
              label="Shown as"
              value={badge ? "badge" : "text"}
              options={[
                { value: "text", label: "Text" },
                { value: "badge", label: "Badge" },
              ]}
              onChange={(next) => onChange({ as: next === "badge" ? "badge" : "text" })}
            />
          </FullSegments>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <span className="text-body-sm text-ink-muted">Align</span>
          <FullSegments>
            <SegmentedControl
              label="Align"
              value={spec.align === "right" ? "right" : "auto"}
              options={[
                { value: "auto", label: "Auto" },
                { value: "right", label: "Right" },
              ]}
              onChange={(next) => onChange({ align: next })}
            />
          </FullSegments>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-body-sm text-ink-muted">Width</span>
          <FullSegments>
            <SegmentedControl
              label="Width"
              value={spec.width === "fixed" ? "fixed" : "auto"}
              options={[
                { value: "auto", label: "Auto" },
                { value: "fixed", label: "Fixed" },
              ]}
              onChange={(next) => onChange({ width: next })}
            />
          </FullSegments>
        </div>
      </div>
      <div className="divide-y divide-line overflow-hidden rounded-panel border border-line bg-surface">
        <ToggleRow
          label="Sort by clicking the heading"
          checked={spec.sortable !== false}
          onChange={(next) => onChange({ sortable: next })}
        />
        {number ? (
          <ToggleRow
            label="Show a total at the bottom"
            help="Sum of the rows shown"
            checked={spec.total === true}
            onChange={(next) => onChange({ total: next })}
          />
        ) : null}
        <ToggleRow
          label="Hide on phones"
          checked={spec.phone === false}
          onChange={(next) => onChange({ phone: !next })}
        />
      </div>
      {badge ? (
        <section aria-label="Badge colors" className="flex flex-col gap-1.5">
          <h4 className="m-0 text-body-sm text-ink-muted">Badge colors</h4>
          {values.length ? (
            <ul className="m-0 list-none divide-y divide-line overflow-hidden rounded-panel border border-line bg-surface p-0">
              {values.map((value) => {
                const tone = spec.badges?.[value];
                return (
                  <li key={value} className="flex min-h-10 items-center justify-between gap-3 px-3">
                    <span className="min-w-0 truncate text-body-sm text-ink">{value}</span>
                    <span className="flex shrink-0 items-center gap-2">
                      <ToneChip tone={tone ?? "neutral"}>{value}</ToneChip>
                      <select
                        aria-label={`Color of ${value}`}
                        value={tone ?? ""}
                        onChange={(event) => {
                          const next = { ...(spec.badges ?? {}) };
                          if (event.target.value) next[value] = event.target.value as Tone;
                          else delete next[value];
                          onChange({ badges: next });
                        }}
                        className="h-7 rounded-control border border-line-control bg-surface px-1 text-meta text-ink focus-visible:outline-2 focus-visible:outline-focus"
                      >
                        <option value="">Automatic</option>
                        {TONES.map((one) => (
                          <option key={one} value={one}>
                            {TONE_WORDS[one]}
                          </option>
                        ))}
                      </select>
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="m-0 text-body-sm text-ink-muted">This column has no values yet.</p>
          )}
          <p className="m-0 text-meta text-ink-muted">
            Values come from the column's choices, so new ones appear here on their own.
          </p>
        </section>
      ) : null}
    </div>
  );
}

/** The editor in a small panel that opens from a trigger. */
export function ColumnEditor({
  spec,
  facts,
  onChange,
  trigger,
  open,
  onOpenChange,
  side = "right",
}: {
  spec: ColumnSetting;
  facts: ColumnFacts | undefined;
  onChange: (patch: Partial<ColumnSetting>) => void;
  trigger: ReactElement;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  side?: "left" | "right" | "bottom";
}) {
  return (
    <DrawerEditor
      trigger={trigger}
      title={`Column · ${headingOf(spec)}`}
      footer={false}
      side={side}
      {...(open === undefined ? {} : { open })}
      {...(onOpenChange ? { onOpenChange } : {})}
    >
      <ColumnEditorBody spec={spec} facts={facts} onChange={onChange} />
    </DrawerEditor>
  );
}

/** The heading cell of a column on the canvas, found by its words. */
export function headingCell(widget: string, text: string): HTMLElement | undefined {
  const cells = Array.from(
    document.querySelectorAll<HTMLElement>(`[data-widget-cell="${CSS.escape(widget)}"] th`),
  );
  return cells.find((cell) => cell.textContent?.trim() === text) ?? cells[0];
}

/**
 * The editor drawn beside an element that is not its own trigger: the heading cell on the
 * canvas, or the row of the drawer's list. A button with no look of its own is placed over the
 * element and the panel is positioned from it. Not drawn while closed, or when `find` finds
 * nothing.
 */
export function AnchoredColumnEditor({
  find,
  spec,
  facts,
  onChange,
  open,
  onClose,
  side,
}: {
  find: () => HTMLElement | undefined;
  spec: ColumnSetting;
  facts: ColumnFacts | undefined;
  onChange: (patch: Partial<ColumnSetting>) => void;
  open: boolean;
  onClose: () => void;
  side: "left" | "right" | "bottom";
}) {
  const [box, setBox] = useState<DOMRect | undefined>();
  // biome-ignore lint/correctness/useExhaustiveDependencies: `find` is a new function each render; the element is looked for when it opens
  useEffect(() => {
    if (!open) return;
    const measure = () => setBox(find()?.getBoundingClientRect());
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open, spec.column]);
  if (!open || !box) return null;
  return createPortal(
    <ColumnEditor
      spec={spec}
      facts={facts}
      onChange={onChange}
      open
      side={side}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      trigger={
        <button
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          data-column-anchor={spec.column}
          style={{
            position: "fixed",
            left: box.left,
            top: box.top,
            width: box.width,
            height: box.height,
            pointerEvents: "none",
            opacity: 0,
          }}
        />
      }
    />,
    document.body,
  );
}

/**
 * The editor beside the column's heading on the canvas (board 12): anchored to the heading
 * cell, `[data-widget-cell="<id>"] th`.
 */
export function CanvasColumnEditor({
  widget,
  ...rest
}: {
  widget: string;
  spec: ColumnSetting;
  facts: ColumnFacts | undefined;
  onChange: (patch: Partial<ColumnSetting>) => void;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <AnchoredColumnEditor
      {...rest}
      side="bottom"
      find={() => headingCell(widget, headingOf(rest.spec))}
    />
  );
}
