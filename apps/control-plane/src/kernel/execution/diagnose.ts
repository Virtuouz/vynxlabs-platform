/**
 * A suggested next step for a failed run, read from the shape of its failure.
 * It is advice for a person and never acts. A failure that matches nothing
 * known gets no suggestion rather than a guess.
 */
export interface Diagnosis {
  /** What probably happened, in a sentence. */
  cause: string;
  /** What to do about it, in a sentence. */
  next: string;
  /** The console screen that helps, by its workspace section: "connections", "variables"… */
  section?: "connections" | "secrets" | "variables" | "settings" | "triggers";
}

export interface FailedRun {
  message: string;
  attempt: number;
  maxAttempts: number;
  timeoutSeconds?: number | undefined;
  /** Connections the script uses that have nothing bound in this workspace. */
  unbound?: string[];
}

const HTTP: [RegExp, (status: number) => Diagnosis | undefined][] = [
  [
    /\b(?:status(?: code)?|HTTP)\s*:?\s*(\d{3})\b/i,
    (status) => {
      if (status === 401 || status === 403)
        return {
          cause: `The service refused the request with ${status}: the credential was not accepted.`,
          next: "Check the credential set on the connection the script calls, and that it may do this.",
          section: "connections",
        };
      if (status === 404)
        return {
          cause:
            "The service answered 404: the address or the record it names does not exist there.",
          next: "Check the connection's base address, and the identifier the run sent.",
          section: "connections",
        };
      if (status === 400 || status === 409 || status === 422)
        return {
          cause: `The service refused the data it was sent (${status}).`,
          next: "Compare the run's input with what the service expects; the log shows the service's answer.",
        };
      if (status === 429)
        return {
          cause: "The service is limiting how often it is called (429).",
          next: "Retries with a longer delay, or fewer runs at once, give it room.",
          section: "settings",
        };
      if (status >= 500)
        return {
          cause: `The service failed on its side (${status}).`,
          next: "Usually passing: run it again later, or ask the service's owner if it keeps failing.",
        };
      return undefined;
    },
  ],
];

/** Reads a failure and says what to do next, or nothing when the failure is not a known shape. */
export function diagnose(run: FailedRun): Diagnosis | undefined {
  const message = run.message;
  const exhausted =
    run.maxAttempts > 1 && run.attempt >= run.maxAttempts
      ? ` It failed on all ${run.maxAttempts} attempts.`
      : "";

  if (run.unbound && run.unbound.length > 0) {
    const names = run.unbound.join(", ");
    return {
      cause: `Connection ${names} has nothing bound in this workspace.${exhausted}`,
      next: `Bind ${names} under Connections, then run it again.`,
      section: "connections",
    };
  }
  if (/\bnot bound\b|\bno binding\b|\bunbound\b/i.test(message))
    return {
      cause: `A connection the script uses has nothing bound here.${exhausted}`,
      next: "Bind it under Connections, then run it again.",
      section: "connections",
    };
  if (/\bsecret\b.*\bnot set\b|\bno secret\b/i.test(message))
    return {
      cause: "A secret the script reads is not set in this workspace.",
      next: "Set it under Secrets.",
      section: "secrets",
    };
  if (/\bvariable\b.*\bnot set\b|\bno variable\b/i.test(message))
    return {
      cause: "A variable the script reads has no value here.",
      next: "Give it a value under Variables.",
      section: "variables",
    };
  if (/timed out|timeout|time limit/i.test(message))
    return {
      cause: `The run took longer than its timeout${run.timeoutSeconds ? ` of ${run.timeoutSeconds}s` : ""}.${exhausted}`,
      next: "Raise the script's timeout, or have it do less in one run.",
    };
  if (
    /ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ECONNRESET|ETIMEDOUT|getaddrinfo|fetch failed/i.test(message)
  )
    return {
      cause: `The service could not be reached from the worker.${exhausted}`,
      next: "Check the connection's address, and that the worker's network can reach it.",
      section: "connections",
    };
  if (/must have required property|does not match|is not valid|schema/i.test(message))
    return {
      cause: "The data did not match the schema it was checked against.",
      next: "Compare the run's input with the script's input schema.",
    };
  for (const [pattern, explain] of HTTP) {
    const found = pattern.exec(message);
    const status = found?.[1] ? Number(found[1]) : undefined;
    if (status) {
      const said = explain(status);
      if (said) return { ...said, cause: `${said.cause}${exhausted}` };
    }
  }
  return undefined;
}
