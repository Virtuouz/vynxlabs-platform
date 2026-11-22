import type { PageWidget } from "@volvel/manifest";
import { Button, CheckboxField, Dialog } from "@volvel/ui";
import { useState } from "react";
import { GROUP_MAX } from "./records.ts";

const labelOf = (button: PageWidget) => String(button.config?.label ?? button.title ?? button.id);

/**
 * "Group with other buttons…": the page's other buttons, with the ones on the same row
 * checked first. Confirming makes one Action group of them and this button, at the place
 * of the first.
 */
export function GroupButtonsDialog({
  open,
  onClose,
  button,
  others,
  onGroup,
}: {
  open: boolean;
  onClose: () => void;
  button: PageWidget;
  /** The other buttons that can join it, those on its row first. */
  others: readonly PageWidget[];
  onGroup: (ids: string[]) => void;
}) {
  const onRow = (one: PageWidget) =>
    one.at.y < button.at.y + button.at.h && button.at.y < one.at.y + one.at.h;
  // Asked afresh each time the dialog is opened: it is mounted for the asking.
  const [chosen, setChosen] = useState<string[]>(() => others.filter(onRow).map((one) => one.id));
  const room = GROUP_MAX - 1;
  const full = chosen.length >= room;
  return (
    <Dialog open={open} onClose={onClose} title="Group with other buttons">
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (chosen.length > 0) onGroup([button.id, ...chosen]);
        }}
      >
        <p className="m-0 text-body-sm text-ink-muted">
          The buttons become one Action group, a toolbar, where <strong>{labelOf(button)}</strong>{" "}
          is. Each keeps its label, its look and what it does.
        </p>
        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className="mb-1 text-label text-ink-subtle uppercase">
            Buttons to group with
          </legend>
          {others.map((one) => (
            <CheckboxField
              key={one.id}
              name={`group-${one.id}`}
              label={`${labelOf(one)}${onRow(one) ? " (on the same row)" : ""}`}
              checked={chosen.includes(one.id)}
              disabled={full && !chosen.includes(one.id)}
              onChange={(on) =>
                setChosen((before) =>
                  on ? [...before, one.id] : before.filter((id) => id !== one.id),
                )
              }
            />
          ))}
        </fieldset>
        {full ? (
          <p className="m-0 text-body-sm text-ink-muted">
            A group holds at most {GROUP_MAX} buttons.
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button variant="quiet" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={chosen.length === 0}>
            Group the buttons
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
