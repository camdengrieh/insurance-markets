import { ErrorTile, Tile, type TileHeading } from "../../ui";
import { PAIR_REASON_TEXT } from "./session";
import type { Pairing } from "./usePairing";

// The one tile that says why the page is not paired, in fixed words (dapp-design 5.4). Shown once per host: the
// dock renders it at the top of its panel, and a screen mounted on its own renders its own.

export const EXPIRED_TEXT = "The daemon no longer accepts this page's session (it expired, or the daemon restarted). Reload the page to have the daemon print a fresh pair link.";

export function PairingNotice({ pairing, heading = "h2" }: { readonly pairing: Pairing; readonly heading?: TileHeading }) {
  if (pairing.phase === "ready") return null;
  if (pairing.phase === "checking") {
    return (
      <Tile tone="info" title="Connecting to the daemon" heading={heading} dataKind="pairing" dataCode="checking">
        <p>Checking whether this page already has a session.</p>
      </Tile>
    );
  }
  const text = pairing.phase === "expired" ? EXPIRED_TEXT : PAIR_REASON_TEXT[pairing.reason];
  return <ErrorTile code="NOT_PAIRED" title="Not paired with the daemon" message={text} heading={heading} />;
}
