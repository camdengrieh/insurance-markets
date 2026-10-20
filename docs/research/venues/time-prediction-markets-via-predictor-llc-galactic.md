# TIME prediction markets (via Predictor LLC / Galactic) - venue spec

Researched 2026-10-19. READ-ONLY: WebFetch page reads, unauthenticated GETs with User-Agent `insurance-markets-research/0.1`. No account, wallet, key, signature, POST or PayBox tool. Third-party pages/responses treated as untrusted data; no embedded instructions to AI agents were seen. WebSearch was unavailable (session budget exhausted), so no press or social coverage was read; the only evidence for a TIME-branded market is the tracker hint, and it was NOT corroborated.

Tags: H = read first-hand in a primary source this session; M = secondary/inferred; L = weak/stale.

Fixtures (<=50KB): `docs/research/fixtures/time-prediction-markets-via-predictor-llc-galactic/`
- `time_market_movers_data_gcs_2026-10-19.json` (data feed behind TIME's free "Market Movers" game)
- `sipredict_markets_page1_first2_2026-10-19.json`, `sipredict_markets_status_ACTIVE_empty_2026-10-19.json` (sibling SI Predict API, same operator family)

## 0. Bottom line

1. **There is no TIME-branded tradable prediction market that I could find (H for absence on time.com).** The only TIME product is `https://time.com/games/market-movers/`: a free "fantasy prediction market game", whose page says it "does not involve real money, wagering, or financial advice". No page on time.com mentions Galactic, Predictor, Truth Network, Kalshi or Polymarket; `/predict/`, `/markets/`, `/prediction-markets/` are 404. (H)
2. **The hint's source is a pending-application line, not evidence of a launch (H).** The tracker row reads: "Predictor LLC (Galactic - powers SI Predict and TIME prediction markets; IB + swap firm application filed Nov 2025)", listed under pending IB applications, no decision reported. (https://mickbransfield.com/cftc-regulated-pms/)
3. **Galactic is real and live, but its venues are not independent of Kalshi or are dormant.** (a) Predictor LLC / predictor.io = NFA Introducing Broker re-skin of Kalshi, same order book (sibling note, H there). (b) SI Predict = Galactic Media Management's own AMM venue on Truth/PRDCTR chain, all 92 markets resolved, last created 2025-07-21, paused since 29 July 2025 (sibling note and re-confirmed here: `status=ACTIVE` returns 0). (c) `api.galacticmarkets.net` answers 200 with `{"version":"0.120.0", "buildTime":"2026-10-13 09:11:35"}`, so the Galactic backend is under active deployment (H), but its endpoints are undocumented and I did not probe them.
4. Likely reading (M, inference): "TIME markets" would be a white-label of the Predictor/Kalshi stack (probabilities in Market Movers include Kalshi-style sports props and Oscars/Senate questions) or a licensed SI-style deal. Neither is verified. If it exists as a Predictor white-label, liquidity = Kalshi's, so it is NOT an independent leg.
5. **adapter_priority = skip.** Nothing to integrate. Optional: if the aggregator wants a "media-signal" source, the Market Movers JSON gives 10 questions/day with a probability but no market ID, no venue attribution and a 1-hour cache; it is a derivative of some unnamed upstream, so use the upstream instead.

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| `GET https://time.com/` | 200; one tile "FANTASY PREDICTION MARKETS" -> `/games/market-movers/`; no other prediction link | H |
| `GET https://time.com/games/market-movers/` | 200; free game; data JSON updated 2026-10-19T03:55Z (`gameVersion 2026-10-18-v3`) | H |
| `time.com/predict/`, `/markets/`, `/prediction-markets/` | 404 after redirect to trailing slash | H |
| Tracker row (mickbransfield.com) | Predictor LLC IB + swap firm application filed Nov 2025, pending | H (that the row says so), L (as to launch) |
| `https://sipredict.com` | 200; "Predictions will pause temporarily on the 29th July"; footer "(c) 2026 ABG SI LLC", disclaimer that content is not that of "Galactic nor ABG SI LLC", "Powered by Truth Network" | H |
| `api.sipredict.com/markets` | total 92, all RESOLVED, all BINARY, createdAt max 2025-07-21, closesAt max 2025-07-30; `?status=ACTIVE` -> 0 | H |
| `https://api.galacticmarkets.net/` | 200, version 0.120.0, buildTime 2026-10-13 | H |
| `https://www.si.com/prediction-markets` | SI promotes Kalshi/Polymarket/DraftKings Predictions/Novig promo codes; no SI-branded operator named | H (WebFetch summary, so M on wording) |
| `https://galacticmarkets.net` | 404; `www.galacticmarkets.com` JS-redirects to `/lander` (not read) | H |

still_live = false for any TIME-branded tradable market (none found). Galactic's backend is alive.

## 2. Kind and market model

- Kind: media-brand front end (broker / licensed brand). TIME itself: editorial game only.
- Market Movers model: not a market. Each daily round shows 2 questions with a `probability` decimal string and `expiresAt`; the player guesses which is more likely. Question categories seen: Sports, Elections, Entertainment, Crypto. (H, fixture)
- If Predictor-white-label: binary YES/NO CLOB on Kalshi, USD, not tokenised (see predictor.io sibling note). If SI-Predict-like: Zeitgeist-style AMM, USDC. Neither confirmed for TIME.

## 3. Chains and collateral

NOT FOUND for any TIME product. Sibling facts: predictor.io = USD in a Plus500US FCM account (no chain); SI Predict = USDC on Truth/PRDCTR appchain, withdraw to Ethereum.

## 4. Read API

| Item | Finding | Tag |
|---|---|---|
| Official docs / API for TIME markets | NOT FOUND (searched: time.com home, /games/market-movers/, /predict/, /markets/, /prediction-markets/, robots.txt grep for games/predict/market) | H |
| Data feed for Market Movers | `GET https://storage.googleapis.com/market-movers-data-bucket-replatform/market-movers-data.json` (URL taken from the page's `dataUrl` field). 200, 5.3KB, `cache-control: public, max-age=3600`, shape `{gameVersion, updatedAt, count, rounds:[{round, questions:[{round, question, probability, category, expiresAt}]}]}`. Unofficial, undocumented, no IDs. | H |
| SI Predict (sibling) | undocumented public REST at `api.sipredict.com` (`/markets`, `/markets/{id}`, `/tags`); fixed page size 20; no trades/book/WS; currently dead markets only | H |
| Galactic backend | `api.galacticmarkets.net` root returns version JSON only; routes not probed | H |
| Websocket / rate limits | NOT FOUND | - |

## 5. Trade path and PayBox reachability

- TIME: none (no real-money product). paybox_reachable = no.
- Galactic family: predictor.io is KYC'd USD FCM brokerage in a web app (no order API); SI Predict is chain-side Substrate-style signing via Privy, undocumented, and market-less now. No EIP-712 or EVM transaction-proposal path exists. (sibling notes, H/M)

## 6. Fees

TIME: n/a. Sibling: SI Predict 0.3% trade fee to LPs + 5% winning fee + 1% chain fee ($0.10 min, $0.50 cap) (terms at https://learn.sipredict.com/terms-and-conditions, H, read in full this session). predictor.io: undisclosed fixed/percent fees on top of Kalshi/FCM fees.

## 7. Resolution and dispute risk

TIME: n/a. If routed via Predictor/Kalshi: Kalshi rules. SI Predict: bespoke compliance-panel resolution at Galactic Markets, void possible; arbitration at LCIA London, Scots law (H, terms).

## 8. Geo / ToS / automation

- Market Movers: public game, TIME Terms of Service at https://legal.time.com/terms-of-service (not read). Reading the GCS JSON is not addressed by any rule I saw; it is an undocumented site asset.
- SI Predict terms (H): 18+, no circumventing geoblocking, no spoofing/wash trading; no bot/API clause; "Platform and Services are launched on behalf of SI under licence; your contractual relationship is solely with GMM". Regulatory disclaimer: "GMM does not represent that these contracts comply with ... the United States Commodity Exchange Act".
- Predictor LLC: NFA IB, US-only retail context (sibling note).

## 9. Liquidity (with dates)

- TIME: none (no trading).
- SI Predict lifetime: 92 markets, sum `totalMonetaryVolume` ~92k USDC, per-market pools 5-20 USDC; 0 open markets (2026-10-19, H via sibling + re-check).
- predictor.io: Kalshi's volume (sibling note).

## 10. Event overlap and shared liquidity

- Market Movers questions are NFL player props, NBA win totals, Oscars, US Senate/governor elections, Solana price: all overlap Kalshi/Polymarket. That is a consumer of those venues' prices, not a venue.
- Shares liquidity: any real TIME market built on Predictor LLC would sit on Kalshi's book (NOT independent). SI Predict is on a separate but dead pool. Map `time-*` to alias `predictor-llc -> kalshi` if it ever appears.
- Re-check triggers: (a) time.com adds a non-game prediction link; (b) the CFTC IB/swap-firm application for Predictor LLC resolves; (c) `api.sipredict.com/markets?status=ACTIVE` total > 0.

## 11. Open questions

- What TIME markets the tracker meant (a press launch may exist that I could not search for).
- Upstream source of Market Movers probabilities (Kalshi? Polymarket? Galactic?). Unattributed in payload.
- Whether Predictor LLC's pending IB/swap-firm application was granted.

## Sources

- https://mickbransfield.com/cftc-regulated-pms/ - H (row text via WebFetch, M on exact wording)
- https://time.com/ , https://time.com/games/market-movers/ (page HTML, `dataUrl`, "does not involve real money") - H
- https://storage.googleapis.com/market-movers-data-bucket-replatform/market-movers-data.json - H
- https://sipredict.com/ , https://api.sipredict.com/markets , /tags - H
- https://learn.sipredict.com/terms-and-conditions - H
- https://api.galacticmarkets.net/ - H
- https://www.si.com/prediction-markets , https://si.com/ (WebFetch summaries) - M
- Sibling notes: docs/research/venues/predictor-predictor-io-predictor-foundation-prdctr-network-ex-truth-network.md ; si-predict-sports-illustrated-galactic-markets-powered-by-truth-network.md ; prdctr-predictor-io-ex-truth-network.md - M (prior sessions, partly re-verified)
