/** What the input a person or a program gave was refused for, in one sentence. */
export function inputWords(issues: readonly { path: string; message: string }[]): string {
  const missing: string[] = [];
  const other: string[] = [];
  for (const issue of issues) {
    const named = /^must have required property '([^']+)'$/.exec(issue.message);
    if (named?.[1]) missing.push(named[1]);
    else other.push(`${issue.path.replace(/^\/input\/?/, "") || "the input"} ${issue.message}`);
  }
  const needs =
    missing.length === 0
      ? []
      : [
          `It needs ${missing.length > 1 ? `${missing.slice(0, -1).join(", ")} and ` : ""}${missing.at(-1)}`,
        ];
  return `${[...needs, ...other.slice(0, 3)].join("; ")}.`;
}
