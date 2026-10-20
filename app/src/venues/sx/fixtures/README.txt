*_recorded.json: copied from docs/research/fixtures/sx-bet (captured 2026-10-19, GET only), not modified:
  markets_active_recorded.json  GET /markets/active?pageSize=3 (three NFL rows)
  markets_find_recorded.json    GET /markets/find?marketHashes= (one crypto market)
  metadata_recorded.json        GET /metadata/obv3
  orderbook_nfl_recorded.json   legacy GET /orderbook-v3/snapshot?marketHash= (NFL moneyline); a { note, response }
                                wrapper written by the research notes
  orderbook_btc_recorded.json   the same for a BTC daily-strike market (round numbers: hand-checkable shares)
  unauth_401_recorded.json      the 401 body of a key-gated route, as the research recorded it
The public trade tape was NOT copied: its rows carry bettor addresses and usernames, and the adapter does not
use that route. Off-ladder odds, crossed books, off-book markets and hostile text are built in the tests from the
recorded rows (synthetic).
