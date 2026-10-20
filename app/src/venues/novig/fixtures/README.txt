No Novig response is committed. Novig has restricted terms, so the earlier recorded copies of its public routes were
deleted along with every test that read a payload. The adapter is covered here only by payload-free tests (the gate,
request hygiene, the closed error set, the caps) and by the opt-in live drift test (live.test.ts).
fake-fetch.ts: a scripted fetch double (no network, no data). An unmatched request throws; the longest matching
prefix wins. Several other modules' tests import this same double.
