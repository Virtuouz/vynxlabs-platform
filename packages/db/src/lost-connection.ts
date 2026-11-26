import type pg from "pg";

/**
 * Keeps a connection that is lost while it is in use from ending the process.
 *
 * A pool listens for errors on its idle connections only. One that is checked out, in the middle
 * of a statement or between two of a transaction, says `error` when its server goes away, and an
 * `error` nobody listens for ends a Node process. In phase 35 the database was restarted under
 * load and the control plane exited three seconds later, taking every script in progress with
 * it; a data source a tenant points at a server of their own could do the same by hanging up.
 * The statement in progress is still refused, and the pool drops the connection when it is
 * given back: nothing is hidden by listening here.
 */
export function surviveLostConnections(pool: pg.Pool, onError?: (error: Error) => void): pg.Pool {
  pool.on("connect", (client) => {
    client.on("error", (error) => onError?.(error));
  });
  return pool;
}
