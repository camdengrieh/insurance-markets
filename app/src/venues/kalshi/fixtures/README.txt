No fixtures live here, on purpose.

The Kalshi Developer Agreement bars caching or aggregating its data and this repo is public, so no recorded Kalshi
response body is committed. Nothing invented or placeholder is committed in its place either.

The tests in ../adapter.test.ts and ../hygiene.test.ts need no payload: they check the off-by-default gate, the
clause disclosure, memory-only behavior, the host and daemon allowlist, and the error mapping for empty or garbage
input (an empty object or a garbage string is a test input, not market data).

Shape, unit and edge-case checks against the real API are the job of the opt-in live drift suite, ../live.test.ts.
It runs only with APP_LIVE=1 and APP_LIVE_RESTRICTED=1, sends GET requests only and writes nothing to disk.

Any capture you make locally must be named *_recorded.json; those names are git-ignored.
