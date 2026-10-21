import { useState } from "react";

import { applyThemeChoice, readThemeChoice, saveThemeChoice, THEME_CHOICES, type ThemeChoice } from "./theme";

const LABELS: Readonly<Record<ThemeChoice, string>> = { system: "system", light: "light", dark: "dark" };

function nextChoice(choice: ThemeChoice): ThemeChoice {
  const index = THEME_CHOICES.indexOf(choice);
  return THEME_CHOICES[(index + 1) % THEME_CHOICES.length] ?? "system";
}

// The 44 x 44 half-circle button of the top bar (docs/design/cockpit-v2 Main.dc.html): each press steps through
// system, light and dark. The current choice and the next one are in its accessible name, so the icon is never
// the only carrier of the state.
export function ThemeToggle() {
  const [choice, setChoice] = useState<ThemeChoice>(() => readThemeChoice());
  const next = nextChoice(choice);
  return (
    <button
      type="button"
      className="ui-icon-button ui-theme-toggle"
      data-theme-choice={choice}
      aria-label={`Switch theme: now ${LABELS[choice]}, next ${LABELS[next]}`}
      onClick={() => {
        setChoice(next);
        applyThemeChoice(next);
        saveThemeChoice(next);
      }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true" focusable="false">
        <circle cx="12" cy="12" r="8" />
        <path d="M12 4v16A8 8 0 0012 4z" fill="currentColor" />
      </svg>
    </button>
  );
}
