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

/** What a call to a service answered, by status. Read from the texts `HttpError` writes: "GET https://… answered 429." */
function serviceAnswer(status: number): Diagnosis | undefined {
  if (status === 401 || status === 403)
    return {
      cause: `The service refused the request with ${status}: the credential was not accepted.`,
      next: "Check the credential set on the connection the script calls, and that it may do this.",
      section: "connections",
    };
  if (status === 404)
    return {
      cause: "The service answered 404: the address or the record it names does not exist there.",
      next: "Check the connection's base address, and the identifier the run sent.",
      section: "connections",
    };
  if (status === 413)
    return {
      cause: "The service refused what was sent because it was too large (413).",
      next: "Send less in one request, in smaller parts, or ask the service's owner for its limit.",
    };
  if (status === 400 || status === 409 || status === 422)
    return {
      cause: `The service refused the data it was sent (${status}).`,
      next: "Compare the run's input with what the service expects; the log shows the service's answer.",
    };
  if (status === 429)
    return {
      cause: "The service is limiting how often it is called (429).",
      next: "A longer wait between tries, or fewer runs at once, give it room. Both are under the script's Settings.",
      section: "settings",
    };
  if (status >= 500)
    return {
      cause: `The service failed on its side (${status}).`,
      next: "Usually passing: run it again later, or ask the service's owner if it keeps failing.",
    };
  return undefined;
}

const NAMED: Record<string, { section: Diagnosis["section"]; label: string }> = {
  secret: { section: "secrets", label: "Secrets" },
  variable: { section: "variables", label: "Variables" },
  connection: { section: "connections", label: "Connections" },
  "connection group": { section: "connections", label: "Connections" },
};

/** Reads a failure and says what to do next, or nothing when the failure is not a known shape. */
export function diagnose(run: FailedRun): Diagnosis | undefined {
  const message = run.message;
  // What is matched below is the message without its addresses: a word in a URL is not the failure.
  const text = message.replace(/\bhttps?:\/\/\S+/gi, "<address>");
  const exhausted =
    run.maxAttempts > 1 && run.attempt >= run.maxAttempts
      ? ` It failed on all ${run.maxAttempts} attempts.`
      : "";

  // An unbound connection is the cause only when the failure names it: a run that failed for
  // another reason is not blamed on whatever else its script uses.
  const unbound = (run.unbound ?? []).filter((name) =>
    message.toLowerCase().includes(name.toLowerCase()),
  );
  if (unbound.length > 0) {
    const names = unbound.join(", ");
    return {
      cause: `Connection ${names} is not set up in this workspace.${exhausted}`,
      next: `Set up ${names} under Connections, then run it again.`,
      section: "connections",
    };
  }

  // The platform's own texts: fixed strings of the worker and its routes.
  const declared = /answered 403: This needs a declared use of the ([a-z ]+?) "([^"]+)"/.exec(text);
  if (declared)
    return {
      cause: `The script reads the ${declared[1]} "${declared[2]}" without naming it in what it uses.`,
      next: "Name it in the script's Settings under what it uses, or in its code, then deploy again.",
      section: "settings",
    };
  const missing = /answered 404: The ([a-z ]+?) (\S+) was not found/.exec(text);
  const named = missing?.[1] ? NAMED[missing[1]] : undefined;
  if (missing && named)
    return {
      cause: `The ${missing[1]} ${missing[2]} is not set in this workspace.`,
      next: `Set it under ${named.label}, then run it again.`,
      ...(named.section ? { section: named.section } : {}),
    };
  const limit = /took longer than its limit of (\d+) seconds/.exec(text);
  if (limit)
    return {
      cause: `The run took longer than its limit of ${limit[1]} seconds.${exhausted}`,
      next: "Raise the script's timeout, or have it do less in one run.",
      section: "settings",
    };
  const memory = /ran out of memory \((\d+) MB\)/.exec(text);
  if (memory)
    return {
      cause: `The script used more memory than the ${memory[1]} MB it is allowed.${exhausted}`,
      next: "Raise the script's memory, or have it hold less at once.",
      section: "settings",
    };
  if (/machine ran low on memory/.test(text))
    return {
      cause: `The worker's machine ran low on memory and stopped the script.${exhausted}`,
      next: "Have the script hold less at once, or run it on a worker with more memory.",
    };
  if (/worker did not report for|worker stopped responding/i.test(text))
    return {
      cause: `The worker running it stopped reporting.${exhausted}`,
      next: "Check that the worker is running and can reach Volvel, then run it again.",
    };
  if (/^(?:GET|POST|PUT|PATCH|DELETE) \/\S* answered 413\b/.test(text))
    return {
      cause:
        "Volvel refused what the worker sent because it was larger than a request may be (413).",
      next: "Log less in one line, return less, or store it as a file and return its name.",
    };
  if (/The output is larger than/.test(text))
    return {
      cause: "The script returned more than a run may keep.",
      next: "Return less, or store it as a file and return its name.",
    };

  if (/\bnot bound\b|\bnot set up\b|\bno binding\b|\bunbound\b/i.test(text))
    return {
      cause: `A connection the script uses is not set up here.${exhausted}`,
      next: "Set it up under Connections, then run it again.",
      section: "connections",
    };
  if (/\bsecret\b.*\bnot set\b|\bno secret\b/i.test(text))
    return {
      cause: "A secret the script reads is not set in this workspace.",
      next: "Set it under Secrets.",
      section: "secrets",
    };
  if (/\bvariable\b.*\bnot set\b|\bno variable\b/i.test(text))
    return {
      cause: "A variable the script reads has no value here.",
      next: "Give it a value under Variables.",
      section: "variables",
    };
  if (/\btimed out\b|\btime limit\b/i.test(text))
    return {
      cause: `The run took longer than its timeout${run.timeoutSeconds ? ` of ${run.timeoutSeconds}s` : ""}.${exhausted}`,
      next: "Raise the script's timeout, or have it do less in one run.",
    };
  if (/ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ECONNRESET|ETIMEDOUT|getaddrinfo|fetch failed/i.test(text))
    return {
      cause: `The service could not be reached from the worker.${exhausted}`,
      next: "Check the connection's address, and that the worker's network can reach it.",
      section: "connections",
    };
  // A schema failure is the one the SDK or the platform words, not any message with the word in it.
  if (/does not match its schema|does not match the schema|must have required property/i.test(text))
    return {
      cause: "The data did not match the schema it was checked against.",
      next: "Compare the run's input with the script's input schema.",
    };
  const answered = /\banswered (\d{3})\b|\b(?:status(?: code)?|HTTP)\s*:?\s*(\d{3})\b/i.exec(text);
  const status = Number(answered?.[1] ?? answered?.[2]);
  if (status) {
    const said = serviceAnswer(status);
    if (said) return { ...said, cause: `${said.cause}${exhausted}` };
  }
  return undefined;
}
