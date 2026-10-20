# SUPERFORTUNE (superfortune.xyz, token GUA) - venue spec for the cross-venue aggregator

Researched 2026-10-19 (probe clock about 03:40-03:50 UTC). READ-ONLY: page and doc reads, public unauthenticated GETs to the app's own API host, Sourcify and DexScreener public GETs, no account, wallet, key, signature, POST, on-chain call or PayBox tool. Third-party pages, the site's JS bundle and API responses were treated as untrusted data; nothing in them was followed. No third-party code was cloned or run.

Tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source, small-model page summary, or my inference; **L** = weak or stale.

Fixtures (real responses, each <= 50 KB): `docs/research/fixtures/superfortune/` (listed in section 12).

---

## 0. Bottom line

1. **Live, but it is not a prediction market.** SUPERFORTUNE is a gamified "AI metaphysics" (Bazi / I Ching) entertainment dApp plus a BNB Chain token (GUA). The site and API respond today (2026-10-19). The "Prediction Market engine" wording on CoinMarketCap is token marketing. (H for liveness, H for product scope)
2. **No wagerable markets were found anywhere official.** The docs, the app's route table (144 distinct routes) and its English UI strings contain no market list, order book, AMM, odds, stake, bet, payout or settlement flow. The only "predict" feature is a free per-token "Market Trends" AI report (limited free uses per 24h). (H, see section 2)
3. **The product's own terms say its outputs are randomised entertainment.** "Results follow predetermined ratios and patterns designed to enhance user engagement ... randomization for entertainment value." Not a signal source either. (H, section 8)
4. **The one prediction-flavoured item is stale.** A FIFA World Cup 2026 section exists in the API (schedule, results, standings, per-user "prediction stats"); the final was 2026-07-19 and the match-list endpoint still labels all 104 fixtures `upcoming` on 2026-10-19. Per-user prediction endpoints are empty or auth-gated. No stake or payout appears in any of it. (H)
5. **adapter_priority = skip.** No markets to quote, no trade path, no resolution mechanism, no independent liquidity. Revisit only if the team ships a real market contract (watch the BSC campaign proxy in section 3 and the docs site).

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| `https://superfortune.xyz` | HTTP 307 to `https://app.superfortune.xyz/` (Vercel) | H (curl -I) |
| App shell | HTTP 200, `last-modified: Sun, 18 Oct 2026 04:53:44 GMT`; `<title>SUPERFORTUNE</title>`; SPA (React/Vite) with an empty `#root`, which is why page fetchers only saw the title | H |
| Docs | `docs.superfortune.xyz` and `docs.superfortune.ai` both 307 to `https://superfortune.gitbook.io/superfortune/` (GitBook). Sections: Welcome, What is SUPERFORTUNE, Platform Overview (Fortune Reading, Fortune Charms, Whack the Villain, Karmic Vault, Fortune Points and QIAN, Key Texts), Tokenomics, Referral Rewards, Quick Reference. No prediction-market page. | H (WebFetch of the GitBook pages; page list from its llms.txt) |
| App API | `https://api.app.superfortune.xyz` returns HTTP 200 JSON on public GETs (section 4) | H |
| `airdrop.superfortune.xyz` | HTTP 200, `last-modified: Fri, 16 Oct 2026 10:33:48 GMT` (content is another SPA shell; purpose not read) | H (headers) / L (content) |
| Token | GUA trades: DexScreener shows one BSC pair (Uniswap-family, GUA/USDT) priced 0.02895 on 2026-10-19; CMC page captured 2026-10-19 shows price 0.02903, all-time low 0.02772 on 2026-10-18 and all-time high 2.35 on 2026-06-09 (down about 98.8%) | H (DexScreener API) / M (CMC via page summary) |
| Campaigns | `/campaign/campaigns` returns 8 campaigns, all `status:3`, latest `end_time` 1771977600 (2026-02-25). No active campaign. | H |
| Source repo | CMC links `github.com/manta-Network/super-fortune-backend`: `gh api repos/manta-Network/super-fortune-backend` returns 404 (private or removed). Not in the Manta-Network org listing. | H |

Verdict: **still_live = true as an entertainment and token-analytics app; there is no live prediction market.**

---

## 2. Kind and market model

- **Kind (H):** consumer "fortune" / gamification dApp (daily fortune reading, token "energy" check, person-to-person compatibility, MBTI, "Whack the Villain" game, "Karmic Vault" burn ritual, NFT "charms", incense, referral and red-packet marketing campaigns). The GitBook states the product is "an AI-powered InfoFi engine" offering free daily readings, token energy checks and X-user compatibility. Source: https://superfortune.gitbook.io/superfortune/welcome (WebFetch summary).
- **"Prediction" in the product (H):** English UI strings containing "predict": `market.predict = "Predict"`, `market.freePredictionLeft = "Free Predictions Left"`, `market.dialogDesc1 = "Only {{count}} free prediction within 24 Hours"`, `market.dialogDesc2 = "Reports remain valid for 24 hours after prediction"`, `dailyFortune.v2.trendPrediction = "Market Trends"`. This is a metered AI report per token, not a market. Source: `https://app.superfortune.xyz/locales/en/translation.json` (69.8 KB, fetched).
- **Absent (H, bundle and locale search):** no occurrences of wager, odds, payout or settle in app code outside bundled wallet libraries; no outcome tokens; no order book or AMM; no market identifiers; no contract call for placing a position.
- **CoinGecko claim (M):** its page says the platform "Hosts multi-project red packet campaigns and prediction markets for global events like the World Cup 2026" and that BNB Chain contracts "settle prediction market outcomes". I found no code or doc corroboration. The red-packet campaigns are marketing reward draws (reward_amount per tier, section 6), and the World Cup section is data plus a per-user stats endpoint. Treat the CoinGecko sentence as marketing copy. Source: https://www.coingecko.com/en/coins/superfortune (page summary).
- **Market model for the adapter:** none. Not binary, categorical or scalar; no outcome tokenisation.

---

## 3. Chains and collateral

| Item | Value | Tag |
|---|---|---|
| Token GUA | BEP-20 on BNB Smart Chain, contract `0xa5c8e1513b6a08334b479fe4d71f1253259469be`, 1,000,000,000 total supply | M (CMC, CoinGecko, BingX summaries agree; DexScreener lookup by this address returned the GUA pair, which corroborates the address) |
| App payments | App config carries BSC mainnet plus Solana mainnet, with Solana USDC and USDT addresses, for buying charms, NFTs and items | H (bundle config) |
| Campaign contract | `BSC_CAMPAIGN_CONTRACT_ADDRESS` in the production config: `0xD4F3777597fF189BeD89aA19455e37DC9d15C981`. Sourcify: verified (match, 2026-09-10) as an OpenZeppelin v4 `TransparentUpgradeableProxy`; EIP-1967 implementation `0x9FFfe544c7b5d90026715a3F65D237845D40dF96`, whose source is **not** on Sourcify (404). Function surface unknown, so I cannot say what it settles. | H (Sourcify) |
| Collateral for any "market" | NOT FOUND (searched: docs, bundle, locale strings, Sourcify, CMC/CoinGecko). | - |
| In-app currency QIAN | Centrally issued, non-tradable, off-chain ("no onchain liquidity"). GUA is "not used for in-game payouts". | H (GitBook tokenomics page) |
| Manta tie | Incubated by Manta Labs; GUA is not on Manta Pacific per the sources I read | M (CMC, BingX) |

---

## 4. Read API

**Exists: unofficial-but-public (app backend); no developer docs.** Nothing is documented for third parties. The endpoints below are those the production web app calls, taken from the JS bundle route table and confirmed with GETs. All of it is app data (tokens, price, campaigns, sports schedule), none of it is market data.

| Item | Value | Tag |
|---|---|---|
| Base URL | `https://api.app.superfortune.xyz` (Express behind APISIX/3.3.0, `Server: APISIX/3.3.0`, `X-Powered-By: Express`); AI report host `https://api.app.superfortune.ai` (not probed) | H |
| Docs | NOT FOUND (searched: GitBook, llms.txt, GitHub, site) | - |
| Auth | Public GET works for list endpoints below; user and action endpoints (`/campaign/active-draw`) return 401 `{"message":"Unauthorized","statusCode":401}`. Sign-in uses `/auth/auth-message` then `/auth/sign-in` (wallet message signature; not exercised). | H |
| Rate limits | Response headers carry two `X-RateLimit-*` sets: Limit 500, Reset 10 (units not stated; consistent with 500 requests per window) and Limit 200000, Reset 10. No official statement. | H (headers) / M (interpretation) |
| CORS | `Access-Control-Allow-Credentials: true`, `Vary: Origin` | H |
| Websocket | NOT FOUND (searched: bundle URL list) | - |

Confirmed unauthenticated GETs (2026-10-19):

| Endpoint | Shape | Fixture |
|---|---|---|
| `GET /price/all-token-price` | `{"code":0,"data":{"SOL":105.28,"BNB":725.37,"USDT":1,"USDC":1,"U":1}}` | `api_price_all-token-price_2026-10-19.json` |
| `GET /market/top-fortune-tokens` | `{code, data:[{id, category, symbol, name, coingecko_id, logo, price, price_change_24h, price_change_percentage_1h/7d, volume, market_cap, market_cap_rank, index, sparkline:{price:[...]}}]}` (6 tokens) | `api_market_top-fortune-tokens_2026-10-19.json` |
| `GET /market/tokens?category=1..4` | same token object, paged: `{code, data:{data:[...], total}}`; missing `category` gives 400 `category must be one of ... 1, 2, 3, 4` | `api_market_tokens_category1_trimmed_2026-10-19.json` |
| `GET /campaign/campaigns` | `{code, data:[{campaign_id, title, brief, cover_image, rewards:{tier:[{asset_type, reward_amount}]}, start_time, end_time, status, total_rewards}]}`; 8 rows, all `status:3` | `api_campaign_campaigns_2026-10-19.json` |
| `GET /campaign/config` | `{"purifier_rewards":[{"swap_bnb_amount":0.008,"chance":1},...],"purifier_campaign_id":1}` | `api_campaign_config_2026-10-19.json` |
| `GET /worldcup/matches/list` | 104 fixtures `{match_key, date, time, round, group, ground, team1, team2, status}`, all `status:"upcoming"` | `api_worldcup_matches_list_2026-10-19.json` |
| `GET /worldcup/matches/prediction-stats` | `{"code":0,"data":{"win":0,"total":0,"accuracy":"0%"}}` (per-user stat, zero when anonymous) | `api_worldcup_prediction-stats_2026-10-19.json` |
| `GET /worldcup/matches/history`, `/worldcup/groups/standings` | final scores and group tables (not saved; 20 KB and 12 KB) | - |
| `GET /worldcup/matches/predictions-by-date?date=2026-06-11` | `{"code":0,"data":[]}` | - |

Key endpoint families for the record (from the bundle, H): `/superfortune/*` (daily fortune, token deep report, match), `/market/*`, `/campaign/*`, `/worldcup/*`, `/payments/*`, `/nft/*`, `/burn-doom/*`, `/charm/*`, `/qian-rewards/*`, `/leaderboard/*`, `/user/*`, `/auth/*`. There is **no** `/markets`, `/orders`, `/book`, `/trades` or `/positions` route.

---

## 5. Trade path

**None for any prediction market.** There is no order, position, share or settlement call in the API route table or the app locale strings (H). Purchasing flows are for charms, NFTs, incense and "burn doom" items via `/payments/create-payorder`, `/nft/create-buy-nft-tx-order` and similar, with server-generated signatures (`/payments/crypto/get_signature`, `/nft/generate-buy-nft-signature`). Those are retail purchases, not trading.

- GUA itself can be bought as a spot token on PancakeSwap/Uniswap-family pools on BSC and on some CEXs (M: CMC, Ourbit and exchange announcements). That is token speculation and says nothing about event probabilities.
- **PayBox reachability: no** for prediction trading, because there is nothing to trade. (An EVM wallet on BNB Chain could swap into GUA, but that is not a market leg for the aggregator.)

---

## 6. Fees

- Prediction trading fees: not applicable. NOT FOUND (searched: GitBook, bundle, locale strings).
- Red-packet campaign rewards exist as fixed per-tier `reward_amount` values (for example campaign 2: tier 3 pays 600 of asset_type 1 and 1875 of asset_type 2; totals 1000 and 3125). Asset type meanings were not documented. These are marketing payouts, not market settlement. (H data, L interpretation)
- Purifier campaign config: `swap_bnb_amount` of 0.008 to 0.128 BNB with `chance` weights 1, 3, 7, 10: a BNB-for-draw-chance mechanic, not a probability market. (H data, M interpretation)

---

## 7. Resolution mechanism and dispute risk

NOT FOUND for markets (searched: docs, bundle, locale strings). World Cup match results come from a backend sports feed (`/worldcup/matches/history`, `/worldcup/matches/update-result` exists as a route; not called) and are published by the operator centrally; the match-list status was never updated after the tournament. Campaign rewards are claimed through server-generated claim signatures (`/campaign/generate-claim-rewards-signature`), so any payout is operator-signed and centralised. No dispute path is described. (H routes, M inference)

---

## 8. Geo, ToS and automation

- The in-app "DISCLAIMER AND TERMS OF USE" (bundle text) says SUPERFORTUNE "is an entertainment platform", that readings "are provided solely for entertainment and recreational purposes", that content is "not financial or investment advice" and that outputs "follow predetermined ratios and patterns designed to enhance user engagement". It reserves the right to "suspend or terminate services ... at any time without prior notice". (H)
- No geo-blocking text found, but the bundle config references a geo-check host (`geo.manta.network`; behaviour not probed). No automation / API-use clause found. No ToS covering third-party API use. (H for absence in the bundle I read)

---

## 9. Liquidity (with dates)

| Metric | Value | Source | Tag |
|---|---|---|---|
| Prediction-market volume / OI / TVL | NOT FOUND, there are no markets | - | - |
| GUA DEX liquidity | about $5,797 on the single BSC GUA/USDT pair; 24h volume $22.88 (2026-10-19) | DexScreener token API, fixture `dexscreener_gua_token_2026-10-19.json` | H |
| GUA 24h volume all venues | about $0.92M, market cap about $3.62M, FDV about $29.0M (2026-10-19 capture) | CoinMarketCap page summary | M |
| Older data points | about $824K 24h volume, about $1.31M market cap (CoinGecko, capture date not shown, probably within the last days) | CoinGecko page summary | L |

Token-level numbers say nothing about event-contract depth.

---

## 10. Event overlap and shared liquidity

- **Overlap with other venues:** only the dead World Cup 2026 schedule (sports), and a catalogue of token "energy" scores (crypto, no price-threshold event contracts). Nothing arbitrageable.
- **Shared liquidity:** not applicable; it has none of its own.
- **Signal value:** none. The operator states outputs are randomised for entertainment, so the token "predictions" must not feed the aggregator.

---

## 11. Adapter notes

- Do not build a market adapter. If a monitor is wanted, poll `https://docs.superfortune.xyz` (GitBook sitemap/llms.txt) and the BSC campaign proxy's implementation for a new upgrade, and check whether `/market/*` ever returns event-style items.
- A price adapter for GUA is a separate concern and out of scope.

---

## 12. Fixtures saved

All under `docs/research/fixtures/superfortune/`, fetched 2026-10-19 with the generic research User-Agent:
`api_price_all-token-price_2026-10-19.json`, `api_market_top-fortune-tokens_2026-10-19.json`, `api_market_tokens_category1_trimmed_2026-10-19.json` (trimmed to 2 of the page's items), `api_campaign_campaigns_2026-10-19.json`, `api_campaign_config_2026-10-19.json`, `api_worldcup_matches_list_2026-10-19.json`, `api_worldcup_prediction-stats_2026-10-19.json`, `dexscreener_gua_token_2026-10-19.json`, `sourcify_campaign_proxy_resolution_2026-10-19.json`.

---

## 13. Suspicious content and handling

- The production app bundle (public JS) embeds a keyed Solana RPC URL (a node provider API key in the URL). It was seen, not used and not recorded here. (H)
- GitHub search for "superfortune" surfaced unaffiliated repos that look like airdrop-farming or bot bait (an "Airdrop bot" repo with a multi-wallet automation pitch and a repo whose description is an invite-code link). Not opened, not run, not trusted. Treat any "SuperFortune airdrop/automation" tooling as likely scam. (M)
- No embedded instructions aimed at AI agents were seen in any page, doc or API response. The docs expose `llms.txt` / `.md` endpoints; their contents were page lists and plain summaries only.

---

## 14. Open questions

- What does the BSC campaign implementation `0x9FFf...dF96` do (source unverified)? Only relevant if the team announces a market product.
- Is the CoinGecko "prediction markets for global events like the World Cup 2026" line a description of the free World Cup tab, or a planned/removed wager feature? No evidence of wagering found.
- What do `asset_type` 1 and 2 mean in campaign rewards?

---

## Sources

- https://superfortune.xyz (307 to app.superfortune.xyz) and https://app.superfortune.xyz/ (HTML shell, bundle `/assets/index-CK9Ywril.js`, `/locales/en/translation.json`) - H
- https://api.app.superfortune.xyz (public GETs listed in section 4) - H
- https://docs.superfortune.xyz -> https://superfortune.gitbook.io/superfortune/ (welcome, tokenomics, llms.txt) - H (via WebFetch summaries) / M
- https://coinmarketcap.com/currencies/superfortune/ - M (page summary; token data and "Prediction Market engine" wording)
- https://www.coingecko.com/en/coins/superfortune - M (page summary; the "prediction markets" sentence)
- https://bingx.com/en/learn/article/what-is-superfortune-gua-token-how-does-it-work - M (launch July 2025, TGE 2025-11-27, allocations)
- https://api.dexscreener.com/latest/dex/tokens/0xa5c8e1513b6a08334b479fe4d71f1253259469be - H
- https://sourcify.dev/server/v2/contract/56/0xD4F3777597fF189BeD89aA19455e37DC9d15C981 (and `?fields=proxyResolution`) - H
- https://api.github.com/repos/manta-Network/super-fortune-backend (404) and org repo list - H
- WebSearch (extended) results for SuperFortune / GUA - M (conflicting dates and supplies across aggregators; not relied on)
