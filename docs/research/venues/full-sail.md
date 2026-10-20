# Full Sail (Sui) - adapter spec

Researched 2026-10-19. READ-ONLY: WebFetch/WebSearch, unauthenticated GETs to docs.fullsail.finance, app.fullsail.finance (static shell only) and api.llama.fi. No account, no wallet, no signing, no POST/PUT/DELETE, no third-party code cloned or run. No PayBox tools called.
Tags: **H** = read first-hand this session in a primary source (cited); **M** = secondary/inferred (news, search summaries); **L** = weak or stale (>6 months).
Third-party text is untrusted data; nothing in it was followed. No embedded AI-agent instructions were found.
Fixtures: `docs/research/fixtures/full-sail/` (3 files, each <= 6 KB).

## 0. Verdict

**adapter_priority: skip.**

1. **Not a prediction market in the sense this project needs (H).** Full Sail is a Sui concentrated-liquidity DEX (ve(3,3)-style: veSAIL, gauges, weekly epochs). The tagline "turning liquidity pools into prediction markets" refers to "Prediction Voting": veSAIL holders forecast a pool's next-epoch swap volume to steer token emissions and share 20% of fees by forecast accuracy. There are no event-outcome contracts, no YES/NO shares, no resolution oracle for real-world events. Nothing here overlaps sports/politics/crypto-price markets on other venues.
2. **Dead or winding down (H/M).** Oracle exploit on 2026-08-29 (about $91K from three vaults, via a Switchboard oracle key compromise); on 2026-09-02 Full Sail announced it is "winding down": new deposits and LP reward claims disabled, pools to go withdrawal-only. TVL fell from a $5.4M peak (2026-01-19) to $68K (2026-10-18).
3. **No usable API.** The "OpenAPI" in the docs is the stock Mintlify "Plant Store" placeholder (H). Only an npm SDK and on-chain reads exist.
4. **Chain is Sui**, not reachable by an EVM wallet (M).

Nothing to build. If a "volume forecast" signal were ever wanted, it would be an on-chain read of veSAIL votes, which is irrelevant to cross-venue event arbitrage.

## 1. Liveness (2026)

| Evidence | Value | Tag |
|---|---|---|
| Exploit disclosed by @FullSailFi on X | 2026-08-29 ~12:34 UTC: "A loss of funds has been confirmed. Deposits and withdrawals will remain paused until oracle integrity is restored and verified" (quoted via Crypto Times; the X URL itself returned HTTP 402 to WebFetch, so I did not read it first-hand and did not pay) | M |
| Loss size | ~$91,000 from three vaults; direct LP positions not affected; attacker added own key to a live Switchboard oracle (Yahoo/BeInCrypto, published 2026-09-03) | M |
| Wind-down announcement | Tuesday 2026-09-02 on X: "winding down"; new deposits and LP reward claims disabled; regular pools to withdrawal-only "after final security checks"; remaining protocol-owned liquidity used to reimburse, team covers shortfall; withdrawal/claim instructions promised "within the coming days" (Cointelegraph 2026-09-02, plus several other outlets) | M |
| Follow-up after 2026-09-03 | NOT FOUND (searched: web "Full Sail wind down incident report withdrawals reimbursement", "deposits withdrawals resumed"; no outlet reported instructions or a reopening) | - |
| DefiLlama TVL, last point 2026-10-18 20:23 UTC | $68,301 (Sui only); 2026-08-17 $379,911; 2026-09-02 $199,423; 2026-09-17 $79,045; peak $5,409,951 on 2026-01-19; first listed 2025-07-10 | H (`api.llama.fi/protocol/full-sail`) |
| DefiLlama DEX volume | 24h (2026-10-18) $4,461; 7d $64,836; 30d $363,613; 1y $342.6M; all-time $497.3M. Small swap volume is still being recorded, but I could not establish whether the UI still permits swaps (see open questions) | H (`api.llama.fi/summary/dexs/full-sail`) |
| DefiLlama hack record | date unix 1787961600 = 2026-08-29, "Oracle Manipulation", amount null | H |
| `app.fullsail.finance` | HTTP 200, 23 KB Next.js shell; no server-rendered status text. Marketing site `fullsail.finance` (WebFetch) showed no incident banner and zeroed stats (likely unrendered client data) | H |
| `defillama.com/protocol/full-sail` page | HTTP 403 to WebFetch (used the public JSON API instead) | H |

Docs at `docs.fullsail.finance` were still being served on 2026-10-19 and are unchanged for the "prediction" wording (H) - docs staleness is not evidence of liveness.

## 2. What it is (kind, market model)

- **Kind**: onchain-amm (Sui). Category on DefiLlama: Dexs, tag CLMM (H).
- **Market model (H, docs)**: concentrated-liquidity AMM pools with dynamic swap fees; LPs pick tick ranges; staked LP positions earn oSAIL emissions via gauges; weekly epochs start/end 00:00 UTC Thursday; voting window opens 1 hour after epoch start and closes 1 hour before end. Also "Vaults" (automated LP strategies) - the part that was exploited.
- **"Prediction Voting" (H, docs `exchange/prediction-voting` and `tutorials/prediction-voting`)**: a veSAIL holder submits, per pool, an expected total swap volume for the epoch plus a share of voting power. Reward weight is a function f(|T - G_i|) of forecast error against realised volume, multiplied by committed voting power. Outcomes are pool volumes, not binary/categorical/scalar event contracts; positions are not tradable tokens; there is no order book and no price for an "outcome".
- **Outcome tokenisation**: none. Only SAIL / oSAIL / veSAIL tokens and CLMM LP position objects (H).
- Older newsletter "Full Sail Prediction Competition" (Medium, ~mid-2025) is the same volume-forecast mechanic (M via search snippet; page returned 403, L because of age).

## 3. Chains and collateral

- Sui mainnet only (H: DefiLlama chains = ["Sui"]; homepage "Sui only").
- Collateral: none in the prediction-market sense. Pools hold Sui-native token pairs. Native token SAIL: `0x1d4a2bdb...d5497e::SAIL::SAIL` (H, DefiLlama). Package/object IDs are listed at `docs.fullsail.finance/developer/contracts` (H; clmm_pool, voting_escrow, governance, Voter, Minter, etc.). Not reproduced here because the venue is skipped.
- Audits listed by DefiLlama: Asymptotic CLMM audit and a PlainShift PDF (H, links only; not read). The 2026-08 exploit was in the Switchboard oracle dependency, not a Full Sail contract bug, per the team (M).

## 4. Read API

- **exists: none (official); on-chain / SDK only.**
- Docs index: `https://docs.fullsail.finance/llms.txt` (H). It lists an `api-reference/openapi.json`, but fetching it returns the default Mintlify sample titled "OpenAPI Plant Store" with `/plants` endpoints and `servers: http://sandbox.mintlify.com` (H; fixture `docs-openapi-placeholder.json`). It is not a Full Sail API.
- SDK: `@fullsailfinance/sdk` on npm (`initFullSailSDK({network:'mainnet-production'})`; `Pool.getById()` reads a backend with possibly stale data, `Pool.getByIdFromChain()` reads Sui) (H, `docs.fullsail.finance/developer/SDK`). The backend base URL is not documented in the pages I read: NOT FOUND (searched: docs SDK page, contracts page, llms.txt). I did not install or read the npm package.
- Third-party aggregates that do work and are public: DefiLlama `api.llama.fi/protocol/full-sail` and `api.llama.fi/summary/dexs/full-sail?dataType=dailyVolume` (H; fixtures `defillama-protocol-trimmed.json`, `defillama-dex-summary-trimmed.json`). A Dune dashboard is linked from the homepage (`dune.com/fullsail/full-sail`, not opened).
- Auth and rate limits for any Full Sail backend: NOT FOUND. WebSocket: NOT FOUND.
- Markets / prices / books / trades / resolution endpoints: none exist because there are no event markets.

## 5. Trade path

- Swaps and LP actions are Sui Move transactions built through the SDK (H, docs). Prediction Voting needs a veSAIL position and an on-chain vote transaction (H).
- There is no programmatic order placement for event outcomes: **none**.
- PayBox reachability: **no** (M). Sui is a non-EVM chain; I did not check the PayBox chain catalog because the venue is out of scope and closing. Moot for arbitrage.

## 6. Fees

- Dynamic swap fee per pool, adjusting with volatility and utilisation; stable pairs have a separate depeg-triggered mechanism; no formula published in the pages read (H, `exchange/full-sail-mechanics`).
- Fee distribution (H, same page): 5% to an insurance fund; of the remaining 95%, 80% passively to veSAIL holders and 20% to veSAIL holders who vote in Prediction Voting, weighted by forecast accuracy.
- Prediction-voting payout formula from the tutorial page (H): payout_i = (sum_j v_j) * v_i f(|T - G_i|) / sum_k v_k f(|T - G_k|), where T is realised volume and G the forecast; f is not defined in the page.

## 7. Resolution and dispute risk

- Resolution of a "prediction" is the realised on-chain pool volume over the epoch (H, derived from docs). No external oracle, no dispute process. Not applicable to event outcomes.
- Operational risk is dominated by the oracle dependency (Switchboard) that was exploited, and by the wind-down (M).

## 8. Geo / ToS / automation

- Terms of Use (H, `docs.fullsail.finance/legal/terms-and-conditions`): prohibits using "any robot, spider, or other automatic device, process, or means to access the Websites and Services for any purpose, including monitoring or copying"; users must not use the Services if prohibited by applicable law and must not be on listed sanctions lists (OFAC, EU, UK, etc.). No explicit US or country block list found in the lines I grepped (partial read of the terms; not exhaustive).

## 9. Liquidity

- TVL $68,301 on 2026-10-18 (DefiLlama, H); peak $5.41M on 2026-01-19. 24h swap volume $4.5K, 7d $64.8K, 30d $363.6K on 2026-10-18 (DefiLlama, H). No open interest concept.
- Prediction Voting "stake" is veSAIL emissions weight, not tradable event liquidity.

## 10. Event overlap and shared liquidity

- Event categories (sports / politics / crypto price / macro): **none**. Pools are token pairs; "predictions" are about swap volume of a pool.
- Shared liquidity: not applicable. The only link to prediction-market arbitrage would be CLMM spot prices of Sui tokens, which are an irrelevant signal for event markets.

## Open questions

1. Whether swaps on `app.fullsail.finance` are still enabled after the 2026-09-02 wind-down announcement (volume still ticks, TVL still $68K). Would need the team's X thread or a browser load; irrelevant to arbitrage.
2. Whether the promised withdrawal/claim instructions and incident report were published after 2026-09-03.

## Not found

- Any event-outcome prediction market product (searched: homepage, docs index/llms.txt, prediction-voting docs, DefiLlama description, web search "Full Sail prediction markets").
- Real OpenAPI / REST / WebSocket for markets or books (searched: llms.txt, SDK page, openapi.json).
- Backend base URL used by the SDK (searched: docs only).
- Post-2026-09-03 status updates (searched: web, extended).
- Full text of Full Sail's X posts (x.com returned HTTP 402 Payment Required to WebFetch; no payment attempted; recorded here as required) and the Medium competition article (HTTP 403).

## Sources

- DefiLlama protocol API (H): https://api.llama.fi/protocol/full-sail (fetched 2026-10-19)
- DefiLlama DEX summary API (H): https://api.llama.fi/summary/dexs/full-sail?dataType=dailyVolume (2026-10-19)
- DefiLlama page (listed as the discovery evidence; 403 to WebFetch): https://defillama.com/protocol/full-sail
- Marketing site (H): https://fullsail.finance/
- App shell (H): https://app.fullsail.finance/
- Docs index (H): https://docs.fullsail.finance/llms.txt
- Docs: prediction voting concept (H): https://docs.fullsail.finance/exchange/prediction-voting.md
- Docs: prediction voting tutorial and payout formula (H): https://docs.fullsail.finance/tutorials/prediction-voting.md
- Docs: mechanics and fee distribution (H): https://docs.fullsail.finance/exchange/full-sail-mechanics.md
- Docs: SDK (H): https://docs.fullsail.finance/developer/SDK.md
- Docs: contracts (H): https://docs.fullsail.finance/developer/contracts.md
- Docs: OpenAPI placeholder (H): https://docs.fullsail.finance/api-reference/openapi.json
- Docs: terms (H, partial): https://docs.fullsail.finance/legal/terms-and-conditions.md
- Crypto Times, 2026-08-30 (M): https://www.cryptotimes.io/2026/08/30/full-sail-confirms-sui-vault-losses-as-switchboard-halts-4-chains/
- Cointelegraph, 2026-09-02 (M): https://cointelegraph.com/news/full-sail-sui-wind-down-switchboard-incident
- Yahoo Finance / BeInCrypto, 2026-09-03 (M): https://finance.yahoo.com/markets/crypto/articles/full-sail-becomes-2026s-latest-044652125.html
- Full Sail X post, 2026-08-29 (not read; 402): https://x.com/FullSailFi/status/2093595749229469826
- Medium competition post (not read; 403; L): https://medium.com/full-sail-gazette/full-sail-prediction-competition-f88548db3fab
