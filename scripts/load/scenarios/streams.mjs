import { tenantPath } from "./_lib.mjs";

const HOLD_MS = 2000;

/**
 * Each iteration opens `extra.streams` (default 8) streams for one user at once, holds them
 * two seconds, and closes them. The route `STREAM accepted_count` is synthetic: its "ms" is the
 * number accepted before the first 429. The product allows five a caller (two for an end user).
 * Streams of users that share a principal count together, so use one user per principal.
 * Use `--fixed 1 --seconds 10`.
 */
export default {
  name: "streams",
  description: "Opens server-sent-event streams until the product answers 429 too_many_streams.",
  actions: [
    {
      name: "open streams",
      weight: 1,
      async run(ctx, user) {
        const wanted = user.extra?.streams ?? 8;
        const opened = [];
        // One after another, so "accepted before the first 429" has an order.
        for (let i = 0; i < wanted; i++)
          opened.push(await ctx.open(user, `${tenantPath(user)}/stream`));
        const accepted = opened.findIndex((s) => s.status !== 200);
        const count = accepted === -1 ? opened.length : accepted;
        await new Promise((done) => setTimeout(done, HOLD_MS));
        for (const stream of opened) stream.close();
        return [
          ...opened.map(({ route, status, ms, retryAfter }) => ({ route, status, ms, retryAfter })),
          { route: "STREAM accepted_count", status: 200, ms: count, synthetic: true },
        ];
      },
    },
  ],
};
