import { Button, Skeleton } from "@volvel/ui";
import { type ReactNode, useEffect, useState } from "react";
import { type ApiError, ASK_FOR_ACCESS, type Loaded } from "../api.ts";

/** Waits this long before showing that something loads: most answers come sooner. */
export const LOADING_DELAY_MS = 300;

/** True once `active` has stayed true for `ms`. */
export function useDelayed(active: boolean, ms = LOADING_DELAY_MS): boolean {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!active) {
      setShown(false);
      return;
    }
    const timer = setTimeout(() => setShown(true), ms);
    return () => clearTimeout(timer);
  }, [active, ms]);
  return active && shown;
}

/** The message of whatever failed: an API error, an `Error`, or a string. */
const messageOf = (error: unknown) =>
  typeof error === "string"
    ? error
    : error instanceof Error
      ? error.message
      : "Something went wrong.";

/** A request ID, written so it can be read out and copied. */
function RequestId({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="inline-flex flex-wrap items-center gap-2 text-meta text-ink-muted">
      Request ID <code className="font-mono text-code-sm text-ink">{id}</code>
      <button
        type="button"
        className="cursor-pointer rounded-inner px-1 text-action underline underline-offset-2 hover:bg-action-soft"
        onClick={() => {
          void navigator.clipboard?.writeText(id).then(
            () => setCopied(true),
            () => {},
          );
        }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </span>
  );
}

/**
 * What failed, a way to try again (not for a refusal, which asking again does not change), and the server's request ID to report it
 * with. Shown in place of what could not be loaded; the page around it stays.
 */
export function ErrorState({
  error,
  what,
  onRetry,
}: {
  error: unknown;
  /** What could not be loaded, as the screen names it: "runs", "this flow". */
  what?: string | undefined;
  onRetry?: (() => void) | undefined;
}) {
  const requestId = (error as Partial<ApiError> | undefined)?.requestId;
  // A refusal does not pass by asking again: say whom to ask instead.
  const forbidden = (error as Partial<ApiError> | undefined)?.status === 403;
  return (
    <div
      role="alert"
      className="flex flex-wrap items-start justify-between gap-3 rounded-control border border-danger/45 bg-danger-soft px-3 py-2 text-danger"
    >
      <div className="flex min-w-0 flex-col gap-1">
        <span>
          {what ? <strong className="font-medium">Could not load {what}. </strong> : null}
          {messageOf(error)}
        </span>
        {forbidden && !messageOf(error).includes(ASK_FOR_ACCESS) ? (
          <span>{ASK_FOR_ACCESS}</span>
        ) : null}
        {requestId ? <RequestId id={requestId} /> : null}
      </div>
      {onRetry && !forbidden ? (
        <Button size="small" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}

/**
 * One way to show what a read gives: nothing for the first 300 ms, then a
 * skeleton the shape of what comes; what failed, with Try again and the
 * request ID; the empty state when there is nothing; and otherwise the
 * content. While it is asked again the content stays, marked busy.
 */
export function LoadState<T>({
  of,
  what,
  skeleton,
  empty,
  isEmpty,
  className,
  children,
}: {
  of: Loaded<T>;
  /** What is loaded, for the error and the skeleton's name: "runs", "this table". */
  what?: string;
  /** The shape of what comes. Lines of text when left out. */
  skeleton?: ReactNode;
  /** Shown when `isEmpty` says there is nothing. */
  empty?: ReactNode;
  isEmpty?: (data: T) => boolean;
  className?: string;
  children: (data: T) => ReactNode;
}) {
  const waiting = useDelayed(of.data === undefined && of.error === undefined);
  if (of.data === undefined) {
    if (of.error) return <ErrorState error={of.error} what={what} onRetry={of.reload} />;
    if (!waiting) return null;
    return (
      <div aria-busy="true" className={className}>
        {skeleton ?? (
          <Skeleton lines={4} className="h-5 w-full" label={what ? `Loading ${what}` : "Loading"} />
        )}
      </div>
    );
  }
  const content = empty && isEmpty?.(of.data) ? empty : children(of.data);
  return (
    <div aria-busy={of.loading ? "true" : undefined} className={className ?? "contents"}>
      {of.error ? <ErrorState error={of.error} what={what} onRetry={of.reload} /> : null}
      {content}
    </div>
  );
}

/**
 * Something not there yet: nothing for the first 300 ms, then a skeleton. For a
 * place that has its own way of showing what comes, and no error to show.
 */
export function Loading({ what, lines = 3 }: { what?: string; lines?: number }) {
  const slow = useDelayed(true);
  if (!slow) return <div aria-busy="true" />;
  return (
    <div aria-busy="true">
      <Skeleton lines={lines} className="h-5 w-full" label={what ? `Loading ${what}` : "Loading"} />
    </div>
  );
}

/**
 * What a screen shows while its read has given nothing: what failed, with Try
 * again and the request ID, or else `Loading`. Never "Loading…" for ever.
 */
export function Pending<T>({ of, what }: { of: Loaded<T>; what?: string }) {
  if (of.error) return <ErrorState error={of.error} what={what} onRetry={of.reload} />;
  return <Loading {...(what ? { what } : {})} />;
}
