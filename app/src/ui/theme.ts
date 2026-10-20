// Manual theme choice on top of prefers-color-scheme. "system" removes the attribute so the media query in
// theme.css decides. The choice is a per-viewer convenience kept in localStorage; every access is wrapped
// because the accessor can throw (private window, blocked site data) and the page must render without it.

export type ThemeChoice = "system" | "light" | "dark";

export const THEME_STORAGE_KEY = "xo-cockpit.theme";
export const THEME_CHOICES: readonly ThemeChoice[] = ["system", "light", "dark"];

export function isThemeChoice(value: unknown): value is ThemeChoice {
  return value === "system" || value === "light" || value === "dark";
}

export function readThemeChoice(): ThemeChoice {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeChoice(stored) ? stored : "system";
  } catch {
    return "system";
  }
}

export function applyThemeChoice(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (choice === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", choice);
}

export function saveThemeChoice(choice: ThemeChoice): void {
  try {
    if (choice === "system") window.localStorage.removeItem(THEME_STORAGE_KEY);
    else window.localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    // Not persisted; the choice still applies for this page view.
  }
}

// Called once from main.tsx before the first render so there is no flash of the wrong theme.
export function initTheme(): ThemeChoice {
  const choice = readThemeChoice();
  applyThemeChoice(choice);
  return choice;
}
