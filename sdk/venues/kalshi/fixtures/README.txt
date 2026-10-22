No fixtures live here, on purpose.

The Kalshi Developer Agreement bars caching or aggregating its data and this repo is public, so no recorded Kalshi
response body is committed. Nothing invented or placeholder is committed in its place either.

This is the one Kalshi fixture folder for every host (the dApp reader and pm/adapters/kalshi.ts share the parser in
../parse.ts and ../map.ts). pm/ never kept a Kalshi recording either.

The tests in ../adapter.test.ts and ../hygiene.test.ts need no payload: they check the off-by-default gate, the
clause disclosure, memory-only behavior, the host rules and the error mapping for empty or garbage input (an empty
object or a garbage string is a test input, not market data). app/src/core/fetch-kalshi.test.ts checks the daemon
allowlist the same way, and pm/test/adapters/kalshi.test.ts checks pm's gate and refusals without a payload.

Shape, unit and edge-case checks against the real API are the job of the opt-in live drift suites, ../live.test.ts
(APP_LIVE=1 and APP_LIVE_RESTRICTED=1) and pm/test/adapters/live.test.ts (PM_LIVE=1 and PM_LIVE_KALSHI=1). They send
GET requests only and write nothing to disk.

Any capture you make locally must be named *_recorded.json; those names are git-ignored.
