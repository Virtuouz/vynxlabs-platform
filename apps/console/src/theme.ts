import { useEffect, useState } from "react";

const href = (tenantId: string) => `/api/v1/tenants/${tenantId}/theme.css`;
const find = (tenantId: string) =>
  [...document.head.querySelectorAll<HTMLLinkElement>("link[data-tenant-theme]")].find(
    (link) => link.dataset.tenantTheme === tenantId,
  );

/**
 * Shows the console in a tenant's colours while one of its screens is open. The
 * tenant's stylesheet is loaded after the kit's own, so its values replace the
 * kit's, and it is taken away again on leaving the tenant.
 */
export function useTenantTheme(tenantId: string | undefined) {
  useEffect(() => {
    if (!tenantId) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href(tenantId);
    link.dataset.tenantTheme = tenantId;
    document.head.append(link);
    return () => link.remove();
  }, [tenantId]);
}

/** Loads the tenant's stylesheet again after its theme was saved. The browser may keep the old one for a minute otherwise. */
export function refreshTenantTheme(tenantId: string) {
  const link = find(tenantId);
  if (link) link.href = `${href(tenantId)}?saved=${Date.now()}`;
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
