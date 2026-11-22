/**
 * The Rules tab's body. Moved out of `Inspector.tsx` so the agent that rebuilds it (board 9,
 * middle) owns one file; the drawer shell draws the tab, the header and the dot around it.
 */
import { SegmentedControl } from "@volvel/ui";
import { Link } from "../../router.tsx";
import { actionContext } from "./actionControls.tsx";
import { type Condition, conditionSentence, firstCondition } from "./actionModel.ts";
import { ConditionsEditor } from "./conditions.tsx";
import type { Env } from "./controls.tsx";
import { heading, visualOf } from "./model.ts";

export function RulesTab({
  env,
  rowRules,
}: {
  env: Env;
  /** Where a table's row rules are changed, if the reader may go there. */
  rowRules: ((table: string) => string) | undefined;
}) {
  const tables = [
    ...new Set(
      Object.values(env.widget.data ?? {}).flatMap((input) => {
        const visual = visualOf(input);
        return visual?.table ? [visual.table] : [];
      }),
    ),
  ];
  const noun = env.surface === "app" ? "app" : "dashboard";
  // A widget's own rules can read the record its page is open on, and no clicked one.
  const ctx = { ...actionContext(env), eventTable: undefined, defaultRef: "this" as const };
  const showWhen = env.widget.rules?.showWhen;
  const setShowWhen = (next: Condition[] | undefined, key?: string) => {
    const { rules: _before, ...rest } = env.widget;
    env.write(
      next && next.length > 0
        ? { ...rest, rules: { ...(env.widget.rules ?? {}), showWhen: next } }
        : rest,
      "changing when it is shown",
      key ? `showWhen:${env.widget.id}` : undefined,
    );
  };
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <span className="text-body-sm font-medium text-ink">Show this widget</span>
        <div>
          <SegmentedControl
            label="Show this widget"
            options={[
              { value: "always", label: "Always" },
              { value: "when", label: "Only when …" },
            ]}
            value={showWhen ? "when" : "always"}
            onChange={(next) => {
              if (next === "always") setShowWhen(undefined);
              else if (!showWhen) setShowWhen([firstCondition(ctx, env.groups)]);
            }}
          />
        </div>
        {showWhen ? (
          <>
            <ConditionsEditor
              id={`${env.widget.id}-show`}
              noun="rule"
              conditions={showWhen}
              ctx={ctx}
              groups={env.groups}
              onChange={(next, key) => setShowWhen(next, key)}
            />
            <p className="m-0 text-body-sm text-ink-muted">
              Shown only when {showWhen.map((one) => conditionSentence(one)).join(" and ")}.
            </p>
          </>
        ) : null}
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-body-sm font-medium text-ink">Who can see it</span>
        <p className="m-0 flex h-control items-center rounded-control border border-line px-3 text-ink-muted">
          Everyone who can open the {noun}
        </p>
      </div>
      <p className="m-0 flex flex-col gap-1 rounded-control border border-line p-3 text-body-sm text-ink-muted">
        <span>
          Hiding a widget isn’t security. What rows each person receives is decided by{" "}
          {tables.length === 0 ? (
            "the row rules of the tables it reads."
          ) : (
            <>the {tables.map((table) => heading(table)).join(" and ")} row rules.</>
          )}
        </span>
        {rowRules
          ? tables.map((table) => (
              <Link
                key={table}
                to={rowRules(table)}
                className="text-action underline underline-offset-2"
              >
                Open row rules{tables.length > 1 ? ` for ${heading(table)}` : ""}
              </Link>
            ))
          : null}
      </p>
    </div>
  );
}
