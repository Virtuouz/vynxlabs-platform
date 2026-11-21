import type { Page } from "@volvel/manifest";
import { Button, SelectField, TextField } from "@volvel/ui";
import { useState } from "react";
import { type Catalog, heading } from "../../kit/inspector/model.ts";
import type { PageKind } from "./contract.ts";
import { KIND_LINE, KIND_NAMES, kindOf, withKind } from "./pageKinds.ts";

const TOPIC = /^[a-z0-9][a-z0-9_-]*$/;

/**
 * The settings of the page itself, shown in the inspector's place when a page
 * is chosen and no widget (board 2's Page tab): what kind of page it is, the
 * table its record is of, its title in the app's menu, and its help.
 */
export function PageSettings({
  page,
  catalog,
  mostReadTable,
  onChange,
  onRemove,
  canRemove,
}: {
  page: Page;
  catalog: Catalog;
  /** The table the page's widgets mostly read: what a record page is most likely of. */
  mostReadTable: string | undefined;
  onChange: (next: Page, label: string, key?: string) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const kind = kindOf(page);
  const [topic, setTopic] = useState(page.help ?? "");
  const [topicError, setTopicError] = useState<string>();
  const tables = catalog.tables.map((one) => ({ value: one.name, label: heading(one.name) }));
  const opensOnRecord = kind !== "page";
  return (
    <section className="flex flex-col gap-4" aria-label="Page settings">
      <h2 className="m-0 text-heading-sm">{page.title}</h2>
      <SelectField
        label="Page type"
        name="page-kind"
        value={kind}
        hint={KIND_LINE}
        options={(Object.keys(KIND_NAMES) as PageKind[]).map((one) => ({
          value: one,
          label: KIND_NAMES[one],
        }))}
        onChange={(value) => {
          const next = value as PageKind;
          const table = page.record?.table ?? mostReadTable ?? tables[0]?.value;
          onChange(
            withKind(page, next, next === "modal" ? page.record?.table : table),
            `making ${page.title} a ${KIND_NAMES[next].toLowerCase()}`,
          );
        }}
      />
      {opensOnRecord ? (
        <SelectField
          label="Table of its record"
          name="page-record-table"
          value={page.record?.table ?? ""}
          hint={
            kind === "modal"
              ? "A modal that makes a new record opens on none."
              : "The record it opens on is a row of this table."
          }
          options={[
            ...(kind === "modal" ? [{ value: "", label: "None: it opens on no record" }] : []),
            ...tables,
          ]}
          onChange={(value) => {
            const { record: _gone, ...rest } = page;
            onChange(
              value ? { ...rest, record: { table: value } } : rest,
              "choosing the table of the record",
            );
          }}
        />
      ) : null}
      <TextField
        label={kind === "page" ? "Title in the app menu" : "Title"}
        name="page-title"
        value={page.title}
        maxLength={200}
        required
        {...(kind === "page"
          ? {}
          : { hint: "A record page, side sheet or modal is not in the menu." })}
        onChange={(title) => {
          if (title) onChange({ ...page, title }, "renaming the page", `page-title:${page.id}`);
        }}
      />
      <TextField
        label="Help topic"
        name="page-help"
        required={false}
        value={topic}
        error={topicError}
        hint="A topic of your documentation. Whoever uses the app, and may open that documentation, gets a Help button that shows it. Leave it empty for no help."
        onChange={(value) => {
          setTopic(value);
          const named = value.trim();
          if (named !== "" && !TOPIC.test(named)) {
            setTopicError(
              "A topic is lowercase letters, digits, hyphens and underscores, as it is written in the page's frontmatter.",
            );
            return;
          }
          setTopicError(undefined);
          const { help: _help, ...rest } = page;
          onChange(
            named === "" ? rest : { ...rest, help: named },
            "setting the page's help",
            `page-help:${page.id}`,
          );
        }}
      />
      {canRemove ? (
        <div>
          <Button variant="quiet" onClick={onRemove}>
            Remove page
          </Button>
        </div>
      ) : null}
    </section>
  );
}
