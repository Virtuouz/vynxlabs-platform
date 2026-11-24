# Run log: develop/how-to/docs/draw-a-diagram.md

- Not run. No page with a diagram was written or served on the instance, so the page is not presented as finished. The steps and keys come from `docs/sdk-guide.md` and `apps/console/src/diagrams/draw.ts`.

## Second check, 2026-11-23 (second agent)

Run on the repository site of the keep-documentation run and on a console-made site, as tenant admin and doc writer.
1. A `mermaid` block in a page: the editor's preview drew it with the three buttons; a wrong block showed "This diagram does not read: Parse error on line 2:" and the source.
2. Saved and deployed: the served page drew it (`.vd-mermaid-drawn`, focusable, a label naming the keys). At 1440 light: ArrowRight, +, -, 0, a drag, Ctrl and the wheel, and a double-click each changed the drawing as the page says; the wheel alone scrolled the page and said "Use Ctrl + scroll to zoom". At 390 dark: the keys worked, no horizontal scroll, and the page read in dark colors.
3. `volvel dev`: the block is shown as its source.
- Seen, not in the page: at 390 px after pressing 0 the leftmost box of the diagram sat against the edge of its frame (the text is small at that width).
- Not run: a reader whose script is off (read in `script.ts`), a diagram too large for the frame.
