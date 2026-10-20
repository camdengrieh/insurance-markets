import { useState } from "react";

import { applyThemeChoice, readThemeChoice, saveThemeChoice, THEME_CHOICES, isThemeChoice, type ThemeChoice } from "./theme";

const LABELS: Readonly<Record<ThemeChoice, string>> = { system: "System", light: "Light", dark: "Dark" };

// A native <select> inside a <label>: keyboard and screen-reader behaviour for free, 44 px tall.
export function ThemeToggle() {
  const [choice, setChoice] = useState<ThemeChoice>(() => readThemeChoice());
  return (
    <label className="ui-field">
      <span className="ui-visually-hidden">Colour theme</span>
      <select
        className="ui-select"
        value={choice}
        onChange={(event) => {
          const next = event.target.value;
          if (!isThemeChoice(next)) return;
          setChoice(next);
          applyThemeChoice(next);
          saveThemeChoice(next);
        }}
      >
        {THEME_CHOICES.map((value) => (
          <option key={value} value={value}>
            {`Theme: ${LABELS[value]}`}
          </option>
        ))}
      </select>
    </label>
  );
}
