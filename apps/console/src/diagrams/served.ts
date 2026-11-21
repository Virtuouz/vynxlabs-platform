import mermaid from "mermaid";
import { drawAll as draw } from "./draw.ts";

/**
 * The script a served page of documentation fetches when it has a diagram:
 * Mermaid, and the instance's own drawing, in one file served from the
 * instance as `/_platform/diagrams.js`. Nothing in it reaches another site.
 */
export function drawAll(root: ParentNode): Promise<void> {
  return draw(root, async () => mermaid);
}
