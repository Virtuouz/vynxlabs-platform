import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";

/**
 * The builder's settings drawer. A setting is a row ("Measure  Sum of Total ›"); pressing it opens
 * a small editor beside it, a dialog titled with the row's label, that "Done" or Escape closes.
 * These find them by their roles and names, as a person does.
 */

/** The row of the drawer whose label is `label` ("Measure", "For each", "Source"). */
export const settingRow = (drawer: Locator, label: string): Locator =>
  drawer
    .getByRole("button", { name: new RegExp(`^${label}(\\s|$)`) })
    // A filter's chip beside a row ("Goal month") is a toggle; a row is not.
    .and(drawer.locator(":not([aria-pressed])"));

/** Opens the editor of a row and returns it; `title` is its name when it is not the row's label. */
export async function openSetting(
  page: Page,
  drawer: Locator,
  label: string,
  title: string = label,
): Promise<Locator> {
  await settingRow(drawer, label).click();
  const editor = page.getByRole("dialog", { name: title, exact: true });
  await expect(editor).toBeVisible();
  return editor;
}

/** Closes an editor with Escape, which gives focus back to its row. */
export async function closeSetting(page: Page, editor: Locator): Promise<void> {
  await page.keyboard.press("Escape");
  await expect(editor).toBeHidden();
}

/**
 * Chooses one of an editor's options (its radio is visually hidden; the option's label is what is
 * pressed), and says that it is now the chosen one.
 */
export async function choose(editor: Locator, name: string | RegExp): Promise<void> {
  const radio = editor.getByRole("radio", { name });
  await radio.locator("xpath=ancestor::label[1]").click();
  await expect(radio).toBeChecked();
}
