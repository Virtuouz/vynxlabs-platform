import { useLoad } from "../api.ts";

interface Reference {
  target: { kind: string; name: string };
  by: { kind: string; path: string };
  how: string;
}

/**
 * Who uses each thing of one kind in a workspace, by its name, worked out
 * from what is deployed. One request for a whole list.
 */
export function useReferences(root: string, kind: string, enabled = true) {
  const found = useLoad<{ items: Reference[] }>(enabled ? `${root}/references?kind=${kind}` : null);
  return (name: string) => (found.data?.items ?? []).filter((one) => one.target.name === name);
}

/** "orders/sync, orders/handle" or a quiet "Nothing deployed uses it". */
export function UsedBy({ uses }: { uses: Reference[] }) {
  if (uses.length === 0) return <span className="text-ink-subtle">Nothing deployed uses it</span>;
  const names = [...new Set(uses.map((one) => one.by.path))];
  return (
    <span
      className="font-mono text-telemetry text-ink-muted"
      title={uses.map((one) => `${one.by.path} ${one.how}`).join("\n")}
    >
      {names.slice(0, 3).join(", ")}
      {names.length > 3 ? ` and ${names.length - 3} more` : ""}
    </span>
  );
}
