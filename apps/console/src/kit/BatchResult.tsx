import { Button, Closing, Dialog } from "@volvel/ui";
import { type ReactNode, useState } from "react";
import { notify } from "../ask.tsx";
import { CopyIcon } from "./copy.tsx";

/** What a batch route answers: one result per item (phase 15, P3-3). */
export interface BatchAnswer {
  results: {
    id: string;
    ok: boolean;
    status: number;
    detail?: string;
    requestId?: string;
    runId?: string;
  }[];
  done: number;
  failed: number;
  /** Items the server answered 409 to, that need nothing done: counted in neither of the others. */
  left?: number;
}

/**
 * A 409 to a cancel means the run has already ended: nothing was asked of it that is not true,
 * so it is said to be left alone, not "not done".
 */
export function leftAlone(answer: BatchAnswer): BatchAnswer {
  const left = answer.results.filter((one) => !one.ok && one.status === 409);
  if (left.length === 0) return answer;
  return {
    results: answer.results.filter((one) => one.ok || one.status !== 409),
    done: answer.done,
    failed: answer.failed - left.length,
    left: (answer.left ?? 0) + left.length,
  };
}

/** The most items the server does in one batch (`apps/control-plane/src/routes/batch.ts`). */
export const BATCH_LIMIT = 100;

/**
 * Sends a batch in slices the server accepts, one after the other, and adds up the answers, so
 * that a hundred and one checked rows are not refused whole.
 */
export async function inSlices<T>(
  items: T[],
  send: (slice: T[]) => Promise<BatchAnswer>,
): Promise<BatchAnswer> {
  const answers: BatchAnswer[] = [];
  for (let at = 0; at < items.length; at += BATCH_LIMIT) {
    answers.push(await send(items.slice(at, at + BATCH_LIMIT)));
  }
  return {
    results: answers.flatMap((one) => one.results),
    done: answers.reduce((sum, one) => sum + one.done, 0),
    failed: answers.reduce((sum, one) => sum + one.failed, 0),
    left: answers.reduce((sum, one) => sum + (one.left ?? 0), 0),
  };
}

interface Shown {
  title: string;
  answer: BatchAnswer;
  /** How an item is named to people: a run's script, a trigger's path. */
  name: (id: string) => string;
  /** Does the failed ones again. */
  retry?: ((ids: string[]) => Promise<BatchAnswer>) | undefined;
}

/**
 * Runs a batch and says what happened. When every item was done, a toast
 * says so; when any was not, a dialog lists each one with why, its request
 * ID, and Retry failed. Render `dialog` once in the screen.
 */
export function useBatch() {
  const [shown, setShown] = useState<Shown>();
  const [busy, setBusy] = useState(false);

  const run = async (
    request: () => Promise<BatchAnswer>,
    {
      done,
      title,
      name = (id) => id,
      retry,
    }: {
      /** What the toast says when every item was done: "3 runs canceled." */
      done: (count: number, left: number) => string;
      /** What the dialog is called when some were not: "Canceling runs". */
      title: string;
      name?: (id: string) => string;
      retry?: (ids: string[]) => Promise<BatchAnswer>;
    },
  ): Promise<BatchAnswer | undefined> => {
    setBusy(true);
    try {
      const answer = await request();
      if (answer.failed === 0) notify.success(done(answer.done, answer.left ?? 0));
      else setShown({ title, answer, name, retry });
      return answer;
    } catch (error) {
      notify.error(error);
      return undefined;
    } finally {
      setBusy(false);
    }
  };

  const dialog: ReactNode = (
    <Closing subject={shown}>
      {(shown, open) => (
        <BatchResult
          {...shown}
          open={open}
          onClose={() => setShown(undefined)}
          onRetry={
            shown.retry
              ? async (ids) => {
                  const again = await (shown.retry as (ids: string[]) => Promise<BatchAnswer>)(ids);
                  setShown({ ...shown, answer: again });
                }
              : undefined
          }
        />
      )}
    </Closing>
  );

  return { run, dialog, busy };
}

/** Each item of a batch, done or not, and why. */
export function BatchResult({
  title,
  answer,
  name,
  open,
  onClose,
  onRetry,
}: Shown & {
  open: boolean;
  onClose: () => void;
  onRetry?: ((ids: string[]) => Promise<void>) | undefined;
}) {
  const [retrying, setRetrying] = useState(false);
  const failed = answer.results.filter((result) => !result.ok);
  return (
    <Dialog open={open} onClose={onClose} title={title}>
      <div className="flex flex-col gap-3">
        <p className="m-0" role="status">
          {answer.done} done, {answer.failed} not done
          {answer.left ? `, ${answer.left} left alone because they had finished` : ""}.
        </p>
        <ul className="m-0 flex max-h-80 list-none flex-col gap-2 overflow-y-auto p-0">
          {failed.map((result) => (
            <li
              key={result.id}
              className="flex flex-col gap-0.5 rounded-control border border-line px-3 py-2"
            >
              <span className="font-mono text-code">{name(result.id)}</span>
              <span className="text-body-sm text-danger">
                {result.detail ?? `It was refused (${result.status}).`}
              </span>
              {result.requestId ? (
                <span className="flex items-center gap-1 text-meta text-ink-subtle">
                  Request ID <span className="font-mono">{result.requestId}</span>
                  <CopyIcon value={result.requestId} label="Copy the request ID" />
                </span>
              ) : null}
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap justify-end gap-2">
          <Button onClick={onClose}>Close</Button>
          {onRetry && failed.length > 0 ? (
            <Button
              variant="primary"
              loading={retrying}
              onClick={async () => {
                setRetrying(true);
                try {
                  await onRetry(failed.map((result) => result.id));
                } finally {
                  setRetrying(false);
                }
              }}
            >
              Retry {failed.length === 1 ? "the one" : `the ${failed.length}`} not done
            </Button>
          ) : null}
        </div>
      </div>
    </Dialog>
  );
}
