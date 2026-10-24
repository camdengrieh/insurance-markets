import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import { AccountChip } from "./features/account/AccountChip";
import { Dock } from "./features/terminal/Dock";
import { WalletChip } from "./features/wallet/WalletChip";
import { startPageSession } from "./session";
import { initTheme } from "./ui/theme";
import { takePairingFragment } from "./ui/pairing-fragment";
import "./ui/theme.css";
import "./ui/components.css";

// Entry point of both builds (import.meta.env.MODE is "standalone" or "cockpit"). Order matters:
//   1. remove a #pair= fragment from the address bar before anything reads the location;
//   2. apply the saved theme before the first paint;
//   3. start the Cockpit session (exchange the pairing code, if the page was opened with one);
//   4. render: the shell with the trading account chip and the wallet chip in its top bar and the terminal dock in its
//      footer. The dock says whether the page is paired; the wallet chip opens the Connect modal, the account chip the
//      trading account panel (hosted build only; it renders nothing in the Cockpit build).
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
      <App
        topBarEnd={
          <>
            <AccountChip />
            <WalletChip />
          </>
        }
        dock={<Dock session={session} />}
      />
    </StrictMode>,
  );
}
