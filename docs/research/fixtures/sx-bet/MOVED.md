# Moved

These captures were byte-identical copies of the recordings the venue reader is tested against. To keep
one fixture set per venue they now live only in the SDK (docs/sdk-and-api-design.md step 3). Same bytes, new place:

- `markets_active_pageSize3_2026-10-19.json` -> `sdk/venues/sx/fixtures/markets_active_recorded.json`
- `markets_find_by_hash_2026-10-19.json` -> `sdk/venues/sx/fixtures/markets_find_recorded.json`
- `metadata_obv3_2026-10-19.json` -> `sdk/venues/sx/fixtures/metadata_recorded.json`
- `orderbook_legacy_snapshot_btc_above_82000_2026-10-19.json` -> `sdk/venues/sx/fixtures/orderbook_btc_recorded.json`
- `orderbook_legacy_snapshot_nfl_moneyline_2026-10-19.json` -> `sdk/venues/sx/fixtures/orderbook_nfl_recorded.json`
- `unauth_401_book_best_odds_orders_public.json` -> `sdk/venues/sx/fixtures/unauth_401_recorded.json`

The other files in this folder are research captures that no reader is tested against; they stay here.
