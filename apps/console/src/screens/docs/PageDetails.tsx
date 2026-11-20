import {
  ABOUT_KINDS,
  type About,
  FRONTMATTER_SCHEMA,
  frontmatterOf,
  type Manifest,
  setFrontmatter,
  type TermDefinition,
} from "@volvel/docs-engine";
import {
  Button,
  Notice,
  NumberField,
  Panel,
  SelectField,
  TextAreaField,
  TextField,
} from "@volvel/ui";
import { Plus, X } from "lucide-react";

const SAYS = FRONTMATTER_SCHEMA.properties;
const text = (value: unknown) => (typeof value === "string" ? value : "");
const list = <T,>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);
/** "a, b" as its parts, for a field that takes several short things. */
const parts = (typed: string) =>
  typed
    .split(",")
    .map((one) => one.trim())
    .filter((one) => one !== "");

/**
 * What the top of a page says about it, as a form. It writes the page's own
 * source, the lines a person would have typed, so the source stays the one
 * thing that is saved and whatever the form does not show is left as it was.
 */
export function PageDetails({
  source,
  onChange,
  index,
  product,
}: {
  source: string;
  onChange: (source: string) => void;
  /** Whether this is a folder's own page, which may name the folder's icon. */
  index: boolean;
  /** The product's help, for the topics a page can add its notes to. */
  product: Manifest | undefined;
}) {
  const now = frontmatterOf(source);
  if (now === undefined) {
    return (
      <Notice tone="attention">
        The lines between the two <code>---</code> at the top of the page cannot be read as they are
        written. Mend them in the source, and this form comes back.
      </Notice>
    );
  }
  const set = (changes: Record<string, unknown>) => {
    const next = setFrontmatter(source, changes);
    if (next !== undefined) onChange(next);
  };
  const terms = list<Partial<TermDefinition>>(now.terms);
  const about = list<About>(now.about);
  const extended = list<string>(now.extends);
  const topics = Object.entries(product?.topics ?? {})
    .map(([topic, path]) => ({
      value: topic,
      label: product?.pages.find((page) => page.path === path)?.title ?? topic,
    }))
    .filter((one) => !extended.includes(one.value))
    .sort((a, b) => a.label.localeCompare(b.label));
  const titleOf = (topic: string) => {
    const path = product?.topics[topic];
    return product?.pages.find((page) => page.path === path)?.title ?? topic;
  };

  return (
    <Panel className="flex flex-col gap-5 p-4">
      <div className="grid gap-4 md:grid-cols-2">
        <TextField
          name="title"
          label="Title"
          required
          maxLength={120}
          value={text(now.title)}
          hint={SAYS.title.description}
          onChange={(title) => set({ title })}
        />
        <TextField
          name="topic"
          label="Topic"
          required={false}
          maxLength={80}
          value={text(now.topic)}
          hint={SAYS.topic.description}
          onChange={(topic) => set({ topic })}
        />
        <TextAreaField
          name="description"
          label="Description"
          rows={2}
          required={false}
          maxLength={500}
          value={text(now.description)}
          hint={SAYS.description.description}
          onChange={(description) => set({ description })}
        />
        <div className="flex flex-col gap-4">
          <NumberField
            name="order"
            label="Order"
            required={false}
            value={typeof now.order === "number" ? now.order : undefined}
            hint={SAYS.order.description}
            onChange={(order) => set({ order })}
          />
          {index || now.icon !== undefined ? (
            <TextField
              name="icon"
              label="Icon"
              required={false}
              maxLength={40}
              value={text(now.icon)}
              hint={SAYS.icon.description}
              onChange={(icon) => set({ icon })}
            />
          ) : null}
        </div>
      </div>

      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
        <legend className="p-0 font-medium text-body-sm text-ink">Terms it defines</legend>
        <p className="m-0 text-body-sm text-ink-muted">{SAYS.terms.description}</p>
        {terms.map((term, at) => {
          const change = (changed: Partial<TermDefinition>) =>
            set({
              terms: terms.map((one, index) => {
                if (index !== at) return one;
                const next = { ...one, ...changed };
                if (!next.aliases || next.aliases.length === 0) delete next.aliases;
                return next;
              }),
            });
          const named = text(term.term) || `term ${at + 1}`;
          return (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: a term has no name of its own until its id is typed, and is changed in place.
              key={at}
              className="grid items-start gap-2 md:grid-cols-[10rem_10rem_12rem_1fr_auto]"
            >
              <TextField
                name={`term-${at}-term`}
                label="Term"
                labelHidden={at > 0}
                value={text(term.term)}
                placeholder="RMA"
                onChange={(value) => change({ term: value })}
              />
              <TextField
                name={`term-${at}-id`}
                label="Id"
                labelHidden={at > 0}
                value={text(term.id)}
                placeholder="rma"
                onChange={(value) => change({ id: value })}
              />
              <TextField
                name={`term-${at}-aliases`}
                label="Also written"
                labelHidden={at > 0}
                required={false}
                value={list<string>(term.aliases).join(", ")}
                placeholder="RMAs, return number"
                onChange={(value) => change({ aliases: parts(value) })}
              />
              <TextField
                name={`term-${at}-short`}
                label="What it means"
                labelHidden={at > 0}
                value={text(term.short)}
                maxLength={500}
                onChange={(value) => change({ short: value })}
              />
              <Button
                size="small"
                variant="quiet"
                className={at === 0 ? "md:mt-6" : ""}
                aria-label={`Remove ${named}`}
                onClick={() => set({ terms: terms.filter((_, index) => index !== at) })}
              >
                <X size={14} aria-hidden="true" />
              </Button>
            </div>
          );
        })}
        <div>
          <Button
            size="small"
            onClick={() => set({ terms: [...terms, { id: "", term: "", short: "" }] })}
          >
            <Plus size={14} aria-hidden="true" /> Term
          </Button>
        </div>
      </fieldset>

      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
        <legend className="p-0 font-medium text-body-sm text-ink">What it is about</legend>
        <p className="m-0 text-body-sm text-ink-muted">{SAYS.about.description}</p>
        {about.map((one, at) => {
          const kind = Object.keys(one)[0] ?? "table";
          const path = text((one as Record<string, unknown>)[kind]);
          const change = (nextKind: string, nextPath: string) =>
            set({
              about: about.map((was, index) => (index === at ? { [nextKind]: nextPath } : was)),
            });
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: a row is changed in place, and two may say the same while one is typed.
            <div key={at} className="grid items-start gap-2 md:grid-cols-[10rem_1fr_auto]">
              <SelectField
                name={`about-${at}-kind`}
                label="Kind"
                labelHidden={at > 0}
                value={kind}
                options={ABOUT_KINDS.map((value) => ({ value, label: value }))}
                onChange={(value) => change(value, path)}
              />
              <TextField
                name={`about-${at}-path`}
                label="Path"
                labelHidden={at > 0}
                value={path}
                placeholder="sales/orders"
                onChange={(value) => change(kind, value)}
              />
              <Button
                size="small"
                variant="quiet"
                className={at === 0 ? "md:mt-6" : ""}
                aria-label={`Remove ${kind} ${path || at + 1}`}
                onClick={() => set({ about: about.filter((_, index) => index !== at) })}
              >
                <X size={14} aria-hidden="true" />
              </Button>
            </div>
          );
        })}
        <div>
          <Button size="small" onClick={() => set({ about: [...about, { table: "" }] })}>
            <Plus size={14} aria-hidden="true" /> Resource
          </Button>
        </div>
      </fieldset>

      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
        <legend className="p-0 font-medium text-body-sm text-ink">
          Notes on the product's help
        </legend>
        <p className="m-0 text-body-sm text-ink-muted">{SAYS.extends.description}</p>
        {extended.length > 0 ? (
          <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
            {extended.map((topic) => (
              <li
                key={topic}
                className="inline-flex items-center gap-1 rounded-control border border-line bg-sunken py-0.5 pr-1 pl-2 text-body-sm"
              >
                {titleOf(topic)}
                <Button
                  size="small"
                  variant="quiet"
                  aria-label={`Remove ${titleOf(topic)}`}
                  onClick={() => set({ extends: extended.filter((one) => one !== topic) })}
                >
                  <X size={14} aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
        {topics.length > 0 ? (
          <div className="max-w-[24rem]">
            <SelectField
              name="extends-add"
              label="Add this page's notes to"
              required={false}
              value=""
              options={[{ value: "", label: "Choose a topic of the help…" }, ...topics]}
              onChange={(topic) => {
                if (topic !== "") set({ extends: [...extended, topic] });
              }}
            />
          </div>
        ) : null}
      </fieldset>
    </Panel>
  );
}
