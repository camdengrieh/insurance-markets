import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import { SessionStatus } from "./SessionStatus";
import { startPageSession } from "./session";
import { appModeFromEnv } from "./ui";
import { initTheme } from "./ui/theme";
import { takePairingFragment } from "./ui/pairing-fragment";
import "./ui/theme.css";
import "./ui/components.css";

// Entry point of both builds (import.meta.env.MODE is "standalone" or "cockpit"). Order matters:
//   1. remove a #pair= fragment from the address bar before anything reads the location;
//   2. apply the saved theme before the first paint;
//   3. start the Cockpit session (exchange the pairing code, if the page was opened with one);
//   4. render.
// Nothing else happens at load: apart from that one exchange, no request is made until a screen asks for data.
takePairingFragment();
initTheme();
const session = startPageSession();

const element = document.getElementById("root");
if (element === null) {
  document.body.textContent = "The app could not start: the page has no #root element.";
} else {
  createRoot(element).render(
    <StrictMode>
      <App statusBar={appModeFromEnv() === "cockpit" ? <SessionStatus session={session} /> : undefined} />
    </StrictMode>,
  );
}
