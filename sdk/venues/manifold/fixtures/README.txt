search_markets_recorded.json and market_detail_recorded.json: copied from docs/research/fixtures/manifold
(captured 2026-10-19, GET only, user ids stripped). The `url` fields are never read by the adapter.
No hand-written file is committed. The tests that need a mixed list (multiple choice, the CASH token, a bad
probability, closed/resolved/cancelled rows) or hostile text build those rows inside adapter.test.ts from the first
recorded row or the recorded detail, replacing only the fields a test is about; they are not venue output.
fake-fetch.ts: a scripted fetch double (no network, no data). An unmatched request throws.
