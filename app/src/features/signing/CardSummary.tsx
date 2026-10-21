import type { ReactNode } from "react";

import type { PreparedDecoded } from "@shared/relay/contract";

import { formatUtc, parseIsoMs } from "../../core/format";
import { Num } from "../../ui";
import type { CardEvaluation, CardPrepared } from "./card";
import { KIND_TEXT } from "./words";

// The card's headline and its facts list (docs/design/cockpit-v2 Signing: "Buy 38 Yes at 0.26 on XO" over a
// two-column body). Both are built from the decoded block alone: closed values (a side, a venue, an action) get
// fixed app words and numbers are shown as the decoded strings, in mono. Nothing here is the relay's text, a market's
// text or a guess: the decoded block names no outcome (Yes or No is the token id, which the page cannot name), so
// the headline says "shares". An item that failed a check gets no decoded headline at all, so a tampered block can
// never put a calm sentence at the top of the card.

const VENUE_NAME: Readonly<Record<string, string>> = Object.freeze({ polymarket: "Polymarket", limitless: "Limitless" });
const VENUE_FACT: Readonly<Record<string, string>> = Object.freeze({ polymarket: "Polymarket, Polygon", limitless: "Limitless, Base" });
const SIDE_WORD: Readonly<Record<string, string>> = Object.freeze({ BUY: "Buy", SELL: "Sell" });

const ACTION_HEADLINE: Readonly<Record<string, string>> = Object.freeze({
  deploy_enable_trading: "Deploy the account and enable trading",
  enable_trading: "Enable trading",
  revoke_trading: "Revoke trading",
  redeem: "Redeem",
  withdraw: "Withdraw",
  create_market: "Create a market",
  respond_update: "Answer an update request",
  cancel_market: "Cancel a market",
});

function kindWords(item: CardPrepared | null): string {
  if (item === null) return "Unreadable item";
  return KIND_TEXT[item.kind] ?? "Prepared item";
}

// The headline, numbers in mono. Fixed words around decoded values only.
export function headlineOf(evaluation: CardEvaluation): ReactNode {
  const { item, decoded, verification } = evaluation;
  if (item === null) return "Unreadable item";
  if (verification === "failed") return `${kindWords(item)} that failed a check: do not sign`;
  if (decoded === null) return `${kindWords(item)}, not decoded here`;
  return decodedHeadline(decoded);
}

function decodedHeadline(decoded: PreparedDecoded): ReactNode {
  switch (decoded.kind) {
    case "order":
      return (
        <>
          {SIDE_WORD[decoded.terms.side] ?? "Trade"} <Num>{decoded.terms.shares}</Num> shares at <Num>{decoded.terms.price}</Num> on XO
        </>
      );
    case "clob_order":
      return (
        <>
          {SIDE_WORD[decoded.terms.side] ?? "Trade"} <Num>{decoded.terms.shares}</Num> shares at <Num>{decoded.terms.price}</Num> on {VENUE_NAME[decoded.venue] ?? "an unlisted venue"}
        </>
      );
    case "auth":
      return "Log in to XO";
    case "clob_auth":
      return `Log in to ${VENUE_NAME[decoded.venue] ?? "an unlisted venue"}`;
    default:
      return `${ACTION_HEADLINE[decoded.action] ?? "An unlisted action"} on XO`;
  }
}

function Fact({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </>
  );
}

function Addr({ value }: { readonly value: string }) {
  return <code className="signing-code">{value}</code>;
}

function When({ iso }: { readonly iso: string }) {
  const ms = parseIsoMs(iso);
  return ms === null ? <span>not readable</span> : <time dateTime={iso}><Num>{formatUtc(ms)}</Num></time>;
}

function Caps({ item, checked }: { readonly item: CardPrepared; readonly checked: boolean }) {
  return (
    <>
      this item counts <Num>{item.caps.reserved_usd}</Num> USD · <Num>{item.caps.day_remaining_usd}</Num> USD left today{" "}
      <span className="signing-muted">{checked ? "(the count checked here, the day figure the relay's)" : "(the relay's figures, not checked here)"}</span>
    </>
  );
}

// The facts column. Without a decoded block there are no facts to derive: the caller shows the relay's own lines.
export function FactsList({ evaluation }: { readonly evaluation: CardEvaluation }) {
  const { item, decoded, verification } = evaluation;
  if (item === null || decoded === null) return null;
  const capsChecked = (decoded.kind === "order" || decoded.kind === "clob_order") && verification === "verified";
  let rows: ReactNode;
  if (decoded.kind === "order" || decoded.kind === "clob_order") {
    const { terms } = decoded;
    rows = (
      <>
        <Fact label="Venue">
          {decoded.kind === "order" ? "XO Market" : VENUE_FACT[decoded.venue] ?? "An unlisted venue"} · chain <Num>{String(decoded.chain_id)}</Num>
        </Fact>
        <Fact label="Account">
          <Addr value={decoded.account} />{" "}
          <span className="signing-muted">{decoded.kind === "order" ? "derived Kernel account of the owner" : "the owner wallet signs as itself"}</span>
        </Fact>
        <Fact label="Side · price">
          {SIDE_WORD[terms.side] ?? "Unlisted side"} · <Num>{terms.price}</Num> a share
        </Fact>
        <Fact label="Size">
          <Num>{terms.shares}</Num> shares · <Num>{terms.principal_usd}</Num> USD principal
        </Fact>
        <Fact label="Expiry">{terms.expires_at === null ? "none signed into the order" : <When iso={terms.expires_at} />}</Fact>
        <Fact label="Caps">
          <Caps item={item} checked={capsChecked} />
        </Fact>
      </>
    );
  } else if (decoded.kind === "auth" || decoded.kind === "clob_auth") {
    rows = (
      <>
        <Fact label="Venue">
          {decoded.kind === "auth" ? "XO Market" : VENUE_FACT[decoded.venue] ?? "An unlisted venue"} · chain <Num>{String(decoded.chain_id)}</Num>
        </Fact>
        <Fact label="Address">
          <Addr value={decoded.clob_auth.address} />
        </Fact>
        <Fact label="Signs">a login attestation, no money moves</Fact>
        <Fact label="Lives">
          <Num>{String(decoded.ttl_s)}</Num> s
        </Fact>
        <Fact label="Caps">
          <Caps item={item} checked={false} />
        </Fact>
      </>
    );
  } else {
    rows = (
      <>
        <Fact label="Venue">
          XO Market · chain <Num>{String(decoded.chain_id)}</Num>
        </Fact>
        <Fact label="Account">
          <Addr value={decoded.account} /> <span className="signing-muted">derived Kernel account of the owner</span>
        </Fact>
        <Fact label="Calls">
          <Num>{String(decoded.calls.length)}</Num> inside one operation
        </Fact>
        <Fact label="Valid until">
          <When iso={decoded.display.valid_until} />
        </Fact>
        <Fact label="Caps">
          <Caps item={item} checked={false} />
        </Fact>
      </>
    );
  }
  return (
    <dl className="signing-facts" aria-label="The item, from its decoded fields">
      {rows}
      <Fact label="Owner">
        <Addr value={decoded.owner} />
      </Fact>
    </dl>
  );
}
