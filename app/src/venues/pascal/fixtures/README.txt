markets_recorded.json and books_recorded.json: copied from docs/research/fixtures/pascal (captured 2026-10-19,
GET only, unmodified apart from the `_fixture_note` key each already carried). They hold 5 of 3,255 markets and
3 books.
Nothing hand-written is committed. The earlier hand-written hostile-markets file and populated-account file were
deleted:
  - hostile market text is built inside adapter.test.ts from the first recorded market with a few fields replaced;
  - the populated /accounts/{owner} answer was never observed (it is a funded wallet), so only the 404 and garbage
    cases are tested.
fake-fetch.ts: a scripted fetch double (no network, no data). An unmatched request throws.
