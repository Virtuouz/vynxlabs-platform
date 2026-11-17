import { Button, Notice } from "@vynxlabs/ui";
import { useLoad } from "../api.ts";
import { Link } from "../router.tsx";
import { kindName, objectHref } from "./objects.tsx";

export interface Reference {
  target: { kind: string; name: string };
  by: { kind: string; path: string };
  how: string;
  /** In a draft, not yet deployed. */
  draft?: boolean;
}

/**
 * Who uses each thing of one kind in a workspace, by its name, worked out
 * from what is deployed. One request for a whole list. `failed` says the
 * answer could not be read, which is not the same as nothing using it.
 */
export function useReferences(root: string, kind: string, enabled = true) {
  const found = useLoad<{ items: Reference[] }>(enabled ? `${root}/references?kind=${kind}` : null);
  const usesOf = (name: string) =>
    (found.data?.items ?? []).filter((one) => one.target.name === name);
  return Object.assign(usesOf, { failed: Boolean(found.error) });
}

/** What uses a thing, each named once, for a confirmation that lists them. */
export const usersOf = (uses: Reference[]): string[] => [
  ...new Set(uses.map((one) => one.by.path)),
];

/**
 * The first few users of a thing in a list's cell, each a link to it, and the
 * rest as a link to the thing's own page, where they are all listed. Never a
 * tooltip: what is behind one cannot be reached by keyboard or touch.
 */
export function UsedBy({
  uses,
  link,
  all,
  failed = false,
}: {
  uses: Reference[];
  /** The workspace's console address. */
  link?: string | undefined;
  /** The thing's own page, where every use is listed. */
  all?: string | undefined;
  failed?: boolean;
}) {
  if (failed) return <span className="text-ink-subtle">Could not be read</span>;
  if (uses.length === 0) return <span className="text-ink-subtle">Nothing deployed uses it</span>;
  const users = [...new Map(uses.map((one) => [one.by.path, one.by])).values()];
  return (
    <span className="font-mono text-telemetry text-ink-muted">
      {users.slice(0, 3).map((by, index) => (
        <span key={by.path}>
          {index > 0 ? ", " : ""}
          {link ? <Link to={objectHref(link, by.kind, by.path)}>{by.path}</Link> : by.path}
        </span>
      ))}
      {users.length > 3 ? (
        all ? (
          <>
            {" "}
            <Link to={all}>and {users.length - 3} more</Link>
          </>
        ) : (
          ` and ${users.length - 3} more`
        )
      ) : null}
    </span>
  );
}

/**
 * Everything that uses one thing, drafts included, each a link with its kind
 * and how it uses it. A failed read says so and offers to try again.
 */
export function ReferenceList({
  root,
  link,
  kind,
  name,
}: {
  root: string;
  link: string;
  kind: string;
  name: string;
}) {
  const found = useLoad<{ items: Reference[] }>(
    `${root}/references?${new URLSearchParams({ kind, name, drafts: "true" })}`,
  );
  if (found.error) {
    return (
      <Notice
        tone="danger"
        action={
          <Button size="small" onClick={found.reload}>
            Try again
          </Button>
        }
      >
        What uses it could not be read: {found.error.message}
      </Notice>
    );
  }
  if (!found.data) return <p className="m-0 text-ink-muted">Loading…</p>;
  if (found.data.items.length === 0) {
    return <p className="m-0 text-ink-muted">Nothing uses it, deployed or in a draft.</p>;
  }
  return (
    <ul aria-label={`What uses ${name}`} className="m-0 flex list-none flex-col gap-1.5 p-0">
      {found.data.items.map((one) => (
        <li
          key={`${one.by.kind}:${one.by.path}:${one.how}`}
          className="flex flex-wrap items-baseline gap-x-2"
        >
          <span className="w-20 shrink-0 text-meta text-ink-subtle">{kindName(one.by.kind)}</span>
          <Link
            to={objectHref(link, one.by.kind, one.by.path)}
            className="font-mono text-telemetry"
          >
            {one.by.path}
          </Link>
          <span className="text-ink-muted">{one.how}</span>
          {one.draft ? <span className="text-meta text-attention">in a draft</span> : null}
        </li>
      ))}
    </ul>
  );
}
