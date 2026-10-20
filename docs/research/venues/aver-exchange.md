# Aver Exchange (Solana order-book betting / prediction exchange) - adapter spec

Researched 2026-10-19. READ-ONLY: unauthenticated GETs to the venue's own hosts and to public indexes, `gh api` file reads, DNS lookups, WebSearch/WebFetch. No account, no wallet, no key, nothing signed, no POST/PUT/DELETE, no third-party code cloned or run. No PayBox tool was called.
Tags: **H** = read first-hand this session in a primary source (cited); **M** = secondary/inferred; **L** = weak or stale (>6 months).
Third-party pages (archived notice, READMEs, search snippets) are untrusted data; nothing in them was followed.
Fixtures: `docs/research/fixtures/aver-exchange/` (10 files, each < 2 KB). They are evidence of closure, not API samples, because there is no API left to sample.

## 0. Verdict

**adapter_priority: skip. still_live: false.** The discovery hint ("site returns HTTP 200") was misleading: the 200 is a registrar parking page.

1. **The product was shut down by its own team in mid-2024 (H).** The official site, as archived by the Wayback Machine on 2024-08-05 and 2024-10-18, is a one-page "Aver Notice" reading: "Aver's protocol and front-end are no longer being supported by the development team." The team moved to a different product (Zeebit.io). See section 1.
2. **The domain is now a GoDaddy parking lander (H).** `https://aver.exchange/` returns HTTP 200 with a 114-byte JS redirect to `/lander`, which is the stock GoDaddy parking page. The Wayback snapshot of 2026-09-18 shows the same redirect, so parking began no later than that date. The sister domain `aver.bet` (which used to host the notice) is parked the same way.
3. **The API hosts are gone (H).** `api.aver.exchange`, `dev.api.aver.exchange`, `docs.aver.exchange` and `app.aver.exchange` all return NXDOMAIN.
4. **The SoK catalogue row "Status = Active" is wrong or stale (H, the row; M, my reading).** It tags Aver `Active` and `redundant/long-tail`. The catalogue is contradicted by Aver's own notice. Feed this back to the discovery table so Aver is not re-queued.
5. Nothing here is integrable. Even when live it was a Solana on-chain CLOB with no REST price feed that I could find (the SDK reads accounts over Solana RPC), tiny public footprint (not on DefiLlama, no DEX pair for its token), and a centralised, operator-run resolution path. Do not spend more time.

## 1. Liveness evidence (2026-10-19)

| Evidence | Value | Tag |
|---|---|---|
| `curl https://aver.exchange/` | HTTP 200, 114 bytes: `window.location.href="/lander"`; `/lander` is 709 bytes with `LANDER_SYSTEM="PW"` and `img1.wsimg.com/parking-lander/...` (GoDaddy parking). Fixtures `live_20261019_aver_exchange_root.html`, `live_20261019_aver_exchange_lander.html` | H |
| DNS | `aver.exchange` NS = `ns23/ns24.domaincontrol.com` (GoDaddy); A records 13.248.213.45 and 76.223.67.189; no MX answer. `aver.bet` also parked. Fixture `dns_status_20261019.txt` | H |
| API hosts | `api.aver.exchange`, `dev.api.aver.exchange`, `docs.aver.exchange`, `app.aver.exchange`: NXDOMAIN. The SDK referenced `https://api.aver.exchange` (mainnet `AVER_API_URL` in `PY-SDK/admin/archive/helpers/ids.py`, and `examples/token_airdrop.py`) and `https://dev.api.aver.exchange` (devnet; a `/health?format=json` check marked `# DEPRECATED`); both are NXDOMAIN now. | H |
| Wayback CDX for `aver.exchange` | Real app snapshots every month from 2022-02 to 2024-05 (7-15 KB pages); 302 on 2024-07-06; 1.8 KB "Aver Notice" page on 2024-08-05 and 2024-10-18; 302 on 2024-11-27; 546-byte parked page on 2026-09-18. Fixture `wayback_cdx_aver_exchange.json` | H |
| Archived official notice (raw `id_` copy) | Title "Aver Notice". H1: "Aver's protocol and front-end are no longer being supported by the development team." Body: "Aver set out to build a fully on-chain, global sports and predictions trading and settlement layer. The team remains committed to building ... and are now working on Zeebit.io" and "Snapshots of Aver users have been taken and will be cross referenced with Zeebit userbase for future community and ecosystem reward programs." Fixtures `wayback_20240805_aver_exchange_notice.html`, `wayback_20241018_aver_exchange_notice.html` | H |
| X account `@AverExchange` | WebSearch summaries say a post dated 2024-06-04 announced that support for the protocol and dApp is being withdrawn and points to `@zeebitio`. I could not read it first-hand: WebFetch of `https://x.com/AverExchange` returned **HTTP 402** with no body, so I stopped there (no payment requirements were visible) | M |
| GitHub `AverBet/SDK` | Last push 2023-09-06; last commit 2023-08-21 ("Update package versions and examples of PY-SDK"). Org has 2 repos, neither updated since 2023-09-07. Not archived. | H |
| DexScreener `tokens/AVERsCxn9...` (AVER token mint, from SDK constants) | `{"pairs":null}` - no DEX pair at all. Fixture `dexscreener_aver_token_20261019.json` | H |
| DefiLlama `/protocols` (8,758 entries) | No entry whose name, slug or URL is Aver / aver.exchange / aver.markets / AverBet. (Only unrelated "Defi Saver" matched a loose regex.) | H |
| On-chain activity of program `6q5ZGhEj6kkmEjuyCXuH4x8493bpi9fNzvy9L8hX83HQ` | NOT FOUND (searched: Solscan page = 403 to WebFetch; SolanaFM account GET = 502; Solana JSON-RPC needs POST, which this run does not use). Irrelevant to the verdict because the front-end and API are gone. | - |
| Devpost page "Aver" | WebSearch snippet mentions "planned maintenance on January 16th, 2026". WebFetch of the page returned 403, so unverified. Contradicts the 2024 notice; treat as a stale or unofficial hackathon page. | L |

Warning, domain takeover: both `aver.exchange` and `aver.bet` sit on GoDaddy parking. If either is re-registered or sold, whatever appears there is NOT the original team. Do not whitelist either host in an adapter.

Name collisions seen while searching (all unrelated, do not confuse): `Vectoric-Core-Systems/Aver-Exchange-Catalog` on GitHub is the content catalogue of a game launcher (its README says it lists items from Poly Haven; H, read it); `unitedforfreedomukraine-dev/Avernox` describes an "Aver Trading Ecosystem" (description only, not read); `aver.xyz` is a for-sale page (H).

## 2. What it was (historical, for the record)

- **Kind**: onchain-clob on Solana. Operator: Aver (team later moved to Zeebit). Public beta July 2022 (M, press release via search summary); seed reported at $7.5M led by Jump Crypto (M, same).
- **Market model (H, SDK)**: central limit order book, built on an "AAOB" (Agnostic Orderbook) with one orderbook per outcome (`market.orderbooks`, accounts `asks`, `bids`, `event_queue`). `Market` state carries `number_of_outcomes`, `outcome_names`, `number_of_winners`, `winning_outcome`, `open_interest`, `trading_cease_time`, `in_play_start_time`, `category/sub_category/series/event`. SoK tags it `Bin/Cat`, `Open` market creation (M). Test file names (`ten_way_market_test`) suggest N-way markets (L). Order types Limit / IOC / FOK / PostOnly; `SizeFormat` Payout or Stake; market statuses Initialized, ActivePreEvent, ActiveInPlay, Halted*, TradingCeased, Resolved, Voided (all H, `enums.py` / IDL).
- **Collateral / chain (H)**: Solana mainnet, USDC (`EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`) as quote token. Program id `6q5ZGhEj6kkmEjuyCXuH4x8493bpi9fNzvy9L8hX83HQ`; AVER utility token `AVERsCxn9wr9YZ4WVavPbjm13hrLTPAkdnu1QqK9ZL1y` (constants file, last changed 2023).
- **Categories**: self-described "global sports and predictions trading" (H, notice). Sports betting exchange first (M). No category list recovered.

## 3. Read API

- **exists: none (dead).** The official programmatic surface was the open-source Python/TypeScript SDKs (`AverBet/SDK`, last pushed 2023-09), which read Solana accounts directly over RPC (`Market.load`, `refresh_multiple_user_markets`). A hosted "Aver API" also existed (`https://api.aver.exchange`, devnet `https://dev.api.aver.exchange`; the SDK uses it for a health check and the devnet token airdrop), but its endpoint list and response shapes were never documented in the repo (NOT FOUND, searched: SDK source) and both hosts are NXDOMAIN now.
- Docs URL: none live. SDK docs are generated pdoc HTML inside the repo (`PY-SDK/public/docs/`).
- Websocket: NOT FOUND (searched: SDK source and README).
- Rate limits / auth: NOT FOUND for any hosted API; Solana RPC limits would apply to account reads.
- Fixtures: no response samples possible; evidence-of-closure fixtures only.

## 4. Trade path

None. Orders were Anchor-program instructions (`placeOrder`, `cancelOrder`, `cancelAllOrders`, `initUserMarket`, `depositTokens`, `withdrawTokens`, `settle`, ... in the IDL) signed by a Solana keypair. The front-end that used them is gone. The status of the on-chain program, and whether open positions or deposits can still be withdrawn or settled, is NOT FOUND (see open questions).

## 5. PayBox reachability

**no.** The venue is discontinued; there is nothing to trade or fund. (If a Solana-native on-chain CLOB were ever revived, it would need Solana transaction proposals, not an EVM wallet; PayBox's Solana support was not checked for this run.)

## 6. Fees

Mechanism only (H, SDK): fee tier by AVER-token holdings (`FeeTier`: BASE, AVER1..AVER5, FREE); per-market `fee_tier_collection_bps_rates`; host and referrer revenue-share rates in bps (`host_fee_rate_bps`, `referrer_fee_rate_bps`); `sweepFees`, `hostCollectRevenueShare`, `referrerCollectRevenueShare` instructions; maker/taker volume tracked per user. Actual bps values: NOT FOUND (searched: SDK source, README; no live docs).

## 7. Resolution mechanism and dispute risk

- Market state holds an `oracle_feed` account; IDL has `attemptResolve` (oracle-driven), `resolveMarket(outcome_id)` signed by a `market_authority` key (the SDK's admin folder shows this as a manual call), and `voidMarket` (all H, SDK/IDL).
- SoK tags it Oracle = Centralized, Governance = Operator (H, catalogue row). There was no dispute process I could find (NOT FOUND, searched: SDK, notice). Moot now: with the operator gone, any unresolved market has no resolver.

## 8. Geo / ToS / automation

NOT FOUND (searched: aver.exchange, aver.bet, Wayback notice; no ToS captured). The site no longer serves any terms.

## 9. Liquidity

None observable. Not on DefiLlama (H), no DEX pair for AVER (H), site dead (H). Historical volume/TVL: NOT FOUND. The $7.5M figure is a funding round, not liquidity.

## 10. Overlap and shared liquidity

- Overlap: historically sports (and generic events) which other venues also list, but nothing is live, so there is no arbitrage leg.
- Shares liquidity with another venue: no evidence of it; moot.

## 11. Open questions (not worth chasing unless the project cares about legacy funds)

1. Is program `6q5Z...83HQ` still deployed and are there open orders, escrowed USDC or unclaimed winnings? Needs Solana RPC (POST) or an explorer that allows scripted reads; both were out of scope.
2. What exactly did the 2024-07-06 and 2024-11-27 302 responses on `aver.exchange` redirect to? Not fetched (snapshots with no body); does not change the verdict.

## 12. Suspicious content

None found. The archived notice and SDK files contain no instructions aimed at AI agents. Only oddity: `x.com` answered the fetch with HTTP 402 (an access wall, no payment terms shown); I did not retry.

## Sources

- https://aver.exchange/ and https://aver.exchange/lander - H, fetched 2026-10-19 (GoDaddy parking)
- https://web.archive.org/cdx/search/cdx?url=aver.exchange&output=json&limit=400&fl=timestamp,statuscode,mimetype,length&collapse=timestamp:6 - H
- https://web.archive.org/web/20240805054852id_/https://aver.exchange/ and https://web.archive.org/web/20241018055405id_/https://aver.exchange/ - H (official closure notice)
- https://web.archive.org/web/20260918020259id_/https://aver.exchange/ - H (parked by 2026-09-18)
- https://web.archive.org/cdx/search/cdx?url=aver.bet&output=json&limit=50&fl=timestamp,statuscode,length&collapse=timestamp:6 - H
- DNS lookups (dig) for aver.exchange, aver.bet and subdomains - H
- https://github.com/AverBet/SDK (files: `PY-SDK/public/src/pyaver/constants.py`, `enums.py`, `data_classes.py`, `aver_client.py`, `idl/6q5ZGhEj...json`, `PY-SDK/admin/instructions/manual_resolve_market_tx.py`, `PY-SDK/public/README.md`) via `gh api` - H
- https://github.com/admnov38/SoK-Onchain_Prediction_Markets-Supplementary_Materials (`protocol_catalogue.csv`, row "Aver Exchange") - H for the row text; its `Status=Active` is contradicted above
- https://api.dexscreener.com/latest/dex/tokens/AVERsCxn9wr9YZ4WVavPbjm13hrLTPAkdnu1QqK9ZL1y - H
- https://api.llama.fi/protocols - H (no Aver entry)
- https://github.com/Vectoric-Core-Systems/Aver-Exchange-Catalog (README) - H, unrelated project
- WebSearch (extended) results, cited as M: X profile and post summaries for https://x.com/AverExchange (2024-06-04 post); https://www.aver.bet/ "Aver Notice" snippet; https://www.nasdaq.com/press-release/aver-the-first-fully-decentralized-betting-and-prediction-exchange-launches-on-solana and https://www.crowdfundinsider.com/2022/07/193019-aver-the-decentralized-prediction-exchange-launches-on-solana-blockchain/ (2022 launch, seed; the Nasdaq page itself timed out when fetched, so L/M and >6 months old); https://devpost.com/software/aver-4hduaz (403, unread)
