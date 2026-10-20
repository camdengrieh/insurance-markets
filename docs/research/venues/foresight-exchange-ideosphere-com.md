# Foresight Exchange (ideosphere.com) - venue spec

Researched 2026-10-19. Tags: H = read first-hand this session in a primary source, M = secondary/inferred, L = weak/stale.

## Verdict

adapter_priority: **skip**. A play-money (FX-bucks) game with no money, no chain, no API, no trading activity in the last 7 days, and a 1990s CGI/telnet/email interface. It cannot be an arbitrage leg. Its only conceivable use is as a free, slow "signal" for long-dated science/tech/politics claims, and even that is not worth an adapter.

## Liveness

- [H] The site is up but only over plain HTTP. `http://www.ideosphere.com/` returns 200 (Server: Apache/2.2.3 CentOS, an ancient stack). HTTPS (port 443) refuses connections for both `ideosphere.com` and `www.ideosphere.com`. This explains the earlier "refuses connections" hint, which was an HTTPS-only probe. DNS resolves to 173.255.208.217 (name.com nameservers).
- [H] Summary report page (http://www.ideosphere.com/fx/summary.html): leaderboard "as of 2026/10/17 05:14:22 GMT", other reports "current as of 2026/10/18 14:31:43 GMT". So the server's cron jobs still run.
- [H] Same page, 2026-10-18 snapshot: "Top 10 Claims by Transaction Volume in the Last 7 Days" is empty (Total 100%, no rows); "Top 10 Players by Number of Trades in the Last 7 Days" is empty; "New Players in the Last 7 Days: Count = 0"; "Claims in the Proposal/Approval Process: [None]". Net: server alive, zero trading and zero signups in the past week.
- [H] The newest trade I saw on claim 13Gy (ticker) is dated 2003-11-04 (ticker page for that claim; the ticker may be truncated, see Fixtures). Not proof of overall inactivity, but consistent with it.
- [M] A web search found a LessWrong thread (~2020) saying there is almost no activity at ideosphere.com. The search tool's summary said the same; I did not open the thread. Treat as stale (L).
- [M] Not the Base project "Ideosphere" (ideosphere.io), as the hint says.
- Operator: footer "Prediction market software by Consensus Point"; the Foresight Exchange page says it is "affiliated with Consensus Point" in a commented-out line [H]. Contact: info@ideosphere.com (public address on the site) [H]. Robin Hanson's page says the Ideosphere business is wholly owned by Kumo Software and seems defunct [M, via search summary, not opened].

## Kind and market model

- kind: forecasting-nonmoney (play money "FX-bucks").
- [H] Binary claims only. YES coupon pays 1 FX-buck if the claim is judged true, NO pays 1 minus YES. Judge can set a partial payoff in [0,1] ("A judge may enter a judgement by entering payoff on YES coupons in range [0,1], decimals allowed", http://www.ideosphere.com/fx/docs/rules.html). Docs index also mentions "Conjuncts" and "Scaled Payoffs" (http://www.ideosphere.com/fx/docs/index.html; content pages not read).
- [H] Central limit order book (continuous double auction), orders typed as `B50@75` / `S25@35` (buy 50 at 75 percent, sell 25 at 35), in FX-cents; shorting is done by selling coupons ("A negative number means that you have sold coupons"). Source: http://www.ideosphere.com/fx/docs/FXdocs.html.
- Outcomes are not tokenised; they are rows in the server's database keyed by claim symbol (e.g. `13Gy`) and player uid.
- [H] Claim categories (from the ListClaims form): Arts and Entertainment (Entertainment Technology, Literature, Movies, Television), Finance (US, World), Misc (Religion/New Age), News (Disasters, US, World), Politics (UK, US), Science and Technology (Computer Industry, Benchmarks, Computing Theory/AI, Encryption/Factoring, General Science, Idea Futures, Internet, Math, Medicine, Physics, Space, Technology).

## Chains and collateral

None. Collateral is FX-bucks, a play currency with a weekly "allowance" (rules page; the numeric values are blank in the served page) [H]. No on-chain component, no token, no wallet.

## Read API

exists: **none** official. Only HTML pages (and an email/telnet command interface).

- Base: `http://www.ideosphere.com` (HTTP only).
- Docs: http://www.ideosphere.com/fx/docs/FXdocs.html (human help); a "FXTP" doc is linked from the docs index but I did not find it (`/fx/docs/fxtp.html` 404; NOT FOUND, searched: that path, the docs index, FXdocs.cgi).
- [H] Useful public GET pages (HTML, scrape-only):
  - `/fx/summary.html` - weekly reports (top players, volume, price moves, proposals).
  - `/fx-bin/Claim?claim=<symbol>` - claim wording, category, judge, owner, status ("JUDGED at 100"), price plot. Works with unauthenticated GET.
  - `/fx-bin/Ticker?claim=<symbol>&duration=7` - trade tape in a `<pre>` block with columns Quant, Price, Date, GMT, Pairs, People, Buyer, Seller. Works via GET even though the form is POST.
  - `/fx-bin/ListClaims` and `/fx-bin/AllAccounts` - the forms are POST; GET returns only the empty form. I did not POST (read-only rules), so how to enumerate active claims and their bid/ask is NOT FOUND via GET. The docs say bid/ask/last are shown on the logged-in Account page (needs uid; password only for trades) [H].
- Auth: none for the pages above; no rate limits documented (NOT FOUND, searched: docs, robots.txt returns 404). No websocket.
- Email/telnet interface: `telnet ideosphere.com:7002` or mail to the fx@ address with commands like `register`, `activate`, `help` [H, FXdocs.html]. Not tested (would require an account).

## Trade path

Account-based only: register with an email and a nym, receive a password by email, activate to get a uid; trade via web form (uid + password), email commands or telnet [H, FXdocs.html]. No API keys, no signing scheme. One account per email address. Not tested (no sign-ups allowed in this task).

paybox_reachable: **no**. There is no chain, token or order-signing path; FX-bucks cannot be funded or withdrawn. A PayBox EVM/Solana wallet is irrelevant.

## Fees

[H] Play-money only. A claim proposal costs an FX-buck fee ("fee to start a claim", amount blank on the served page; part pays the judge, part is a transaction cost). No trading fee documented. Rules page: http://www.ideosphere.com/fx/docs/rules.html.

## Resolution

[H] Human judge named by the claim owner at creation; wording locked after a 7-day approval period; judge enters YES payoff in [0,1]; claim moves ACTIVE to RETIRED. Judge's ambiguity statements are per claim (example on 13Gy: "look for a solution that causes the least damage to FX as a market and game"). Dispute risk is high and slow (13Gy was created 1995-09-07, due date "TBD", judged at 100 only much later). No appeal mechanism found.

## Geo / ToS / automation

[H] Docs: "this is not real money"; "FX is essentially unregulated"; one account per email; "You may only control one IF account"; "You may not trade with the purpose of transferring money between accounts"; penalties "at the whim of the FX administrators". Docs copyright: excerpts require permission from Ideosphere. No explicit bot/automation policy found (NOT FOUND, searched: FXdocs, rules). No geo restrictions found; no KYC (email only). Being play money, there is no gambling-law exposure.

## Liquidity

- [H] 2026-10-18 summary: zero transaction volume in 7 days, zero trades by any player, zero new players. Top-10 networth range ~8.5k to 21.7k FX-bucks (leaderboard 2026-10-17). In practice, liquidity is nil and prices are effectively stale.
- No real-money OI/TVL exists (play money).

## Event overlap / arbitrage relevance

Categories nominally include US/UK politics, US/world finance and news, but the claims are 1990s-2000s era long-dated statements (e.g. "Universe older than 13 Gyears" created 1995). Prices come from a handful of hobbyists and are stale; no overlap that supports arbitrage. A play-money price cannot be arbitraged against real-money venues anyway (no way to settle). liquidity_shared_with: none.

## Adapter priority: skip

Reasons: play money; no API and POST-only listing pages; HTTP-only; zero trades in the last week; no chain; stale claims; resolution by individual judges taking years. If ever wanted as a curiosity signal, a daily scrape of `Claim?claim=<symbol>` for a hand-picked few symbols would work, but that is not worth engineering time.

## Fixtures (public unauthenticated GETs, 2026-10-19)

Saved in `docs/research/fixtures/foresight-exchange-ideosphere-com/`:
- `home.html` - home page (top-10 players; empty volume table).
- `summary.html` - weekly summary report (shows zero activity).
- `claim-13Gy.html` - claim page for symbol 13Gy.
- `ticker-13Gy-head.txt` - first 40 lines of the ticker `<pre>` block for 13Gy (full response was 99 KB, truncated).

## Sources

- http://www.ideosphere.com/ [H]
- http://www.ideosphere.com/fx/summary.html [H]
- http://www.ideosphere.com/fx/docs/FXdocs.html [H]
- http://www.ideosphere.com/fx/docs/index.html [H]
- http://www.ideosphere.com/fx/docs/rules.html [H]
- http://www.ideosphere.com/fx-bin/Claim?claim=13Gy [H]
- http://www.ideosphere.com/fx-bin/Ticker?claim=13Gy&duration=7 [H]
- http://www.ideosphere.com/fx-bin/ListClaims [H] (form only)
- https://fr.wikipedia.org/wiki/Marché_prédictif [M] (discovery evidence; not opened)
- Web search (extended) for "Foresight Exchange ideosphere.com" surfacing a LessWrong thread "Are there any active play-money prediction markets online?" (~2020) and a Hanson Idea Futures page [M/L; summaries only, not opened]

## Suspicious content

None found. The pages carry only Google AdSense/Urchin analytics scripts (third-party, not followed) and no instructions aimed at AI agents.

## Open questions

- How to enumerate active claims and current bid/ask without an account or POST (not tested).
- Whether FXTP (the FX trading protocol) is documented anywhere.
- Whether anyone but the site operator still logs in (the zero-activity snapshot is one week only).
