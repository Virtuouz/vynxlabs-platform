import { tenantPath } from "./_lib.mjs";

/**
 * Goes past documented limits once and records the answers. Use `--fixed 1 --seconds 10`:
 * each action runs once per user (`once`).
 * - A webhook (`extra.webhookUrl`, the full address) is called `extra.webhookBurst` times
 *   (default 150) in a second or so; the limit is 120 a minute, so 429s are expected, with
 *   Retry-After.
 * - A sixth stream: `extra.streams` (default 6) are opened; the limit is five a caller.
 * Sign-in flooding is not here.
 */
export default {
  name: "limits",
  description: "Exceeds the webhook rate limit and the stream limit, and records the answers.",
  once: true,
  actions: [
    {
      name: "webhook past 120 a minute",
      weight: 1,
      async run(ctx, user) {
        const url = user.extra?.webhookUrl;
        if (!url) return [];
        const burst = user.extra.webhookBurst ?? 150;
        const out = [];
        for (let sent = 0; sent < burst; sent += 25) {
          const batch = Array.from({ length: Math.min(25, burst - sent) }, () =>
            ctx.call(user, "POST", url, { load: "limits" }),
          );
          out.push(...(await Promise.all(batch)));
        }
        return out;
      },
    },
    {
      name: "sixth stream",
      weight: 1,
      async run(ctx, user) {
        const wanted = user.extra?.streams ?? 6;
        const opened = [];
        for (let i = 0; i < wanted; i++)
          opened.push(await ctx.open(user, `${tenantPath(user)}/stream`));
        for (const stream of opened) stream.close();
        return opened.map(({ route, status, ms, retryAfter }) => ({
          route,
          status,
          ms,
          retryAfter,
        }));
      },
    },
  ],
};
