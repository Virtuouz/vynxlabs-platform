import type { PageWidget } from "@volvel/manifest";
import { Button } from "@volvel/ui";
import { type Edit, manyOf, type PageContext, tableOf } from "./records.ts";
import { rowClickOffer } from "./rowClick.ts";
import { useTableInfo } from "./SampleRecord.tsx";

/**
 * "When a row is clicked" (board 3), beside the inspector of a table or list
 * that does nothing yet when a row is: open the record's detail, or make one.
 * The inspector's Actions tab can draw the same offer by calling
 * `rowClickOffer`; this is the builder's own copy of it until it does.
 */
export function RowClickOffer({
  root,
  widget,
  context,
  onApply,
}: {
  root: string;
  widget: PageWidget;
  context: PageContext;
  onApply: (edit: Edit, label: string) => void;
}) {
  const name = tableOf(widget);
  const info = useTableInfo(root, name);
  const offer = rowClickOffer(context, widget, info);
  if (!offer || !name) return null;
  return (
    <section
      aria-label="When a row is clicked"
      className="mb-4 flex flex-col gap-2 rounded-panel border border-line bg-sunken p-3"
    >
      <h3 className="m-0 text-label text-ink-subtle uppercase">When a row is clicked</h3>
      <p className="m-0 text-body-sm text-ink-muted">
        Nothing happens yet.{" "}
        {offer.made
          ? `This makes a side sheet that shows the ${manyOf(name)} row clicked, with its fields and the row's actions.`
          : "Passes the clicked row along, in the side sheet that shows it."}
      </p>
      <div>
        <Button size="small" onClick={() => onApply(offer.edit, `making rows open their detail`)}>
          {offer.label}
        </Button>
      </div>
    </section>
  );
}
