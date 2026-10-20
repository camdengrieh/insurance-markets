import { useEffect, useState } from "react";

import { PAIR_REASON_TEXT } from "./features/terminal/session";
import type { PageSessionState } from "./session";
import { Badge } from "./ui";

// The strip under the header in the Cockpit build: whether this page is paired with the daemon, in words. Without it an
// unpaired page shows every venue as "not supported", which is true and tells a person nothing. The standalone build has
// no daemon and shows nothing here. The text is fixed app text; nothing from the daemon is displayed.

export function SessionStatus({ session }: { readonly session: Promise<PageSessionState> }) {
  const [state, setState] = useState<PageSessionState | null>(null);
  useEffect(() => {
    let live = true;
    void session.then((next) => {
      if (live) setState(next);
    });
    return () => {
      live = false;
    };
  }, [session]);

  if (state === null || state.kind === "standalone") return null;
  if (state.kind === "paired") {
    return (
      <p role="status">
        <Badge tone="ok">Paired with the local daemon</Badge> Read and prepare access for this tab. This page cannot submit anything.
        {state.fresh ? "" : " The pairing is from earlier in this tab; if the daemon restarted, reload from a fresh pair link."}
      </p>
    );
  }
  return (
    <p role="alert">
      <Badge tone="warn">Not paired with the daemon</Badge> {PAIR_REASON_TEXT[state.reason]}
    </p>
  );
}
