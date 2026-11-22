import { Field } from "@base-ui/react/field";
import { ChevronDown } from "lucide-react";
import type { ChangeEvent, ReactNode } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { TermText } from "./Term.tsx";

/** A control's own box. An invalid one has a danger edge, beside the words that say why. */
export const control =
  "h-control w-full rounded-control border border-line-control bg-field px-3 text-ink placeholder:text-ink-muted/70 disabled:opacity-60 data-[invalid]:border-danger aria-[invalid=true]:border-danger";

/** A select's own box: the native control, drawn flat so the chevron beside it is the kit's. */
const selectControl = `${control} appearance-none pr-8`;

/** The chevron a select shows at its end. It takes no pointer: the select under it does. */
function Chevron() {
  return (
    <ChevronDown
      aria-hidden="true"
      size={14}
      className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-ink-muted"
    />
  );
}

/**
 * A field whose label sits inside its box, before the value: "Clinic  All".
 * For a filter bar and other rows of small controls. The label is a real
 * label, so the control keeps its name; the box takes the focus ring.
 */
function InlineFrame({
  label,
  hint,
  error,
  children,
  chevron = false,
}: Omit<Common, "hint"> & { hint: string | undefined; children: ReactNode; chevron?: boolean }) {
  return (
    <Field.Root invalid={error !== undefined} className="flex flex-col gap-1">
      <div className="relative flex h-control items-center gap-2 rounded-control border border-line-control bg-field px-3 text-body-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus has-[[data-invalid]]:border-danger">
        <Field.Label className="shrink-0 font-normal text-ink-muted">{label}</Field.Label>
        {children}
        {chevron ? <Chevron /> : null}
      </div>
      {hint ? (
        <Field.Description className="m-0 text-body-sm text-ink-muted">
          <TermText>{hint}</TermText>
        </Field.Description>
      ) : null}
      {error ? (
        <Field.Error match role="alert" className="m-0 text-body-sm text-danger">
          {error}
        </Field.Error>
      ) : null}
    </Field.Root>
  );
}

/** What a control inside an `InlineFrame` is drawn with: no box of its own. */
const bare =
  "h-full min-w-0 flex-1 appearance-none bg-transparent text-ink outline-none placeholder:text-ink-muted/70 focus-visible:outline-none disabled:opacity-60";

interface Common {
  label: string;
  /** Shown under the control. Says what is expected, not what went wrong. It stays beside an error. */
  hint?: string;
  error?: string | undefined;
  /**
   * For a field in a toolbar, beside others whose purpose its placeholder or
   * value makes plain: the label is read, not shown (P4-1).
   */
  labelHidden?: boolean;
  /**
   * The label sits inside the box, before the value, as in a filter bar:
   * "Clinic  All". The hint and the error stay under it.
   */
  inline?: boolean;
}

const Beside = createContext<ReactNode>(null);

/**
 * Puts something beside the label of the field inside it: the ⓘ that says
 * more about the field. It sits next to the label and not in it, since a
 * label may hold only the control it names.
 */
export function FieldHelp({ help, children }: { help: ReactNode; children: ReactNode }) {
  return <Beside.Provider value={help}>{children}</Beside.Provider>;
}

/**
 * A field's label, its control, what is expected and what went wrong (08 §3.30).
 * The error and the hint are tied to the control by `aria-describedby`, so a
 * screen reader reads them on reaching it. A required field is marked; one
 * marked `required={false}` says it is optional. The marks are for the eye: the
 * control's `required` is what assistive technology announces, so a field's
 * name stays its label.
 */
export function FieldFrame({
  label,
  hint,
  error,
  required,
  labelHidden = false,
  children,
}: Common & { required?: boolean | undefined; children: ReactNode }) {
  const beside = useContext(Beside);
  return (
    <Field.Root invalid={error !== undefined} className="flex flex-col gap-1">
      <div className={labelHidden ? "sr-only" : "flex items-baseline gap-1 text-body-sm"}>
        <Field.Label className="font-medium text-ink">{label}</Field.Label>
        {beside && !labelHidden ? (
          // The help is for this field. A field inside this one gets none of it.
          <Beside.Provider value={null}>
            <span className="self-center">{beside}</span>
          </Beside.Provider>
        ) : null}
        {/* Seen, not read: the control's own `required` is what a screen reader says. */}
        {required === true ? (
          <span aria-hidden="true" className="text-danger">
            *
          </span>
        ) : required === false ? (
          <span aria-hidden="true" className="text-ink-subtle">
            optional
          </span>
        ) : null}
      </div>
      {children}
      {hint ? (
        <Field.Description className="m-0 text-body-sm text-ink-muted">
          <TermText>{hint}</TermText>
        </Field.Description>
      ) : null}
      {error ? (
        <Field.Error match role="alert" className="m-0 text-body-sm text-danger">
          {error}
        </Field.Error>
      ) : null}
    </Field.Root>
  );
}

export interface TextFieldProps extends Common {
  name: string;
  type?: "text" | "email" | "password" | "number" | "date";
  value?: string;
  placeholder?: string;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  autoComplete?: string;
  disabled?: boolean;
  onChange?: (value: string) => void;
}

export function TextField({
  label,
  hint,
  error,
  onChange,
  labelHidden = false,
  inline = false,
  ...input
}: TextFieldProps) {
  if (labelHidden && input.placeholder === undefined) input.placeholder = label;
  if (inline) {
    return (
      <InlineFrame label={label} hint={hint} error={error}>
        <Field.Control
          {...input}
          className={bare}
          onChange={(event: ChangeEvent<HTMLInputElement>) => onChange?.(event.currentTarget.value)}
        />
      </InlineFrame>
    );
  }
  return (
    <FieldFrame
      label={label}
      {...(hint ? { hint } : {})}
      error={error}
      required={input.required}
      labelHidden={labelHidden}
    >
      <Field.Control
        {...input}
        className={control}
        onChange={(event: ChangeEvent<HTMLInputElement>) => onChange?.(event.currentTarget.value)}
      />
    </FieldFrame>
  );
}

export interface SelectFieldProps extends Common {
  name: string;
  value?: string;
  required?: boolean;
  disabled?: boolean;
  options: { value: string; label: string }[];
  onChange?: (value: string) => void;
}

/** A native select: it works with every keyboard, screen reader and phone as it is. */
export function SelectField({
  label,
  hint,
  error,
  options,
  onChange,
  labelHidden = false,
  inline = false,
  ...select
}: SelectFieldProps) {
  const choices = options.map((option) => (
    <option key={option.value} value={option.value}>
      {option.label}
    </option>
  ));
  if (inline) {
    return (
      <InlineFrame label={label} hint={hint} error={error} chevron>
        <Field.Control
          render={
            <select
              {...select}
              className={`${bare} pr-6`}
              onChange={(event) => onChange?.(event.currentTarget.value)}
            >
              {choices}
            </select>
          }
        />
      </InlineFrame>
    );
  }
  return (
    <FieldFrame
      label={label}
      {...(hint ? { hint } : {})}
      error={error}
      required={select.required}
      labelHidden={labelHidden}
    >
      <div className="relative">
        <Field.Control
          render={
            <select
              {...select}
              className={selectControl}
              onChange={(event) => onChange?.(event.currentTarget.value)}
            >
              {choices}
            </select>
          }
        />
        <Chevron />
      </div>
    </FieldFrame>
  );
}

export interface TextAreaFieldProps extends Common {
  name: string;
  value?: string;
  /** The fewest lines it shows. It grows from there with what it holds. */
  rows?: number;
  /** The most lines it grows to before its text scrolls. */
  maxRows?: number;
  placeholder?: string;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  disabled?: boolean;
  onChange?: (value: string) => void;
}

/** How tall a text area grows by itself, in lines. */
export const TEXT_AREA_MAX_ROWS = 12;

/**
 * Makes a text area as tall as its text, between its `rows` and `maxRows`
 * lines. The handle in its corner still drags it to any height, and a field
 * its reader has dragged is left at the height they gave it.
 */
function useGrowing(value: string | undefined, maxRows: number) {
  const area = useRef<HTMLTextAreaElement>(null);
  // The height last given here. Any other height is one the reader dragged it to.
  const given = useRef<number | undefined>(undefined);
  const fit = useCallback(() => {
    const node = area.current;
    if (!node) return;
    if (given.current !== undefined && Math.abs(node.offsetHeight - given.current) > 1) return;
    node.style.height = "auto";
    const style = getComputedStyle(node);
    const line = Number.parseFloat(style.lineHeight);
    // Nothing is laid out, as in a test with no browser: leave it to its rows.
    if (node.scrollHeight === 0 || Number.isNaN(line)) return;
    const edges = node.offsetHeight - node.clientHeight;
    const padding = Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom);
    const most = line * maxRows + padding;
    const wanted = Math.min(node.scrollHeight, most);
    // Never shorter than its rows, which is the height it has with none set.
    const height = Math.max(wanted + edges, node.offsetHeight);
    node.style.height = `${height}px`;
    node.style.overflowY = node.scrollHeight > most ? "auto" : "hidden";
    given.current = node.offsetHeight;
  }, [maxRows]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: new text is the reason to measure again
  useLayoutEffect(fit, [fit, value]);
  return { area, fit };
}

/** Text that runs over several lines. */
export function TextAreaField({
  label,
  hint,
  error,
  rows = 4,
  maxRows = TEXT_AREA_MAX_ROWS,
  onChange,
  ...area
}: TextAreaFieldProps) {
  const growing = useGrowing(area.value, Math.max(rows, maxRows));
  return (
    <FieldFrame label={label} {...(hint ? { hint } : {})} error={error} required={area.required}>
      <Field.Control
        render={
          <textarea
            {...area}
            ref={growing.area}
            rows={rows}
            className={`${control} h-auto resize-y py-1.5`}
            onInput={growing.fit}
            onChange={(event) => onChange?.(event.currentTarget.value)}
          />
        }
      />
    </FieldFrame>
  );
}

/** What the box shows for a number. Nothing for no number. */
function numberText(value: number | undefined): string {
  return value === undefined ? "" : String(value);
}

/** The number typed in the box. Undefined for an empty box or text that is not a number. */
function typedNumber(text: string): number | undefined {
  if (text.trim() === "") return undefined;
  const number = Number(text);
  return Number.isNaN(number) ? undefined : number;
}

export interface NumberFieldProps extends Common {
  name: string;
  /** The number in the box. Undefined for an empty box. Leave it out to let the box keep its own. */
  value?: number | undefined;
  min?: number;
  max?: number;
  /** The size of one step. Use 1 for whole numbers. */
  step?: number;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  /** Called with the number typed, or undefined when the box holds no number. */
  onChange?: (value: number | undefined) => void;
}

export function NumberField(props: NumberFieldProps) {
  const { label, hint, error, value, onChange, ...input } = props;
  // The typed text is kept as it is, so that "1." or "-" is not rewritten half-way through.
  // It gives way only when a value is passed in that is not the number it spells.
  const [text, setText] = useState(() => numberText(value));
  const held = "value" in props && typedNumber(text) !== value;
  return (
    <FieldFrame label={label} {...(hint ? { hint } : {})} error={error} required={input.required}>
      <Field.Control
        {...input}
        type="number"
        value={held ? numberText(value) : text}
        className={`${control} text-right`}
        onChange={(event: ChangeEvent<HTMLInputElement>) => {
          setText(event.currentTarget.value);
          onChange?.(typedNumber(event.currentTarget.value));
        }}
      />
    </FieldFrame>
  );
}

export interface DateFieldProps extends Common {
  name: string;
  /**
   * `2026-03-09`, or with `withTime` a date and time: `2026-03-09T14:30` in the
   * person's local time, or with `timeZone: "UTC"` an instant such as
   * `2026-03-09T14:30:00.000Z`.
   */
  value?: string;
  /** Asks for a time of day as well. */
  withTime?: boolean;
  /**
   * Which clock a time is read and written in. `local`, the default, is the
   * browser's. With `UTC` the field shows UTC times and `value`, `min`, `max`
   * and `onChange` are ISO instants ending in `Z`, so what is stored never
   * depends on where the person is.
   */
  timeZone?: "local" | "UTC";
  /** The earliest and latest values allowed, in the same form as `value`. */
  min?: string;
  max?: string;
  required?: boolean;
  disabled?: boolean;
  onChange?: (value: string) => void;
}

/** An ISO instant as a UTC wall-clock time for a `datetime-local` input. */
export function utcInputValue(instant: string | undefined): string | undefined {
  if (!instant) return instant;
  const date = new Date(instant);
  return Number.isNaN(date.getTime()) ? instant : date.toISOString().slice(0, 16);
}

/** A `datetime-local` input's value, read as UTC, as an ISO instant. */
export function utcInstant(wallClock: string): string {
  if (!wallClock) return "";
  const date = new Date(`${wallClock.length === 16 ? `${wallClock}:00` : wallClock}Z`);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

/** The browser's own date picker: it follows the person's locale and works on a phone. */
export function DateField({
  label,
  hint,
  error,
  withTime,
  timeZone = "local",
  onChange,
  ...input
}: DateFieldProps) {
  const utc = withTime && timeZone === "UTC";
  const shown = utc
    ? {
        ...input,
        value: utcInputValue(input.value),
        min: utcInputValue(input.min),
        max: utcInputValue(input.max),
      }
    : input;
  const note = utc ? (hint ? `${hint} Times are in UTC.` : "Times are in UTC.") : hint;
  return (
    <FieldFrame
      label={label}
      {...(note ? { hint: note } : {})}
      error={error}
      required={input.required}
    >
      <Field.Control
        {...Object.fromEntries(Object.entries(shown).filter(([, value]) => value !== undefined))}
        type={withTime ? "datetime-local" : "date"}
        className={control}
        onChange={(event: ChangeEvent<HTMLInputElement>) => {
          const value = event.currentTarget.value;
          onChange?.(utc ? utcInstant(value) : value);
        }}
      />
    </FieldFrame>
  );
}

export interface CheckboxFieldProps extends Common {
  name: string;
  checked?: boolean;
  required?: boolean;
  disabled?: boolean;
  onChange?: (checked: boolean) => void;
}

/** A yes-or-no choice. The label sits beside the box and can be pressed too. */
export function CheckboxField({ label, hint, error, onChange, ...input }: CheckboxFieldProps) {
  const id = useId();
  const note = error || hint ? `${id}-note` : undefined;
  return (
    <div className="flex flex-col gap-1">
      <label className="flex items-center gap-2 text-body-sm font-medium text-ink">
        <input
          {...input}
          type="checkbox"
          className="size-4 accent-(--vx-action) disabled:opacity-60"
          aria-invalid={error !== undefined}
          aria-describedby={note}
          onChange={(event) => onChange?.(event.currentTarget.checked)}
        />
        {label}
      </label>
      {error ? (
        <p id={note} role="alert" className="m-0 text-body-sm text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={note} className="m-0 text-body-sm text-ink-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
