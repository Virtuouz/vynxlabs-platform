import { useEffect, useState } from "react";
import { readPreference, usePreference } from "./prefs.ts";

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

function stored(): ThemeChoice {
  const value = readPreference<string>("theme", "system");
  return value === "light" || value === "dark" ? value : "system";
}

/** Puts a person's choice of light or dark on the page. "system" leaves it to the browser. */
export function applyThemeChoice(choice: ThemeChoice = stored()) {
  if (choice === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = choice;
}

/** The person's choice of light, dark or the system's, kept with their other settings. */
export function useThemeChoice(): [ThemeChoice, (next: ThemeChoice) => void] {
  const [kept, keep] = usePreference<string>("theme", "system");
  const choice: ThemeChoice = kept === "light" || kept === "dark" ? kept : "system";
  useEffect(() => applyThemeChoice(choice), [choice]);
  return [choice, (next) => keep(next === "system" ? undefined : next)];
}

/** Whether the console is drawn light or dark now: the person's choice, else the browser's. */
export function currentLook(): "light" | "dark" {
  const chosen = document.documentElement.dataset.theme;
  if (chosen === "light" || chosen === "dark") return chosen;
  return typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

/** The look of the console, kept up to date as the person or the browser changes it. */
export function useLook(): "light" | "dark" {
  const [look, setLook] = useState(currentLook);
  useEffect(() => {
    const update = () => setLook(currentLook());
    update();
    const watching = new MutationObserver(update);
    watching.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    const query =
      typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)") : null;
    query?.addEventListener?.("change", update);
    return () => {
      watching.disconnect();
      query?.removeEventListener?.("change", update);
    };
  }, []);
  return look;
}
