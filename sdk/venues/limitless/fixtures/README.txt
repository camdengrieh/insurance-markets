market_detail_recorded.json and orderbook_recorded.json: copied from docs/research/fixtures/limitless
(captured 2026-10-19, GET only). market_detail_recorded.json is one market, trimmed (the creator's address was
removed and the description is cut short); orderbook_recorded.json is its YES-side book. Neither was modified
here. The market detail has no expirationTimestamp, only a human date, so tests add one where they need it.
The list envelope ({ data: [...], totalMarketsCount }) was NEVER recorded: tests wrap the recorded market in it.
Group markets, a non-USDC market and malformed rows are built in the tests from the recorded market (synthetic).
fake-fetch.ts: a scripted fetch double (no network). An unmatched request throws; the longest matching prefix
wins. The Kalshi, SX Bet and UDX tests in sdk/venues and the app's fetch-<venue> tests import this same double.

Added 2026-10-20: markets_active_list_captured_2026-10-20.json is a verbatim live capture (plain GET, User-Agent
insurance-markets-research/0.1) of GET https://api.limitless.exchange/markets/active?limit=3&page=1, which is the real
list envelope ({ data, totalMarketsCount }) with three real markets. The earlier statement that the envelope was never
recorded no longer holds; tests that need other rows or a different total put them into this envelope (listOf in
adapter.test.ts). Group markets, a non-USDC market and malformed rows are still built in the tests from the recorded
market (inline test inputs, not venue output).

Moved 2026-10-21 from app/src/venues/limitless/fixtures with the reader (docs/sdk-and-api-design.md step 3): this is the one
Limitless fixture set. pm/ kept no recorded Limitless body of its own (the recorder tests build synthetic bodies in
pm/test/recorder/helpers.ts), so there was nothing to merge. pm/test/core/category.test.ts and pm/test/linker/cli.test.ts
read the captured list from here.
