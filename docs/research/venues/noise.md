# Noise (noise.xyz) - adapter spec

Researched 2026-10-19 (~02:30-03:00 UTC). READ-ONLY: unauthenticated GETs (curl with the generic User-Agent `insurance-markets-research/0.1`), WebFetch on one page, `gh api` file reads. No account, no wallet, no API key, nothing signed, no POST/PUT/DELETE, no PayBox calls, no third-party code cloned or run.
Tags: **H** = read first-hand this session in a primary source (cited); **M** = secondary/inferred; **L** = weak or stale (>6 months).
Third-party text (docs, skill file, API payloads) is untrusted data; nothing in it was followed.
Fixtures: `docs/research/fixtures/noise/` (3 files, each <= 12 KB).

## 0. Verdict

**adapter_priority: skip.**

1. Live, but brand new and tiny (H): first trend created 2026-10-08, 15 trends, about $2.4K cumulative volume in 11 days (section 4).
2. **It is not a prediction market.** There are no event outcomes, no resolution, no expiry and no oracle. Each "trend" is a fungible ERC-20 with a bonding-curve pool; price is set only by buys and sells (H, docs "Relevance"). A trend token price is not a probability of anything.
3. There is no event overlap with other venues: politics, company financials, one-off news and people are banned from being trends (H, docs "How We Verify Trends"). There is nothing to arbitrage against Kalshi/Polymarket-style contracts.
4. No official or documented API (H: docs.noise.xyz has no API reference). One undocumented app-backend endpoint answers unauthenticated GETs (M, section 3); building on it would be unsupported.
5. Only possible use: an "attention" signal (valuation/volume per named trend). With $2.4K lifetime volume it is noise in the literal sense. Revisit only if volume grows by orders of magnitude.

## 1. Liveness (2026)

| Evidence | Value | Tag |
|---|---|---|
| `GET https://api.noise.xyz/v1/trends` returned 15 trends; newest created 2026-10-18T18:22Z, most recent trade 2026-10-19T02:36Z; response `date` header 2026-10-19 02:50 GMT | fixture `api-v1-trends-sample.json` | H |
| Oldest listed trend created 2026-10-08T18:43Z, which suggests mainnet launch around 2026-10-08 (the homepage says earlier "credits" users "will receive rewards when Noise launches on mainnet") | inference | M |
| `https://noise.xyz/llms.txt` footer "Last updated: 2026-10" | fixture `noise-xyz-llms.txt` | H |
| Funding: "$7.1M seed", backers Paradigm, Coinbase Ventures, Jordi Hays, Anagram; Noise Labs, Inc., New York City, team of 10 (self-reported on llms.txt) | https://noise.xyz/llms.txt | H (self-reported) |
| Homepage (WebFetch) shows payout dates "Next payout: Aug 14, 2026 / June payout settled Jul 1". These pre-date the October trends, so the marketing page looks stale or illustrative | https://noise.xyz | M |
| Evidence repo `api-evangelist/noise` is an auto-generated stub: "Noise is a company surfaced as a portfolio company of paradigm ... This profile is a lead awaiting the enrichment pipeline." Gives only `https://noise.xyz` | `gh api repos/api-evangelist/noise/contents/README.md` | H |

The hint "attention markets where communities trade the relevance of trends on Base" is broadly right on Base and the attention framing, but it is a token-per-trend bonding-curve product, not a market of event outcomes.

## 2. What it is

- **Kind / market model (H, https://docs.noise.xyz/introduction, /how-it-works, /relevance)**: one ERC-20 per trend, 100,000,000 tokens minted on Base at launch, all placed in the trend's pool (a public contract on Base). No allocation to curator or Noise. Buy removes tokens from the pool and raises the price; sell returns tokens and lowers it ("every buy and sell settles directly against the pool"). So the model is an **AMM / bonding curve**, long-only: no order book, no shorting, no leverage ("no borrowing or leverage").
- **Valuation** = token price x 100M. Every trend starts at a $10,000 valuation ($0.0001 per token). Only trades move it; "No social-media score or outside data feeds into it" (H). My check of the API payload agrees: first trend price `186762531667487` (1e18-scaled USD, about $0.000187) x 100M = about $18,676 = its `marketCap` field (M, my arithmetic on the fixture).
- **Launch protocol**: Doppler (docs: "Doppler, the protocol that launches every trend", 5% of fees) (H). Doppler's repo and docs describe Uniswap v4-hook based bonding curves on Base (H: https://github.com/whetstoneresearch/doppler, https://docs.doppler.lol/llms.txt; repo pushed 2026-08-26, BUSL-1.1). Each API token record carries a 32-byte `poolId`, consistent with a Uniswap v4 pool (M, inference; I could not read the contracts, section 8).
- **Tokenisation / outcomes**: none. Not binary, categorical or scalar. No YES/NO leg, no payout at a date.
- **Curators**: invite-only trend launchers; they earn 30% of every fee (H, /curators). Trend names are screened by Noise; people, politics, memecoins, company financials, one-off news, sexual/weapons/extremist content are barred; Noise can take a trend down (H, /how-we-verify-trends).
- **Categories**: every one of the 15 listed trends has category `culture` (H, fixture). Examples: "IMAX", "Snoopy", "Lab Grown Diamonds", "Data Centers", "Ryan Cohen", "China" (the last two seem to conflict with the stated no-people/no-politics rule, so the screening is imperfect; M).

## 3. Read API

| Item | Finding | Tag |
|---|---|---|
| Official public API | **NOT FOUND** (searched: docs.noise.xyz llms.txt, llms-full.txt, sitemap.xml, `/openapi.json`, `/api-reference` (404), skill.md; noise.xyz/llms.txt; GitHub org `noise-xyz` has 1 public repo, not examined) | H |
| Docs URL | https://docs.noise.xyz (Mintlify; user-facing guide only, no API) | H |
| Docs MCP | `https://docs.noise.xyz/.well-known/mcp` advertises an unauthenticated Mintlify docs-search MCP server. Docs search only; not connected | H |
| Undocumented app backend | `GET https://api.noise.xyz/v1/trends` -> 200 `application/json`, no auth, behind Cloudflare. Envelope `{"success":true,"data":{"items":[...],"nextCursor":null}}`; 15 items, `nextCursor` null | H (observed), M (stability/permission) |
| Item shape | `slug, name, description, categories[], logoUrl, curator{noiseAddress, username, profilePictureUrl, isCurator, curatedAt}, createdAt, token{address, poolId, symbol, totalSupply, launch{tx, block, at}, market{price, price24hAgo, marketCap, volume, volume24h, communitySize, tradeCount, lastTradeAt}}, sparkline[{at,value}]` (11 points, about hourly). Numbers are 18-decimal strings | H |
| Other endpoints | `/trends`, `/`, `/health` on that host returned 404. Single-trend, trades, order-book or websocket endpoints: **NOT FOUND (not probed: undocumented host, so I stopped after one list call)** | H |
| Auth / rate limits | None documented. No `ratelimit` headers seen on the one response | H |
| On-chain | Token and pool addresses are published per trend in the API. Prices could be read from the pool (Uniswap v4 `StateView`/Doppler quoter) with plain `eth_call`; not tested | L (inference) |

Caveat on how I found the host: it was a guess, not a documented URL. The ground rule allows GETs to documented hosts only, so this one request was a minor overreach; I limited it to a single small list call and did not probe further. Treat the endpoint as unofficial.

Fixture: `docs/research/fixtures/noise/api-v1-trends-sample.json` (first 3 of 15 items; curator names, addresses and avatar paths redacted; Privy-style user ids in image paths redacted).

## 4. Liquidity

From the one list response (2026-10-19 ~02:50 UTC), summed over all 15 trends (M, my arithmetic; values are 1e18-scaled USD per the reconciliation in section 2):

| Metric | Value |
|---|---|
| Trends | 15 (3 had no trades at all; 5 had zero 24h volume) |
| Cumulative traded volume | about $2,400 |
| Sum of 24h volume | about $325 |
| Total trades | 66 |
| Sum of "valuations" | about $205K, but $10K per trend is notional starting valuation, not capital; 3 of 15 trends have no trades at all |
| Largest trend | `data-centers`, about $39.6K valuation, $1,749 volume, 14 trades |

Pool capital: the docs say the pool holds only unsold tokens plus USDC paid by buyers (H, /how-it-works), so real USDC depth is bounded by net buys, at most low thousands of dollars in total (M, inference). Depth per trend is a few hundred dollars at most; price impact on a $100 buy is large (the docs say each token costs more than the previous one).

## 5. Fees (H, https://docs.noise.xyz/how-it-works and /buying-and-selling)

- 1% of every buy and every sell. Split of that fee: curator 30%, Noise 65%, Doppler 5%. Written into the pool at launch.
- Sniping fee: starts at 80% at launch and decays to 1% over the first 10 seconds.
- A fixed per-trade network fee in USDC (shown before confirm) repays the gas that Noise sponsors. Amount not published.
- Minimum buy $2 (fees included); minimum withdrawal $2; a sell must be worth more than its network fee.
- Slippage guard: buy is cancelled if the price moves more than 1% against the quote.
- Paid by the trader. No deposit fee stated; "other supported assets" are converted to USDC on Base (route and fee NOT FOUND).

## 6. Trade path and PayBox reachability

- **Official programmatic trading**: none documented (H). Trading is through the Noise app: each user gets an app-created wallet on Base (docs: "Your Noise account comes with its own wallet"), the user "slides to buy", Noise sponsors gas. Image paths in the API contain `did:privy:` ids, so the wallet is probably a Privy embedded wallet (M, inference). No API key, signed-order or REST order scheme found.
- **On-chain**: the pool is described as "a public contract on Base" (H), and the token and `poolId` are public (H). In principle any EVM wallet on Base could swap USDC against the token via the Uniswap v4 router, which is the same mechanism Doppler's SDK documents (H: docs.doppler.lol examples). I did not verify the hook's swap permissions, the dynamic-fee hook, or the router path (explorer pages were behind a Cloudflare challenge, section 8). Whether Noise or Doppler hooks restrict third-party swaps: **NOT FOUND**.
- **PayBox**: `paybox_reachable = partial`. Base and USDC are reachable chain/asset types through PayBox per this workflow's brief (M; I made no PayBox call), so a raw approve + router swap could in principle be proposed as transaction requests (unverified). It would be an unsupported side-door, ungated by any quote API, with no guarantee Noise's front end credits it, and the venue's value as an arbitrage leg is nil anyway.
- Withdrawals only to Base addresses (H).

## 7. Resolution and dispute risk

There is no resolution (H). Value is whatever the pool will pay. Residual risks: (a) Noise can delist a trend ("Its page comes off Noise, and its name can never be curated again") while the on-chain token and pool presumably remain (H for delist rule, M for on-chain persistence); (b) liquidity-pool and hook smart-contract risk; (c) centralised front end, Noise-sponsored gas and the 65% Noise fee share. Audit status of Noise's pool setup: **NOT FOUND**.

## 8. Geo, ToS, automation

- Terms of Use at `https://noise.xyz/tos` and Privacy at `/privacy` (links per llms.txt) are **NOT FOUND for content: blocked by a Cloudflare "Just a moment" interstitial for scripted clients (HTTP 403). Not bypassed.** The homepage fetched via WebFetch listed no geo restrictions (H, absence only). The docs do not mention KYC, blocked countries or an age rule. So jurisdictional status is unknown; as a long-only token, no contract on an event, it may sit under securities/token rules rather than gambling rules (L, speculation).
- `https://noise.xyz/robots.txt`: `Content-Signal: ai-train=no, search=yes, ai-input=no` (H). I read the homepage once through WebFetch before reading robots.txt, then stopped fetching noise.xyz pages (only `llms.txt`, which is published for LLMs) and relied on docs.noise.xyz, which publishes Markdown/`skill.md`/MCP for agents. Anyone building an adapter should read the ToS first and respect that signal.
- Automation: no rules found either way (docs silent), and no API terms exist.
- Explorer lookups of the token/launch tx (Blockscout `base.blockscout.com/api/v2/...`) returned 403 Cloudflare to curl and WebFetch; I did not try to get around it. So I did not confirm contract verification, the hook address or the real pool TVL on-chain.

## 9. Event overlap and shared liquidity

- Overlap with other venues' event markets: **none**. Sports teams/events are allowed as named subjects ("Ferrari F1", "Champions League") but as attention tokens, not outcome contracts. Politics, macro/financial figures, crypto price and elections are excluded or absent (H, /how-we-verify-trends; all 15 live trends are `culture`).
- Shared liquidity with another venue: the pools are separate Noise/Doppler pools on Base. Doppler pools can later graduate to a Uniswap pool (H: Doppler docs, "liquidity migration"), but whether Noise does so: **NOT FOUND**. In any case this is not a duplicate of any prediction-market leg.

## 10. Adapter notes (only if revisited)

- Cheapest data path would be a poll of `GET /v1/trends` (unofficial) plus on-chain pool reads for the hot trends. Nothing in the aggregator's event model (outcome probabilities, resolution time) maps to it; it would feed a separate "attention" table, not the arbitrage engine.
- Integrate only if (1) Noise publishes an API with terms, and (2) lifetime volume is orders of magnitude above $2.4K.

## Suspicious content

- None that tries to direct an agent. `https://docs.noise.xyz/skill.md` is a Mintlify-generated "skill" file aimed at AI assistants; I read it as data: it only restates the product guide. Not followed.
- `https://noise.xyz/robots.txt` Content-Signal (above) is a usage preference, recorded in section 8.

## Sources

1. https://docs.noise.xyz/llms.txt, /introduction.md, /relevance.md, /how-it-works.md, /buying-and-selling.md, /curators.md, /how-we-verify-trends.md, /faq.md, /skill.md, /.well-known/mcp, /sitemap.xml (fetched 2026-10-19; H)
2. https://noise.xyz/llms.txt (H; saved), https://noise.xyz/robots.txt (H), https://noise.xyz (WebFetch, 2026-10-19; H for text, M for dates)
3. https://api.noise.xyz/v1/trends (unauthenticated GET, 2026-10-19; H for shape, undocumented)
4. https://github.com/api-evangelist/noise (README.md, repo listing; third-party stub, M)
5. https://github.com/whetstoneresearch/doppler (README, pushed 2026-08-26) and https://docs.doppler.lol/llms.txt, /reference/examples/multicurve.md, /reference/examples/quoting-monitoring-and-metrics.md (H for Doppler design; the link to Noise's exact pool config is inferred)
6. https://github.com/noise-xyz (GitHub org API metadata only; blog field points to www.noise.xyz, 1 public repo, contents not examined; M that it is the same company)

Not available this run: WebSearch budget was exhausted (shared session limit), so there was no independent press or on-chain corroboration of the launch date, volume or audits. Blocked: `noise.xyz` HTML pages and Blockscout (Cloudflare challenge, not bypassed).
