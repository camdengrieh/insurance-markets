# Cap.bet - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY. Tools used: DNS lookups, WebFetch of https://www.cap.bet/, public unauthenticated GETs to CoinGecko and DexScreener, `gh api` repository search. No account, wallet, key, signature, POST/PUT/DELETE or PayBox tool used.

Research limit: the shared WebSearch budget was exhausted before my first query ran (both searches returned "budget used up"). I did not work around this. Everything below therefore comes from CoinGecko/DexScreener API data, DNS/WebFetch failures, and a GitHub search. Nothing was read from an official Cap.bet page, because none is reachable.

Tags: **H** = read first-hand in a primary source this session; **M** = secondary or inferred; **L** = weak or stale.

## 0. Bottom line

1. **Cannot confirm the venue is live (H for unreachability).** `cap.bet`, `www.cap.bet`, `docs.cap.bet` and `api.cap.bet` all return no DNS answer from this host; WebFetch fails with `getaddrinfo ENOTFOUND www.cap.bet`. One-host DNS failure is not proof of shutdown (could be a local resolver issue), but combined with the token data below the venue should be treated as dead or unverifiable.
2. **The only evidence of a product is a Solana pump.fun memecoin "CAP" (H).** CoinGecko lists id `cap-3`, platform Solana, contract `7E2iF4WFs5biCtkAVFCBPEdnpg7t2D19VzxjxEPvpump` (a `...pump` suffix is the pump.fun launchpad convention, M). Categories: "Gambling (GambleFi)", "Prediction Markets", "Solana Ecosystem", "Pump.fun Ecosystem". Homepage `https://www.cap.bet/`, X handle `capdotbet`. No GitHub repo, no whitepaper, no docs, no Telegram listed.
3. **The token has collapsed (H, CoinGecko, 2026-10-11).** Market cap USD 9,713, 24h volume USD 2.70, price USD 9.72e-06, versus ATH USD 0.0279 on 2026-06-26 and a peak market cap of about USD 26.8M on 2026-07-01 (daily chart). That is a ~99.96% drawdown. CoinGecko shows zero tickers (`{"name":"Cap","tickers":[]}`) and DexScreener returns `"pairs":null` for the contract, i.e. no tradable DEX pair is indexed.
4. **No API, no contract, no market data found.** NOT FOUND (searched: DNS for four hostnames, WebFetch of homepage, GitHub repo and user search for "cap.bet"/"capdotbet", CoinGecko links block, awesome-list README of aarora4/Awesome-Prediction-Market-Tools, no mention). The "bet on anything in one click" blurb in the discovery hint was not independently verified.
5. **adapter_priority = skip.**

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| DNS `cap.bet`, `www.cap.bet`, `docs.cap.bet`, `api.cap.bet` | no records | H |
| WebFetch `https://www.cap.bet/` | `getaddrinfo ENOTFOUND www.cap.bet` | H |
| CoinGecko `cap-3` last_updated | 2026-10-11T20:31:41Z, price/mcap still tracked, 24h vol USD 2.7 | H |
| DexScreener `/latest/dex/tokens/<mint>` | `pairs: null` | H |
| CoinGecko tickers | empty | H |
| Product launch date, any product release | NOT FOUND | - |

Verdict: **still_live = false (unverified)**. The homepage does not resolve and the token is effectively dead; I could not see any prediction-market product. Caveat: low confidence because no search tool was available.

## 2. Kind and market model

NOT FOUND. Per CoinGecko category only (M): token tagged GambleFi + Prediction Markets, on Solana. No evidence of order book, AMM or parimutuel, outcome tokenisation, or categorical/scalar support. Kind = `onchain-other` is unconfirmed; may be a memecoin with a marketing site, not an exchange.

## 3. Chains and collateral

- Token chain: Solana (H, CoinGecko). Mint `7E2iF4WFs5biCtkAVFCBPEdnpg7t2D19VzxjxEPvpump` (a public token mint, not a user wallet).
- Betting chain/collateral: NOT FOUND.

## 4. Read API

Exists: **none found**. Base URLs: none. Docs URL: none. Endpoints: none. Auth/limits: n/a. Websocket: none found. Fixtures saved are only token metadata (section 11), not market data.

## 5. Trade path

None found. No docs, SDK, contract address or program ID for any betting program was located.

## 6. PayBox reachability

**No (M).** Even if a Solana program existed, there is no documented instruction set or order schema to propose through PayBox; no EVM deployment is known. The CAP memecoin itself has no DEX pair indexed, so even swapping into it is not reliably possible.

## 7. Fees, resolution, geo/ToS

All NOT FOUND (site unreachable, no docs).

## 8. Liquidity

- Token market cap USD 9,713; 24h volume USD 2.70 (CoinGecko, 2026-10-11) (H).
- Prediction-market volume/OI/TVL: NOT FOUND.
- Peak token market cap about USD 26.8M on 2026-07-01 (CoinGecko daily chart, H), so the hype was short-lived; the collapse is recent, not stale.

## 9. Category overlap and independence

Unknown. "Bet on anything" (M, unverified blurb from discovery) suggests generic event markets but nothing confirms which. Independence from other venues: cannot be assessed; no evidence either way. Not usable as an arbitrage leg.

## 10. Priority

**skip**: homepage does not resolve, no docs/API/contracts, token liquidity effectively zero. Revisit only if `cap.bet` resolves again and publishes docs, or if the X account `capdotbet` links a real product (check manually).

## 11. Fixtures (docs/research/fixtures/cap-bet/)

- `coingecko-cap-3.json` - trimmed token record (H, GET `https://api.coingecko.com/api/v3/coins/cap-3`).
- `coingecko-cap-3-chart-sampled.json` - sampled daily price/market cap and peak (GET `.../coins/cap-3/market_chart?vs_currency=usd&days=365&interval=daily`).
- `dexscreener-token-no-pairs.json` - response shape `{"schemaVersion":"1.0.0","pairs":null}` (GET `https://api.dexscreener.com/latest/dex/tokens/<mint>`).

## 12. Suspicious content

None encountered. No third-party page text was read, so no embedded instructions were possible.

## Sources

- CoinGecko coin record: https://api.coingecko.com/api/v3/coins/cap-3 (H, 2026-10-19 fetch; data last_updated 2026-10-11)
- CoinGecko markets list for category prediction-markets: https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&category=prediction-markets (H)
- CoinGecko tickers and market_chart for cap-3 (H)
- CoinGecko categories list: https://api.coingecko.com/api/v3/coins/categories/list (H)
- DexScreener token lookup: https://api.dexscreener.com/latest/dex/tokens/7E2iF4WFs5biCtkAVFCBPEdnpg7t2D19VzxjxEPvpump (H)
- https://www.cap.bet/ (attempted; unresolvable) (H for failure)
- GitHub search for "cap.bet" / "capdotbet" (H: no relevant repo)
- aarora4/Awesome-Prediction-Market-Tools README (H: no mention of cap.bet)
- CoinCodex blurb "bet on anything in one click" (M, from the discovery hint only, not read)
