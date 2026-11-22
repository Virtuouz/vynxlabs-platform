import { createContext, useContext } from "react";

/**
 * Opens the editor over a widget on the canvas ("Edit on the page"). The page
 * editor provides it while building; the inspector's Markdown control offers
 * the button only where it is there.
 */
export const EditOnPage = createContext<((widgetId: string) => void) | undefined>(undefined);

export const useEditOnPage = () => useContext(EditOnPage);
