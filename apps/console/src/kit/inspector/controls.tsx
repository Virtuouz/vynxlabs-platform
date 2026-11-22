/**
 * The controls the inspector draws a widget's configuration with: one for
 * each name in `CONTROLS` (`@volvel/widgets`), drawn from a property's
 * `x-volvel` hint. A widget names a control; it never brings one of its own,
 * so a widget from any pack is drawn with no code here that knows it.
 */
import type { Page, PageFilter, PageWidget, ValueFormat } from "@volvel/manifest";
import {
  Button,
  CheckboxField,
  DrawerBlock,
  DrawerRow,
  MoveButtons,
  MultiSelectField,
  NumberField,
  type Option,
  type Position,
  PositionPicker,
  SegmentedControl,
  SelectField,
  TextField,
  TilePicker,
  ToggleRow,
  useFlip,
} from "@volvel/ui";
import {
  Archive,
  ArrowRight,
  Ban,
  Bell,
  Calendar,
  Check,
  CircleCheck,
  Copy,
  Download,
  ExternalLink,
  Eye,
  FileText,
  Link as LinkIcon,
  Lock,
  Mail,
  Pencil as PencilIcon,
  Phone,
  Play,
  Plus,
  Printer,
  RefreshCw,
  Send,
  Settings,
  Star,
  Trash2,
  Undo2,
  Upload,
  X,
  Zap,
} from "@volvel/ui/icons";
import type { Surface, Tab, WidgetDefinition } from "@volvel/widgets";
import { Pencil } from "lucide-react";
import type { ReactNode } from "react";
import { MarkdownEditor } from "../markdown/MarkdownEditor.tsx";
import { useEditOnPage } from "../markdown/onThePage.ts";
import { ActionControl, ActionsControl } from "./actionControls.tsx";
import { settingControlFor, tilePreviewFor } from "./custom.ts";
import { DataControl, FormatRow } from "./dataControls.tsx";
import { FieldsControl, PageControl } from "./fieldsControl.tsx";
import { FiltersControl } from "./filtersControl.tsx";
import { useChosenGroups } from "./groupChoices.tsx";
import { GroupRowsRow } from "./groupRowsControl.tsx";
import type {
  Catalog,
  CatalogColumn,
  ConfigSetting,
  FlowChoice,
  ScriptChoice,
  TabFate,
} from "./model.ts";
import {
  heading,
  isChoiceLike,
  resultNames,
  tableOfInput,
  withConfig,
  withSystemColumns,
} from "./model.ts";
import { TabsControl } from "./tabsControl.tsx";
import { type GroupChoice, groupName } from "./timelineModel.ts";

/** What every control is given: the widget, its definition, and how to write it. */
export interface Env {
  definition: WidgetDefinition;
  widget: PageWidget;
  surface: Surface;
  filters: readonly PageFilter[];
  /** The page's other widgets: a filter narrows a table here as it does there. */
  neighbours: readonly PageWidget[];
  catalog: Catalog;
  /** The widget's configuration with its definition's defaults filled in. */
  config: Record<string, unknown>;
  /** Writes the widget as it should now be. `key` joins quick changes, such as typing, into one step to undo. */
  write: (next: PageWidget, label: string, key?: string) => void;
  /** The page the widget is on, when it is an app's: its kind and the table of its record say what an action may touch. */
  page?: Page | undefined;
  /** The interface's pages: what "Open a page" and a page setting choose from. */
  pages: readonly Page[];
  /** The workspace's flows (only those with a manual trigger are offered) and scripts. */
  flows: readonly FlowChoice[];
  scripts: readonly ScriptChoice[];
  /** Every widget of the page, this one as it is now (a filter reaches the others). */
  widgets: readonly PageWidget[];
  /** Writes the page's widgets: for a change that reaches other widgets (a filter followed, a tab removed). */
  writeAll: (next: PageWidget[], label: string, key?: string) => void;
  /** Takes back the last step, for what is removed with an Undo beside it. */
  undo?: (() => void) | undefined;
  /** Adds a Search and filter widget at the top of the page, as "Add to page" does. */
  addFilters?: (() => void) | undefined;
  /** Removes a tab of this container, with what it held moved to another tab or removed. */
  onRemoveTab?: ((tab: string, fate: TabFate) => void) | undefined;
  /** Chooses another widget of the page: a Section's "Holds" rows select what they name. */
  select?: ((id: string) => void) | undefined;
  /** Goes to a page of the app, as the outline does: what "Opens New appointment" does. */
  openPage?: ((id: string) => void) | undefined;
  /** Switches the drawer to a tab of this widget. */
  openTab?: ((tab: Tab) => void) | undefined;
  /** "When a row is clicked", as the builder draws it (a table's or a list's); the Actions tab places it. */
  rowClickEditor?: ReactNode;
}

/**
 * Whether a column suits a place that names types. A place that asks for a choice (`enum`) is
 * given every column that is choice-like: text the server counted to a few values, as Conditions
 * and a table's badge colours count it.
 */
export function offersType(types: readonly string[], column: CatalogColumn): boolean {
  return types.includes(column.type) || (types.includes("enum") && isChoiceLike(column));
}

/** The columns a column control offers for a data input. */
export function columnOptions(
  env: Env,
  of: string | undefined,
  types?: readonly string[],
): Option[] {
  const input = of ? env.widget.data?.[of] : undefined;
  const named = tableOfInput(input, env.page, env.widgets);
  const table = named ? env.catalog.tables.find((one) => one.name === named) : undefined;
  const columns = table ? withSystemColumns(table.columns) : [];
  if (types) {
    return columns
      .filter((column) => offersType(types, column))
      .map((column) => ({ value: column.name, label: heading(column.name) }));
  }
  const declared = of ? env.definition.data[of] : undefined;
  if (declared?.shape === "summary") {
    return resultNames(input).map((name) => ({ value: name, label: heading(name) }));
  }
  return columns.map((column) => ({ value: column.name, label: heading(column.name) }));
}

const labelOf = (setting: ConfigSetting) => setting.hint.label;

/**
 * One setting, drawn by the control its hint names. `bare` leaves out the label the control would
 * write above itself, for a place that already says it: the title of the small editor it opens
 * in, or the group it is the only row of.
 */
export function ConfigControl({
  env,
  setting,
  bare = false,
}: {
  env: Env;
  setting: ConfigSetting;
  bare?: boolean;
}) {
  const { hint, name, schema } = setting;
  const { widget } = env;
  const chosenGroups = useChosenGroups();
  const value = env.config[name];
  const field = `${widget.id}-${name}`;
  const set = (next: unknown, key = true) =>
    env.write(
      withConfig(widget, name, next),
      `changing ${labelOf(setting).toLowerCase()}`,
      key ? `config:${widget.id}:${name}` : undefined,
    );
  const help = hint.help;
  const own = settingControlFor(env.definition.type, name);
  if (own) return <>{own(env)}</>;

  switch (hint.control) {
    case "text":
      return (
        <TextField
          name={field}
          label={hint.label}
          labelHidden={bare}
          {...(help ? { hint: help } : {})}
          required={false}
          value={typeof value === "string" ? value : ""}
          {...(typeof schema.maxLength === "number" ? { maxLength: schema.maxLength } : {})}
          onChange={(text) => set(text)}
        />
      );
    case "markdown":
      return (
        <MarkdownControl
          field={field}
          label={hint.label}
          help={help}
          widget={env.widget.id}
          value={typeof value === "string" ? value : ""}
          onChange={(text) => set(text)}
        />
      );
    case "number":
      return (
        <NumberField
          name={field}
          label={hint.label}
          labelHidden={bare}
          {...(help ? { hint: help } : {})}
          required={false}
          value={typeof value === "number" ? value : undefined}
          {...(typeof schema.minimum === "number" ? { min: schema.minimum } : {})}
          {...(typeof schema.maximum === "number" ? { max: schema.maximum } : {})}
          onChange={(next) => set(next)}
        />
      );
    case "switch":
      return (
        <CheckboxField
          name={field}
          label={hint.label}
          {...(help ? { hint: help } : {})}
          checked={value === true}
          onChange={(on) => set(switchValue(env, name, on))}
        />
      );
    case "choice":
    case "segmented": {
      const choices = choicesOf(setting);
      const fixed = env.definition.defaults?.[name] !== undefined;
      if (hint.control === "choice") {
        return (
          <SelectField
            name={field}
            label={hint.label}
            labelHidden={bare}
            {...(help ? { hint: help } : {})}
            value={value === undefined ? "" : String(value)}
            options={[...(fixed ? [] : [{ value: "", label: "Not chosen" }]), ...choices]}
            onChange={(next) =>
              set(choices.find((one) => one.value === next) ? enumValue(setting, next) : undefined)
            }
          />
        );
      }
      return (
        <div className="flex flex-col gap-1">
          {bare ? null : <span className="text-body-sm font-medium text-ink">{hint.label}</span>}
          <div>
            <SegmentedControl
              label={hint.label}
              options={choices}
              value={value === undefined ? "" : String(value)}
              onChange={(next) => set(enumValue(setting, next))}
            />
          </div>
          {help ? <p className="m-0 text-body-sm text-ink-muted">{help}</p> : null}
        </div>
      );
    }
    case "format":
      return (
        <FormatRow
          label={hint.label}
          value={value as ValueFormat | undefined}
          onChange={(format) => set(format)}
        />
      );
    case "filter": {
      const dates = env.filters.filter((one) => one.type === "date_range");
      return (
        <SelectField
          name={field}
          label={hint.label}
          labelHidden={bare}
          hint={
            dates.length === 0
              ? "The page has no filter for a range of dates yet. Add one to its Search and filter."
              : (help ?? "")
          }
          value={typeof value === "string" ? value : ""}
          options={[
            { value: "", label: "Not compared" },
            ...dates.map((one) => ({ value: one.name, label: one.label ?? heading(one.name) })),
          ]}
          onChange={(next) => set(next)}
        />
      );
    }
    case "column": {
      const options = columnOptions(env, hint.of, hint.types);
      const known =
        typeof value === "string" && value !== "" && !options.some((one) => one.value === value);
      return (
        <SelectField
          name={field}
          label={hint.label}
          labelHidden={bare}
          {...(help ? { hint: help } : {})}
          value={typeof value === "string" ? value : ""}
          options={[
            { value: "", label: "None" },
            ...(known ? [{ value: value as string, label: heading(value as string) }] : []),
            ...options,
          ]}
          onChange={(next) => set(next)}
        />
      );
    }
    case "columns": {
      const items = (schema.items ?? {}) as { type?: string };
      const options = columnOptions(env, hint.of, hint.types);
      if (items.type === "string") {
        const max = typeof schema.maxItems === "number" ? schema.maxItems : undefined;
        const chosen = Array.isArray(value) ? (value as string[]) : [];
        return (
          <MultiSelectField
            label={hint.label}
            options={options}
            value={chosen}
            placeholder="None"
            hint={[help, max ? `Up to ${max}.` : undefined].filter(Boolean).join(" ")}
            onChange={(next) => set(max ? next.slice(0, max) : next)}
          />
        );
      }
      return (
        <ColumnsControl
          field={field}
          label={hint.label}
          help={help}
          options={options}
          value={Array.isArray(value) ? (value as ColumnSetting[]) : undefined}
          onChange={(next) => set(next, false)}
        />
      );
    }
    case "action":
      return (
        <ActionControl
          env={env}
          id={field}
          label={hint.label}
          help={help}
          action={value as never}
          onChange={(next, key) => set(next, key !== undefined)}
        />
      );
    case "actions":
      return (
        <ActionsControl
          env={env}
          id={field}
          setting={setting}
          onChange={(next) => set(next, false)}
        />
      );
    case "page":
      return (
        <PageControl
          env={env}
          field={field}
          label={hint.label}
          help={help}
          value={typeof value === "string" ? value : ""}
          onChange={(next) => set(next)}
        />
      );
    case "fields":
      return (
        <FieldsControl
          env={env}
          field={field}
          setting={setting}
          value={Array.isArray(value) ? (value as never) : undefined}
          onChange={(next) => set(next, false)}
        />
      );
    case "tabs":
      return <TabsControl env={env} field={field} />;
    case "pageFilters":
      return <FiltersControl env={env} field={field} setting={setting} />;
    case "source":
    case "measure":
    case "breakdown":
    case "conditions":
    case "sort":
    case "limit":
      // A data control written as a setting of config still belongs to an input.
      return hint.of ? (
        <DataControl
          env={env}
          input={hint.of}
          control={hint.control}
          label={hint.label}
          help={help}
        />
      ) : null;
    case "position":
      return (
        <div className="flex flex-col gap-1">
          {bare ? null : <span className="text-body-sm font-medium text-ink">{hint.label}</span>}
          <PositionPicker
            label={hint.label}
            value={(typeof value === "string" ? value : "middle-center") as Position}
            onChange={(next) => set(next)}
          />
          {help ? <p className="m-0 text-body-sm text-ink-muted">{help}</p> : null}
        </div>
      );
    case "tiles": {
      const preview = tilePreviewFor(env.definition.type, name);
      return (
        <div className="flex flex-col gap-1.5">
          {bare ? null : <span className="text-body-sm font-medium text-ink">{hint.label}</span>}
          <TilePicker
            label={hint.label}
            columns={choicesOf(setting).length === 2 ? 2 : choicesOf(setting).length === 4 ? 4 : 3}
            options={choicesOf(setting).map((one) => ({
              value: one.value,
              label: one.label,
              ...(preview ? { preview: preview(one.value, env) } : {}),
            }))}
            value={value === undefined ? undefined : String(value)}
            onChange={(next) => set(enumValue(setting, next))}
          />
          {help ? <p className="m-0 text-meta text-ink-muted">{help}</p> : null}
        </div>
      );
    }
    case "icon":
      return (
        <IconControl
          field={field}
          label={hint.label}
          help={help}
          value={typeof value === "string" ? value : undefined}
          onChange={(next) => set(next, false)}
        />
      );
    case "groups":
      return (
        <GroupsControl
          field={field}
          label={hint.label}
          help={help}
          choices={chosenGroups}
          value={Array.isArray(value) ? (value as string[]) : []}
          onChange={(next) => set(next, false)}
        />
      );
    case "groupRows":
      return <GroupRowsRow env={env} of={hint.of ?? "rows"} />;
    case "slots":
      // The List's sample row is drawn by what registers it (`registerSettingControl`).
      return (
        <p className="m-0 text-body-sm text-ink-muted">
          {hint.label}: its places are drawn by the widget.
        </p>
      );
    default:
      return null;
  }
}

/** The names of groups held by their paths, as a row says them. */
function GroupNames({ paths }: { paths: readonly string[] }) {
  const choices = useChosenGroups();
  return <>{paths.map((path) => groupName(path, choices)).join(", ")}</>;
}

/** The value a choice writes: the schema's own (1, not "1"), found by its text. */
export function enumValue(setting: ConfigSetting, text: string): unknown {
  const declared = (setting.schema.enum as readonly unknown[] | undefined)?.find(
    (one) => String(one) === text,
  );
  if (declared !== undefined) return declared;
  const type = setting.schema.type;
  if ((type === "integer" || type === "number") && text !== "" && Number.isFinite(Number(text))) {
    return Number(text);
  }
  return text;
}

/** What a switch writes: on is `true`; off takes the property out, or says `false` where the default is on. */
function switchValue(env: Env, name: string, on: boolean): boolean | undefined {
  if (on) return true;
  return env.definition.defaults?.[name] === true ? false : undefined;
}

/** What each value of a choice is called: the hint's words, else the value made readable. */
export function choicesOf(setting: ConfigSetting): { value: string; label: string }[] {
  const values =
    (setting.schema.enum as readonly unknown[] | undefined) ??
    Object.keys(setting.hint.choices ?? {});
  return values.map((one) => ({
    value: String(one),
    label: setting.hint.choices?.[String(one)] ?? heading(String(one)),
  }));
}

// ---------------------------------------------------------------------------
// Numbers

const STYLE_WORDS: Record<ValueFormat["style"], string> = {
  number: "Number",
  currency: "Money",
  percent: "Percent",
};

/** "Money · USD · 2 decimals": what a format is, in a line. */
export function formatSummary(format: ValueFormat | undefined): string {
  if (!format) return "As it comes";
  return [
    STYLE_WORDS[format.style],
    format.style === "currency" ? (format.currency ?? "USD") : undefined,
    format.minorUnits ? "kept in cents" : undefined,
    format.decimals !== undefined
      ? `${format.decimals} decimal${format.decimals === 1 ? "" : "s"}`
      : undefined,
  ]
    .filter(Boolean)
    .join(" · ");
}

// ---------------------------------------------------------------------------
// Markdown

/** The components a page's Markdown may use, beside the plain Markdown every page may. */
export const MARKDOWN_NOTE = "Components you may write in it: alert, steps, tabs and details.";

function MarkdownControl({
  field,
  label,
  help,
  value,
  widget,
  onChange,
}: {
  field: string;
  label: string;
  help: string | undefined;
  value: string;
  widget: string;
  onChange: (text: string) => void;
}) {
  const edit = useEditOnPage();
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span id={`${field}-label`} className="text-label text-ink-subtle uppercase">
          {label}
        </span>
        {edit ? (
          <Button size="small" variant="primary" onClick={() => edit(widget)}>
            <Pencil aria-hidden="true" size={14} /> Edit on the page
          </Button>
        ) : null}
      </div>
      <div className="overflow-hidden rounded-control border border-line">
        <MarkdownEditor
          profile="page"
          label={label}
          value={value}
          onChange={onChange}
          height="14rem"
          modes={["source", "preview"]}
          initialMode="source"
          path={`widget/${widget}/${field}.md`}
        />
      </div>
      <p className="m-0 text-meta text-ink-muted">
        {[help, MARKDOWN_NOTE].filter(Boolean).join(" ")}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Columns of a table

export interface ColumnSetting {
  column: string;
  label?: string;
  format?: ValueFormat;
  as?: string;
  hidden?: boolean;
}

function ColumnsControl({
  field,
  label,
  help,
  options,
  value,
  onChange,
}: {
  field: string;
  label: string;
  help: string | undefined;
  options: Option[];
  value: ColumnSetting[] | undefined;
  onChange: (next: ColumnSetting[] | undefined) => void;
}) {
  const rows: ColumnSetting[] = value?.length
    ? value
    : options.map((one) => ({ column: one.value }));
  const holder = useFlip<HTMLUListElement>(rows.map((one) => one.column).join(" "));
  const change = (at: number, patch: Partial<ColumnSetting>) => {
    const next = rows.map((row, index) => (index === at ? { ...row, ...patch } : row));
    onChange(
      next.map((row) => {
        const clean: ColumnSetting = { column: row.column };
        if (row.label) clean.label = row.label;
        if (row.format) clean.format = row.format;
        if (row.as) clean.as = row.as;
        if (row.hidden) clean.hidden = true;
        return clean;
      }),
    );
  };
  const move = (at: number, by: -1 | 1) => {
    const next = [...rows];
    const [taken] = next.splice(at, 1);
    if (taken) next.splice(at + by, 0, taken);
    onChange(next);
  };
  const left = options.filter((one) => !rows.some((row) => row.column === one.value));
  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
      <legend className="p-0 text-body-sm font-medium text-ink">{label}</legend>
      {help ? <p className="m-0 text-body-sm text-ink-muted">{help}</p> : null}
      <ul ref={holder} className="m-0 flex list-none flex-col gap-2 p-0">
        {rows.map((row, at) => (
          <li
            key={row.column}
            data-flip-key={row.column}
            className="flex flex-col gap-1 rounded-control border border-line p-2"
          >
            <div className="flex items-center justify-between gap-2">
              <CheckboxField
                name={`${field}-${row.column}-shown`}
                label={heading(row.column)}
                checked={row.hidden !== true}
                onChange={(shown) => change(at, shown ? { hidden: false } : { hidden: true })}
              />
              <MoveButtons
                label={heading(row.column)}
                at={at}
                count={rows.length}
                onMove={(by) => move(at, by)}
              />
            </div>
            <TextField
              name={`${field}-${row.column}-label`}
              label={`Heading of ${heading(row.column)}`}
              labelHidden
              placeholder={heading(row.column)}
              required={false}
              value={row.label ?? ""}
              onChange={(text) => change(at, { label: text })}
            />
          </li>
        ))}
      </ul>
      {left.length > 0 ? (
        <SelectField
          name={`${field}-add`}
          label="Add a column"
          value=""
          options={[
            { value: "", label: "Choose a column" },
            ...left.map((one) => ({ value: one.value, label: one.label })),
          ]}
          onChange={(next) => next && onChange([...rows, { column: next }])}
        />
      ) : null}
      {value?.length ? (
        <div>
          <Button size="small" variant="quiet" onClick={() => onChange(undefined)}>
            Show every column again
          </Button>
        </div>
      ) : null}
    </fieldset>
  );
}

// ---------------------------------------------------------------------------
// Icons

type IconComponent = (props: {
  size?: number;
  className?: string;
  "aria-hidden"?: "true";
}) => ReactNode;

/**
 * The curated icons a button or a page may carry, by kit name. The same names the widgets' views
 * draw (`packages/widgets-core/views/look.tsx`): a name written here is one they know.
 */
export const ICON_CHOICES: readonly { name: string; label: string; icon: IconComponent }[] = [
  { name: "archive", label: "Archive", icon: Archive },
  { name: "arrow-right", label: "Arrow", icon: ArrowRight },
  { name: "ban", label: "Ban", icon: Ban },
  { name: "bell", label: "Bell", icon: Bell },
  { name: "calendar", label: "Calendar", icon: Calendar },
  { name: "check", label: "Check", icon: Check },
  { name: "circle-check", label: "Done", icon: CircleCheck },
  { name: "copy", label: "Copy", icon: Copy },
  { name: "download", label: "Download", icon: Download },
  { name: "external-link", label: "Open elsewhere", icon: ExternalLink },
  { name: "eye", label: "View", icon: Eye },
  { name: "file-text", label: "Document", icon: FileText },
  { name: "link", label: "Link", icon: LinkIcon },
  { name: "lock", label: "Lock", icon: Lock },
  { name: "mail", label: "Mail", icon: Mail },
  { name: "pencil", label: "Edit", icon: PencilIcon },
  { name: "phone", label: "Phone", icon: Phone },
  { name: "play", label: "Run", icon: Play },
  { name: "plus", label: "Add", icon: Plus },
  { name: "printer", label: "Print", icon: Printer },
  { name: "refresh-cw", label: "Refresh", icon: RefreshCw },
  { name: "send", label: "Send", icon: Send },
  { name: "settings", label: "Settings", icon: Settings },
  { name: "star", label: "Star", icon: Star },
  { name: "trash-2", label: "Delete", icon: Trash2 },
  { name: "undo-2", label: "Undo", icon: Undo2 },
  { name: "upload", label: "Upload", icon: Upload },
  { name: "x", label: "Close", icon: X },
  { name: "zap", label: "Zap", icon: Zap },
];

const iconOf = (name: string | undefined) => ICON_CHOICES.find((one) => one.name === name);

function IconControl({
  field,
  label,
  help,
  value,
  onChange,
}: {
  field: string;
  label: string;
  help: string | undefined;
  value: string | undefined;
  onChange: (next: string | undefined) => void;
}) {
  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-1.5 border-0 p-0">
      <legend className="p-0 text-body-sm font-medium text-ink">{label}</legend>
      <div className="grid grid-cols-6 gap-1">
        <button
          type="button"
          aria-pressed={value === undefined}
          aria-label="No icon"
          onClick={() => onChange(undefined)}
          className={`grid size-9 cursor-pointer place-items-center rounded-control border text-meta outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus ${
            value === undefined
              ? "border-action bg-action-soft text-action"
              : "border-line text-ink-muted hover:border-line-strong"
          }`}
        >
          None
        </button>
        {ICON_CHOICES.map(({ name, label: words, icon: Icon }) => (
          <button
            key={name}
            id={`${field}-${name}`}
            type="button"
            aria-pressed={value === name}
            aria-label={words}
            title={words}
            onClick={() => onChange(name)}
            className={`grid size-9 cursor-pointer place-items-center rounded-control border outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus ${
              value === name
                ? "border-action bg-action-soft text-action"
                : "border-line text-ink hover:border-line-strong"
            }`}
          >
            <Icon size={16} aria-hidden="true" />
          </button>
        ))}
      </div>
      {help ? <p className="m-0 text-meta text-ink-muted">{help}</p> : null}
    </fieldset>
  );
}

// ---------------------------------------------------------------------------
// Groups

function GroupsControl({
  field,
  label,
  help,
  choices,
  value,
  onChange,
}: {
  field: string;
  label: string;
  help: string | undefined;
  choices: readonly GroupChoice[];
  /** The paths held: `groups/<key>` or `end-user-groups/<key>`. */
  value: string[];
  onChange: (next: string[] | undefined) => void;
}) {
  const toggle = (path: string, on: boolean) =>
    onChange(
      on ? [...value.filter((one) => one !== path), path] : value.filter((one) => one !== path),
    );
  const members = choices.filter((one) => one.kind === "member");
  const endUsers = choices.filter((one) => one.kind === "end_user");
  // A group that is gone stays listed (by its key), so it can be taken out.
  const gone = value.filter((one) => !choices.some((choice) => choice.path === one));
  const section = (title: string, list: readonly { path: string; name: string }[]) =>
    list.length === 0 ? null : (
      <div className="flex flex-col gap-1">
        <span className="text-meta text-ink-muted">{title}</span>
        {list.map((one) => (
          <CheckboxField
            key={one.path}
            name={`${field}-${one.path}`}
            label={one.name}
            checked={value.includes(one.path)}
            onChange={(on) => toggle(one.path, on)}
          />
        ))}
      </div>
    );
  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
      <legend className="p-0 text-body-sm font-medium text-ink">{label}</legend>
      {choices.length === 0 && gone.length === 0 ? (
        <p className="m-0 text-body-sm text-ink-muted">There are no groups yet.</p>
      ) : null}
      {section("Member groups", members)}
      {section("End-user groups", endUsers)}
      {gone.length > 0
        ? section(
            "No longer exist",
            gone.map((path) => ({ path, name: groupName(path, choices) })),
          )
        : null}
      {help ? <p className="m-0 text-meta text-ink-muted">{help}</p> : null}
    </fieldset>
  );
}

// ---------------------------------------------------------------------------
// A setting as a row of the drawer

/** The control inline, in the group, not behind a row: its own shape asks for the room. */
const INLINE = new Set([
  "switch",
  "format",
  "tiles",
  "segmented",
  "position",
  "markdown",
  "columns",
  "action",
  "actions",
  "fields",
  "tabs",
  "pageFilters",
  "slots",
  "groupRows",
  "source",
  "measure",
  "breakdown",
  "conditions",
  "sort",
  "limit",
]);

/** What a row says its setting is now: "Money · USD", "Done", "Practice managers". Left out: "Not set". */
export function settingSummary(env: Env, setting: ConfigSetting): ReactNode {
  const value = env.config[setting.name];
  switch (setting.hint.control) {
    case "text":
      return typeof value === "string" && value !== "" ? value : undefined;
    case "number":
      return typeof value === "number" ? String(value) : undefined;
    case "choice":
      return value === undefined
        ? undefined
        : choicesOf(setting).find((one) => one.value === String(value))?.label;
    case "format":
      return formatSummary(value as ValueFormat | undefined);
    case "filter":
      return typeof value === "string" && value !== ""
        ? (env.filters.find((one) => one.name === value)?.label ?? heading(value))
        : undefined;
    case "column":
      return typeof value === "string" && value !== "" ? heading(value) : undefined;
    case "columns":
      return Array.isArray(value) && value.length > 0
        ? value.map((one) => heading(String(one))).join(", ")
        : undefined;
    case "page":
      return typeof value === "string" && value !== ""
        ? (env.pages.find((one) => one.id === value)?.title ?? value)
        : undefined;
    case "icon": {
      const icon = iconOf(typeof value === "string" ? value : undefined);
      if (!icon) return undefined;
      return (
        <span className="inline-flex items-center gap-2">
          <icon.icon size={14} aria-hidden="true" />
          {icon.label}
        </span>
      );
    }
    case "groups":
      return Array.isArray(value) && value.length > 0 ? (
        <GroupNames paths={value as string[]} />
      ) : undefined;
    default:
      return undefined;
  }
}

/**
 * One setting as the drawer draws it: a row showing its value that opens an editor with the
 * control in it, or, for a switch, tiles, a segmented choice, a position or a list, the control
 * itself in the group. The same control either way.
 */
export function SettingRow({
  env,
  setting,
  bare = false,
}: {
  env: Env;
  setting: ConfigSetting;
  /** The group it is drawn in is named as it is: the label is not written twice. */
  bare?: boolean;
}) {
  const { hint, name } = setting;
  const own = settingControlFor(env.definition.type, name);
  if (own) return <DrawerBlock>{own(env)}</DrawerBlock>;
  if (hint.control === "switch") {
    const value = env.config[name];
    return (
      <ToggleRow
        label={hint.label}
        {...(hint.help ? { help: hint.help } : {})}
        checked={value === true}
        onChange={(on) =>
          env.write(
            withConfig(env.widget, name, switchValue(env, name, on)),
            `changing ${hint.label.toLowerCase()}`,
            `config:${env.widget.id}:${name}`,
          )
        }
      />
    );
  }
  if (INLINE.has(hint.control)) {
    return (
      <DrawerBlock>
        <ConfigControl env={env} setting={setting} bare={bare} />
      </DrawerBlock>
    );
  }
  return (
    <DrawerRow
      label={hint.label}
      value={settingSummary(env, setting)}
      editorTitle={hint.label}
      editor={<ConfigControl env={env} setting={setting} bare />}
    />
  );
}
