/**
 * What a change to a resource does, in a few plain sentences: "Adds the step
 * approve (an approval: Approve a large order)". For people deciding whether to
 * deploy or promote. It reads the two bodies and never anything else, so it is
 * the same wherever it is asked.
 */

type Body = Record<string, unknown> | null | undefined;

const MAX_SENTENCES = 8;

const list = (names: string[]) =>
  names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

const STEP: Record<string, string> = {
  trigger: "a trigger",
  script: "a script step",
  branch: "a branch",
  set: "a step that sets values",
  foreach: "a step for each item",
  join: "a join",
  delay: "a wait",
  approval: "an approval",
  subflow: "a step that runs a flow",
  respond: "a reply to the request",
  fail: "a step that fails the run",
};

function describeStep(node: Record<string, unknown>): string {
  const kind = STEP[String(node.type)] ?? String(node.type);
  const detail =
    node.type === "approval"
      ? String(node.title ?? "")
      : node.type === "script"
        ? String(node.script ?? "")
        : node.type === "trigger"
          ? String((node.trigger as { type?: string } | undefined)?.type ?? "")
          : node.type === "delay"
            ? `${node.seconds}s`
            : "";
  return detail ? `${kind}: ${detail}` : kind;
}

function describeFlow(before: Body, after: Body): string[] {
  const was = (before?.nodes ?? {}) as Record<string, Record<string, unknown>>;
  const now = (after?.nodes ?? {}) as Record<string, Record<string, unknown>>;
  const out: string[] = [];
  for (const id of Object.keys(now).filter((id) => !(id in was)))
    out.push(`Adds the step ${id} (${describeStep(now[id] as Record<string, unknown>)}).`);
  for (const id of Object.keys(was).filter((id) => !(id in now)))
    out.push(`Removes the step ${id}.`);
  for (const id of Object.keys(now).filter((id) => id in was)) {
    const a = was[id] as Record<string, unknown>;
    const b = now[id] as Record<string, unknown>;
    if (a.type !== b.type) out.push(`Makes ${id} ${describeStep(b)}.`);
    else if (!same(a, b)) {
      const fields = Object.keys({ ...a, ...b }).filter(
        (key) => key !== "type" && !same(a[key], b[key]),
      );
      out.push(`Changes ${list(fields)} of the step ${id}.`);
    }
  }
  const edges = (body: Body) =>
    new Set(
      ((body?.edges ?? []) as { from: string; to: string; error?: boolean }[]).map(
        (edge) => `${edge.from} → ${edge.to}${edge.error ? " on error" : ""}`,
      ),
    );
  const [ea, eb] = [edges(before), edges(after)];
  const added = [...eb].filter((edge) => !ea.has(edge));
  const removed = [...ea].filter((edge) => !eb.has(edge));
  if (added.length) out.push(`Connects ${list(added)}.`);
  if (removed.length) out.push(`Disconnects ${list(removed)}.`);
  if (!same(before?.description, after?.description)) out.push("Changes what it says it does.");
  return out;
}

function describeScript(before: Body, after: Body): string[] {
  const out: string[] = [];
  const code = (body: Body) => (body?.source as { code?: string } | undefined)?.code;
  if (!same(code(before), code(after))) {
    const lines = (text: string | undefined) => (text ?? "").split("\n").length;
    const delta = lines(code(after)) - lines(code(before));
    out.push(
      `Changes its code${delta === 0 ? "" : delta > 0 ? ` (${delta} more lines)` : ` (${-delta} fewer lines)`}.`,
    );
  }
  const uses = (body: Body, kind: string) =>
    ((body?.uses as Record<string, string[]> | undefined)?.[kind] ?? []) as string[];
  for (const [kind, noun] of [
    ["connections", "connection"],
    ["secrets", "secret"],
    ["variables", "variable"],
    ["tables", "table"],
  ] as const) {
    const a = uses(before, kind);
    const b = uses(after, kind);
    const gained = b.filter((name) => !a.includes(name));
    const lost = a.filter((name) => !b.includes(name));
    if (gained.length)
      out.push(`Now uses the ${noun}${gained.length > 1 ? "s" : ""} ${list(gained)}.`);
    if (lost.length)
      out.push(`No longer uses the ${noun}${lost.length > 1 ? "s" : ""} ${list(lost)}.`);
  }
  if (!same(before?.timeoutSeconds, after?.timeoutSeconds))
    out.push(`Gives up after ${after?.timeoutSeconds}s instead of ${before?.timeoutSeconds}s.`);
  const retries = (body: Body) => (body?.retries as { limit?: number } | undefined)?.limit ?? 0;
  if (retries(before) !== retries(after))
    out.push(`Tries again ${retries(after)} times instead of ${retries(before)}.`);
  if (!same(before?.input, after?.input)) out.push("Changes the input it takes.");
  if (!same(before?.description, after?.description)) out.push("Changes what it says it does.");
  return out;
}

function describeTable(before: Body, after: Body): string[] {
  const was = (before?.columns ?? {}) as Record<string, Record<string, unknown>>;
  const now = (after?.columns ?? {}) as Record<string, Record<string, unknown>>;
  const out: string[] = [];
  const added = Object.keys(now).filter((name) => !(name in was));
  const removed = Object.keys(was).filter((name) => !(name in now));
  const changed = Object.keys(now).filter((name) => name in was && !same(was[name], now[name]));
  if (added.length) out.push(`Adds the column${added.length > 1 ? "s" : ""} ${list(added)}.`);
  if (removed.length)
    out.push(
      `Retires the column${removed.length > 1 ? "s" : ""} ${list(removed)}; their data is kept.`,
    );
  if (changed.length)
    out.push(`Changes the column${changed.length > 1 ? "s" : ""} ${list(changed)}.`);
  if (!same(before?.policy, after?.policy)) out.push("Changes who sees which rows.");
  return out;
}

function describeInterface(before: Body, after: Body): string[] {
  const pages = (body: Body) =>
    (body?.pages ?? []) as { id: string; title?: string; widgets?: { id: string }[] }[];
  const [a, b] = [pages(before), pages(after)];
  const out: string[] = [];
  const added = b.filter((page) => !a.some((one) => one.id === page.id));
  const removed = a.filter((page) => !b.some((one) => one.id === page.id));
  if (added.length)
    out.push(
      `Adds the page${added.length > 1 ? "s" : ""} ${list(added.map((page) => page.title ?? page.id))}.`,
    );
  if (removed.length)
    out.push(
      `Removes the page${removed.length > 1 ? "s" : ""} ${list(removed.map((page) => page.title ?? page.id))}.`,
    );
  for (const page of b) {
    const old = a.find((one) => one.id === page.id);
    if (!old || same(old, page)) continue;
    const count = (page.widgets ?? []).length - (old.widgets ?? []).length;
    out.push(
      `Changes the page ${page.title ?? page.id}${count > 0 ? ` (${count} more widgets)` : count < 0 ? ` (${-count} fewer widgets)` : ""}.`,
    );
  }
  return out;
}

function describeGeneric(before: Body, after: Body): string[] {
  const fields = Object.keys({ ...(before ?? {}), ...(after ?? {}) }).filter(
    (key) => !same(before?.[key], after?.[key]),
  );
  return fields.length ? [`Changes ${list(fields)}.`] : [];
}

/**
 * Sentences for one change. `before` is what runs now, or nothing for a new
 * resource; `after` is the draft, or nothing for a removal.
 */
export function describeChange(kind: string, before: Body, after: Body): string[] {
  if (!before && after) {
    if (kind === "flow") {
      const steps = Object.keys((after.nodes ?? {}) as object).length;
      return [`A new flow of ${steps} step${steps === 1 ? "" : "s"}.`];
    }
    if (kind === "table") {
      const columns = Object.keys((after.columns ?? {}) as object);
      return [`A new table with the columns ${list(columns)}.`];
    }
    return [`A new ${kind}.`];
  }
  if (before && !after) {
    return kind === "table"
      ? ["Retires the table. Its rows are kept until someone deletes them for good."]
      : [`Removes the ${kind}.`];
  }
  const said =
    kind === "flow"
      ? describeFlow(before, after)
      : kind === "script" || kind === "connector" || kind === "trigger_source"
        ? describeScript(before, after)
        : kind === "table"
          ? describeTable(before, after)
          : kind === "interface"
            ? describeInterface(before, after)
            : describeGeneric(before, after);
  if (said.length === 0) return ["No change that matters to how it runs."];
  return said.length > MAX_SENTENCES
    ? [...said.slice(0, MAX_SENTENCES - 1), `And ${said.length - MAX_SENTENCES + 1} more changes.`]
    : said;
}
