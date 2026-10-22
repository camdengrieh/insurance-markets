Polymarket fixtures: the one recorded fixture set for Polymarket, shared by the SDK reader's tests (vitest) and the
pm adapter's tests (pm/test/adapters/polymarket.test.ts). Every JSON file is a verbatim response of the venue's public
read API; nothing here is hand-written.

RECORDED 2026-10-18, copied byte for byte from docs/research/fixtures/polymarket (the research capture, which stays
where it is as evidence for the notes):
  gamma_market_by_slug_recorded_2026-10-18.json   GET gamma /markets/slug/<Senate-control slug>
  gamma_markets_list_recorded_2026-10-18.json     GET gamma /markets (legacy list, a bare array of two sports markets)
  gamma_events_keyset_recorded_2026-10-18.json    GET gamma /events/keyset (one page)
  gamma_public_search_recorded_2026-10-18.json    GET gamma /public-search
  clob_book_recorded_2026-10-18.json              GET clob /book?token_id=<Senate Yes>
  clob_market_info_recorded_2026-10-18.json       GET clob /clob-markets/<Senate condition>
  data_v2_tokens_recorded_2026-10-18.json         GET data /v2/tokens?condition=<Senate> (the Yes row)

CAPTURED 2026-10-20 (plain GET, User-Agent insurance-markets-research/0.1, 300 ms between requests, values untouched):
  gamma_markets_keyset_captured_2026-10-20.json
      GET https://gamma-api.polymarket.com/markets/keyset?closed=false&limit=2
      The real envelope ($schema, markets, next_cursor) with two markets (both version "v1").
  data_v2_tokens_senate_captured_2026-10-20.json
      GET https://data-api.polymarket.com/v2/tokens?condition=0x86bfb53a...72587  (the Senate-control condition)
      Both the Yes and the No row. (The 2026-10-18 Yes row differs from today's: outcome_index was 1, is now 0.)

NOT captured, so NOT committed, and no test reads one:
  - populated positions (GET /v2/positions): needs a funded wallet; no real person's wallet was looked up.
  - the public profile of an address: personal data of a real person.
  - the geoblock answer: it echoes the caller's IP address. Geoblock tests pass a minimal probe result inline.
  - a Protocol V2 market: none was observed live (all sampled markets were v1).

MOVED 2026-10-21 from pm/test/recorder/fixtures/polymarket-events.json (so that every Polymarket recording lives here):
  gamma_events_list_trimmed_captured_2026-10-20.json
      GET https://gamma-api.polymarket.com/events?active=true&closed=false&limit=20&offset=0&order=volume24hr&ascending=false
      Captured 2026-10-20 with a plain unauthenticated GET (User-Agent insurance-markets-research/0.1), then trimmed: a
      bare list holding 4 of the 20 events. Events and markets are cut down to the fields the recorder's discovery reads
      (ids, flags, dates, outcomes, token ids, fee fields, 24 h volume). The large neg-risk event is cut from 128 to its
      first 70 markets, with fewer fields per market. No titles, descriptions or other text: the market rows have no
      `question` (and the large event's rows no `slug`), so a test that reads them with parseGammaMarket adds a labelled
      SYNTHETIC question and slug. Every value present is as the venue returned it. Read by parseEventsList (index.ts)
      and pm/test/recorder/discover.test.ts.

harness.ts: a scripted fetch double (no network, no data). An unmatched request throws.
load.ts: typed accessors over the files above, cloned on every call.
