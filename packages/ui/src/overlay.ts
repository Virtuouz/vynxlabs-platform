import { createContext, useContext } from "react";

/**
 * Whether what is drawn sits inside an open `Dialog` or `SideSheet`. A modal makes everything
 * outside it inert, so anything that would open over the page (the help panel) must show its
 * words inside the modal instead.
 */
export const InOverlay = createContext(false);

export function useInOverlay(): boolean {
  return useContext(InOverlay);
}
