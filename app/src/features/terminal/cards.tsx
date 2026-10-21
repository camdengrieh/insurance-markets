import type { ReactNode } from "react";
import { Link } from "wouter";

import type { StatusResponse } from "@bridge/contract";

import { formatUtc, parseIsoMs } from "../../core/format";
import { parseQty, toDec } from "../../core/money";
import { isUntrusted, untrusted, type Untrusted } from "../../core/untrusted";
import { Badge, Button, DataTable, Disclosure, EmptyTile, ErrorTile, Missing, Tile, UntrustedText, isProven, type Column, type Tone } from "../../ui";
import { failureWords, type Failure } from "./failure";
import { COMMAND_HELP, COMMAND_NAMES, type CommandName } from "./grammar";
import { spreadOf, type BookResult, type BookView, type CallRecord, type LevelView, type Outcome, type SpreadTier, type WalletRow } from "./execute";
import type { AuditRow } from "./observer";
import { POSTURE_TONE, postureWord } from "./ObserverPane";
import type { MarketOutput, PositionsOutput, SearchOutput, WireText } from "./tools";

// Result cards. One renderer per tool answer, generated from the validated schema output: a field the schema does
// not name is not rendered. Fixed wording is ours; everything a market creator can write is an Untrusted<string>
// inside <UntrustedText>. No card links to a URL from market data, builds an HTML string, or writes to the
// clipboard.

export const DISPLAY_PRICE_NOTE = "display price, not a quote";
export const BOOK_SPREAD_NOTE = "book spread; size and fees are not applied";
export const FEE_CEILING_NOTE = "a ceiling, not a reconciled figure";

// ---- small pieces ----------------------------------------------------------------------------------------------------------

function Flags({ flags }: { readonly flags: readonly string[] }) {
  if (flags.length === 0) return null;
  return (
    <span className="terminal-flags">
      {flags.map((flag) => (
        <Badge key={flag} tone="warn">{`flag: ${flag}`}</Badge>
      ))}
    </span>
  );
}

function Slot({ value, field = "title" }: { readonly value: WireText; readonly field?: "title" | "outcome" | "description" | "rules" | "generic" | "category" }) {
  return (
    <>
      <UntrustedText value={value.text} field={field} />
      <Flags flags={value.flags} />
    </>
  );
}

function Plain({ value, field = "generic" }: { readonly value: Untrusted<string>; readonly field?: "generic" | "title" }) {
  return <UntrustedText value={value} field={field} />;
}

// A decimal string, normalised, or "no data". Never "0" for an unknown.
export function decimalText(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const q = parseQty("price", value);
  return q === null ? null : toDec(q);
}

function Num({ value }: { readonly value: string | null | undefined }) {
  const text = decimalText(value);
  return text === null ? <Missing /> : <span className="terminal-num">{text}</span>;
}

function when(iso: string | null): ReactNode {
  const ms = parseIsoMs(iso);
  return ms === null ? <Missing /> : formatUtc(ms, false);
}

// 0x1234abcd...ef0123: enough to tell two ids apart in a button name. The full id is always in the row itself.
export function shortId(id: string): string {
  return /^0x[0-9a-fA-F]{40,64}$/.test(id) ? `${id.slice(0, 10)}...${id.slice(-6)}` : "an id";
}

function IdCode({ id }: { readonly id: string }) {
  return <code className="terminal-id">{id}</code>;
}

function Pair({ term, children }: { readonly term: string; readonly children: ReactNode }) {
  return (
    <div className="terminal-pair">
      <dt>{term}</dt>
      <dd>{children}</dd>
    </div>
  );
}

const STATUS_TONE: Readonly<Record<string, Tone>> = { ACTIVE: "ok", RESOLVED: "info", CLOSED: "neutral", PENDING: "neutral", PAUSED: "warn", UPDATE_REQUIRED: "warn", unknown: "warn" };

function StatusBadge({ status, lifecycle }: { readonly status: string; readonly lifecycle: string }) {
  return <Badge tone={STATUS_TONE[status] ?? "neutral"}>{`${status.toLowerCase().replace(/_/g, " ")} (${lifecycle.replace(/_/g, " ")})`}</Badge>;
}

export interface Prefill {
  (command: string): void;
}

function PrefillButton({ command, label, onPrefill }: { readonly command: string; readonly label: string; readonly onPrefill: Prefill | undefined }) {
  if (onPrefill === undefined) return null;
  return (
    <Button aria-label={label} onClick={() => onPrefill(command)}>
      {command.split(" ")[0]}
    </Button>
  );
}

// ---- help --------------------------------------------------------------------------------------------------------------------

export function HelpCard({ topic }: { readonly topic: CommandName | null }) {
  const names = topic === null ? COMMAND_NAMES : [topic];
  return (
    <Tile tone="info" title={topic === null ? "Commands" : `Help: ${topic}`} heading="h3" dataKind="help">
      <dl className="terminal-help">
        {names.map((name) => (
          <Pair key={name} term={COMMAND_HELP[name].usage}>
            {COMMAND_HELP[name].summary} <span className="terminal-muted">Answered by {COMMAND_HELP[name].source}.</span>
          </Pair>
        ))}
      </dl>
      {topic === null ? (
        <>
          <p>
            This terminal only reads. It has no model, no scripting, no pipes and no way to call a tool by name. It cannot set a flag or a cap, arm a window, send, sign, fund,
            withdraw or cancel. If your agent prepares something to sign, it appears in the observer pane and on the signing screen.
          </p>
          <p>Pasted line breaks become spaces, and pasting never runs anything: press Enter to run.</p>
        </>
      ) : null}
    </Tile>
  );
}

// ---- status ------------------------------------------------------------------------------------------------------------------


export function StatusCard({ status }: { readonly status: StatusResponse }) {
  const flagEntries = Object.entries(status.flags);
  const writeFlagsOn = flagEntries.filter(([name, on]) => name !== "KILL" && on).length;
  const upstream = Object.entries(status.upstream);
  const capabilities = Object.entries(status.capabilities);
  const venues = Object.entries(status.venues);
  return (
    <Tile tone="neutral" title="Daemon status" heading="h3" dataKind="status">
      <dl className="terminal-facts">
        <Pair term="Posture">
          <Badge tone={POSTURE_TONE[status.posture] ?? "neutral"}>{postureWord(status.posture)}</Badge>
          {status.armed_until === null ? null : <> until {when(status.armed_until)}</>}
        </Pair>
        <Pair term="Kill switch">{status.kill ? <Badge tone="danger">on: every write is refused</Badge> : <Badge tone="neutral">off</Badge>}</Pair>
        <Pair term="This instance">{status.instance === "writer" ? "owns the data directory" : "serves reads only (another process owns the data directory)"}</Pair>
        <Pair term="Token held by this page">{`${status.token.kind}, scopes: ${status.token.scopes.join(", ") || "none"}`}</Pair>
        <Pair term="Version">{`${status.version}, contract ${String(status.contract_version)}`}</Pair>
        <Pair term="Daemon time">{when(status.time)}</Pair>
        <Pair term="Audit chain head">{status.audit_head === null ? <Missing label="no entries yet" /> : <code>{status.audit_head.slice(0, 16)}</code>}</Pair>
      </dl>

      <h4 className="terminal-subhead">Write flags (shown, never set here)</h4>
      <ul className="terminal-chips">
        {flagEntries.map(([name, on]) => (
          <li key={name}>
            <Badge tone={on ? "warn" : "neutral"}>{`${name}: ${on ? "on" : "off"}`}</Badge>
          </li>
        ))}
      </ul>
      <p>
        {writeFlagsOn === 0
          ? "Every write flag is off, so every write-class tool answers flag_off. This terminal is read-only."
          : `${String(writeFlagsOn)} write flag(s) are on in the daemon. This terminal still only reads.`}
      </p>

      <h4 className="terminal-subhead">Tripwires</h4>
      {status.tripwires.ok ? (
        <p>None tripped.</p>
      ) : (
        <ul>
          {status.tripwires.tripped.map((trip) => (
            <li key={trip.id}>
              <code>{trip.id}</code>: <Plain value={untrusted(trip.detail)} />
            </li>
          ))}
        </ul>
      )}

      <h4 className="terminal-subhead">Upstream health</h4>
      {upstream.length === 0 ? (
        <p>No upstream has been called yet.</p>
      ) : (
        <ul className="terminal-chips">
          {upstream.map(([host, health]) => (
            <li key={host}>
              <Badge tone={health.state === "ok" ? "ok" : "warn"}>{`${host}: ${health.state.replace(/_/g, " ")}`}</Badge>
            </li>
          ))}
        </ul>
      )}

      <h4 className="terminal-subhead">Capabilities</h4>
      {capabilities.length === 0 ? (
        <p>No capability facts are recorded. Every one shows as unproven.</p>
      ) : (
        <ul className="terminal-chips">
          {capabilities.map(([name, state]) => (
            <li key={name}>
              <Badge tone={isProven(state) ? "ok" : "warn"}>{`${name}: ${isProven(state) ? "proven" : "unproven"}`}</Badge>
            </li>
          ))}
        </ul>
      )}

      <h4 className="terminal-subhead">Venue switches</h4>
      {venues.length === 0 ? (
        <p>The daemon lists no venue switches.</p>
      ) : (
        <ul className="terminal-chips">
          {venues.map(([name, venue]) => (
            <li key={name}>
              <Badge tone={venue.enabled ? "ok" : "neutral"}>{`${name}: ${venue.enabled ? "on" : "off"}${venue.enabled ? "" : ` (${venue.reason.replace(/_/g, " ")})`}`}</Badge>
            </li>
          ))}
        </ul>
      )}
    </Tile>
  );
}

// ---- markets ------------------------------------------------------------------------------------------------------------------

type MarketRow = SearchOutput["markets"][number];

export function MarketsCard({ data, onPrefill }: { readonly data: SearchOutput; readonly onPrefill?: Prefill }) {
  const columns: readonly Column<MarketRow>[] = [
    { key: "title", header: "Title", rowHeader: true, render: (row) => <Slot value={row.title} /> },
    { key: "status", header: "Status", render: (row) => <StatusBadge status={row.status} lifecycle={row.lifecycle} /> },
    { key: "closes", header: "Closes (UTC)", render: (row) => when(row.expires_at) },
    {
      key: "yes",
      header: "Yes (display price)",
      align: "end",
      render: (row) => <Num value={row.outcomes.find((outcome) => outcome.slot === "yes")?.display_price} />,
    },
    {
      key: "no",
      header: "No (display price)",
      align: "end",
      render: (row) => <Num value={row.outcomes.find((outcome) => outcome.slot === "no")?.display_price} />,
    },
    { key: "volume", header: "Volume (USD)", align: "end", render: (row) => <Num value={row.total_volume_usd} /> },
    { key: "id", header: "Market id", render: (row) => <IdCode id={row.condition_id.toLowerCase()} /> },
    {
      key: "fill",
      header: "Fill the command",
      render: (row) => (
        <span className="terminal-actions">
          <PrefillButton command={`market ${row.condition_id.toLowerCase()}`} label={`Fill the market command for ${shortId(row.condition_id)}`} onPrefill={onPrefill} />
          <PrefillButton command={`book ${row.condition_id.toLowerCase()}`} label={`Fill the book command for ${shortId(row.condition_id)}`} onPrefill={onPrefill} />
        </span>
      ),
    },
  ];
  return (
    <div className="terminal-result" data-kind="markets">
      <DataTable
        caption={`XO markets whose title contains the search text (${String(data.page_info.returned)} shown)`}
        columns={columns}
        rows={data.markets}
        rowKey={(row) => row.condition_id}
        empty={<EmptyTile title="No active markets matched" heading="h3">XO answered and found nothing for that text. That is an empty result, not an error and not a zero.</EmptyTile>}
      />
      <p className="terminal-muted">
        Prices here are {DISPLAY_PRICE_NOTE}s: a list value, never an order book. Volume is display data, not liquidity. Page {String(data.page_info.page)}
        {data.page_info.has_next_page ? "; more pages exist and are not fetched by this terminal (use the Markets screen)" : ""}.
        {data.skipped_rows.count > 0 ? ` ${String(data.skipped_rows.count)} row(s) from XO could not be read and were skipped.` : ""} Filling a command only types it; press Enter to run it.
      </p>
      {data.warnings.map((warning, index) => (
        <p key={index} className="terminal-warning">
          <Plain value={warning} />
        </p>
      ))}
    </div>
  );
}

// ---- one market ----------------------------------------------------------------------------------------------------------------

type OutcomeQuote = NonNullable<MarketOutput["quote"]["yes"]>;

function QuoteLine({ label, quote }: { readonly label: string; readonly quote: OutcomeQuote | null }) {
  if (quote === null) return <Pair term={label}>no quote</Pair>;
  const spread: SpreadTier = spreadOf(quote);
  return (
    <Pair term={label}>
      bid <Num value={quote.best_bid?.price} /> / ask <Num value={quote.best_ask?.price} />
      {spread.tier === "book" ? (
        <>
          , spread <Num value={spread.spread} /> <span className="terminal-muted">({BOOK_SPREAD_NOTE})</span>
        </>
      ) : spread.tier === "crossed" ? (
        <>
          , <Badge tone="danger">crossed book: no spread</Badge>
        </>
      ) : (
        <>
          , <Badge tone="neutral">one side empty: no spread</Badge>
        </>
      )}
      {quote.midpoint_reliable && quote.midpoint !== null ? (
        <>
          , midpoint <Num value={quote.midpoint} />
        </>
      ) : null}
      {quote.thin.length > 0 ? (
        <>
          {" "}
          {quote.thin.map((flag) => (
            <Badge key={flag} tone="warn">{`thin: ${flag.replace(/_/g, " ")}`}</Badge>
          ))}
        </>
      ) : null}
    </Pair>
  );
}

const VERDICT_TEXT: Readonly<Record<MarketOutput["tradability"]["verdict"], { readonly text: string; readonly tone: Tone }>> = {
  open_with_book: { text: "open, with an order book", tone: "ok" },
  thin_book: { text: "open, but the book is thin", tone: "warn" },
  not_open: { text: "not open", tone: "neutral" },
  unknown: { text: "unknown", tone: "warn" },
};

export function feeText(fees: MarketOutput["fees"]): string {
  if (fees.taker_fee_bps === null) return "unknown: do not quote a cost";
  return `up to ${String(fees.taker_fee_bps)} bps for a taker (${FEE_CEILING_NOTE}; sources: ${fees.status.replace(/_/g, " ")})`;
}

export function MarketCard({ data, onPrefill }: { readonly data: MarketOutput; readonly onPrefill?: Prefill }) {
  const market = data.market;
  const verdict = VERDICT_TEXT[data.tradability.verdict];
  const id = market.condition_id.toLowerCase();
  return (
    <div className="terminal-result" data-kind="market">
      <dl className="terminal-facts">
        <Pair term="Title">
          <Slot value={market.title} />
        </Pair>
        <Pair term="Market id">
          <IdCode id={id} />
        </Pair>
        <Pair term="Status">
          <StatusBadge status={market.status} lifecycle={market.lifecycle} />
        </Pair>
        <Pair term="Opens (UTC)">{when(market.starts_at)}</Pair>
        <Pair term="Closes (UTC)">{when(market.expires_at)}</Pair>
        <Pair term="Resolved (UTC)">{when(market.resolved_at)}</Pair>
        <Pair term="Winning outcome">{market.winning_outcome === null ? "none recorded" : market.winning_outcome.slot === "yes" ? "Yes" : "No"}</Pair>
        <Pair term="Volume (USD, display data)">
          <Num value={market.total_volume_usd} />
        </Pair>
        {market.outcomes.map((outcome) => (
          <Pair key={outcome.slot} term={`${outcome.slot === "yes" ? "Yes" : "No"} outcome`}>
            <Slot value={outcome.title} field="outcome" /> <span className="terminal-muted">token</span> <IdCode id={outcome.token_id} />
          </Pair>
        ))}
        <Pair term="Tradability">
          <Badge tone={verdict.tone}>{verdict.text}</Badge>
        </Pair>
        {data.tradability.reasons.map((reason, index) => (
          <Pair key={index} term={index === 0 ? "Reasons" : "Reason"}>
            <Plain value={reason} />
          </Pair>
        ))}
        <QuoteLine label="Yes book quote" quote={data.quote.yes} />
        <QuoteLine label="No book quote" quote={data.quote.no} />
        {data.quote.unavailable_reason === null ? null : (
          <Pair term="Why no quote">
            <Plain value={data.quote.unavailable_reason} />
          </Pair>
        )}
        <Pair term="Taker fee">{feeText(data.fees)}</Pair>
      </dl>
      <p className="terminal-muted">Quotes come from the order book at the time of the call. They are not guaranteed, and fees are not applied to them.</p>
      <p className="terminal-actions">
        <PrefillButton command={`book ${id}`} label={`Fill the book command for ${shortId(id)}`} onPrefill={onPrefill} />
      </p>
      <Disclosure summary="Description and rules (written by the market creator; text only)">
        {market.description === null ? null : <UntrustedText value={market.description.text} field="description" block />}
        {market.rules.description === null ? null : <UntrustedText value={market.rules.description.text} field="rules" block />}
        {market.rules.outcome_rules.map((rule) => (
          <div key={rule.outcome_index}>
            <p className="terminal-muted">{`Rule for ${rule.slot === "yes" ? "Yes" : "No"}`}</p>
            <UntrustedText value={rule.rule.text} field="rules" block />
          </div>
        ))}
        {market.resolution_type === null ? null : (
          <p>
            Resolution type: <Slot value={market.resolution_type} field="generic" />
          </p>
        )}
        {market.resolution_sources.length === 0 ? (
          <p>No resolution sources are listed.</p>
        ) : (
          <>
            <p className="terminal-muted">Resolution sources (shown as text, never as links)</p>
            <ul>
              {market.resolution_sources.map((source, index) => (
                <li key={index}>
                  <Slot value={source} field="generic" />
                </li>
              ))}
            </ul>
          </>
        )}
      </Disclosure>
      {data.warnings.map((warning, index) => (
        <p key={index} className="terminal-warning">
          <Plain value={warning} />
        </p>
      ))}
    </div>
  );
}

// ---- books ----------------------------------------------------------------------------------------------------------------------

const LEVEL_COLUMNS: readonly Column<LevelView>[] = [
  { key: "price", header: "Price (USDC.e per share)", align: "end", rowHeader: true, render: (row) => <Num value={row.price} /> },
  { key: "size", header: "Size (shares)", align: "end", render: (row) => <Num value={row.size} /> },
  { key: "cumulative", header: "Cumulative (shares)", align: "end", render: (row) => <Num value={row.cumulative} /> },
];

function BookTables({ view }: { readonly view: BookView }) {
  const spread = view.spread;
  return (
    <div className="terminal-book" data-slot={view.slot}>
      <p>
        <strong>{view.slot === "yes" ? "Yes" : "No"} book</strong> <span className="terminal-muted">token</span> <IdCode id={view.tokenId} />
      </p>
      <dl className="terminal-facts">
        <Pair term="Best bid">
          <Num value={view.quote.best_bid?.price} />
        </Pair>
        <Pair term="Best ask">
          <Num value={view.quote.best_ask?.price} />
        </Pair>
        <Pair term="Spread">
          {spread.tier === "book" ? (
            <>
              <Num value={spread.spread} /> <span className="terminal-muted">({BOOK_SPREAD_NOTE})</span>
            </>
          ) : spread.tier === "crossed" ? (
            <Badge tone="danger">crossed book: best bid is at or above best ask, no spread shown</Badge>
          ) : (
            <Badge tone="neutral">one side is empty: no spread</Badge>
          )}
        </Pair>
        <Pair term="Depth within 5 cents of the best price (shares)">
          bids <Num value={view.quote.bid_depth_near_touch_shares} />, asks <Num value={view.quote.ask_depth_near_touch_shares} />
        </Pair>
        <Pair term="Levels">{`${String(view.totalLevels.bids)} bid and ${String(view.totalLevels.asks)} ask levels${view.cut ? "; the top five of each side are shown" : ""}`}</Pair>
        <Pair term="Book time">{view.timestamp === null ? <Missing /> : <Plain value={untrusted(view.timestamp)} />}</Pair>
        <Pair term="Tick size">
          <Num value={view.tick} />
        </Pair>
        <Pair term="Order book">{view.active === null ? "activity unknown" : view.active ? "active" : "not active"}</Pair>
        {view.quote.thin.length === 0 ? null : (
          <Pair term="Thin book">
            {view.quote.thin.map((flag) => (
              <Badge key={flag} tone="warn">{flag.replace(/_/g, " ")}</Badge>
            ))}
          </Pair>
        )}
      </dl>
      <DataTable
        caption={`${view.slot === "yes" ? "Yes" : "No"} bids, best first`}
        columns={LEVEL_COLUMNS}
        rows={view.bids}
        rowKey={(row, index) => `b${String(index)}-${row.price}`}
        empty={<EmptyTile title="No bids" heading="h3">There are no bids on this book at the moment. That is an empty book, not an error.</EmptyTile>}
      />
      <DataTable
        caption={`${view.slot === "yes" ? "Yes" : "No"} asks, best first`}
        columns={LEVEL_COLUMNS}
        rows={view.asks}
        rowKey={(row, index) => `a${String(index)}-${row.price}`}
        empty={<EmptyTile title="No asks" heading="h3">There are no asks on this book at the moment. That is an empty book, not an error.</EmptyTile>}
      />
    </div>
  );
}

export function BookCard({ market, books }: { readonly market: MarketOutput; readonly books: readonly BookResult[] }) {
  return (
    <div className="terminal-result" data-kind="book">
      <p>
        Order book for <Slot value={market.market.title} />
      </p>
      {books.map((book) =>
        book.view !== null ? (
          <BookTables key={book.slot} view={book.view} />
        ) : book.failure !== null ? (
          <FailureCard key={book.slot} failure={book.failure} heading={`${book.slot === "yes" ? "Yes" : "No"} book`} />
        ) : null,
      )}
      <p className="terminal-muted">Books are read once, when you run the command. They are not refreshed. A book spread is not a price you can trade at: size and fees are not applied.</p>
    </div>
  );
}

// ---- positions ------------------------------------------------------------------------------------------------------------------

type PositionRow = PositionsOutput["positions"][number];

const LABELS_TEXT: Readonly<Record<PositionsOutput["labels"], string>> = {
  profile_loaded: "Positions are labelled with market titles from the account's XO profile.",
  no_xo_profile: "This address has no XO profile, so positions are listed by token id only.",
  unavailable: "Labels were unavailable, so positions are listed by token id only.",
};

export function PositionsCard({ data, source }: { readonly data: PositionsOutput; readonly source: "typed" | "saved" }) {
  const columns: readonly Column<PositionRow>[] = [
    {
      key: "market",
      header: "Market",
      rowHeader: true,
      render: (row) => (row.market === null ? <span>unlabelled token</span> : <Slot value={row.market.title} />),
    },
    { key: "outcome", header: "Outcome", render: (row) => (row.market === null || row.market.outcome_title === null ? null : <Slot value={row.market.outcome_title} field="outcome" />) },
    { key: "token", header: "Token id", render: (row) => <IdCode id={row.token_id} /> },
    { key: "shares", header: "Shares", align: "end", render: (row) => <Num value={row.shares} /> },
    { key: "reserved", header: "Reserved (resting sells)", align: "end", render: (row) => <Num value={row.reserved_shares} /> },
    { key: "free", header: "Free", align: "end", render: (row) => <Num value={row.free_shares} /> },
  ];
  return (
    <div className="terminal-result" data-kind="positions">
      <dl className="terminal-facts">
        <Pair term="XO account">
          <IdCode id={data.address.toLowerCase()} /> <span className="terminal-muted">{source === "saved" ? "(derived from a saved address)" : "(typed)"}</span>
        </Pair>
        <Pair term="Cash balance (USDC.e)">
          <Num value={data.cash_balance_usdc_e} />
        </Pair>
        <Pair term="Positions">{`${String(data.positions_returned)} of ${String(data.positions_total)} shown${data.truncated || data.upstream_truncated ? " (the list is cut off)" : ""}`}</Pair>
      </dl>
      <DataTable
        caption="Outcome-share positions"
        columns={columns}
        rows={data.positions}
        rowKey={(row, index) => `${row.token_id}-${String(index)}`}
        empty={<EmptyTile title="No positions" heading="h3">XO answered and this account holds no outcome shares. That is an empty result, not an error.</EmptyTile>}
      />
      <p className="terminal-muted">{LABELS_TEXT[data.labels]} Shares are not valued here and different markets are never added together.</p>
      {data.warnings.map((warning, index) => (
        <p key={index} className="terminal-warning">
          <Plain value={warning} />
        </p>
      ))}
    </div>
  );
}

export function PositionsTargetCard({ problem, candidates }: { readonly problem: "none" | "many" | "unusable"; readonly candidates: readonly string[] }) {
  return (
    <Tile tone="info" title="Which account?" heading="h3" dataKind="positions-target" dataCode={problem}>
      {problem === "none" ? (
        <p>
          No saved address has XO selected, so nothing was looked up. Type <code>positions &lt;XO account address&gt;</code>, or save an address with XO ticked from the wallet chip in the top bar (Just watch an address).
        </p>
      ) : problem === "unusable" ? (
        <p>A saved address with XO selected could not be turned into an XO account. Type the address yourself: positions &lt;XO account address&gt;.</p>
      ) : (
        <>
          <p>More than one saved account has XO selected, so none was picked for you. Type one of these after positions:</p>
          <ul>
            {candidates.map((address) => (
              <li key={address}>
                <IdCode id={address} />
              </li>
            ))}
          </ul>
        </>
      )}
    </Tile>
  );
}

// ---- wallet, signals, audit ----------------------------------------------------------------------------------------------------------

export function WalletCard({ rows, persistence }: { readonly rows: readonly WalletRow[]; readonly persistence: "indexeddb" | "memory" | "unknown" }) {
  const columns: readonly Column<WalletRow>[] = [
    { key: "label", header: "Label", rowHeader: true, render: (row) => <UntrustedText value={row.label} field="generic" maxChars={48} /> },
    { key: "kind", header: "Kind", render: (row) => row.kind.replace(/_/g, " ") },
    { key: "address", header: "Address", render: (row) => (row.address === null ? null : <IdCode id={row.address} />) },
    { key: "chain", header: "Chain", render: (row) => row.chain },
    { key: "status", header: "Status", render: (row) => row.status.replace(/-/g, " ") },
    { key: "venues", header: "Venues selected", render: (row) => (row.venues.length === 0 ? "none" : row.venues.join(", ")) },
    {
      key: "derived",
      header: "XO account derived from it",
      render: (row) => (row.derived === null ? null : "account" in row.derived ? <IdCode id={row.derived.account} /> : <span>{row.derived.problem}</span>),
    },
  ];
  return (
    <div className="terminal-result" data-kind="wallet">
      <DataTable
        caption="Saved addresses"
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        empty={
          <EmptyTile title="No saved addresses" heading="h3">
            Nothing is saved in this browser. Add addresses from the wallet chip in the top bar (Just watch an address).
          </EmptyTile>
        }
      />
      <p className="terminal-muted">
        {persistence === "memory" ? "Saved addresses are kept in memory only on this page (the browser blocked storage). " : ""}
        Nothing was looked up: no venue and no chain was asked about these addresses. A derived account is an address calculated from the owner, not proof that anything is deployed
        there, and it is not a deposit target until the account map (under the wallet chip) has checked it.
      </p>
    </div>
  );
}

export function SignalsCard() {
  return (
    <Tile tone="info" title="Signals live on the Markets screen" heading="h3" dataKind="signals">
      <p>
        Quotient signals cost money per call, so this terminal never makes one: a paid call runs only from its own button, with its price shown, in the Quotient panel of a market on the{" "}
        <Link href="/">Markets screen</Link> (the Signals view of its table). There is no auto-pay and no loop here.
      </p>
      <p>The agent-side comparison tools this command would use (the pm_ family) do not exist yet.</p>
    </Tile>
  );
}

export function AuditCard({ rows, connection }: { readonly rows: readonly AuditRow[]; readonly connection: string }) {
  const columns: readonly Column<AuditRow>[] = [
    { key: "seq", header: "Seq", align: "end", rowHeader: true, render: (row) => String(row.seq) },
    { key: "at", header: "Time (UTC)", render: (row) => when(row.at) },
    { key: "type", header: "Event", render: (row) => <code>{row.type}</code> },
    { key: "actor", header: "Actor", render: (row) => row.actor },
    { key: "summary", header: "What", render: (row) => <Plain value={untrusted(row.summary)} /> },
  ];
  return (
    <div className="terminal-result" data-kind="audit">
      <DataTable
        caption="Latest audit entries received by this page"
        columns={columns}
        rows={rows}
        rowKey={(row) => String(row.seq)}
        empty={
          <EmptyTile title="No audit entries received" heading="h3">
            {connection === "live" ? "The stream is live and nothing has been logged since it opened." : "The event stream is not live, so nothing has been received. That does not mean nothing happened."}
          </EmptyTile>
        }
      />
    </div>
  );
}

// ---- failures -------------------------------------------------------------------------------------------------------------------------

export function FailureCard({ failure, heading }: { readonly failure: Failure; readonly heading?: string }) {
  const words = failureWords(failure);
  return <ErrorTile code={failure.kind} title={heading === undefined ? words.title : `${heading}: ${words.title}`} message={words.explain} heading="h3" />;
}

// ---- calls ------------------------------------------------------------------------------------------------------------------------

export function CallLine({ record }: { readonly record: CallRecord }) {
  const words = record.failure === null ? null : failureWords(record.failure);
  return (
    <li className="terminal-call" data-status={record.status}>
      <code>{record.label}</code>
      {record.args === null ? null : <code className="terminal-args">{JSON.stringify(record.args)}</code>}{" "}
      <Badge tone={record.status === "ok" ? "ok" : record.status === "running" ? "info" : "danger"}>
        {record.status === "running" ? "running" : record.status === "ok" ? "done" : record.status === "violation" ? "schema violation" : "failed"}
      </Badge>
      {record.durationMs === null ? null : <span className="terminal-muted">{` ${String(record.durationMs)} ms`}</span>}
      {words === null ? null : <span className="terminal-muted">{` ${words.title}`}</span>}
      {record.raw === null ? null : (
        <Disclosure summary="Raw answer, plain text (untrusted)">
          <UntrustedText value={record.raw} maxChars={2000} block />
        </Disclosure>
      )}
      {record.text === null || !isUntrusted(record.text) ? null : (
        <Disclosure summary="Tool text block, plain text (untrusted)">
          <UntrustedText value={record.text} maxChars={2000} block />
        </Disclosure>
      )}
    </li>
  );
}

// ---- dispatcher ---------------------------------------------------------------------------------------------------------------------

export function OutcomeCard({ outcome, onPrefill }: { readonly outcome: Outcome; readonly onPrefill?: Prefill }) {
  switch (outcome.kind) {
    case "help":
      return <HelpCard topic={outcome.topic} />;
    case "status":
      return <StatusCard status={outcome.status} />;
    case "markets":
      return onPrefill === undefined ? <MarketsCard data={outcome.data} /> : <MarketsCard data={outcome.data} onPrefill={onPrefill} />;
    case "market":
      return onPrefill === undefined ? <MarketCard data={outcome.data} /> : <MarketCard data={outcome.data} onPrefill={onPrefill} />;
    case "book":
      return <BookCard market={outcome.market} books={outcome.books} />;
    case "positions":
      return <PositionsCard data={outcome.data} source={outcome.source} />;
    case "positions_target":
      return <PositionsTargetCard problem={outcome.problem} candidates={outcome.candidates} />;
    case "wallet":
      return <WalletCard rows={outcome.rows} persistence={outcome.persistence} />;
    case "signals":
      return <SignalsCard />;
    case "audit":
      return <AuditCard rows={outcome.rows} connection={outcome.connection} />;
    case "clear":
      return null;
    case "failure":
      return <FailureCard failure={outcome.failure} />;
  }
}
