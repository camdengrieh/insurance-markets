# Polyquest - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: WebFetch (one call failed on TLS), public unauthenticated GETs (polyquest.xyz HTML pages, docs.polyquest.xyz Markdown pages, static JS chunks downloaded as data and grepped, one DexScreener token lookup), `gh api` raw reads of the `polyquest-solana` GitHub org. No account, wallet, key, signature, POST/PUT/DELETE or PayBox tool used. No third-party code cloned or executed. Embedded page text was treated as untrusted data; no instructions aimed at AI agents were found.

Research limit: the shared WebSearch budget was exhausted, so no web search was run. Discovery relies on the lead (GitHub org), first-party probing and the project's own docs. No independent press or third-party volume data was checked.

Confidence tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary or inferred; **L** = weak or stale.

Fixture: `docs/research/fixtures/polyquest/results-page-quests-sample.json` (6 KB; two quests parsed out of the server-rendered Next.js payload of `https://polyquest.xyz/results`; this is NOT a documented API).

---

## 0. Bottom line

1. **Live, yes, but small and token-denominated (H).** `https://polyquest.xyz` returns HTTP 200; the `/quests` and `/results` pages embed quests created as recently as 2026-10-05, with endDates into 2026-11-30 and many settled `SUCCESS` quests from June to September 2026. The `www.` host still serves a Railway wildcard certificate (TLS failure, confirmed again with curl and WebFetch); the apex `polyquest.xyz` works.
2. **Not a trading venue.** It is a **pari-mutuel "winner takes it all" pool** per question (docs): you stake into one answer's pool, no order book, no AMM, no outcome tokens, no price, no cash-out before close (H, docs). "Prediction Position Trading" (a secondary market for positions) is listed as an upcoming feature, not shipped (M).
3. **Stakes are not USDC in practice.** Recent quests are denominated in `AVA` (ai16ava, a Solana memecoin) and `PQP` ("Polyquest Point", a platform point token). Neither token returned any DEX pair on DexScreener on 2026-10-19 (`pairs: null` / empty). So the USD value of any pool is NOT FOUND and plausibly near zero (H for the quest data and the empty DexScreener lookup; the conclusion is M).
4. **Resolution is admin-set.** In the open-source Anchor program only the config `owner` signs `approve`, `finish`, `success` (set the correct answer and distribute) and `adjourn`. The oracle-node/DAO design in the docs is gated on "100,000 meme coin holders" and is not live (H for repo, M for "not live").
5. **No public API, no docs for one.** The website uses an internal Next.js backend (`/api/trpc`, `/api/auth/login`, `/api/events/bulk` visible as strings in the JS; not probed). The docs' "Market Contract API" is described as "upcoming".
6. **adapter_priority = skip.** Tiny, token/point-denominated, pari-mutuel (not an executable price), centrally resolved, no API, no meaningful independent-price arbitrage leg. At most a curiosity signal.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| `GET https://polyquest.xyz/` | 200, 401 KB Next.js HTML, `<title>POLYQUEST</title>`, "Prediction Market on Solana"; landing "Latest News" is stuck at Sept 2024 tweets | H |
| `GET https://www.polyquest.xyz` | TLS fail: cert for `*.up.railway.app` only (curl error 60; DNS CNAME -> `f8m0vxq1.up.railway.app`). Apex works. | H |
| `GET https://polyquest.xyz/quests` | 200; 14 quests embedded, 6 created 2026-10-05, newest `updatedAt` 2026-10-14 | H |
| `GET https://polyquest.xyz/results` | 200; 25 quests, statuses `SUCCESS`, `REVOKE`, `APPROVED`; oldest shown 2026-07-27 | H |
| GitHub org `polyquest-solana` | created 2024-07-15, 5 repos, 3 followers, org `updated_at` 2025-03-14, last repo push 2025-03-14 (`polyquest-wormhole-evm`). Public code is stale (19 months) relative to the live site. | H |
| Docs `reference/update/recent-updates` | last dated entry 13 Dec 2024 | H |
| Docs roadmap/to-do | items due Q4 2024 / Q1 2025 still unchecked (Market Contract API, Position Trading, APY conversion) | H |

Verdict: operating (an operator is creating and settling quests as of Oct 2026), but low activity. Note the 2026 quest platform may run a newer program version than the public repo; the quest payload says `programVersion: "1.0.0"` (M).

## 2. Kind and market model

- Kind: on-chain (Solana) pari-mutuel prediction pools with an off-chain database and admin-curated quests (H).
- Market model: question with 2+ named answers ("Yes"/"No", or match winner). Each answer has `voteCount` and `totalAmount` (pool size). `percent` = share of pool on that answer. Winner takes all of the pool net of fees, pro rata by stake in the winning answer (H, docs `features/winner-takes-it-all`, `polyquest-for/stakeholders/profit-sharing-model`).
- Tokenisation: no outcome tokens. A bet creates a per-user betting account (`states/betting.rs`) in the Anchor program `forecast_market`; the stake sits in a vault token account (H, repo).
- Implied payout is `pool_total * (1 - fees) / winning_answer_pool` and moves as others bet, so the "price" is a floating parimutuel multiple, not a fill price. You cannot exit before close (M: no sell/cancel instruction found in the instruction list: `bet`, `bet_cross_chain`, `claim_token` plus admin ops).
- Lifecycle statuses seen: `APPROVED` (open), `FINISH` (closed, awaiting result), `SUCCESS` (settled), `REVOKE` (cancelled/refund, 4 of 25 results), plus program enum `Draft, Approve, Finished, Success, Adjourn` (H).
- Min bet: `minBetAmount` 100 (raw token units as the page displays them) on the quests sampled (H).

## 3. Chains and collateral

- Chain: Solana mainnet (docs: soft launch 29 Aug 2024; H). Collateral: any SPL token integrated by Polyquest. Docs list USDC (EPjFWdd5...Dt1v) and SEND among supported; the live 2026 quests use `AVA` (`AVA5UhFLfmr9eF9zxegUtXhRw7UTpszSEB6rguwi86dA`, 9 decimals) and `PQP` (`36zbZj53eHxy3SsN9zanXinxXnibkk1f1PS88rhJQqC1`, 9 decimals) (H).
- EVM: repo `polyquest-wormhole-evm` + `evm/demo-wormhole-bridge` implement a Wormhole-based bet-from-EVM flow. Only testnet deployments exist in the repo (Sepolia 11155111, Arbitrum Sepolia 421614, Base Sepolia 84532); roadmap lines in the README say tested on Base Sepolia. No mainnet EVM deployment found (H for the repo contents; whether one exists elsewhere is NOT FOUND).
- Mainnet Solana program id: NOT FOUND in the repo (`Anchor.toml` lists only localnet ids `forecast_market = Anzm9rXES6e...fexfHi`, `forecast_exchange = 6EaqAvkp...BC3g`; these are localnet keys and may differ from mainnet). Not verified on-chain (JSON-RPC is POST; skipped by ground rules).

## 4. Read API

- Official public API: **none documented** (docs index `llms.txt` has no API reference; "Market Contract API" page says "upcoming" and describes quest creation/administration, not reads).
- Undocumented: the Next.js app has a tRPC backend (`/api/trpc`, strings `trpc/server`, `trpc/trpc` in JS chunks), plus `/api/auth/login`, `/api/events/bulk`, `/api/images/...`. Not probed (undocumented, possibly auth-bound).
- Practical read path observed: the `/quests` and `/results` HTML pages embed full quest JSON (server-rendered RSC payload) with fields: `id, title, description, creatorFeePercent, serviceFeePercent, startDate, endDate, token{address,symbol,decimals}, status, voteCount, totalAmount, minBetAmount, finalAnswerId, approveTx, finishTx, answerTx, successTx, answers[{id,title,voteCount,totalAmount,percent,isCorrect}]` (H). A scraper could use it; it is fragile and not an API. The listing is capped (14 and 25 quests).
- On-chain: Anchor IDL in repo `sdk/idl/forecast_market.json`; `MarketAccount` carries `status, market_total_tokens, market_remain_tokens, correct_answer_key, creator_fee_percentage, service_fee_percentage` so all state is readable by `getProgramAccounts` once the mainnet program id is known (M; not exercised).
- Auth/limits/websocket: NOT FOUND (none documented).

## 5. Trade path

- Via the website: connect a Solana wallet (Phantom, Backpack, Bitget, WalletConnect, or a Circle programmable wallet), sign an Anchor `bet` instruction (H, docs FAQ + repo). There is no order API, no signed-off-chain-order scheme.
- Programmatically: build and sign the Anchor `bet` transaction yourself using the repo's TS SDK/IDL (`sdk/forecast-market-program.ts`). Needs the live program id and the market's accounts (NOT FOUND/unverified).
- Cancel/exit: no instruction seen. Claim: `claim_token` after `SUCCESS`.
- The Blink (Solana Actions) repo `polyquest-solana-actions` exposes a voting action at the Dialect/Blinks level (docs `solana-ecosystem/blinks`; repo last pushed 2024-09-25, M) - a GET returns an action descriptor with a transaction-building POST; not probed.

## 6. Reachable through PayBox?

**Partial, not recommended.** An EVM wallet cannot bet: the EVM path is Wormhole from Base/Ethereum/Arbitrum and exists only as testnet code. A PayBox Solana wallet could in principle sign a custom Anchor transaction, but there is no plugin, the mainnet program id is unconfirmed, and the stake tokens (AVA/PQP) are illiquid/unpriced. Net: `paybox_reachable = partial`.

## 7. Fees (H, docs `profit-sharing-model` + on-chain fields)

- Platform (service) fee: 2% of the total pool (quest data shows `serviceFeePercent: 0.02`).
- Creator fee: set per quest (sample: `creatorFeePercent: 0.01` = 1%, example in docs also 1%), taken from the pool.
- Payout pool = Total pool - platform fee - creator fee, shared pro rata among stakers on the correct answer. Charged to the pool (i.e. effectively borne by winners and losers at settlement). Example in docs: $10,000 pool -> $9,700 payout.
- Program computes fees at `success_market` using basis points on `market_remain_tokens` (H, repo). Solana network fees extra. Staking rewards in `$POLY` for early bettors are described in the docs (M; token existence on mainnet not verified).

## 8. Resolution and dispute risk

- Current (H, repo): `owner` (admin) signer is required for `approve_market`, `finish_market`, `sucess_market` (sets the correct answer and pays out), `adjourn_market`, `update_owner`, `retrieve_token`. Single-party control.
- Planned (H docs, M status): 3-stage oracle: (1) meme-coin holders as nodes after 100,000 holders, with Polyquest able to deny; (2) governance group; (3) own oracle chain. Gate not met; nothing indicates it is live.
- Sources named per question: a free-text description and an optional `relevantLink` (null in the sample) (H). Outcomes seen: sports results, TV ratings, crypto price thresholds, KOSPI, FOMC, weather ("Will it rain in Hyeonpung, Daegu").
- Dispute risk: HIGH. No dispute window, single admin, `REVOKE` status exists (4 of 25 recent results revoked, including a 1.26M-unit pool, M on cause). A question that is revoked has refund semantics NOT FOUND in docs.

## 9. Geo / ToS / automation

- Docs FAQ: "accessible globally, provided that local regulations in your jurisdiction allow" (H). No explicit country blocklist, KYC or ToS URL found (`/terms` returns 200 but it is the SPA shell; contents not read) - NOT FOUND (searched docs index, FAQ, important-notice).
- Whitepaper notice: not an offer; no regulatory review (H). Automation/bot policy: NOT FOUND. `robots` meta on the landing page says "noindex, follow, nocache" (H); scraping rules unstated.

## 10. Liquidity

All from the live pages on 2026-10-19 (H), amounts in the token's own units as displayed (decimals 9 per token metadata; whether `totalAmount` is already scaled is unclear):

| Quest | Token | totalAmount | voteCount | Status |
|---|---|---|---|---|
| USD/KRW <= 1,300 by end Oct 2026 (#1117) | PQP | 65,900 | 4 | APPROVED (open) |
| Will BTC reach $100k by end Oct 2026 (#1115) | PQP | 30,080 | 2 | APPROVED |
| Dodgers reach 2026 World Series (#1113) | AVA | 161,100 | 5 | APPROVED (endDate 2026-09-27 passed, still APPROVED) |
| 6 new quests 2026-10-05 (Dem House, FOMC Dec, Brent>120, Ukraine ceasefire, BTC ATH, KOSPI 7,500) | AVA | 0 | 0 | APPROVED |
| Settled sports/TV, Jul-Aug 2026 | AVA | 280k - 1.26M | 8 - 20 | SUCCESS / REVOKE |

Biggest pools are about 1.3 million AVA units with 20 bettors. AVA and PQP have no DEX pair on DexScreener, so USD volume/TVL is NOT FOUND; pools are best treated as worth ~$0. Typical participation: 3 - 20 wallets per quest. No platform-level volume/TVL figure found (DefiLlama etc. not checked: budget exhausted).

## 11. Event overlap with other venues

Categories that overlap liquid venues (Polymarket, Kalshi, Limitless, etc.): BTC/XRP/SOL price thresholds, FOMC rate decision, US midterms (House), Brent crude, Russia-Ukraine ceasefire, KOSPI, USD/KRW, MLS (LAFC) and KBO baseball match winners. Questions are bespoke thresholds/dates, so exact-match linking to other venues' markets would need the market-linking layer. But because stakes are parimutuel and priced in unpriced tokens, any overlap is signal-only, not an arbitrage leg.

## 12. Shared liquidity

None found with another venue; the pools are its own. It is "independent" but too thin and token-denominated to be a useful leg.

## 13. Adapter recommendation

- **adapter_priority: skip.** If ever wanted as a weak sentiment signal: scrape `/quests` + `/results` embedded JSON every few minutes and use `answers[].percent` as the pool-share signal (confidence L; parimutuel shares of 2-20 wallets are not informative). Revisit only if a documented API appears, the mainnet program id is published with USDC-denominated quests, or volume becomes real.

## 14. Not found / open questions

- Mainnet program id(s) and whether the public repo matches deployed code.
- USD value of AVA/PQP pools; any platform volume/TVL.
- Terms of Service text, geo-block list, bot/automation policy.
- Whether `/api/trpc` exposes an unauthenticated quest list (not probed).
- Refund semantics of `REVOKE`.
- Whether `$POLY` exists as a mainnet token.
- Any third-party coverage (search budget exhausted).

## 15. Suspicious content

None found. Observed: the landing page contains embedded tweets and a docs link only; the docs mention fundraising plans for KoL promotion (marketing, not an instruction). The `www.` host serves a mismatched TLS cert (infrastructure misconfiguration, not content).

## Sources

- https://polyquest.xyz/ (H, fetched 2026-10-19), https://polyquest.xyz/quests (H), https://polyquest.xyz/results (H)
- https://docs.polyquest.xyz/llms.txt (H) and pages: `introduction/faq.md`, `features/winner-takes-it-all.md`, `features/spl-token-pool.md`, `features/market-contract-api.md`, `polyquest-for/stakeholders/profit-sharing-model.md`, `prediction-oracle/*.md`, `reference/update/recent-updates.md`, `reference/roadmap/to-do-list.md`, `solana-ecosystem/integrated-tokens.md`, `resources/external-links.md` (H)
- https://github.com/polyquest-solana (org metadata via `gh api`, H); repo `polyquest-solana-program` (README, docs.md n/a, Anchor.toml, `programs/forecast-market/src/{states/market.rs,instructions/admin/finish_market.rs,instructions/admin/sucess_market.rs}`, tree listing) (H); `polyquest-wormhole-evm` and `polyquest-solana-actions` (tree/commit dates only, H)
- https://api.dexscreener.com/latest/dex/tokens/{AVA,PQP mint} (H: empty pairs)
- Fixture: `docs/research/fixtures/polyquest/results-page-quests-sample.json`
