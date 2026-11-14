import { useEffect, useState } from "react";

const INSTANCE_THEME = "/api/v1/instance/theme.css";

/**
 * Puts the instance's branding over the console's own look. The operator's
 * stylesheet holds only the values they set, and is loaded after the console's,
 * so those replace the console's and the rest stay. A tenant's branding is for
 * its apps and portal and never reaches the console.
 */
export function loadInstanceTheme() {
  if (document.head.querySelector("link[data-instance-theme]")) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = INSTANCE_THEME;
  link.dataset.instanceTheme = "";
  document.head.append(link);
}

/** Loads the instance's stylesheet again after it was saved. The browser may keep the old one for a minute otherwise. */
export function refreshInstanceTheme() {
  const link = document.head.querySelector<HTMLLinkElement>("link[data-instance-theme]");
  if (link) link.href = `${INSTANCE_THEME}?saved=${Date.now()}`;
}

export type ThemeChoice = "system" | "light" | "dark";
const CHOICE_KEY = "vx-theme";

function stored(): ThemeChoice {
  try {
    const value = localStorage.getItem(CHOICE_KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

/** Puts a person's choice of light or dark on the page. "system" leaves it to the browser. */
export function applyThemeChoice(choice: ThemeChoice = stored()) {
  if (choice === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = choice;
}

/** The person's choice of light, dark or the system's, kept in this browser. */
export function useThemeChoice(): [ThemeChoice, (next: ThemeChoice) => void] {
  const [choice, setChoice] = useState<ThemeChoice>(stored);
  useEffect(() => applyThemeChoice(choice), [choice]);
  return [
    choice,
    (next) => {
      try {
        if (next === "system") localStorage.removeItem(CHOICE_KEY);
        else localStorage.setItem(CHOICE_KEY, next);
      } catch {
        // Private browsing may refuse storage. The choice then lasts for this page.
      }
      setChoice(next);
    },
  ];
}
