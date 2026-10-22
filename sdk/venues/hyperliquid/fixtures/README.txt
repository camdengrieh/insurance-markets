Hyperliquid fixtures. Every file is a verbatim response of the venue's public read API, captured 2026-10-20
(05:56 to 05:58 UTC) with a User-Agent of insurance-markets-research/0.1, 300 ms between requests. Hyperliquid's
public read API has no GET routes: each answer comes from POST https://api.hyperliquid.xyz/info with a read-only
query body (the adapter sends exactly these four query types and nothing else). Values are exactly as received;
the files are trimmed to a handful of items.

  outcome_meta_captured_2026-10-20.json    {"type":"outcomeMeta"}
      14 of 324 outcomes, 2 of 33 questions (question 480 and its four outcomes, question 484 and its four, six
      standalone outcomes), the first 2 of the deployers, and feeScale. Real shapes include the legacy "Recurring"
      class and the "template:" classes, and the extra keys quoteToken, venue and deployerFeeScale.
  all_mids_captured_2026-10-20.json        {"type":"allMids"}
      only the "#" keys of those outcomes plus three non-outcome keys (BTC, ETH, @107).
  l2_book_yes_captured_2026-10-20.json     {"type":"l2Book","coin":"#143480"}   (outcome 14348, side Yes)
  l2_book_no_captured_2026-10-20.json      {"type":"l2Book","coin":"#143481"}   (the No side)
  settled_outcome_captured_2026-10-20.json {"type":"settledOutcome","outcome":95}
      identical to the official documentation's sample, which is itself a real settled outcome.

These replace the earlier websocket-frame stand-ins, the documentation samples and the hand-written metadata file
(deleted). Rows that no capture covers (hostile text, an unparseable close time, malformed rows) are built inside
adapter.test.ts from copies of captured outcomes; they are not venue output.
The shape-status constant in adapter.ts is left as it was: CORS headers of the POST answers were not measured.
fake-fetch.ts: a scripted fetch double (no network, no data). An unmatched request throws.
