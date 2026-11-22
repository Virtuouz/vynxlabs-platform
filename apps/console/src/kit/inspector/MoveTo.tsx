import { Dialog } from "@volvel/ui";

/** Somewhere a widget can be moved to: "The page", a Section, a tab of Tabs ("Views › By status"). */
export interface MovePlace {
  key: string;
  label: string;
}

/**
 * ⋯ › Move to…: the keyboard's way of putting a widget in a Section or a tab, and back on
 * the page. Dragging can't be the only way (WCAG 2.5.7). Choosing a place moves the widget
 * there, and the dialog closes, which gives focus back to where it was opened from.
 */
export function MoveTo({
  open,
  onClose,
  name,
  places,
  onChoose,
}: {
  open: boolean;
  onClose: () => void;
  name: string;
  places: readonly MovePlace[];
  onChoose: (key: string) => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} title={`Move ${name} to`}>
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {places.map((place) => (
          <li key={place.key}>
            <button
              type="button"
              onClick={() => {
                onChoose(place.key);
                onClose();
              }}
              className="w-full rounded-control px-3 py-2 text-left text-ink hover:bg-action-soft"
            >
              {place.label}
            </button>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
