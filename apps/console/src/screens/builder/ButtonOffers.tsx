import type { PageWidget } from "@volvel/manifest";
import { Button } from "@volvel/ui";
import { detailActionsOf, groupCandidates } from "./suggest.ts";

/**
 * What a chosen button or record detail offers about its buttons (phase 27), beside the
 * inspector: a button, to be grouped with the page's other buttons; a record detail with
 * actions, to move them to an Action group above it. The inspector's Actions tab can draw
 * the same offers by calling the same helpers; this is the builder's own copy until it does.
 */
export function ButtonOffers({
  widget,
  widgets,
  onGroup,
  onMove,
}: {
  widget: PageWidget;
  widgets: readonly PageWidget[];
  /** Open the dialog that asks which buttons to group with. */
  onGroup: () => void;
  onMove: () => void;
}) {
  if (widget.type === "core/button" && groupCandidates(widgets, widget).length > 0) {
    return (
      <section
        aria-label="Buttons together"
        className="mb-4 flex flex-col gap-2 rounded-panel border border-line bg-sunken p-3"
      >
        <h3 className="m-0 text-label text-ink-subtle uppercase">Buttons together</h3>
        <p className="m-0 text-body-sm text-ink-muted">
          Related buttons read better as one toolbar, an Action group.
        </p>
        <div>
          <Button size="small" onClick={onGroup}>
            Group with other buttons…
          </Button>
        </div>
      </section>
    );
  }
  const actions = detailActionsOf(widget);
  if (actions.length > 0) {
    return (
      <section
        aria-label="Buttons together"
        className="mb-4 flex flex-col gap-2 rounded-panel border border-line bg-sunken p-3"
      >
        <h3 className="m-0 text-label text-ink-subtle uppercase">Buttons together</h3>
        <p className="m-0 text-body-sm text-ink-muted">
          The record's {actions.length === 1 ? "button" : `${actions.length} buttons`} can be a
          toolbar above it, as an Action group.
        </p>
        <div>
          <Button size="small" onClick={onMove}>
            Move these buttons to an Action group above it
          </Button>
        </div>
      </section>
    );
  }
  return null;
}
