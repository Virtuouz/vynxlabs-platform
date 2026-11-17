import type { InterfacePage } from "@vynxlabs/manifest";
import { heading, type TableInfo } from "@vynxlabs/screens";
import { Button, SelectField, TextField } from "@vynxlabs/ui";
import { Plus } from "lucide-react";

/**
 * Filters across the page for whoever reads it: a range of dates, or one value
 * of a column. Each narrows every widget whose table has that column.
 */
export function PageFilterSettings({
  page,
  known,
  onChange,
}: {
  page: InterfacePage;
  known: Record<string, TableInfo>;
  onChange: (apply: (page: InterfacePage) => void) => void;
}) {
  const columns = [
    ...new Set(
      page.widgets.flatMap((widget) =>
        widget.table ? (known[widget.table]?.columns ?? []).map((column) => column.name) : [],
      ),
    ),
  ].sort();
  const filters = page.filters ?? [];
  return (
    <fieldset className="mt-4 rounded-panel border border-line p-3">
      <legend className="px-1 text-body-sm text-ink-muted">
        Filters for whoever reads this page
      </legend>
      <div className="flex flex-col gap-2">
        {filters.length === 0 ? (
          <p className="m-0 text-body-sm text-ink-muted">
            None. A filter narrows every widget whose table has its column.
          </p>
        ) : null}
        {filters.map((one, index) => (
          <div key={one.id} className="flex flex-wrap items-end gap-2">
            <div className="w-40">
              <TextField
                label="Label"
                name={`filter-${one.id}-label`}
                value={one.label}
                required={false}
                onChange={(value) =>
                  onChange((target) => {
                    const found = target.filters?.[index];
                    if (found) found.label = value || one.column;
                  })
                }
              />
            </div>
            <div className="w-40">
              <SelectField
                label="Column"
                name={`filter-${one.id}-column`}
                value={one.column}
                options={columns.map((name) => ({ value: name, label: name }))}
                onChange={(value) =>
                  onChange((target) => {
                    const found = target.filters?.[index];
                    if (found) found.column = value;
                  })
                }
              />
            </div>
            <div className="w-36">
              <SelectField
                label="Kind"
                name={`filter-${one.id}-type`}
                value={one.type}
                options={[
                  { value: "date", label: "Range of dates" },
                  { value: "value", label: "One value" },
                ]}
                onChange={(value) =>
                  onChange((target) => {
                    const found = target.filters?.[index];
                    if (found) found.type = value === "date" ? "date" : "value";
                  })
                }
              />
            </div>
            <Button
              size="small"
              variant="danger"
              onClick={() => onChange((target) => target.filters?.splice(index, 1))}
            >
              Remove
            </Button>
          </div>
        ))}
        {filters.length < 4 && columns.length > 0 ? (
          <div>
            <Button
              size="small"
              onClick={() =>
                onChange((target) => {
                  const column =
                    columns.find((name) => name.endsWith("_at")) ?? (columns[0] as string);
                  let id = "filter";
                  for (let n = 2; (target.filters ?? []).some((one) => one.id === id); n += 1)
                    id = `filter_${n}`;
                  target.filters = [
                    ...(target.filters ?? []),
                    {
                      id,
                      label: heading(column),
                      column,
                      type: column.endsWith("_at") ? "date" : "value",
                    },
                  ];
                })
              }
            >
              <Plus size={14} aria-hidden="true" /> Add a filter
            </Button>
          </div>
        ) : null}
      </div>
    </fieldset>
  );
}
