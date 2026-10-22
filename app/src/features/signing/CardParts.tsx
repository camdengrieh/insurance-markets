import type { ReactNode } from "react";

import type { PreparedDecoded } from "@shared/relay/contract";

import { sanitizeText } from "../../core/untrusted";
import { Badge, Disclosure, Num, UntrustedText, type Tone } from "../../ui";
import type { CardCheck, CardEvaluation, CheckStatus, Mismatch } from "./card";
import { FRESHNESS_TEXT, TAG_WORDS, groupTag } from "./words";

// The pieces of the Signature Card. Everything here is a text node: the relay's lines, the decoded block's
// values and the mismatch details are rendered as text, and any value that is not a plain hex number, a decimal or a
// yes/no word goes into the fixed untrusted slot. Nothing is a link, an attribute value or markup.

// ---- text from the relay: summary lines -------------------------------------------------------------------------------

// A line may carry one fixed slot, `[market title (untrusted): "..."]` or `[metadata uri (untrusted): "..."]`. The relay
// already sanitised what is inside it; it is rendered through the untrusted component anyway, so it is marked as
// a stranger's text on screen and cut at the approval slot length.
const SLOT = /^(.*?)\[(market title|metadata uri) \(untrusted\): "(.*)"\](.*)$/su;

export function SummaryLine({ line }: { readonly line: string }) {
  const match = SLOT.exec(line);
  if (match === null) return <>{line}</>;
  const [, before = "", label = "", inner = "", after = ""] = match;
  const text = sanitizeText("title", inner).text;
  return (
    <>
      {before}
      {`[${label} (untrusted): "`}
      <UntrustedText value={text} field="title" maxChars={label === "metadata uri" ? 120 : 80} />
      {'"]'}
      {after}
    </>
  );
}

export function SummaryLines({ lines, mismatchIndex }: { readonly lines: readonly string[]; readonly mismatchIndex: number | null }) {
  return (
    <ol className="signing-lines" aria-label="Summary lines from the relay record">
      {lines.map((line, index) => (
        <li key={index} data-mismatch={mismatchIndex === index ? "true" : undefined}>
          <SummaryLine line={line} />
        </li>
      ))}
    </ol>
  );
}

// ---- values from the decoded block ---------------------------------------------------------------------------------

const PLAIN_VALUE = /^(?:0x[0-9a-fA-F]{0,2100}|[0-9]{1,80}(?:\.[0-9]{1,40})?|true|false)$/;

export function Value({ value }: { readonly value: string | boolean | number | null }) {
  if (value === null) return <span className="ui-missing">none</span>;
  if (typeof value === "boolean") return <code>{value ? "true" : "false"}</code>;
  const text = String(value);
  if (PLAIN_VALUE.test(text)) return <code className="signing-code">{text}</code>;
  // Anything else could be a creator's text (a metadata uri, a label): the stranger's slot.
  return <UntrustedText value={sanitizeText("generic", text).text} maxChars={120} />;
}

function Row({ label, children, covered }: { readonly label: string; readonly children: ReactNode; readonly covered?: boolean }) {
  return (
    <tr>
      <th scope="row">{label}</th>
      <td>{children}</td>
      <td className="signing-muted">{covered === undefined ? "" : covered ? "covered by the digest" : "not covered"}</td>
    </tr>
  );
}

const CALL_TEMPLATE_TEXT: Readonly<Record<string, string>> = Object.freeze({
  usdce_approve: "USDC.e approve",
  ctf_set_approval_for_all: "Conditional Tokens setApprovalForAll",
  ctf_redeem: "Conditional Tokens redeemPositions",
  create_market: "Market manager createConvictionMarket",
  respond_update: "Market manager respondToUpdateRequest",
  cancel_market: "Market manager cancelMarket",
  withdraw_transfer_remote: "XO route transferRemote (withdraw)",
});

const VENUE_CHAIN_TEXT: Readonly<Record<string, string>> = Object.freeze({ polymarket: "Polymarket, Polygon", limitless: "Limitless, Base" });

const ACTION_TEXT: Readonly<Record<string, string>> = Object.freeze({
  deploy_enable_trading: "Deploy the account and enable trading",
  enable_trading: "Enable trading",
  revoke_trading: "Revoke trading",
  redeem: "Redeem",
  withdraw: "Withdraw",
  create_market: "Create a market",
  respond_update: "Answer an update request",
  cancel_market: "Cancel a market",
  place_order: "Place an order",
  connect: "Log in to XO",
});

function CallList({ decoded }: { readonly decoded: Extract<PreparedDecoded, { calls: unknown }> }) {
  return (
    <ol className="signing-calls" aria-label="Calls inside the operation">
      {decoded.calls.map((call, index) => (
        <li key={index}>
          <strong>{CALL_TEMPLATE_TEXT[call.template] ?? "Unlisted call"}</strong> on <code className="signing-code">{call.to}</code>
          <dl className="signing-args">
            {Object.entries(call.args).map(([name, value]) => (
              <div key={name}>
                <dt>{name}</dt>
                <dd>{Array.isArray(value) ? value.map((entry, i) => <span key={i} className="signing-arg-item"><Value value={entry} /></span>) : <Value value={value} />}</dd>
              </div>
            ))}
          </dl>
        </li>
      ))}
    </ol>
  );
}

export function DecodedView({ decoded, covered, unbound }: { readonly decoded: PreparedDecoded; readonly covered: readonly string[]; readonly unbound: readonly string[] }) {
  const common = (
    <>
      <Row label="Action">{ACTION_TEXT[decoded.action] ?? "Unlisted action"}</Row>
      <Row label="Chain">
        <code>{decoded.chain_id}</code> ({decoded.kind === "clob_order" || decoded.kind === "clob_auth" ? VENUE_CHAIN_TEXT[decoded.venue] : "XO"})
      </Row>
      <Row label="Owner">
        <code className="signing-code">{decoded.owner}</code>
      </Row>
      <Row label={decoded.kind === "clob_order" || decoded.kind === "clob_auth" ? (decoded.account.toLowerCase() === decoded.owner.toLowerCase() ? "Maker (the owner wallet itself)" : "Maker (the owner's Polymarket Deposit Wallet, derived from the owner)") : "XO account"}>
        <code className="signing-code">{decoded.account}</code>
      </Row>
    </>
  );
  let body: ReactNode;
  if (decoded.kind === "clob_order") {
    const { order, terms, params, domain } = decoded;
    body = (
      <>
        <Row label="Venue">{VENUE_CHAIN_TEXT[decoded.venue]}</Row>
        <Row label="Side" covered>{terms.side}</Row>
        <Row label="Price (per share)" covered><code>{terms.price}</code></Row>
        <Row label="Shares" covered><code>{terms.shares}</code></Row>
        <Row label="Principal (USD)" covered><code>{terms.principal_usd}</code></Row>
        <Row label="Fee ceiling (bps, policy)"><code>{terms.fee_bound_bps}</code></Row>
        <Row label="Counts against the caps (USD)"><code>{terms.cap_usd}</code></Row>
        <Row label="Worst-case cash out (USD)"><Value value={terms.max_outlay_usd} /></Row>
        <Row label="Worst-case net proceeds (USD)"><Value value={terms.min_proceeds_usd} /></Row>
        <Row label="Expires" covered={false}><Value value={terms.expires_at} /></Row>
        <Row label="Outcome token id" covered><code className="signing-code">{order.token_id}</code></Row>
        <Row label="Exchange (domain)" covered><code className="signing-code">{domain.verifying_contract}</code> ({domain.name} version {domain.version})</Row>
        <Row label="Maker and signer" covered><code className="signing-code">{order.maker}</code></Row>
        <Row label="Salt" covered>
          <code className="signing-code">{order.salt}</code>{" "}
          {decoded.account.toLowerCase() === decoded.owner.toLowerCase() ? "(the wallet signs as an EOA, type 0)" : "(type 3: the owner signs a TypedDataSign wrapper of this order for its Deposit Wallet)"}
        </Row>
        {order.venue === "polymarket" ? (
          <>
            <Row label="Timestamp (ms)" covered><code>{order.timestamp_ms}</code></Row>
            <Row label="Metadata and builder" covered><code className="signing-code">{order.metadata}</code> / <code className="signing-code">{order.builder}</code></Row>
            <Row label="Wire expiration (not signed)"><code>{order.expiration}</code></Row>
          </>
        ) : (
          <>
            <Row label="Taker" covered><code className="signing-code">{order.taker}</code></Row>
            <Row label="Expiration and nonce" covered><code>{order.expiration}</code> / <code>{order.nonce}</code></Row>
            <Row label="Fee rate (bps)" covered><code>{order.fee_rate_bps}</code></Row>
          </>
        )}
        <Row label="Order type">{params.tif}{params.post_only ? ", post-only" : ""}</Row>
        <Row label="Market"><Value value={params.market_id} /></Row>
        <Row label="Tick and minimum size"><code>{params.tick}</code> / <code>{params.min_size}</code></Row>
      </>
    );
  } else if (decoded.kind === "clob_auth") {
    const { clob_auth: auth } = decoded;
    body = (
      <>
        <Row label="Signed address" covered><code className="signing-code">{auth.address}</code></Row>
        <Row label="Timestamp (unix s)" covered><code>{auth.timestamp}</code></Row>
        <Row label="Nonce" covered><code>{auth.nonce}</code></Row>
        <Row label="Attestation text" covered><UntrustedText value={sanitizeText("generic", auth.message).text} maxChars={120} /></Row>
        <Row label="Wrapping">plain login hash (the wallet signs it directly)</Row>
        <Row label="Time to live (s)"><code>{decoded.ttl_s}</code></Row>
      </>
    );
  } else if (decoded.kind === "order") {
    const { order, terms, params } = decoded;
    body = (
      <>
        <Row label="Side" covered>{terms.side}</Row>
        <Row label="Price (per share)" covered><code>{terms.price}</code></Row>
        <Row label="Shares" covered><code>{terms.shares}</code></Row>
        <Row label="Principal (USD)" covered><code>{terms.principal_usd}</code></Row>
        <Row label="Fee bound (bps)"><code>{terms.fee_bound_bps}</code></Row>
        <Row label="Counts against the caps (USD)"><code>{terms.cap_usd}</code></Row>
        <Row label="Worst-case cash out (USD)"><Value value={terms.max_outlay_usd} /></Row>
        <Row label="Worst-case net proceeds (USD)"><Value value={terms.min_proceeds_usd} /></Row>
        <Row label="Expires" covered><code>{terms.expires_at}</code></Row>
        <Row label="Outcome token id" covered><code className="signing-code">{order.token_id}</code></Row>
        <Row label="Exchange" covered><code className="signing-code">{decoded.exchange}</code></Row>
        <Row label="Maker and signer" covered><code className="signing-code">{order.maker}</code></Row>
        <Row label="Salt and nonce" covered><code className="signing-code">{order.salt}</code> / <code>{order.nonce}</code></Row>
        <Row label="Order type">{params.tif}{params.post_only ? ", post-only" : ""}, {params.purpose}</Row>
        <Row label="Condition"><Value value={params.condition_id} /></Row>
      </>
    );
  } else if (decoded.kind === "auth") {
    const { clob_auth: auth } = decoded;
    body = (
      <>
        <Row label="Signed address" covered><code className="signing-code">{auth.address}</code></Row>
        <Row label="Timestamp (unix s)" covered><code>{auth.timestamp}</code></Row>
        <Row label="Nonce" covered><code>{auth.nonce}</code></Row>
        <Row label="Attestation text" covered><UntrustedText value={sanitizeText("generic", auth.message).text} maxChars={120} /></Row>
        <Row label="Wrapping">{decoded.wrap === "kernel-on" ? "wrapped for the Kernel account" : "plain login hash"}</Row>
        <Row label="Time to live (s)"><code>{decoded.ttl_s}</code></Row>
      </>
    );
  } else {
    const { userop } = decoded;
    body = (
      <>
        <Row label="Entry point" covered><code className="signing-code">{userop.entry_point}</code></Row>
        <Row label="Sender" covered><code className="signing-code">{userop.sender}</code></Row>
        <Row label="Nonce" covered><code>{userop.nonce}</code></Row>
        <Row label="Account creation" covered>{userop.init_code === "0x" ? "none (the account already exists)" : `deploys the account (initCode ${String((userop.init_code.length - 2) / 2)} bytes)`}</Row>
        <Row label="Gas limits" covered>verification <code>{userop.verification_gas_limit}</code>, call <code>{userop.call_gas_limit}</code>, pre-verification <code>{userop.pre_verification_gas}</code></Row>
        <Row label="Fees per gas" covered>max <code>{userop.max_fee_per_gas}</code>, priority <code>{userop.max_priority_fee_per_gas}</code></Row>
        <Row label="Paymaster" covered>{userop.paymaster === null ? "none" : <code className="signing-code">{userop.paymaster.address}</code>}</Row>
        <Row label="Valid until" ><code>{decoded.display.valid_until}</code></Row>
        <Row label="Gas figures from">{decoded.display.gas_source}</Row>
        {decoded.display.title_slot === null ? null : (
          <Row label="Market title">
            <SummaryLine line={decoded.display.title_slot} />
          </Row>
        )}
      </>
    );
  }
  return (
    <div className="signing-decoded">
      <table className="signing-table">
        <caption>Decoded fields the digest was rebuilt from</caption>
        <thead>
          <tr>
            <th scope="col">Field</th>
            <th scope="col">Value</th>
            <th scope="col">Digest</th>
          </tr>
        </thead>
        <tbody>
          {common}
          {body}
        </tbody>
      </table>
      {"calls" in decoded ? <CallList decoded={decoded} /> : null}
      {covered.length === 0 && unbound.length === 0 ? null : (
        <p className="signing-muted">
          The digest commits to: {covered.length === 0 ? "nothing listed" : covered.join(", ")}. Shown but not committed to by the digest: {unbound.length === 0 ? "nothing listed" : unbound.join(", ")}.
        </p>
      )}
    </div>
  );
}

// ---- the checks ----------------------------------------------------------------------------------------------------------

const CHECK_TONE: Readonly<Record<CheckStatus, { readonly tone: Tone; readonly word: string }>> = {
  pass: { tone: "ok", word: "passed" },
  fail: { tone: "danger", word: "failed" },
  unavailable: { tone: "warn", word: "could not run" },
  unchecked: { tone: "neutral", word: "unchecked" },
};

export function ChecksList({ checks }: { readonly checks: readonly CardCheck[] }) {
  return (
    <ul className="signing-checks" aria-label="Checks run in this page">
      {checks.map((check) => (
        <li key={check.id} data-check={check.id} data-status={check.status}>
          <Badge tone={CHECK_TONE[check.status].tone}>{CHECK_TONE[check.status].word}</Badge> <strong>{check.label}.</strong> <span>{check.detail}</span>
        </li>
      ))}
    </ul>
  );
}

export function MismatchDetail({ mismatch }: { readonly mismatch: Mismatch }) {
  if (mismatch.status !== "mismatch") return null;
  return (
    <div className="signing-mismatch" role="group" aria-label="First difference found">
      <p>
        First difference at <code>{mismatch.field}</code>.
      </p>
      {mismatch.expected === null ? null : (
        <p>
          Rebuilt here: <UntrustedText value={sanitizeText("generic", mismatch.expected).text} maxChars={160} />
        </p>
      )}
      {mismatch.actual === null ? null : (
        <p>
          The relay sent: <UntrustedText value={sanitizeText("generic", mismatch.actual).text} maxChars={160} />
        </p>
      )}
    </div>
  );
}

// ---- tags --------------------------------------------------------------------------------------------------------------------

const FORM_TEXT: Readonly<Record<string, string>> = Object.freeze({
  userOpHash: "a user operation hash, signed as a raw intent",
  kernelWrappedOrderHash: "an order wrapped for the Kernel account, signed as typed data",
  kernelWrappedClobAuth: "an XO login hash wrapped for the Kernel account",
});

// The match line under the tags: whether the tags this page computed from the item are the tags the daemon says it
// prepared. Fixed words per verification outcome; never the relay's.
const MATCH_TEXT: Readonly<Record<CardEvaluation["verification"], string>> = Object.freeze({
  verified: "Tags match: this page rebuilt the item from its decoded fields and got the same bytes the daemon prepared.",
  failed: "Tags do not match: what this page rebuilt differs from what the daemon prepared. Do not sign.",
  viewer_only: "Not compared: without a decoded block this page cannot rebuild the tags, so it shows the daemon's as sent.",
});

export function TagsPanel({ evaluation }: { readonly evaluation: CardEvaluation }) {
  const { digestTag, innerTag, innerKind, digestForm, chainId } = evaluation;
  if (digestTag === null) return null;
  return (
    <section className="signing-tags" aria-labelledby="signing-tags-title">
      <h4 id="signing-tags-title">Tags to compare with PayBox</h4>
      <p className="signing-match" data-tags-match={evaluation.verification}>
        {MATCH_TEXT[evaluation.verification]}
      </p>
      <dl>
        <div>
          <dt>Digest tag</dt>
          <dd>
            <code className="signing-tag" data-tag="digest">{groupTag(digestTag)}</code>
          </dd>
        </div>
        <div>
          <dt>{innerKind === "typed_data_hash" ? "Inner tag (typed data)" : "Inner tag (call data)"}</dt>
          <dd>
            {innerTag === null ? <span data-tag="inner-missing">none: the relay sent no inner tag</span> : <code className="signing-tag" data-tag="inner">{groupTag(innerTag)}</code>}
          </dd>
        </div>
        <div>
          <dt>Chain</dt>
          <dd>
            XO chain <code>{chainId}</code>
            {digestForm === null ? null : <>, {FORM_TEXT[digestForm] ?? "an unlisted digest form"}</>}
          </dd>
        </div>
      </dl>
      <p className="signing-muted">{TAG_WORDS.unknownDisplay}</p>
      <Disclosure summary="What the two tags are">
        <p>{TAG_WORDS.digest}</p>
        {innerTag === null ? null : <p>{innerKind === "typed_data_hash" ? TAG_WORDS.innerTyped : TAG_WORDS.innerCallData}</p>}
        <p>{TAG_WORDS.limits}</p>
      </Disclosure>
    </section>
  );
}

// The countdown at the top right of the card (Signing.dc.html): the time left in 28 px mono, the words under it. The
// tone is carried as data for the stylesheet and the tests; the words carry the meaning.
export function FreshnessText({ evaluation, remaining }: { readonly evaluation: CardEvaluation; readonly remaining: string }) {
  const state = evaluation.freshness.state;
  return (
    <p className="signing-countdown" data-tone={state === "fresh" ? "ok" : state === "short" ? "warn" : "danger"} data-freshness={state}>
      <Num>{remaining}</Num>
      <span>{FRESHNESS_TEXT[state]}</span>
    </p>
  );
}
