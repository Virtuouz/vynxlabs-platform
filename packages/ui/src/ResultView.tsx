import { type ReactNode, useState } from "react";
import { JsonView } from "./JsonView.tsx";
import { Markdown, safeHref } from "./Markdown.tsx";
import { SegmentedControl } from "./Pickers.tsx";

/** How a result can be shown, besides as JSON. */
export type ResultShape = "table" | "markdown" | "media" | "json";

/** The most rows a table draws; the rest are counted, and the JSON has them all. */
export const MAX_TABLE_ROWS = 500;
const MAX_COLUMNS = 12;

type Plain = Record<string, unknown>;

function isPlain(value: unknown): value is Plain {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const IMAGE = /\.(png|jpe?g|gif|webp|avif|svg)(\?.*)?$/i;

interface Media {
  url: string;
  name?: string | undefined;
  image: boolean;
}

/** A single address, or `{ image }`, `{ url }` or `{ file }` with an optional name. */
function mediaOf(value: unknown): Media | undefined {
  if (typeof value === "string") {
    if (/^data:image\//.test(value)) return { url: value, image: true };
    const href = /^https?:\/\/\S+$/i.test(value) ? safeHref(value) : undefined;
    return href ? { url: href, image: IMAGE.test(new URL(href).pathname) } : undefined;
  }
  if (!isPlain(value)) return undefined;
  const keys = Object.keys(value);
  const name = typeof value.name === "string" ? value.name : undefined;
  if (keys.some((key) => !["image", "url", "file", "name", "alt"].includes(key))) return undefined;
  if (typeof value.image === "string") {
    const found = mediaOf(value.image);
    if (found) return { ...found, image: true, name: name ?? (value.alt as string | undefined) };
  }
  const address = typeof value.url === "string" ? value.url : value.file;
  if (typeof address === "string") {
    const found = mediaOf(address);
    if (found) return { ...found, name };
  }
  return undefined;
}

/** The shapes a value can be shown in, the best first. JSON is always last. */
export function resultShapes(value: unknown): ResultShape[] {
  const shapes: ResultShape[] = [];
  if (Array.isArray(value) && value.length > 0 && value.every(isPlain)) shapes.push("table");
  if (isPlain(value) && typeof value.markdown === "string") shapes.push("markdown");
  if (mediaOf(value)) shapes.push("media");
  shapes.push("json");
  return shapes;
}

const LABELS: Record<ResultShape, string> = {
  table: "Table",
  markdown: "Text",
  media: "Preview",
  json: "JSON",
};

const ADDRESS = /^https?:\/\/\S+$/i;

/**
 * The columns of a table: those the schema names, in its order, then those
 * found in the rows. Without a schema, the order the rows were stored in says
 * little (the database keeps keys shortest first), so plain values come
 * first, and addresses and nested values after them.
 */
export function columnsOf(rows: Plain[], schema?: unknown): string[] {
  const named =
    isPlain(schema) && isPlain(schema.items) && isPlain(schema.items.properties)
      ? Object.keys(schema.items.properties)
      : [];
  const sample = rows.slice(0, 100);
  const found: string[] = [];
  for (const row of sample) {
    for (const key of Object.keys(row)) if (!found.includes(key)) found.push(key);
  }
  const plain = (key: string) =>
    sample.every((row) => {
      const value = row[key];
      return value === null || value === undefined || typeof value !== "object"
        ? !(typeof value === "string" && ADDRESS.test(value))
        : false;
    });
  const rest = found.filter((key) => !named.includes(key));
  return [...named, ...rest.filter(plain), ...rest.filter((key) => !plain(key))];
}

function cell(value: unknown): ReactNode {
  if (value === null || value === undefined) return <span className="text-ink-muted">—</span>;
  if (typeof value === "string") {
    const href = ADDRESS.test(value) ? safeHref(value) : undefined;
    if (href) {
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          title={value}
          className="block max-w-[16rem] truncate text-action"
        >
          {value}
        </a>
      );
    }
    // A code, a name or a date reads on one line; prose wraps.
    return value.length <= 32 ? <span className="whitespace-nowrap">{value}</span> : value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return <span className="whitespace-nowrap tabular-nums">{String(value)}</span>;
  }
  const text = JSON.stringify(value);
  return (
    <code className="font-mono text-[12px] text-ink-muted" title={text}>
      {text.length > 80 ? `${text.slice(0, 79)}…` : text}
    </code>
  );
}

function ResultTable({ rows, schema, label }: { rows: Plain[]; schema?: unknown; label: string }) {
  const all = columnsOf(rows, schema);
  const columns = all.slice(0, MAX_COLUMNS);
  const shown = rows.slice(0, MAX_TABLE_ROWS);
  const hidden = [
    rows.length > shown.length
      ? `${rows.length - shown.length} more row${rows.length - shown.length === 1 ? "" : "s"}`
      : "",
    all.length > columns.length
      ? `${all.length - columns.length} more column${all.length - columns.length === 1 ? "" : "s"}`
      : "",
  ].filter(Boolean);
  return (
    <div className="flex flex-col gap-1.5">
      <section
        aria-label={label}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: a block that scrolls must be reachable by keyboard
        tabIndex={0}
        className="max-h-[24rem] overflow-auto rounded-control border border-line bg-surface"
      >
        <table className="w-full border-collapse text-left text-[13px]">
          <thead className="sticky top-0 bg-surface">
            <tr>
              {columns.map((column) => (
                <th
                  key={column}
                  scope="col"
                  className="border-b border-line px-3 py-1.5 font-medium whitespace-nowrap text-ink-muted"
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((row, at) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: result rows have no identity but their place
              <tr key={at} className="border-b border-line last:border-b-0">
                {columns.map((column) => (
                  <td key={column} className="max-w-[24rem] px-3 py-1.5 align-top">
                    {cell(row[column])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <p className="m-0 text-[12px] text-ink-muted">
        {rows.length} row{rows.length === 1 ? "" : "s"}
        {hidden.length > 0 ? `; ${hidden.join(" and ")} in the JSON` : ""}
      </p>
    </div>
  );
}

/**
 * An image from another site is not loaded until asked for: loading it tells
 * that site who is looking. One carried in the value itself is shown.
 */
function MediaPreview({ media }: { media: Media }) {
  const inline = media.url.startsWith("data:");
  const [show, setShow] = useState(inline);
  const name = media.name ?? (inline ? "Image" : media.url);
  return (
    <div className="flex flex-col items-start gap-2 rounded-control border border-line bg-sunken p-3">
      {media.image && show ? (
        <img
          src={media.url}
          alt={media.name ?? ""}
          className="max-h-[20rem] max-w-full rounded-[4px]"
        />
      ) : null}
      <div className="flex max-w-full flex-wrap items-center gap-2">
        {inline ? null : (
          <a
            href={media.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-action break-all"
          >
            {name}
          </a>
        )}
        {media.image && !show ? (
          <button
            type="button"
            className="rounded-[4px] border border-line bg-surface px-1.5 py-0.5 text-[12px] text-ink-muted hover:text-ink"
            onClick={() => setShow(true)}
          >
            Show image
          </button>
        ) : null}
      </div>
    </div>
  );
}

export interface ResultViewProps {
  value: unknown;
  /** Names the block for screen readers: "Output". */
  label: string;
  /** The result's declared JSON Schema, if any: a table's columns follow it. */
  schema?: unknown;
  maxHeight?: string;
}

/**
 * A result shown by its shape: rows as a table, `{ markdown }` as text, an
 * address as a link or an image, with the JSON always one click away.
 */
export function ResultView({ value, label, schema, maxHeight = "24rem" }: ResultViewProps) {
  const shapes = resultShapes(value);
  const [chosen, setChosen] = useState<ResultShape>(shapes[0] as ResultShape);
  const shape = shapes.includes(chosen) ? chosen : (shapes[0] as ResultShape);
  const media = shape === "media" ? mediaOf(value) : undefined;
  return (
    <div className="flex flex-col gap-2">
      {shapes.length > 1 ? (
        <SegmentedControl
          label={`Show ${label.toLowerCase()} as`}
          size="small"
          value={shape}
          onChange={setChosen}
          options={shapes.map((value) => ({ value, label: LABELS[value] }))}
        />
      ) : null}
      {shape === "table" ? (
        <ResultTable rows={value as Plain[]} schema={schema} label={label} />
      ) : shape === "markdown" ? (
        <section
          aria-label={label}
          // biome-ignore lint/a11y/noNoninteractiveTabindex: a block that scrolls must be reachable by keyboard
          tabIndex={0}
          style={{ maxHeight }}
          className="overflow-auto rounded-control border border-line bg-surface p-3"
        >
          <Markdown text={(value as { markdown: string }).markdown} />
        </section>
      ) : media ? (
        <MediaPreview media={media} />
      ) : (
        <JsonView label={label} value={value} maxHeight={maxHeight} />
      )}
    </div>
  );
}
