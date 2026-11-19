import pg from "pg";

export interface Listener {
  /** The server process of the listening connection, while there is one. For tests. */
  readonly pid: number | undefined;
  close(): Promise<void>;
}

export interface ListenOptions {
  connectionString: string;
  channels: string[];
  onMessage: (channel: string, payload: string) => void;
  /** Called after the connection was lost and made again: messages in between were missed. */
  onReconnect?: () => void;
  onError?: (error: Error) => void;
}

const FIRST_DELAY_MS = 250;
const LONGEST_DELAY_MS = 5_000;

/**
 * Listens on Postgres channels on a connection of its own, outside every pool,
 * and makes it again when it is lost. A notification is fire-and-forget: what
 * was sent while the connection was down is gone, and `onReconnect` says so.
 */
export async function listen(options: ListenOptions): Promise<Listener> {
  let client: pg.Client | undefined;
  let pid: number | undefined;
  let closed = false;
  let delay = FIRST_DELAY_MS;
  let timer: NodeJS.Timeout | undefined;

  const connect = async (again: boolean): Promise<void> => {
    const next = new pg.Client({
      connectionString: options.connectionString,
      application_name: "volvel-events",
    });
    let lost = false;
    const onLost = (error?: Error) => {
      if (lost) return;
      lost = true;
      if (error) options.onError?.(error);
      if (client === next) {
        client = undefined;
        pid = undefined;
      }
      next.end().catch(() => {});
      if (!closed) retry();
    };
    next.on("notification", (message) => {
      if (message.payload !== undefined) options.onMessage(message.channel, message.payload);
    });
    next.on("error", (error) => onLost(error));
    next.on("end", () => onLost());
    await next.connect();
    for (const channel of options.channels) {
      await next.query(`listen ${pg.escapeIdentifier(channel)}`);
    }
    pid = (await next.query<{ pid: number }>("select pg_backend_pid() as pid")).rows[0]?.pid;
    client = next;
    delay = FIRST_DELAY_MS;
    if (again) options.onReconnect?.();
  };

  const retry = () => {
    if (timer || closed) return;
    timer = setTimeout(async () => {
      timer = undefined;
      try {
        await connect(true);
      } catch (error) {
        options.onError?.(error as Error);
        delay = Math.min(delay * 2, LONGEST_DELAY_MS);
        retry();
      }
    }, delay);
  };

  await connect(false);
  return {
    get pid() {
      return pid;
    },
    async close() {
      closed = true;
      if (timer) clearTimeout(timer);
      await client?.end().catch(() => {});
    },
  };
}
