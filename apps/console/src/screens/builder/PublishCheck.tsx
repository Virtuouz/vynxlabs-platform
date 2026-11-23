import type { InterfaceBody } from "@volvel/manifest";
import { Button } from "@volvel/ui";
import { Check, TriangleAlert, X } from "lucide-react";
import { useMemo } from "react";
import { useLoad } from "../../api.ts";
import { useActionLists, useCatalog } from "../../kit/inspector/catalog.ts";
import type { DocsList } from "../docs/model.ts";
import { draftChanges } from "./changes.ts";
import { useGroupKeys } from "./groupKeys.ts";
import {
  type CheckItem,
  checksFor,
  inputsNeededOf,
  mostAffectedGroup,
  problemAt,
  problemWords,
} from "./publishCheck.ts";
import { definitionOf } from "./registry.ts";

interface Preview {
  possible: boolean;
  refusal: { detail: string; errors: { path: string; message: string }[] } | null;
  summary: { warnings?: { path: string; message: string }[] } | null;
}

const MARK = {
  ok: { icon: Check, label: "Passed", tone: "text-success" },
  warn: { icon: TriangleAlert, label: "Worth knowing", tone: "text-attention" },
  fail: { icon: X, label: "Needs fixing", tone: "text-danger" },
} as const;

const plural = (count: number, one: string) => `${count} ${count === 1 ? one : `${one}s`}`;

/**
 * "Ready to publish" (board 6): what publishing would find wrong, or worth knowing, and what it
 * changes, said before it is done; "Try as <group> first" and "Publish N changes". A problem that
 * would make the publish refuse disables it, with why. It is the content of the popover under the
 * Publish button.
 */
export function PublishCheck({
  root,
  path,
  appPath,
  drafted,
  body,
  deployed,
  problems,
  publishing,
  onPublish,
  onTry,
  onGo,
}: {
  root: string;
  path: string;
  appPath: string | null;
  /** What publishing deploys: the page's draft, and the app's when it has one. */
  drafted: readonly string[];
  body: InterfaceBody;
  /** What people see now; `null` when nothing is published yet; `undefined` while it is read. */
  deployed: InterfaceBody | null | undefined;
  /** What saving the draft refused, as the server words it. */
  problems: readonly { path: string; message: string }[];
  publishing: boolean;
  onPublish: () => void;
  /** "Try as Billing first": View as that group, and the panel closes. */
  onTry: (group: { key: string; name: string }) => void;
  /** "Show it": the page and the widget a check is about are shown in the builder, and the panel closes. */
  onGo?: ((at: { page: string; widget: string }) => void) | undefined;
}) {
  // Only what has a draft is asked about: a page nobody has changed has none, and asking for it
  // is refused ("A draft at … was not found"), which read as a problem with the app.
  const paths = [path, ...(appPath ? [appPath] : [])]
    .filter((one) => drafted.includes(one))
    .join(",");
  const nothing = paths === "";
  const preview = useLoad<Preview>(
    nothing ? null : `${root}/changes/preview?paths=${encodeURIComponent(paths)}`,
  );
  const workspace = useLoad<{ name: string }>(root);
  const { catalog, loading, error: catalogError } = useCatalog(root);
  const lists = useActionLists(root);
  const keyed = useGroupKeys(root);
  const instance = useLoad<{ appsAddress?: "separate" | "console" | "none" }>("/instance");
  // Only when the documents were read: a read that failed leaves the Help topics unchecked, not wrong.
  const docs = useLoad<DocsList>(`${root}/docs`);

  const known = useMemo(
    () => ({
      tables:
        loading || catalogError
          ? undefined
          : new Map(
              catalog.tables.map((table) => [
                table.name,
                new Set(table.columns.map((c) => c.name)),
              ]),
            ),
      queries:
        loading || catalogError ? undefined : new Set(catalog.queries.map((query) => query.path)),
      flows: new Set(lists.flows.map((flow) => flow.path)),
      scripts: new Set(lists.scripts.map((script) => script.path)),
      inputsNeeded: inputsNeededOf(lists.flows, lists.scripts),
      groups: keyed.loaded ? keyed.groups.map((group) => group.key) : undefined,
      approvalFlows: new Map(
        lists.everyFlow.map((flow) => [flow.path, { title: flow.title, asks: flow.asks }]),
      ),
      appsAddress: instance.data?.appsAddress,
      docTopics: docs.data
        ? new Set(docs.data.pages.flatMap((page) => (page.topic ? [page.topic] : [])))
        : undefined,
    }),
    [
      loading,
      catalogError,
      catalog,
      lists.flows,
      lists.everyFlow,
      lists.scripts,
      keyed.loaded,
      keyed.groups,
      instance.data,
      docs.data,
    ],
  );
  const asked: Preview | undefined = nothing
    ? { possible: true, refusal: null, summary: null }
    : preview.data;
  const checks: CheckItem[] = useMemo(() => {
    // What could not be read cannot be checked, and is said: neither passed nor failed.
    const unread = [
      ...(catalogError ? [`the tables and queries (${catalogError})`] : []),
      ...(keyed.error ? [`the groups (${keyed.error})`] : []),
    ];
    const found = checksFor({
      body,
      known,
      definitionOf,
      problems: problems.map((one) => ({
        text: `${problemWords(one, body)}.`.replace(/\.\.$/, "."),
        at: problemAt(one, body),
      })),
      refusal: asked?.refusal
        ? asked.refusal.errors.length > 0
          ? asked.refusal.errors.map((one) => ({
              // The same words as a saved problem's, so that one failure is one line.
              text: `${problemWords(one, body)}.`.replace(/\.\.$/, "."),
              at: problemAt(one, body),
            }))
          : [{ text: asked.refusal.detail }]
        : [],
      warnings: (asked?.summary?.warnings ?? []).map((one) => one.message),
    });
    return unread.length === 0
      ? found
      : [
          ...found,
          {
            id: "unread",
            state: "warn" as const,
            text: `Could not check ${unread.join(" or ")}`,
            detail: "Reload to ask again. Publishing is not held for this.",
          },
        ];
  }, [body, known, problems, asked, catalogError, keyed.error]);
  const lines = deployed === undefined ? undefined : draftChanges(deployed ?? undefined, body);
  const blockers = checks.filter((one) => one.state === "fail");
  const ready = asked !== undefined && lines !== undefined;
  const blocked = blockers.length > 0 || asked?.possible === false;
  const tryGroup = keyed.loaded ? mostAffectedGroup(body, known.groups ?? []) : undefined;
  const tryName = keyed.groups.find((group) => group.key === tryGroup)?.name;

  // The check itself was refused or failed: said, with a way to ask again, and not waited for.
  const unasked = !nothing && preview.data === undefined ? preview.error : undefined;
  const heading = unasked
    ? "The check could not be made"
    : !ready
      ? "Checking before you publish"
      : blocked
        ? blockers.length > 0
          ? `Not ready to publish: ${plural(blockers.length, "thing")} to fix`
          : "Not ready to publish"
        : "Ready to publish";

  return (
    <div data-publish-check="" className="flex flex-col gap-3 p-4 text-ink">
      <header className="flex flex-col gap-0.5">
        <h2 className="m-0 text-title font-semibold">{heading}</h2>
        <p className="m-0 text-body-sm text-ink-muted">
          {deployed === null
            ? `Publishes to ${workspace.data?.name ?? "this workspace"} for the first time. Nobody sees it until then.`
            : `Publishes to ${workspace.data?.name ?? "this workspace"}. The live app keeps working until then.`}
        </p>
      </header>
      {unasked ? (
        <div role="alert" className="flex flex-col items-start gap-2 text-body-sm">
          <p className="m-0 text-danger">
            {unasked.message} Publishing is off until the check can be made.
          </p>
          <Button onClick={() => void preview.reload()}>Check again</Button>
        </div>
      ) : !ready ? (
        <p role="status" className="m-0 text-body-sm text-ink-muted">
          Checking what publishing does…
        </p>
      ) : (
        <>
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {checks.map((one) => {
              const mark = MARK[one.state];
              const Icon = mark.icon;
              return (
                <li key={one.id} data-check={one.state} className="flex items-start gap-3 py-1">
                  <Icon aria-hidden="true" size={16} className={`mt-0.5 shrink-0 ${mark.tone}`} />
                  <span className="flex min-w-0 flex-col">
                    <span>
                      <span className="sr-only">{mark.label}: </span>
                      {one.text}
                    </span>
                    {one.detail ? (
                      <span className="text-meta text-ink-muted">{one.detail}</span>
                    ) : null}
                    {one.at && onGo ? (
                      <button
                        type="button"
                        onClick={() => onGo(one.at as { page: string; widget: string })}
                        className="w-fit cursor-pointer border-0 bg-transparent p-0 text-meta text-action underline outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus"
                      >
                        Show it
                      </button>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>
          <section
            aria-label="Changes"
            className="flex flex-col gap-1.5 rounded-control border border-line p-3"
          >
            <h3 className="m-0 text-label text-ink-subtle uppercase">
              {lines.length} {lines.length === 1 ? "change" : "changes"}
            </h3>
            {lines.length === 0 ? (
              <p className="m-0 text-body-sm text-ink-muted">The app is as people see it now.</p>
            ) : (
              <ul className="m-0 flex max-h-40 list-none flex-col gap-1 overflow-y-auto p-0 text-body-sm">
                {lines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            )}
          </section>
          {blocked ? (
            <p role="alert" className="m-0 text-body-sm text-danger">
              Publish is off until {blockers.length === 1 ? "this is" : "these are"} fixed:{" "}
              {blockers.map((one) => one.text.replace(/\.$/, "")).join("; ") ||
                "the control plane refuses it"}
              .
            </p>
          ) : null}
        </>
      )}
      <footer className="flex items-center justify-between gap-3">
        {tryGroup && tryName ? (
          <button
            type="button"
            className="cursor-pointer border-0 bg-transparent p-0 text-body-sm text-ink-muted underline hover:text-ink"
            onClick={() => onTry({ key: tryGroup, name: tryName })}
          >
            Try as {tryName} first
          </button>
        ) : (
          <span />
        )}
        <Button
          variant="primary"
          loading={publishing}
          disabled={!ready || blocked || nothing || unasked !== undefined}
          onClick={onPublish}
        >
          {lines && lines.length > 0
            ? `Publish ${lines.length} ${lines.length === 1 ? "change" : "changes"}`
            : "Publish"}
        </Button>
      </footer>
    </div>
  );
}
