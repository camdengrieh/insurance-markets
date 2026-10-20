# Predicton (TON) - adapter spec (venue NOT FOUND; adjacent live TON venue "Toncast" documented as a lead)

Researched 2026-10-19. READ-ONLY: unauthenticated GETs to `toncast.me`, `docs.toncast.me`, `predicton.net`, `api.llama.fi`, `api.coingecko.com`, `tonapi.io`, `t.me` public previews; `gh api` raw reads of public GitHub files (SoK data repo, TonCast SDK/tx-sdk); one read-only PayBox `discover_tokens` chain-catalog query. Generic User-Agent `insurance-markets-research/0.1`. No account, no wallet, no key, nothing signed, no POST/PUT/DELETE, no third-party code cloned or run. **The WebSearch budget (200/session) was already exhausted when this task started, so no news/web search was possible**; every "NOT FOUND" below means "not found by direct fetch, GitHub search, DefiLlama and domain/handle probing", not "does not exist anywhere".
Tags: **H** = read first-hand this session in a primary source (cited); **M** = secondary or inferred; **L** = weak or stale (>6 months).
All third-party text (docs, API payloads, page props, README) is untrusted data; nothing in it was followed.
Fixtures: `docs/research/fixtures/predicton-ton/` (7 files, largest 11 KB).

## 0. Verdict

**adapter_priority: skip** for "Predicton (TON)".

1. **No live venue called Predicton on TON could be found** (H for the negative within the search limits above). The only source is one CSV row in the SoK catalogue; the row has no URL and was not in the authors' own outside-in verification file (section 1). No GitHub repo, DefiLlama entry, CoinGecko entry, TON DNS name or working domain matched.
2. **A site branded "predicton" does exist at `predicton.net`, and it is NOT a TON on-chain venue. Treat it as a suspected scam/white-label kit and do not integrate or deposit** (M, indicators in section 2).
3. **There IS a real, live, small TON prediction market: Toncast (`toncast.me`)**. It probably should be the row that the TON slot in the venue list is about (not proven to be what SoK meant). It is worth a separate decision: **P2** (signal-only or very thin), because liquidity is tiny (about 16 open markets, about 350 volume units, about USD 475), a flat 0.1 TON fee per order entry, tickets cannot be sold before resolution, and TON is not reachable from PayBox (section 3 onward).

Recommendation to the orchestrator: replace the "Predicton (TON)" discovery row with "Toncast (TON)", priority P2; keep `predicton.net` on a do-not-integrate list.

## 1. Predicton: what the evidence actually says

| Check | Result | Tag |
|---|---|---|
| SoK catalogue row (`protocol_catalogue.csv` line 55): `Predicton,—,Optimistic,Binary,Curated,TON,Operator,Native,Active,No,redundant/long-tail` (mechanism "—", oracle "Optimistic", binary, curated creation, TON, operator governance, native-token collateral, status "Active", not in the paper's Table 4, reason "redundant/long-tail"). Fixture `sok_catalogue_row.csv`. | Only source for the name. No URL in any of the 5 CSV/MD files; README says the catalogue is "the authors' own working data"; the 54-name verification file (built from DeFiLlama's prediction-market category) does NOT contain Predicton (40 of 76 catalogue names appear there). The SoK paper is "under review, 2026". Status "Active" is therefore unverified. | H (that the row exists and says this), M (that it is accurate) |
| DefiLlama `api.llama.fi/protocols` (8,758 protocols, fetched 2026-10-19): any entry containing "predicton"; any TON-chain entry in category "Prediction Market" | **None.** (Toncast and PreToke are not listed either.) | H |
| CoinGecko `/search?query=predicton` and `toncast` | Empty for both. | H |
| GitHub `gh search repos predicton` (+ "ton", "telegram") | 20 unrelated ML repos ("predicton" typo of prediction); no prediction-market repo. | H |
| TON DNS `tonapi.io/v2/dns/predicton.ton` | `entity not found` (while `toncast.ton` exists). | H |
| Telegram public previews: `t.me/predicton` = "Predicton \| for sale" (1 member); `t.me/predicton_bot` = "Aastha group prediction"; `t.me/predictonbot` = "Colour predicton hack"; `t.me/PredictOnTON` = "PredictOnTON Community", 2 subscribers; `t.me/predicton_ton` = empty. | Squatted/for-sale handles and unrelated bots. No active project. | H |
| Domains probed: predicton.xyz/.io/.app/.fun/.ton/.market/.me/.bet/.ai/.tech/.co/.live/.cc/.games/.org, predictonton.com, predicton-ton.com | No resolve, timeout, or unrelated (`.org` redirects to knowledge.insead.edu, `.com` to a collectibles shop, `.pro` returns a JSON "Application not found"). Only `.net` serves a prediction-market page. | H |

Conclusion: either the SoK row is a long-tail/defunct project with no surviving web presence, a mis-spelled or renamed product (Toncast is the obvious candidate but unproven), or it is the `predicton.net` brand mis-classified. Do not build an adapter against the name.

## 2. `predicton.net` - suspected scam/white-label kit (do not integrate)

Fetched once with GET; page is an Inertia/Laravel SPA titled "predicton - Forecast Exchange". The embedded `data-page` JSON (summary in fixture `predicton_net_page_props_summary.json`) shows:

- Site `name` = "AtlasCorpPoly", brand "predicton", `pm_variant: "classic"` (a themeable template). It lists 7,728 to 7,817 "markets" with slugs identical to Polymarket's (e.g. `republican-presidential-nominee-2028`, `bitcoin-up-or-down-<unix>`), i.e. a copied market list with no on-chain venue behind it (M).
- Props include keys `mamont`, `mamont_notifications`, `impersonationLink`, `pending_bonus`, `panel_links` and `oddsMultiplier: 1.3`. "Mamont" is Russian-underworld slang for a scam victim; an operator-side "impersonation link" and a global odds multiplier are not features of a legitimate exchange (M, inferred from key names only; I did not log in or probe further).
- Custodial deposit coins list: ADA, BCH, BNB, BTC, DASH, DOGE, EOS, ETC, ETH, LTC, NOT (TON), SHIB, SOL, TON, TRX, USDC (Ethereum), USDT (TRON), XLM, XMR, XRP, ZEC. Fees: deposit 0%, trade 0%, **withdraw 2%** (H, page props).
- Nothing in the page ties it to TON smart contracts, an optimistic oracle or the SoK entry.

Impact: if the orchestrator's "TON" slot was fed from a web search for "predicton", this domain is the likely wrong hit. Any agent that is told to "trade on Predicton" must not send funds there.

## 3. Adjacent lead: Toncast (live TON prediction market)

Everything in sections 3-9 is about Toncast, NOT proven to be "Predicton".

### 3.1 Liveness (2026)

| Evidence | Value | Tag |
|---|---|---|
| `GET https://toncast.me/api/v1/paris` | 16 active markets, all created 2026-09-25 to 2026-10-10 (newest 2026-10-10); 5 "pending" (past end time, oracle result not yet pushed), oldest created 2026-05-18; 259 finished (created 2025-10-03 to 2026-09-03) | H (fixture `toncast_feeds_summary.json`) |
| Repos | `TonCast/sdk` pushed 2026-06-05 (README: REST and WS client, "TonConnect betting (TON/jettons)"); `TonCast/tx-sdk` pushed 2026-04-29; `toncast-swap-proxy` 2026-04-21. SDK doc banner: "Still in early development (0.0.1)... we may ship breaking changes in minor releases". | H |
| Not on DefiLlama (prediction-market category or by name) and not on CoinGecko | | H |

### 3.2 Kind and market model

- **Kind**: `onchain-other` (TON smart-contract "Pari" per market, Telegram Mini-App front end). Operator-curated: users can submit markets but "your market will be reviewed by our team"; creator gets 20 TCAST (H, `docs.toncast.me/faqs/create-market.md`).
- **Model**: binary YES/NO only (result values `yes|no|draw|pending`; `draw` exists, so some markets can end in a draw/void-like outcome, its payout rule not documented). Order-book style matching of fixed-size tickets: each winning ticket pays **0.1 TON**; a YES ticket at implied probability p costs p x 0.1 TON and matches a NO ticket at (100-p) x 0.1 TON. Prices live on a grid of even YES-odds values 2..98 (SDK: Fixed order `yesOdds: 2..98 even`). Three order types: Market, Fixed, Limit; unmatched tickets can be cancelled, matched ones cannot (H, `faqs/bet-execution-and-payouts.md`, `tx-sdk` README).
- **Tokenisation**: no transferable outcome token. Tickets are recorded in the Pari contract under a `beneficiary` address (signer can differ from owner). **"Purchased tickets cannot be sold until the event is over"** (H, `glossary/trade-and-orders.md`) - no exit before resolution, so any arb leg is hold-to-resolution only.
- **Contract versions** v1, v2, v3 coexist (H, finished feed: v1/v2/v3; active feed all v3).

### 3.3 Chains and collateral

TON only. Native collateral is TON (payout 0.1 TON per ticket). Jettons (e.g. USDT) are accepted by swapping to TON through STON.fi and a `toncast-swap-proxy` contract (`EQCiRGAq...f41lvl`, from tx-sdk constants), so exposure is TON-denominated, not USD (H, `tx-sdk` constants and README). TON price 2026-10-19: USD 1.35 (CoinGecko simple price, H).

### 3.4 Read API

| Item | Detail | Tag |
|---|---|---|
| Status | **unofficial-but-first-party-SDK public REST**: no documented REST reference; endpoints are known from the official SDK (`TonCast/sdk`, `packages/sdk/src/http/endpoints.ts`) and confirmed live keyless. The docs site covers the SDK, not the raw API. | H |
| Docs | https://docs.toncast.me/sdk/core-sdk.md ; index https://docs.toncast.me/llms.txt ; SDK README https://github.com/TonCast/sdk | H |
| Base URL | `https://toncast.me/api` ; websocket base `wss://toncast.me` | H |
| Endpoints | `GET /v1/categories` -> `[{id,title}]` (Sport 1, Crypto 3, Culture 4, Politics 5, Economy 6). `GET /v1/paris?limit<=50&categoryId&search&includeInactive=true&showPendingResults=true&cursorSortValue&cursorAddress` -> `{data:[Pari],pagination:{hasMore,nextCursor:{sortValue,address}}}` (feeds: default active; `showPendingResults=true` pending; `includeInactive=true` finished). `GET /v1/paris/{id}` ; `/odds-state` ; `/coefficient-history?limit&timeframe` ; `/winners`. `GET /v1/bets/user/{addr}` and `/v1/bets/{pariId}/user/{addr}`. | H (list, categories, one pari, odds-state, coefficient-history exercised; winners and bets not exercised) |
| Pari shape | `id` (the on-chain Pari contract address), `name`, `description` (resolution rule and source URL), `endTime` (unix), `yesVolume`, `noVolume` (floats, unit undocumented, assumed TON), `status` (active/inactive/paused), `result` (pending/yes/no/draw), `bestYesOdds`, `bestNoOdds` (ints = implied %), `version`, `availableBets` (JSON string mapping YES-odds to a per-price-level contract address). Note the single-pari endpoint returned `bestYesOdds: null` where the list returned 56, so use `odds-state` for the book. | H (fixture `toncast_paris_limit3.json`) |
| Book | `odds-state` = `{oddsState:{Yes:[49 ints],No:[49 ints]}}`: tickets resting per price level, index i corresponds to even odds 2+2i (the SDK warns the No array is indexed at the NO price, i.e. `No[17]=200` means cheap NO tickets matchable by a YES bet at yesOdds 64). Sample: BTC-October market had only 100+50+25+10 tickets on each side. | H (fixture `toncast_odds_state_btc_oct.json`) |
| Auth / limits | None required. No rate-limit headers observed (Cloudflare fronted). SDK defines a 429 error with `Retry-After`; numeric limits NOT FOUND (searched: SDK README, docs index, response headers). | H |
| Websocket | `wss://toncast.me/ws/pari-list` (global broadcast: pari_created, coefficient/volume updates, paused/resolved; ping every 5 s, sequence ids) and `wss://toncast.me/ws/<pariId>` (book and bet events). Documented in SDK README only; not connected in this pass. | H (docs), not exercised |
| On-chain | Pari contract source is not in the TonCast GitHub org (generated TS bindings only in `tx-sdk/src/contracts/generated/pari.ts`); direct chain read via toncenter/tonapi would be needed for independent verification. | M |

### 3.5 Trade path

No REST order endpoint. The SDK builds a TON message: `BatchPlaceBetsForWithRef` (opcode `0xaabbccf0`) to the Pari contract (TON bet) or a STON.fi swap with `ProxyForward` (opcode `0x50415249`, jetton bet). The caller's TON wallet signs and sends it (TonConnect or a server-side signer; the SDK "never asks for a private key"). `beneficiary` sets who owns the tickets. Payout is pushed automatically to the beneficiary at resolution. Orders can be market, fixed (single price) or limit (worst price). A programmatic bot is feasible but needs a TON wallet with its own signing (ed25519, wallet-contract specific), outside PayBox. (H, SDK README and `tx-sdk` README/constants.)

### 3.6 PayBox reachability

**no.** TON is not an EVM or Solana chain. A PayBox `discover_tokens mode=chains query=ton` call on 2026-10-19 returned only "Newton" (eip155:1012) and "Redstone" (eip155:690), no TON/Toncoin network (H, read-only catalog call; catalog is "metadata, not a support allowlist", so absence is strong but not a contract). PayBox transaction proposals or signed orders from Base/Ethereum/BNB/Arbitrum/Polygon/Solana cannot place a Toncast bet; funds would need an external bridge to TON, which is outside the plugin's scope.

### 3.7 Fees

- **Flat execution fee 0.1 TON per entry in the bets map** (one entry per distinct odds level), included in `totalCost` (H, `tx-sdk/src/constants.ts` `PARI_EXECUTION_FEE = 100_000_000n`, "must mirror pari-proxy.tolk"). 0.1 TON equals the payout of one ticket. Example from the SDK docs: 42 tickets at 60 + 36 at 62 = 2 entries = 0.2 TON fee on about 4.95 TON of tickets (about 4%); a 1-ticket order at 50% costs 0.05 TON of ticket plus 0.1 TON fee (200% overhead). Matched/unmatched cancel: "contract and network commissions are not refunded".
- Jetton route adds STON.fi swap cost and gas reserve (0.3 TON direct, 0.6 TON two-hop, mostly refunded) (H, tx-sdk README).
- No trading/taker percentage fee documented; whether the platform takes a cut of winnings: NOT FOUND (searched: docs index pages, fundamentals, payouts, tx-sdk constants). "Stake TCAST to earn a share of platform revenue" (docs landing page) implies some revenue stream (M).

### 3.8 Resolution and dispute risk

- Each market's description carries a rule and a "sole resolution source" URL (e.g. Coinbase BTC-USD at 23:59:59 UTC 31 Oct 2026) (H, API sample). Who pushes the result is not documented: the SDK comments say "the oracle hasn't pushed a result yet" (M); oracle identity, any dispute window and any bond: NOT FOUND (searched: docs.toncast.me index pages, SDK README, tx-sdk README). Treat as **operator/centralised resolution** (the SoK's "Optimistic oracle" label for Predicton is not supported by anything I could read about Toncast).
- `endTime` can precede the event: the BTC-October market has `endTime` 2026-10-20 14:30 UTC while its rule resolves on 31 Oct (H, fixture) - betting closes ~11 days before the observation date, and there is no exit. 5 markets are currently "pending" past their end time with no result pushed (H), so resolution latency is a live risk.
- Cancelled events: stakes returned, fees not (H, payouts FAQ).

### 3.9 Geo / ToS / automation

NOT FOUND. `toncast.me/terms` and `/privacy` return HTTP 200 but are client-rendered SPA shells; the text was not readable without a browser (searched: docs index, landing page). Docs say no KYC for payouts ("no verification"). The SDK is officially offered for third-party integrations ("Want to add prediction markets to your app?"), and the hosted widget is white-label, so automated reads are clearly intended; trading by bots: not addressed (M).

### 3.10 Liquidity

| Metric | Value | Source and date |
|---|---|---|
| Open markets | 16 (plus 5 awaiting result) | Toncast API, 2026-10-19 (H) |
| Sum of yes+no volume, open markets | 351.8 units (about USD 475 if TON at USD 1.35) | same (H on the sum; M on unit = TON) |
| Sum of yes+no volume, 259 finished markets | 7,301 units (about USD 9.9K) over 12 months of markets (grouped by creation month: 2026-05 peak at 1,872 across 95 markets, 2026-02/03 about 1,100 to 1,200, 2026-09 about 116) | same (H on sums; M on unit) |
| Book depth | e.g. 100+50+25+10 tickets (of 0.1 TON payout each) per side on the BTC-October market, i.e. a few TON | `odds-state`, 2026-10-19 (H) |
| TVL / DeFiLlama | not listed | H |

### 3.11 Event overlap (arbitrage relevance)

Open markets are monthly crypto/commodity/FX relatives ("Will Bitcoin/ETH/gold/Brent close October above where it closed September?", ETH vs TON outperformance, naira weaker end-October), EPL fixtures (Chelsea v Man Utd, Liverpool v Arsenal, Arsenal v Man City), US politics (Democrats control Senate), geopolitics (US naval blockade of Iran on 15 Nov) and Nigerian culture (Billboard, Nollywood). Past (finished) markets included dated crypto price thresholds (e.g. "ETH above 3,212 USDT on Feb 8 2026 16:00 UTC"). Overlap with Polymarket/Kalshi: sports, US Senate, crypto price levels. Rule wording is bespoke (and uses Coinbase as source, versus Polymarket/Kalshi sources), so linking needs the market-linking layer; no exit before resolution means no true arbitrage unwinding, only hold-to-resolution with the 0.1 TON/entry fee and tiny size.

### 3.12 Independence

Own contracts and own order book; no shared liquidity with another venue found (M: no integration or routing mentioned in docs). Independent, but irrelevant at this size.

## 4. Adapter spec sketch (only if Toncast is ever pursued, P2)

Signal-only adapter: poll `GET /v1/paris` (active feed, `limit=50`) every 60 s, `GET /v1/paris/{id}/odds-state` for markets that match a tracked event; midpoint = best YES odds, depth in tickets x 0.1 TON. Normalise price to p = odds/100 per YES; payout 1 unit per ticket scaled; stamp `source=toncast`, `executable=false`. Do NOT build a trade path (TON wallet + signer outside PayBox, flat fee, no exit). Use websocket `wss://toncast.me/ws/pari-list` only if latency matters (it does not at this size).

## 5. Not found / open questions

- Predicton official site, docs, contracts, chain presence, TVL/volume: NOT FOUND (searched: SoK repo files, DefiLlama protocols API, CoinGecko search, GitHub repo search, TON DNS, ~30 domains, Telegram handles). WebSearch unavailable (session budget exhausted); someone with search access could re-check "Predicton TON" once.
- Whether the SoK "Predicton" row refers to Toncast, a defunct project or something else: unknown. Ask the SoK authors via the repo issue tracker, or accept the ambiguity.
- Toncast: oracle/resolver identity and dispute path, fee on winnings, volume unit, rate limits, ToS/geo, cancel message format, behaviour of `draw` results: all NOT FOUND.
- `predicton.net`: the scam-kit read is inferred from page keys only (M); not tested further by design.

## Sources

- SoK catalogue (row for Predicton): https://github.com/admnov38/SoK-Onchain_Prediction_Markets-Supplementary_Materials (files `protocol_catalogue.csv`, `protocol_catalogue_verification.csv`, `README.md`) - H, read 2026-10-19 via `gh api`
- DefiLlama protocols API: https://api.llama.fi/protocols - H, 2026-10-19
- CoinGecko search / simple price: https://api.coingecko.com/api/v3/search?query=predicton ; https://api.coingecko.com/api/v3/simple/price?ids=the-open-network&vs_currencies=usd - H
- TON DNS lookup: https://tonapi.io/v2/dns/predicton.ton - H
- Telegram public previews: https://t.me/predicton , https://t.me/PredictOnTON (and three other handles) - H
- `predicton.net` page payload: https://predicton.net/markets - H (content), M (interpretation)
- Toncast site and API: https://toncast.me/ ; https://toncast.me/api/v1/paris ; https://toncast.me/api/v1/categories ; https://toncast.me/api/v1/paris/{id}/odds-state ; `/coefficient-history` - H, 2026-10-19
- Toncast docs: https://docs.toncast.me/llms.txt ; /glossary/basic-concepts.md ; /glossary/trade-and-orders.md ; /faqs/bet-execution-and-payouts.md ; /faqs/create-market.md ; /faqs/security.md ; /sdk/overview.md ; /help.md - H
- Toncast SDK: https://github.com/TonCast/sdk (README, `packages/sdk/README.md`, `packages/sdk/src/http/endpoints.ts`, `src/types/pari.ts`, `src/resources/paris.ts`) ; https://github.com/TonCast/tx-sdk (README, `src/constants.ts`) - H (code read via `gh api`, not executed)
- PayBox chain catalog check: `discover_tokens mode=chains query=ton` - H (read-only), 2026-10-19
- Fixtures: `docs/research/fixtures/predicton-ton/{toncast_paris_limit3,toncast_categories,toncast_odds_state_btc_oct,toncast_coefficient_history_btc_oct,toncast_feeds_summary,predicton_net_page_props_summary}.json`, `sok_catalogue_row.csv`
