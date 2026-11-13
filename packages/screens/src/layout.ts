import type { PageWidget } from "@vynxlabs/manifest";

type Box = PageWidget["at"];

const overlap = (a: Box, b: Box) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/**
 * Makes room for a widget that was just moved, stretched or added: every
 * widget it now lies on is pushed down until nothing overlaps, and then each
 * of the others rises as far as it can, so the page has no holes a person did
 * not make. The widget that was moved stays where it was put.
 *
 * Changes the widgets it is given.
 */
export function settle(widgets: PageWidget[], moved: string | undefined): void {
  const pinned = widgets.find((widget) => widget.id === moved);
  // From the top down, so that what is pushed pushes what is under it in turn.
  const rest = widgets
    .filter((widget) => widget !== pinned)
    .sort((a, b) => a.at.y - b.at.y || a.at.x - b.at.x);
  const placed: PageWidget[] = pinned ? [pinned] : [];
  for (const widget of rest) {
    // As high as it will go without lying on anything already placed.
    let y = 0;
    for (;;) {
      const under = placed.find((other) => overlap({ ...widget.at, y }, other.at));
      if (!under) break;
      y = under.at.y + under.at.h;
    }
    widget.at.y = Math.min(199, y);
    placed.push(widget);
  }
}
