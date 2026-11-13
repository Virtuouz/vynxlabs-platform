import type { ReactNode } from "react";

export interface Fact {
  label: string;
  value: ReactNode;
  /** Shows the value in the code font: an ID, a path, a hash. */
  code?: boolean;
}

/** Short facts about one thing, as labels and values in columns. An empty value is left out. */
export function Facts({ facts, columns = 4 }: { facts: readonly Fact[]; columns?: 2 | 3 | 4 }) {
  const shown = facts.filter(
    (fact) => fact.value !== undefined && fact.value !== null && fact.value !== "",
  );
  const grid = { 2: "", 3: "md:grid-cols-3", 4: "md:grid-cols-2 xl:grid-cols-4" }[columns];
  return (
    <dl
      className={`m-0 grid grid-cols-1 gap-x-6 gap-y-2 rounded-control border border-line p-3 ${grid}`}
    >
      {shown.map((fact) => (
        <div key={fact.label} className="flex min-w-0 items-baseline gap-3">
          <dt className="w-16 shrink-0 text-[12.5px] text-ink-muted">{fact.label}</dt>
          <dd
            className={`m-0 min-w-0 truncate text-[13px] ${fact.code ? "font-mono text-[12.5px]" : ""}`}
          >
            {fact.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
