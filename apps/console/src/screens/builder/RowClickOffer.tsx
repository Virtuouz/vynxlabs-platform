import type { Page, PageWidget } from "@volvel/manifest";
import type { Edit, PageContext } from "./records.ts";
import { RowClickEditor } from "./RowClickEditor.tsx";

/**
 * "When a row is clicked" (board 3) beside the inspector of a table or list: the
 * `RowClickEditor`, in a panel of its own. The table's drawer places the editor in
 * its Actions section; this is the builder's mount of it until it does.
 */
export function RowClickOffer({
  root,
  widget,
  context,
  onApply,
  onSetPage,
  onEditLayout,
}: {
  root: string;
  widget: PageWidget;
  context: PageContext;
  onApply: (edit: Edit, label: string) => void;
  onSetPage?: (page: Page, label: string) => void;
  onEditLayout?: (page: Page) => void;
}) {
  if (widget.type !== "core/table" && widget.type !== "core/list") return null;
  return (
    <div className="mb-4 rounded-panel border border-line bg-sunken p-3">
      <RowClickEditor
        root={root}
        widget={widget}
        context={context}
        onApply={onApply}
        {...(onSetPage ? { onSetPage } : {})}
        {...(onEditLayout ? { onEditLayout } : {})}
      />
    </div>
  );
}
