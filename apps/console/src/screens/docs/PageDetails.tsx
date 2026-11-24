import {
  ABOUT_KINDS,
  type About,
  DOC_TYPE_LABELS,
  DOC_TYPES,
  type DocType,
  FRONTMATTER_SCHEMA,
  frontmatterOf,
  isDocType,
  MAX_SUBJECTS,
  type Manifest,
  setFrontmatter,
  type TermDefinition,
} from "@volvel/docs-engine";
import { Button, Notice, Panel, SelectField, TextAreaField, TextField } from "@volvel/ui";
import { Plus, X } from "lucide-react";
import { useState } from "react";

const SAYS = FRONTMATTER_SCHEMA.properties;
const text = (value: unknown) => (typeof value === "string" ? value : "");
const list = <T,>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);
/** "a, b" as its parts, for a field that takes several short things. */
/** What is typed as a subject, written as one is: lowercase, with a hyphen where there was a space. */
const subjectOf = (typed: string) =>
  typed
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^[-_]+|-+$/g, "")
    .slice(0, 80);

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
  inherited,
  subjects: known = [],
}: {
  source: string;
  onChange: (source: string) => void;
  /** Whether this is a folder's own page, which may name the folder's icon. */
  index: boolean;
  /** The product's help, for the topics a page can add its notes to. */
  product: Manifest | undefined;
  /** The type the folder gives a page that says none. */
  inherited?: DocType | undefined;
  /** The subjects the app's other pages name, the most used first: offered to choose from. */
  subjects?: readonly { subject: string; pages: number }[];
}) {
  const [typedSubject, setTypedSubject] = useState("");
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

  const type = text(now.type);
  const chosen = list<string>(now.subjects).filter((one) => typeof one === "string");
  const full = chosen.length >= MAX_SUBJECTS;
  const offered = known.filter((one) => !chosen.includes(one.subject)).slice(0, 12);
  const addSubject = (typed: string) => {
    const subject = subjectOf(typed);
    if (subject === "" || full || chosen.includes(subject)) return;
    set({ subjects: [...chosen, subject] });
    setTypedSubject("");
  };
  const typeOptions = [
    {
      value: "",
      label: index
        ? "None: the pages under it say their own"
        : inherited
          ? `Use the folder's (${DOC_TYPE_LABELS[inherited]})`
          : "None",
    },
    ...DOC_TYPES.map((one) => ({ value: one, label: DOC_TYPE_LABELS[one] })),
    // What is written and is none of them is kept, so that the form says what the source says.
    ...(type !== "" && !isDocType(type) ? [{ value: type, label: `${type} (not a type)` }] : []),
  ];

  return (
    <Panel className="flex flex-col gap-5 p-4 max-sm:border-0 max-sm:bg-transparent max-sm:p-0">
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
          <p className="m-0 text-meta text-ink-muted">
            Its place among the others: drag it in the tree, or list it in <code>pages:</code> on
            its folder's own page.
          </p>
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
          <div className="max-w-[16rem]">
            <TextField
              name="date"
              label="Date"
              type="date"
              required={false}
              value={text(now.date)}
              hint={SAYS.date.description}
              onChange={(date) => set({ date })}
            />
          </div>
        </div>
      </div>

      <fieldset className="m-0 flex flex-col gap-3 border-0 p-0">
        <legend className="p-0 font-medium text-body-sm text-ink">What kind of page it is</legend>
        <div className="max-w-[24rem]">
          <SelectField
            name="type"
            label="Type"
            required={false}
            value={type}
            options={typeOptions}
            hint={
              type === "" && inherited && !index
                ? `The folder says ${DOC_TYPE_LABELS[inherited]}, so this page is one.`
                : SAYS.type.description
            }
            onChange={(next) => set({ type: next })}
          />
        </div>
        <div className="flex flex-col gap-2">
          <p className="m-0 text-body-sm text-ink-muted">{SAYS.subjects.description}</p>
          {chosen.length > 0 ? (
            <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
              {chosen.map((subject, at) => (
                <li
                  key={subject}
                  className={`inline-flex items-center gap-1 rounded-control border border-line bg-sunken py-0.5 pr-1 pl-2 text-body-sm ${
                    at >= MAX_SUBJECTS ? "text-ink-subtle line-through" : ""
                  }`}
                >
                  {subject}
                  <Button
                    size="small"
                    variant="quiet"
                    aria-label={`Remove ${subject}`}
                    onClick={() => set({ subjects: chosen.filter((one) => one !== subject) })}
                  >
                    <X size={14} aria-hidden="true" />
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
          {chosen.length > MAX_SUBJECTS ? (
            <p className="m-0 text-body-sm text-warning">
              Only the first {MAX_SUBJECTS} are used. Remove the others, or keep the ones a reader
              would look for first.
            </p>
          ) : null}
          <div className="flex max-w-[24rem] items-end gap-2">
            <div className="min-w-0 flex-1">
              <TextField
                name="subject-add"
                label="Add a subject"
                required={false}
                maxLength={80}
                disabled={full}
                value={typedSubject}
                placeholder="refunds"
                hint={
                  full
                    ? `Five is the most a page uses. Remove one to add another.`
                    : "A short name, the same on every page about it."
                }
                onChange={setTypedSubject}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addSubject(typedSubject);
                  }
                }}
              />
            </div>
            <Button
              size="small"
              disabled={full || subjectOf(typedSubject) === ""}
              onClick={() => addSubject(typedSubject)}
            >
              <Plus size={14} aria-hidden="true" /> Subject
            </Button>
          </div>
          {offered.length > 0 && !full ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-body-sm text-ink-muted">On other pages of this site:</span>
              {offered.map((one) => (
                <Button
                  key={one.subject}
                  size="small"
                  variant="quiet"
                  aria-label={`Add ${one.subject}`}
                  title={`${one.pages} ${one.pages === 1 ? "page" : "pages"}`}
                  onClick={() => addSubject(one.subject)}
                >
                  <Plus size={14} aria-hidden="true" /> {one.subject}
                </Button>
              ))}
            </div>
          ) : null}
        </div>
      </fieldset>

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
