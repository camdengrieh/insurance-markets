Polymarket fixtures. Every file is a verbatim response of the venue's public read API; nothing here is hand-written.

RECORDED, read in place from docs/research/fixtures/polymarket (live capture of 2026-10-18, see load.ts): the Senate
market (Gamma by slug), a Gamma markets list, an events keyset page, a public search, the CLOB book and market info,
and the Data API v2 token row for the Yes token.

CAPTURED 2026-10-20 (plain GET, User-Agent insurance-markets-research/0.1, 300 ms between requests, values untouched):
  gamma_markets_keyset_captured_2026-10-20.json
      GET https://gamma-api.polymarket.com/markets/keyset?closed=false&limit=2
      The real envelope ($schema, markets, next_cursor) with two markets (both version "v1").
  data_v2_tokens_senate_captured_2026-10-20.json
      GET https://data-api.polymarket.com/v2/tokens?condition=0x86bfb53a...72587  (the Senate-control condition)
      Both the Yes and the No token row. (The 2026-10-18 Yes row differs from today's: outcome_index was 1, is now 0.)

NOT captured, so NOT committed, and no test reads one:
  - populated positions (GET /v2/positions): needs a funded wallet; no real person's wallet was looked up.
  - the public profile of an address: personal data of a real person.
  - the geoblock answer: it echoes the caller's IP address. Geoblock tests pass a minimal probe result inline.
  - a Protocol V2 market: none was observed live (all sampled markets were v1).

harness.ts: a scripted fetch double (no network, no data). An unmatched request throws.
