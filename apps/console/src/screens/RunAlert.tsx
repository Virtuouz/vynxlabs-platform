import { Notice } from "@volvel/ui";
import { useLoad } from "../api.ts";
import { Link, TEXT_LINK } from "../router.tsx";

/** What the failure alert of a run did, as the run stores it. */
export type FailureAlertOutcome = Record<string, unknown> | null | undefined;

const text = (value: unknown): string | undefined =>
  typeof value === "string" && value !== "" ? value : undefined;

/**
 * What became of a failed run's notification: the handler it started or could not start, whether
 * the post was made, and the failures counted on it. One piece for a script run's page and a flow
 * run's.
 */
export function RunAlert({ alert, link }: { alert: FailureAlertOutcome; link: string }) {
  if (!alert) return null;
  const handlerRun = text(alert.handlerRunId);
  const handlerError = text(alert.handlerError);
  const notifyError = text(alert.notifyError);
  const repeats = typeof alert.repeats === "number" ? alert.repeats : 0;
  const sameAs = alert.suppressed ? text(alert.sameAs) : undefined;
  const notified = alert.notified;
  return (
    <>
      {handlerRun ? (
        <Link to={`${link}/runs/${handlerRun}`} className={`text-meta ${TEXT_LINK}`}>
          The failure handler's run
        </Link>
      ) : null}
      {handlerError ? (
        <Notice tone="danger">The failure handler did not start: {handlerError}</Notice>
      ) : null}
      {notified === true ? (
        <p className="m-0 text-meta text-ink-muted">The failure notification was posted.</p>
      ) : null}
      {notified === false ? (
        <Notice tone="danger">
          The failure notification was not sent{notifyError ? `: ${notifyError}` : "."}
        </Notice>
      ) : null}
      {notified === null ? (
        <p className="m-0 text-meta text-ink-muted">
          The failure notification is waiting for a worker to post it.
        </p>
      ) : null}
      {repeats > 0 ? (
        <p className="m-0 text-meta text-ink-muted">
          {repeats === 1
            ? `1 later failure was counted on this alert`
            : `${repeats} later failures were counted on this alert`}
          , not sent on its own.
        </p>
      ) : null}
      {sameAs ? (
        <p className="m-0 text-meta text-ink-muted">
          No alert was sent: it is counted on{" "}
          <Link to={`${link}/runs/${sameAs}`}>the alert of an earlier failure</Link>, sent less than
          ten minutes before.
        </p>
      ) : null}
    </>
  );
}

/** The events a script run published, each leading to the event log. */
export function RunEvents({ root, link, runId }: { root: string; link: string; runId: string }) {
  const events = useLoad<{ items: { id: string; name: string; occurredAt: string }[] }>(
    `${root}/events?run=${encodeURIComponent(runId)}`,
  );
  if (events.error || !events.data) return null;
  return (
    <section aria-labelledby="published" className="flex flex-col gap-1.5">
      <h2 id="published" className="m-0 text-label text-ink-subtle uppercase">
        Published
      </h2>
      {events.data.items.length === 0 ? (
        <p className="m-0 text-meta text-ink-muted">It published no events.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {events.data.items.map((one) => (
            <li key={one.id} className="min-w-0 break-words">
              <Link to={`${link}/events?item=${encodeURIComponent(one.id)}`} className={TEXT_LINK}>
                {one.name}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
