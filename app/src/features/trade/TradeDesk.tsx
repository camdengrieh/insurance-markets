import { useEffect, useMemo, useState } from "react";

import { checkEvmAddress } from "../../core/address";
import type { CapabilityFacts } from "../../core/capabilities";
import { Disclosure, ErrorTile, Field, NeedsCockpitTile, Tile, UntrustedText, useAppMode, type TileHeading } from "../../ui";
import { untrustedField } from "../../core/untrusted";
import { PAIR_REASON_TEXT } from "../terminal/session";
import { usePairing, type Pairing } from "../terminal/usePairing";
import { AccountPanel, flagViewOf } from "./AccountPanel";
import { OrderPanel, type TokenChoice } from "./ActionPanels";
import { ActionPanelsInOrder } from "./ActionPanelsInOrder";
import { ClobOrderPanel } from "./ClobOrderPanel";
import type { ClobMarketFacts } from "./clob-ticket";
import { KeyValues, Mono } from "./components";
import type { PanelContext } from "./context";
import { mergeFacts, type GateInput } from "./facts";
import { useAccount } from "./hooks";
import { useTradeServices, type OwnerChoice, type TradeServices } from "./services";

// The trade desk: read the account, then prepare one thing at a time (deploy and enable trading, an order, a
// redeem, a funding step, a revoke) and show the checked result. It signs nothing and sends nothing; what it
// produces is a prepared item and a hand-off for an agent. Every write path is OFF at the daemon until the operator
// switches it on, and every capability it depends on reads "unproven" until a live test has recorded it as "yes".
//
// There is no Trade screen any more: the market modal of the Markets surface hosts the desk for an XO market in the
// Cockpit build (`panels: "order"` with the market's own outcome tokens as the choices), or for a Polymarket or
// Limitless market (`clobMarket`: the venue ticket, signed by the wallet itself), and the full set of panels
// is still available to any host that asks for `panels: "all"`. The host says which heading level the desk's
// sections sit at (`heading`): h2 on a page of its own, h4 inside the market modal's "Order ticket" section.
//
// In the market modal (`panels: "order"`) the desk is the design's one-line ticket (Market.dc.html): the bar first,
// then everything secondary (what this page does and does not do, the owner chooser, the account or maker panel)
// under one disclosure, still in the page and still read by a screen reader. Not paired, the pairing notice takes the
// bar's place: it is the reason there is no bar.
//
// The standalone build has no daemon, and the desk says it needs the Cockpit there. A market's order ticket in that
// build is the trading account's one ticket (direct/TradeTicket), which the market modal hosts itself.
//
// Pairing is the page's one shared hook (features/terminal/usePairing), the same the dock and the inspector use, so
// the desk never holds a pairing state of its own that could disagree with the strip.

// The desk's sections and the tiles inside them: one level below the host's heading.
export type DeskHeading = "h2" | "h4";

function below(heading: DeskHeading): TileHeading {
  return heading === "h2" ? "h3" : "h4";
}

function PairingNotice({ pairing, heading }: { readonly pairing: Pairing; readonly heading: TileHeading }) {
  if (pairing.phase === "ready") return null;
  if (pairing.phase === "checking") {
    return (
      <Tile tone="info" title="Connecting to the daemon" dataKind="pairing" dataCode="checking" heading={heading}>
        <p>Checking whether this page already has a session.</p>
      </Tile>
    );
  }
  const text = pairing.phase === "expired" ? "The daemon no longer accepts this page's session (it expired, or the daemon restarted). Reload the page to have the daemon print a fresh pair link." : PAIR_REASON_TEXT[pairing.reason];
  return <ErrorTile code="NOT_PAIRED" title="Not paired with the daemon" message={text} heading={heading} />;
}

const SAVED = "saved:";
const OTHER = "other";

// Which owner address the screen asks about. A saved address is used as saved; a pasted one goes through the same
// checks as the address book (checksum, look-alike). A look-alike is not accepted until it is confirmed.
function OwnerChooser({ owners, onOwner, heading }: { readonly owners: readonly OwnerChoice[]; readonly onOwner: (address: string | null) => void; readonly heading: DeskHeading }) {
  const Heading = heading;
  const [choice, setChoice] = useState<string>(owners[0] === undefined ? OTHER : `${SAVED}${owners[0].id}`);
  const [pasted, setPasted] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const saved = useMemo(() => owners.map((owner) => ({ id: owner.id, address: owner.address })), [owners]);
  const check = useMemo(() => (pasted.trim() === "" ? null : checkEvmAddress(pasted, saved, { role: "wallet" })), [pasted, saved]);

  const picked = choice.startsWith(SAVED) ? (owners.find((owner) => `${SAVED}${owner.id}` === choice)?.address ?? null) : check !== null && check.ok && (!check.needsConfirmation || confirmed) ? check.address : null;
  useEffect(() => onOwner(picked), [picked, onOwner]);

  return (
    <section className="tr-section" aria-labelledby="tr-owner-h" data-testid="owner">
      <Heading id="tr-owner-h">Owner address</Heading>
      <p>The wallet that owns the XO account. The account itself is derived from it here and checked against every answer; it is never typed.</p>
      <Field label="Owner">
        {(id) => (
          <select id={id} className="ui-select" value={choice} onChange={(event) => setChoice(event.target.value)}>
            {owners.map((owner) => (
              <option key={owner.id} value={`${SAVED}${owner.id}`}>
                {`Saved: ${owner.address.slice(0, 6)}…${owner.address.slice(-4)}`}
              </option>
            ))}
            <option value={OTHER}>Another address</option>
          </select>
        )}
      </Field>
      {choice.startsWith(SAVED) ? (
        <ul className="tr-owners" aria-label="Saved owner label">
          {owners
            .filter((owner) => `${SAVED}${owner.id}` === choice)
            .map((owner) => (
              <li key={owner.id}>
                <UntrustedText value={untrustedField("generic", owner.label)} field="generic" /> <code className="tr-mono">{owner.address}</code>
              </li>
            ))}
        </ul>
      ) : (
        <>
          <Field label="Paste the owner address (0x…)">{(id) => <input id={id} className="ui-input" autoComplete="off" spellCheck={false} value={pasted} onChange={(event) => { setPasted(event.target.value); setConfirmed(false); }} />}</Field>
          {check === null ? null : !check.ok ? (
            <p role="alert">{check.message}</p>
          ) : (
            <div>
              {check.warnings.map((warning) => (
                <p key={warning.code} role="note">
                  {warning.message}
                </p>
              ))}
              {check.needsConfirmation ? (
                <label className="tr-check">
                  <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /> I have compared the full address <code className="tr-mono">{check.address}</code> and it is the one I mean.
                </label>
              ) : null}
            </div>
          )}
        </>
      )}
    </section>
  );
}

export interface TradeDeskProps {
  readonly services?: TradeServices;
  // "all": every prepare panel in order. "order": the order ticket only (the market modal).
  readonly panels?: "all" | "order";
  // A Polymarket or Limitless market: the venue ticket (ClobOrderPanel) instead of the XO one, built against these
  // market facts. Absent for XO.
  readonly clobMarket?: ClobMarketFacts;
  // The outcome tokens of the market the desk is opened for; the ticket offers them as a choice instead of a typed id.
  readonly tokenChoices?: readonly TokenChoice[];
  // The heading level of the desk's sections: h2 on a page of its own (the default), h4 inside the market modal.
  readonly heading?: DeskHeading;
}

// The maker on a CLOB venue is the owner wallet itself: a small panel in place of the XO account one.
function MakerPanel({ owner, venue, flagOn, heading }: { readonly owner: string | null; readonly venue: ClobMarketFacts["venue"]; readonly flagOn: boolean | null; readonly heading: DeskHeading }) {
  const Heading = heading;
  const flag = venue === "polymarket" ? "ENABLE_CLOB_POLYMARKET" : "ENABLE_CLOB_LIMITLESS";
  return (
    <section className="tr-section" aria-labelledby="tr-maker-h" data-testid="maker">
      <Heading id="tr-maker-h">Maker wallet</Heading>
      <p>On this venue the wallet itself is the maker and the signer: no account is derived, and the typed data PayBox shows is the order.</p>
      <KeyValues
        rows={[
          { label: "Maker", value: owner === null ? "choose an owner address" : <Mono>{owner}</Mono> },
          { label: `Venue switch ${flag}`, value: flagOn === null ? "not read yet" : flagOn ? "on (plugin and relay)" : "off" },
        ]}
      />
    </section>
  );
}

export function TradeDesk({ services: provided, panels = "all", tokenChoices, clobMarket, heading = "h2" }: TradeDeskProps) {
  const mode = useAppMode();
  const fallback = useTradeServices();
  const services = provided ?? fallback;
  const { pairing } = usePairing(services, mode);
  const [owners, setOwners] = useState<readonly OwnerChoice[] | null>(null);
  const [owner, setOwner] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void services.loadOwners().then((list) => {
      if (!cancelled) setOwners(list);
    });
    return () => {
      cancelled = true;
    };
  }, [services]);

  const ready = mode === "cockpit" && pairing.phase === "ready";
  const { state, refresh } = useAccount(services, owner, ready);
  const account = state.phase === "done" && state.value.ok ? state.value.data : null;
  // A fresh daemon answer replaces the recorded facts only by agreeing with them: "no" from either side wins.
  const facts: CapabilityFacts = useMemo(() => mergeFacts(services.facts(), account?.capabilities ?? null), [services, account]);
  const gateInput: GateInput = useMemo(
    () => ({ hasOwner: owner !== null, paired: ready, accountRead: account !== null, kill: account?.kill_switch ?? null, flags: flagViewOf(account), facts }),
    [owner, ready, account, facts],
  );
  const ctx: PanelContext = useMemo(() => ({ services, owner, account, facts, gateInput, refreshAccount: refresh }), [services, owner, account, facts, gateInput, refresh]);

  if (mode !== "cockpit") {
    // The standalone build: the desk prepares through the local daemon, which this build has none of.
    return <NeedsCockpitTile what="the trade desk, which prepares items through the local daemon" heading={below(heading)} />;
  }
  const clobFlag = clobMarket === undefined ? null : clobMarket.venue === "polymarket" ? "ENABLE_CLOB_POLYMARKET" : "ENABLE_CLOB_LIMITLESS";
  const flagView = flagViewOf(account);
  const clobFlagOn = clobFlag === null || flagView === null ? null : flagView.plugin?.[clobFlag] === true && flagView.relay?.[clobFlag] === true;
  const intro = (
    <Tile tone="info" title="This page prepares. It never signs and never sends." role="note" dataKind="trade-intro" heading={below(heading)}>
      <p>
        Everything here ends in a checked, prepared item and a hand-off for your agent. You approve it in PayBox; your agent sends it while you hold an ARM window open. All write paths are off until the operator switches them on, and each
        action names the live tests it still depends on as &quot;unproven&quot;. Creating markets is not offered.
      </p>
    </Tile>
  );
  const ownerAndAccount =
    !ready || owners === null ? null : (
      <>
        <OwnerChooser owners={owners} onOwner={setOwner} heading={heading} />
        {clobMarket === undefined ? <AccountPanel state={state} facts={facts} onRefresh={refresh} heading={heading} /> : <MakerPanel owner={owner} venue={clobMarket.venue} flagOn={clobFlagOn} heading={heading} />}
      </>
    );

  if (panels === "order") {
    return (
      <div className="tr-root tr-compact">
        {!ready ? (
          <PairingNotice pairing={pairing} heading={below(heading)} />
        ) : owners === null ? (
          <p role="status">Loading saved addresses.</p>
        ) : owner === null ? (
          <p role="note">Choose an owner address to see what can be prepared: open &quot;Account and safety notes&quot; below.</p>
        ) : clobMarket !== undefined ? (
          <ClobOrderPanel ctx={ctx} facts={clobMarket} tokenChoices={tokenChoices} heading={heading} layout="compact" />
        ) : (
          <OrderPanel ctx={ctx} tokenChoices={tokenChoices} heading={heading} layout="compact" />
        )}
        <Disclosure summary="Account and safety notes">
          <div className="ui-stack">
            {intro}
            {ownerAndAccount}
          </div>
        </Disclosure>
      </div>
    );
  }

  return (
    <div className="tr-root ui-stack">
      {intro}
      <PairingNotice pairing={pairing} heading={below(heading)} />
      {!ready ? null : owners === null ? (
        <p role="status">Loading saved addresses.</p>
      ) : (
        <>
          {ownerAndAccount}
          {owner === null ? (
            <p>Choose an owner address to see what can be prepared.</p>
          ) : clobMarket !== undefined ? (
            <ClobOrderPanel ctx={ctx} facts={clobMarket} tokenChoices={tokenChoices} heading={heading} />
          ) : (
            <ActionPanelsInOrder ctx={ctx} heading={heading} />
          )}
        </>
      )}
    </div>
  );
}
