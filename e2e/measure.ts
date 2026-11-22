import type { Page } from "@playwright/test";

/**
 * Measures of the console's polish (phase 16, P4): how far down a list's first
 * row starts, which text runs over what is beside it, and which bordered boxes
 * sit inside other bordered boxes. Each returns plain data, so a spec can both
 * record a baseline and assert on it.
 */

/**
 * The top, in px from the top of the work area (`main`), of the first row of data in the
 * work area: a table's first body row, a grid's first data row, a list's first
 * item, or the empty state when there is nothing to list. Null when none is shown.
 */
export function firstRowTop(page: Page): Promise<number | null> {
  return page.evaluate(() => {
    const main = document.querySelector("main");
    if (!main) return null;
    const candidates = [
      ...main.querySelectorAll("tbody tr[data-row]"),
      ...main.querySelectorAll(
        '[role="grid"] [role="row"][aria-rowindex]:not([aria-rowindex="1"]), [role="grid"] tbody tr[aria-rowindex]',
      ),
      ...main.querySelectorAll("[data-list] > li, [data-list] > a"),
      ...main.querySelectorAll("[data-empty-state]"),
    ];
    // From the top of the work area: the shell's header, and the operator strip under it, are
    // the console's, not the page's.
    const origin = main.getBoundingClientRect().top;
    const tops = candidates
      .map((element) => element.getBoundingClientRect())
      .filter((box) => box.width > 0 && box.height > 0)
      .map((box) => Math.round(box.top - origin));
    return tops.length > 0 ? Math.min(...tops) : null;
  });
}

/**
 * Text that runs past its own box without being clipped, so that it draws over
 * whatever is beside it. Each finding names the element by its text.
 */
export function overdraws(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const found: string[] = [];
    const roots = [document.querySelector("header"), document.querySelector("main")].filter(
      (root): root is Element => root !== null,
    );
    const clipped = (element: Element) => {
      // Text inside an ancestor that clips cannot draw over a neighbour outside it, but can
      // over one inside it: only the element's own overflow is judged here.
      const style = getComputedStyle(element);
      return style.overflowX !== "visible" || style.textOverflow === "ellipsis";
    };
    for (const root of roots) {
      for (const element of root.querySelectorAll<HTMLElement>("*")) {
        const hasText = [...element.childNodes].some(
          (node) => node.nodeType === Node.TEXT_NODE && (node.textContent ?? "").trim() !== "",
        );
        if (!hasText) continue;
        const box = element.getBoundingClientRect();
        if (box.width === 0 || box.height === 0) continue;
        if (element.closest("[data-preview], .monaco-editor, svg, [aria-hidden='true']")) continue;
        if (clipped(element)) continue;
        if (element.scrollWidth > element.clientWidth + 1 && element.clientWidth > 0) {
          const text = (element.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 60);
          found.push(`"${text}" is ${element.scrollWidth}px wide in ${element.clientWidth}px`);
        }
      }
    }
    return [...new Set(found)];
  });
}

/**
 * Bordered containers inside bordered containers (07 §7.5): block boxes with a
 * border on at least three sides, larger than a control, that have such a box
 * as an ancestor. Theme previews (`data-preview`), a sheet of the kit's samples, each in
 * its own panel (`data-samples`), and dialogs are left out.
 */
export function nested(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const main = document.querySelector("main");
    if (!main) return [];
    const bordered = (element: Element) => {
      // A field, a choice tile (a label around a radio: a control, as a button is), a table's parts, and a recessed well (`data-well`: code, JSON, a log) have a
      // border of their own at any depth (07 §7.5): they are not panels.
      if (
        element.matches(
          "input, select, textarea, button, hr, a, kbd, td, th, tr, table, [data-well], label:has(> input[type=radio], > input[type=checkbox])",
        )
      ) {
        return false;
      }
      const style = getComputedStyle(element);
      if (style.display.startsWith("inline") || style.display === "contents") return false;
      const box = element.getBoundingClientRect();
      if (box.height < 40 || box.width < 120) return false;
      const sides = (["Top", "Right", "Bottom", "Left"] as const).filter((side) => {
        const width = Number.parseFloat(
          style.getPropertyValue(`border-${side.toLowerCase()}-width`),
        );
        const kind = style.getPropertyValue(`border-${side.toLowerCase()}-style`);
        const color = style.getPropertyValue(`border-${side.toLowerCase()}-color`);
        return (
          width > 0 && kind !== "none" && !/rgba\(.*,\s*0\)$/.test(color) && color !== "transparent"
        );
      });
      return sides.length >= 3;
    };
    const name = (element: Element) => {
      const label =
        element.getAttribute("aria-label") ??
        element.querySelector("h1, h2, h3, legend, [data-section-label]")?.textContent ??
        element.textContent ??
        "";
      return label.trim().replace(/\s+/g, " ").slice(0, 50);
    };
    const found: string[] = [];
    for (const element of main.querySelectorAll("*")) {
      if (element.closest("[data-preview], [data-samples], [role='dialog']")) continue;
      if (!bordered(element)) continue;
      let parent = element.parentElement;
      while (parent && parent !== main) {
        if (bordered(parent)) {
          found.push(`"${name(element)}" inside "${name(parent)}"`);
          break;
        }
        parent = parent.parentElement;
      }
    }
    return found;
  });
}
