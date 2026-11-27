import { pick, wsPath } from "./_lib.mjs";

const ENDED = new Set(["succeeded", "failed", "canceled"]);
const POLL_EVERY_MS = 500;
const POLL_GIVE_UP_MS = 120_000;

const seconds = (from, to) => (from && to ? Math.max(0, Date.parse(to) - Date.parse(from)) : null);

/**
 * Starts runs by the API. Use it with `--rate R`. A sample of the runs (`extra.pollSample`,
 * default 0.1) is read until it ends, which gives the queue wait and the duration as the
 * synthetic routes `RUN queue_wait` and `RUN duration` (milliseconds), and the whole time
 * as `RUN end_to_end`. A run still going after two minutes is `RUN not_finished`, status 0.
 */
export default {
  name: "run-start",
  description: "Starts script runs at a rate, and follows a sample of them to the end.",
  setup(ctx) {
    for (const user of ctx.users) {
      const scripts = user.extra?.scripts;
      if (!Array.isArray(scripts) || scripts.length === 0) {
        throw new Error(`User ${user.label}: extra.scripts must list { path, input } to start.`);
      }
    }
  },
  actions: [
    {
      name: "start run",
      weight: 1,
      async run(ctx, user) {
        const script = pick(user.extra.scripts);
        const started = await ctx.call(user, "POST", `${wsPath(user)}/runs`, {
          script: script.path,
          input: script.input ?? {},
        });
        const out = [started];
        const id = started.json?.id;
        const sampled = Math.random() < (user.extra.pollSample ?? 0.1);
        if (!id || (started.status !== 200 && started.status !== 201) || !sampled) return out;

        const began = performance.now();
        let run = started.json;
        while (!ENDED.has(run?.state) && performance.now() - began < POLL_GIVE_UP_MS) {
          await new Promise((done) => setTimeout(done, POLL_EVERY_MS));
          const polled = await ctx.call(user, "GET", `${wsPath(user)}/runs/${id}`);
          out.push(polled);
          if (polled.status === 200) run = polled.json;
        }
        if (!ENDED.has(run?.state)) {
          out.push({
            route: "RUN not_finished",
            status: 0,
            ms: performance.now() - began,
            synthetic: true,
          });
          return out;
        }
        const wait = seconds(run.scheduledFor ?? run.createdAt, run.startedAt);
        const took = seconds(run.startedAt, run.finishedAt);
        const whole = seconds(run.createdAt, run.finishedAt);
        const synth = (route, ms) => ({ route, status: 200, ms, synthetic: true });
        if (wait !== null) out.push(synth("RUN queue_wait", wait));
        if (took !== null) out.push(synth("RUN duration", took));
        if (whole !== null) out.push(synth("RUN end_to_end", whole));
        if (run.state !== "succeeded") {
          out.push({ route: `RUN ended_${run.state}`, status: 200, ms: 0, synthetic: true });
        }
        return out;
      },
    },
  ],
};
