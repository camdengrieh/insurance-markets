# 13. Local implementations inventory (own repos under `<local workspace>`)

Researched 2026-10-19. Read-only: nothing was run, installed, built, cloned or modified in any other repo. No `.env`, key,
keystore or credential file was opened. The only network access was `gh api` reads of public Polymarket repos, used to check
claims made by the local code (see Sources).

Confidence tags: **H** = read first-hand this session (path/URL cited), **M** = secondary or inferred, **L** = weak or stale.
`NOT FOUND (searched: ...)` marks a documented absence. Nothing in `docs/plan.md` was repeated as a finding; the plan's XO
claims remain unverified by this task.

Privacy note: the names of the author's private repositories are replaced by aliases (`own-repo-A`, `own-repo-B`, ...), and the author's name, handle, organisation, home path and session paths are removed. The technical findings are unchanged.

---

## 0. Executive summary

1. **There is no XO, Kalshi, Trueo, Quotient, Kernel/ZeroDev, Blockscout or automated market-matching code anywhere locally** (H, see section 8).
   Everything reusable is Polymarket/Limitless-shaped, x402-shaped, or generic (ERC-1271 verification, source aggregation, caching).
2. **Best reusable assets** (all TypeScript, mostly the author's own):
   - `own-repo-B/apps/webapp/lib/markets/*`: a normalised multi-venue market model (`MarketEvent`/`SubMarket`/`MarketOutcome`) with Polymarket (Gamma) and Limitless adapters. This is the closest thing to the multi-venue aggregation layer the user wants.
   - `own-repo-G/apps/indexer/src/api/ops-auth.ts`: a rigorous EIP-712 + ERC-1271 verifier (getCode, `isValidSignature` magic, skew/TTL/nonce, cross-account replay notes). Written for a different product but the pattern maps directly to the plan's "re-verify the signed typed data equals the quote" guardrail.
   - `own-repo-F/packages/sources/src/aggregate.ts`: deterministic multi-source consensus (time-weighted mid, spread cap, staleness drop, per-operator median, outlier drop, dispersion -> ABSTAIN). The right discipline for a cross-venue "fair value / edge" signal.
   - `otaku/.../polymarket.service.ts` (elizaOS, MIT): LRU+TTL caches, timeout and retry helpers, Polymarket Data-API reads (positions, trades, activity, holders) usable as copy-trading signal inputs.
3. **The local Polymarket WRITE path is NOT safe to reuse as written.** I checked it against Polymarket's own repos (primary source) and found four independent defects/staleness issues (section 5): (a) wrong Safe-proxy salt, (b) eager-incrementing order nonce that the exchange rejects, (c) L2 HMAC output has its `=` padding stripped (upstream says keep it), (d) EIP-712 order struct is the V1 layout while Polymarket now has CTF Exchange V2 with a different struct. The author's own status doc says the end-to-end live test was never done. Reuse the *shape* (build -> sign -> submit, L1/L2 auth), not the code.
4. **Nothing local touches PayBox.** The closest "agent wallet" analogues are otaku's CDP plugin (no spend limits, hot MPC wallet) and the own-repo-D MCP server (raw private key in env, model-controlled `allowPayment` flag): both are anti-patterns for a guardrailed PayBox plugin.
5. **Hard-coded secrets found** (rotate): `own-repo-K/backend/packages/config/config.webserver.ts:67` and `config.common.ts:26` (plus the gitignored `*.local.ts` twins at the same lines). Details in section 7. own-repo-F's "private keys" are labelled public Anvil test keys.
6. **Ownership caveats**: `otaku`, `x402`, `x402-starter-kit`, `txApi`, `scaffold-x402` are third-party clones; `own-repo-D/agent` is a copy of `otaku`; `own-repo-D/facilitator` is a verbatim copy of `x402-starter-kit`; `own-repo-D/packages/x402-solana` is PayAI Network's MIT package; `own-repo-E` carries a restrictive Azuro licence (do not copy); `own-repo-C` is an ETHGlobal team repo (co-authors), so confirm permission before lifting code.

---

## 1. Method and coverage

- Listed all named repos and read the structure of each. Read in full or in the relevant ranges every file cited below.
- Whole-folder greps (real `/usr/bin/grep`, excluding `node_modules`, `.git`, `dist`, `.next`, `.pnpm-store`, `.env*`, key/keystore/lock/map files) for: polymarket, kalshi, limitless, clob, gamma-api, py-clob, ClobClient, unified order book, arbitrage, market matching, HMAC, kernel/zerodev/permissionless, EIP-712, ERC-1271/isValidSignature, Quotient, Trueo, Metaculus, Manifold, PredictIt, Blockscout, xo.market.
- Caveat on greps: the first greps excluded directories named `lib`, which hides `own-repo-B/apps/webapp/lib/**`; I re-ran without that exclusion (counts below use the corrected run). Several broad terms are noisy ("clob" substring matches "clobber"; "permissionless" is a licence/contract word; "quotient" is a math word; "kernel" is unrelated). Only word-boundary or library-specific matches were counted.
- Secret scan printed **path:line only**, never match text; hits were then classified from masked context (tx hashes, init-code hashes, salts, token ids are not secrets).
- `own-repo-K` has **no `.git` of its own**: `git -C own-repo-K rev-parse --show-toplevel` returns `<home>`, i.e. a repository rooted at the home directory. Its dates/remotes are therefore not trustworthy (H). Worth checking that the home-directory repo cannot accidentally track secrets.

Repo-level hit counts (corrected run, files): `polymarket`: own-repo-B 77, otaku 33, own-repo-D 33, own-repo-C 17, own-repo-B2 8, own-repo-N 4 (docs only), own-repo-O 1 (json). `limitless`: own-repo-B 45, own-repo-C 6, own-repo-B2 2. `kalshi`: own-repo-C 3 (icons/mock data), own-repo-B 2 (docs text only). `\bclob\b|ClobClient|clob-client`: own-repo-B 29, otaku 9, own-repo-D 9, own-repo-M 1 (unrelated). `py-clob`: 4 own-repo-B (comments), 1 otaku, 1 own-repo-D.

---

## 2. Ownership and licence posture

| Repo / path | Origin (evidence) | Licence | Last commit | Posture |
|---|---|---|---|---|
| `own-repo-B` (`apps/webapp`, `apps/backend`) | Own: an own GitHub repository | None found (no LICENSE, no field in package.json) | 2026-04-17 | Own code; AI-iterated ("Iteration 49" in status doc). Free to reuse. |
| `own-repo-B2` | a repository of the author's company organisation (org appears to be the author's company; not confirmed) | None found | 2025-11-26 | Own. Older (x402 **v1**); the monorepo copy `own-repo-B/apps/backend` is newer (x402 **v2**). Prefer the monorepo copy. |
| `own-repo-C` | Local single "Initial commit" by the author, no remote. README references the ETHGlobal Cannes team (`ethglobal-cannes-polybets`) and another contributor handle | `apps/polymarket-copier/package.json` says MIT; no repo LICENSE | 2025-10-10 | **Team hackathon code**; confirm co-author consent before copying beyond ideas. |
| `own-repo-D/agent` | Copy of elizaOS `otaku` (`diff -rq` shows plugin dir identical; added message-filter; removed CDP wallet UI) | MIT (LICENSE: elizaOS) | 2026-01-25 | Vendored third-party + author edits. |
| `own-repo-D/facilitator` | Verbatim copy of `dabit3/x402-starter-kit` (`diff -rq` empty) | MIT (Nader Dabit) | 2026-01-25 | Vendored third-party. |
| `own-repo-D/packages/x402-solana`, `x402-solana-react` | PayAI Network package (`"author": "PayAI Network"`, MIT) | MIT | 2026-01 | Vendored third-party. |
| `own-repo-D/packages/own-repo-D-mcp-server` | Own (single file, 306 lines) | None | 2026-01 | Own. |
| `otaku` | `github.com/elizaOS/otaku` clone; commits by upstream contributors, none by the author | MIT | 2026-01-06 | Third-party. `plugin-polymarket-discovery` was written upstream (Dec 2025). Reuse with MIT attribution. |
| `own-repo-E` | Own repo (an own GitHub repository) but built on **Azuro SDK template** | **Azuro DAO custom licence**: only for Azuro project, must disclose domain, no hosted service use, licence-key functionality must not be circumvented | 2025-11-03 | **Do not copy.** |
| `x402` | `github.com/coinbase/x402` clone, HEAD 2026-01-16 (**9 months old: likely stale**) | Apache-2.0 + NOTICE | 2026-01-16 | Third-party; keep NOTICE if copying. |
| `x402-starter-kit` | `dabit3/x402-starter-kit` (1 commit by the author) | MIT | 2026-01-25 | Third-party. |
| `scaffold-x402` | Scaffold-ETH 2 extension (BuidlGuidl) | MIT | 2025-12-13 | Third-party template. |
| `txApi` | `github.com/scxr/txApi` (all 20 commits by `scxr`) | None | 2025-05-25 | Third-party, unrelated (four.meme trade parser). |
| `own-repo-F` | Own: an own GitHub repository; `src/v1` is source-identical gmx-contracts (upstream licence applies to that dir) | SPDX MIT headers on some files; no repo LICENSE | 2026-09-29 | Own (except vendored GMX V1 under `packages/contracts/src/v1`). |
| `own-repo-G` | Own: an own GitHub repository | None found | 2026-10-19 (today) | Own; active. |
| `own-repo-H` | Own: an own GitHub repository | None found | 2026-07-08 | Own. |
| `own-repo-I` | Own scaffold (1 commit) | MIT SPDX in sols | 2026-10-02 | Own; `worker/src/x402/index.ts` is a one-line TODO, so nothing to reuse there. |
| `own-repo-J` | Own; **empty** (only `.gitattributes`) | n/a | 2026-03-12 | Nothing. |
| `own-repo-K` | Casino backend (coinflip/jackpot/NestJS), no own `.git` | n/a | n/a | Not relevant; contains hard-coded keys (section 7). |

---

## 3. Inventory by code area

### 3.1 `own-repo-B/apps/webapp/lib/markets/` (multi-venue market model) [H]

- **Language/framework**: TypeScript, Next.js 16 app; adapters are plain `fetch`; `index.ts` mixes in TanStack Query hooks (`useQueries`).
- **What**: `types.ts:1-112` defines `MarketProvider = "polymarket" | "limitless"`, `MarketEvent`, `SubMarket`, `MarketOutcome {tokenId,label,probability}`, `PricePoint`, `PriceHistory`. `polymarket.ts:79-188` normalises Gamma events/markets (JSON-string arrays `outcomes`/`outcomePrices`/`clobTokenIds` parsed defensively at `:79-87`); `:190-212` thin `gammaGet`/`clobGet`; `:229-321` list/lookup by slug/id/conditionId; `:332-377` CLOB `/prices-history`. `limitless.ts:59-158` normalises Limitless; `:87-129` status mapping and prices; reuses `extractOutcomeTokens` from `lib/trading/prediction/limitless-api.ts:147-220` (13 golden vectors) to cope with drifting wire shapes.
- **Quality**: typed, defensive parsing, provider failures isolated (one provider failing does not blank the merge, `index.ts:104-187`). No unit tests for the normalisers themselves (only `extractOutcomeTokens`). Self-reported: Vitest 19 files / 310 tests green (`TRADING_TEST_COVERAGE_ISSUES.md:1-20`); I counted 19 `*.test.ts` files but did not run them.
- **Defects to fix before reuse**: (i) `polymarket.ts:115` treats `closed === true` as `resolved`; (ii) probabilities default to **0.5** when data is absent (`polymarket.ts:130`, `limitless.ts:93-97,113,118`): for edge/arb this must be `null`, never a fabricated midpoint (the plan itself says "never infer outcomes from absent data"); (iii) only `outcomePrices` (last/mid) is carried; there is **no best bid/ask or depth**, so it cannot support arbitrage; (iv) winner detection by `price === 1` (`:118-120`) is brittle; (v) `index.ts` couples to React Query, so extract the pure adapters into a server-safe module.
- **Staleness**: Polymarket and Limitless wire shapes are as of 2026-04 (`limitless-api.ts` says "live API as of 2026-04"). Re-verify field names before use.
- **Verdict**: **COPY-ADAPT** (high value). Add `venue: "xo"` adapter, `bestBid/bestAsk/depth`, `null` probabilities, `resolutionSource/rules` text fields, and a `canonicalKey` for matching.

### 3.2 `own-repo-B/apps/webapp/lib/trading/prediction/` (Polymarket + Limitless order path) [H]

| File | Lines | What | Verdict |
|---|---|---|---|
| `polymarket-api.ts` | 1-122 | Read-only CLOB (`/markets/{id}`, `/book?token_id=`) + Gamma search; React Query hooks | Reads are fine; superseded by 3.1 adapters |
| `polymarket-api-key.ts` | 21-85, 87-138, 143-216 | L1 `ClobAuth` EIP-712 -> `POST /auth/api-key`; per-EOA creds cached in `localStorage`; L2 HMAC headers (`POLY_*`) with base64url-decoded secret | **COPY-ADAPT after fixing padding** (`base64UrlEncode` at `:191-196` strips `=`; upstream keeps it, section 5.3). No derive fallback (`/auth/derive-api-key`). Browser-storage creds are not applicable to a plugin. |
| `polymarket-order.ts` | 22-45, 59-110, 114-165 | `buildPolymarketOrder` (pure-ish, previewable) and `signPolymarketOrder` (EIP-712 via `walletClient.signTypedData`) | **IDEAS / ADAPT ONLY IF XO's struct matches V1.** Struct is Polymarket V1 (section 5.4). Build/sign split is exactly the PayBox prepare -> `request_wallet_sign` -> submit shape. |
| `clob-types.ts` | 24-95 | Shared CTF `ClobOrder`, `ClobOrderSide`, `ClobSignatureType` (EOA/POLY_PROXY/POLY_GNOSIS_SAFE) | **IDEA.** Lacks `POLY_1271` (=3, upstream has it) so no smart-contract-wallet signature type. |
| `polymarket-amounts.ts` | 47-80 | USD -> maker/taker integer amounts, 6 decimals, rejects bad price | **COPY-ADAPT** (pure, 15 vectors). Add tick/size rounding; verify XO collateral decimals first (plan: 6-vs-18 is a 10^12 error). |
| `orderbook.ts` | 33-53 | Convention-agnostic best ask/bid scan (does not assume sort order) | **COPY** (pure, tiny, has test). |
| `polymarket-nonce.ts` | 1-108 | Browser `localStorage` eager-increment counter | **AVOID** (section 5.2). |
| `polymarket-proxy.ts` | 12-68 | CREATE2 Safe-proxy derivation | **AVOID** (section 5.1). |
| `use-polymarket-trade.ts` | 72-199 | State machine: resolving-price -> authenticating -> signing -> submitting -> pending/success; observability hooks | **IDEA** (status enum maps onto PayBox request lifecycle). Hard-codes `negRisk: true` (`:144-147`), submits body `{order, signature}` (`:153`) with no end-to-end validation. |
| `limitless-order.ts` / `limitless-api.ts` / `use-limitless-trade.ts` | 166 / 248 / 212 | Limitless on Base: EOA-signed CTF order, no HMAC | **IDEA.** Needs the Limitless docs re-check; code verified only for token-id extraction. |
| `providers.ts` | 1-24 | provider -> chainId map | IDEA |

- **Maintenance state**: AI-iterated in April 2026. `TRADING_INTEGRATION_STATUS.md:158`: "`[ ] Real end-to-end test with small YES bet on live market. Polymarket has no public testnet.`" (unchecked). `POLYMARKET_CLOB_NOTES.md` (252 lines) is a research log written by an agent loop and contains unverified assumptions; treat it as notes, not a spec.
- **Test gaps** (H): no known-answer vector for `buildClobL2Headers` (only base64url encode/decode vectors), and no Polymarket-specific EOA -> proxy known-answer pair (`polymarket-proxy.test-data.ts` has only generic EIP-1014 vectors and structural assertions). That is why defects 5.1 and 5.3 passed their own tests.

### 3.3 `own-repo-B/apps/backend/src/` (also `own-repo-B2/src`) [H]

- `runners/polymarket-ws.ts:1-42`: subscribes to Polymarket's real-time `activity/trades` topic via `@polymarket/real-time-data-client ^1.4.0`; payload type `types/polymarket.ts` has `proxyWallet`, `pseudonym`, `side`, `size`, `price`, `conditionId`, `transactionHash`. **This is the only trade-following feed in the repos.** It is a stub: handler only dedups by `transactionHash` (drops multiple fills in one tx), computes `totalSpent`, logs are commented out, `trackedTxs` Set grows without bound, and the client `.connect()`s at import time. **COPY-ADAPT** as a signal source skeleton (bounded LRU, per-fill ids, leader allow-list, persistence).
- `routes/polymarket.ts` + `services/polymarket/markets.ts` (47 lines): Gamma `public-search` and `events/slug`; no validation or caching. **IDEA** only.
- `clients/redis-cache.ts:1-60`: 30-line Redis `get/set EX` wrapper. Trivial; **IDEA**.
- `services/ugc/x402.ts:1-228` + `routes/x402.ts:1-38`: x402 **v2** resource server on Hono (`@x402/core`, `@x402/evm`): resource server + exact EVM scheme registration (`:49-56`), `verifyX402Payment` (`:135-228`: build requirements -> 402 -> `decodePaymentSignatureHeader` -> `findMatchingRequirements` -> `verifyPayment` -> returns `settle()` for the caller to invoke **after** business logic, `:223`); emits both `Payment-Response` and `X-PAYMENT-RESPONSE`; CAIP-2 network normaliser (`:26-44`). **COPY-ADAPT** if aggregated signals are sold over x402. Note it reads only the `X-PAYMENT` request header (`:154`), so check the v2 header name before reuse. The file hard-codes a forwarding wallet address in `extra` (not reproduced here; remove it).
- `own-repo-B2/src/services/ugc/x402.ts` is the **v1** version (`x402/verify`, `@x402x/core`); superseded.

### 3.4 `own-repo-B/apps/webapp/lib/x402-payment.ts` [H]

x402 v2 buyer with an injected EVM signer: wraps a viem `signTypedData` into `ClientEvmSigner` and `wrapFetchWithPayment`. **IDEA for PayBox**: PayBox already exposes `pay_x402`/`use_service`, so we should not build a client; but the `ClientEvmSigner` shape (`{address, signTypedData}`) is precisely what a remote-signer adapter needs.

### 3.5 `own-repo-C/apps/polymarket-copier/` (market mirroring, not copy-trading) [H]

- **Language**: TypeScript/Bun. 1,961 lines: `index.ts` (689), `market-rephraser.ts` (376), `polymarket-client.ts` (327), `types.ts` (190). **No tests** (package.json references a non-existent `test-rephrasing.ts`).
- **What it really does**: pulls active binary markets from Gamma, asks an LLM (LangChain via OpenRouter) to rephrase them while preserving win conditions, **creates pools on Solana marketplaces and seeds them at Polymarket's odds**, then writes `markets`/`external_markets` rows to Supabase. It is a *market-copier/bootstrapper*, not a trade follower.
- **Reusable pieces**: `polymarket-client.ts:278-318` retry + exponential backoff + fixed rate-limit delay; `:100-136` JSON-string-array parsing; `:188-221` market validity filter; `types.ts:50-120` Gamma wire type; `market-rephraser.ts:94-206` prompt that insists the rephrased market has "EXACT SAME" event, data source, date, threshold and methodology (useful as the spec for an `xo_validate_market_draft` lint and for a market-equivalence check); `:212-266` zod-validated structured output chain.
- **Anti-patterns to avoid**: `index.ts:519-554` `calculateOddsWithVariance` deliberately perturbs odds by a random 20-30% and `:294-301` randomly skips venues "for better variance"; seeding another venue at a copied price with random noise is exactly the wash/manipulation optics the plan flags. Market text is interpolated into the LLM prompt unsanitised (prompt-injection surface). Content copying from Polymarket has unassessed IP/ToS risk. Hard-coded `localhost` URLs in DB rows.
- **Verdict**: **IDEAS** (prompt spec, retry pattern); do **not** copy the seeding/variance logic.

### 3.6 `own-repo-C` aggregation pieces [H]

- `packages/migrations/seed.sql:61-79`: **market-equivalence schema**: `markets` (parent) <- `external_markets {question, price_lookup_method in ('canibeton-lmsr','polymarket-orderbook','limitless-orderbook'), price_lookup_params jsonb, parent_market, marketplace_id}`; `marketplaces.price_strategy in ('orderbook','amm','lmsr')` (`:13-27`, `:42-56`). Comment: "Markets on other platforms, used by the frontend to propose what markets to spread your bets on". Equivalence is **manual or LLM-curated**; no automated matcher exists. The file defines `marketplaces` twice (`:4` and `:33`), so it is not directly runnable. **IDEA**.
- `apps/marketplace-adapter-rest-api/index.ts:1-136` + `packages/common/src/marketplace-adapters/types.ts:1-40`: Hono REST façade over a generic `MarketplaceAdapter {buyShares, sellShares, getPrices, claimPayout}`; only a Solana adapter exists (the README's Polymarket/Limitless adapters are **not present**). **IDEA** (interface shape; note it lacks quote/depth/fees/cancel).
- `apps/bet-router-rofl/bet_execution/optimal_betting.py:81-203, 265-346`: `MarketInterface` with LMSR implementation and an `OrderBookMarket` that is a **placeholder returning price 0.5** (`:160-193`); `find_optimal_betting_strategy` ranks pools by shares per dollar; `compare_two_pools`. This is **best-price routing between duplicate markets, not arbitrage detection**. `lmsr_calculator.py:218` `calculate_shares_to_buy` is LMSR math (XO's AMM is described as legacy, so low value). **IDEA**.
- `contracts/contracts/polybet.sol:295-314`: `instantArbitrage` bet-slip flag (sell proxied bets if a leg loses); bookkeeping only. **IDEA** at best.
- `apps/agent/polybet_agent_v3.py:215-276`: LLM-filtered market recommendations from Supabase tables (uAgents/Fetch.ai chat protocol), with a naive per-user rate limiter (`:39-60`). **IDEA**.
- Dead/ignored: `arbitrage-rofl` (README: "IGNORE THIS"). The "arbitrage logic" claimed in the README is the `instantArbitrage` flag above.

### 3.7 `otaku` and `own-repo-D/agent` (elizaOS) [H]

- `src/plugins/plugin-polymarket-discovery/` (identical in both; 22 action files + 1,815-line service + 482-line `types.ts`; **no tests**; MIT, elizaOS contributors). Reads only (no auth): Gamma markets/events, CLOB book/spread/prices-history/`/books`, Data API `positions`, `value`, `trades`, `closed-positions`, `activity`, `holders`, `oi`.
- `services/polymarket.service.ts` reusable parts: `:49-87` `mapApiMarketToInterface`; `:103-149` TTL constants and LRU caches; `:203-270` LRU helpers; `:275-293` `fetchWithTimeout` (AbortController); `:298-325` `retryFetch` (1s/2s/4s; **retries every error, no 429/`Retry-After` handling, no jitter**); `:867-1045` wallet positions/value/trades; `:1470-1560` batch books; `:1578-1760` closed positions, activity, top holders. Weaknesses: `getMarketDetail` downloads `markets?limit=500` and filters client-side (`:506`); `deriveProxyAddress` uses `@polymarket/sdk` (a cross-check against own-repo-B's hand-rolled derivation).
- **Copy-trading relevance**: the Data API wallet endpoints (positions/trades/activity/holders) are the *read* half of trade-following (leader scoring, position diffs). **COPY-ADAPT with MIT attribution** into a read-only signal module.
- `src/plugins/plugin-cdp` (CDP MPC wallets: transfer, swap, NFT, `cdp-wallet-fetch-with-payment.ts` x402 pay action): **no spend limits, allow-lists or approval gate** found (searched for confirm/approval/max/limit/allowlist/simulate in that plugin). Agent can move funds if asked: an anti-example for the plan's guardrails. **IDEAS only.**
- `src/plugins/plugin-relay` (3,238 lines, `@relayprotocol/relay-sdk`: `getQuote` -> `execute` -> status poll). Hard-codes 5 viem chains (`relay.service.ts:12`) and imports `privateKeyToAccount` (`:11`), i.e. local-key signing (usage not traced further). Whether Relay can route to chain 3223 is not answerable locally. **IDEA for gate 6** (quote -> unsigned steps -> status), not copyable because it signs with a local key.
- `docs/research/polymarket-cdp-wallet-compatibility.md` (identical to `clob-cdp-accounts.md`, dated 2025-12-29, **stale >6 months**, agent-generated, author machine paths `<home>/...`): describes a **remote-signer adapter** (wrap an external account's `signTypedData` as the ethers-v5 `_signTypedData` the CLOB client wants). Good *idea* for adapting any CTF client to a PayBox signer. `polymarket-integration-requirements.md` (660 lines) has an API table, the auth-level table (Public/L1/L2/Builder) and a US-restriction note; secondary, dated Dec 2025.
- `own-repo-D/agent` differs from `otaku` mainly in character/branding, a message filter (`src/frontend/lib/message-filter.ts`) and removal of the CDP wallet UI and of `src/managers/cdp-transaction-manager.ts`. It still lists `plugin-cdp` and `plugin-relay` under `src/plugins`, so those plugins probably cannot work there as-is (not tested).

### 3.8 `own-repo-D` MCP + x402 packages [H]

- `packages/own-repo-D-mcp-server/src/index.ts:1-306`: stdio MCP server using the **low-level** `Server` + `ListToolsRequestSchema`/`CallToolRequestSchema` (`@modelcontextprotocol/sdk ^1.18.0`), tools `http_get_paid`, `http_post_paid`, `discover`. Good minimal scaffold for the *shape* of an MCP server. **Do not copy the safety model**: the paid call uses `PRIVATE_KEY` from env (`:67`) and the guard is an `allowPayment` boolean that the *model itself* supplies (`:61-65`), which is not a control; `ALLOWLIST_HOSTS` is optional and when unset every host is allowed (`:38-52`), an SSRF/exfiltration surface. Prefer the high-level `McpServer` + zod used in coinbase's example.
- `packages/x402-solana`: PayAI Network package (MIT), 597 lines of src, 2 tests. Third-party; Solana is out of scope for XO.
- `facilitator/` = `x402-starter-kit` (Express `MerchantExecutor`, EVM + Solana, TEE docs). Only relevant if we run our own facilitator; not needed for PayBox.

### 3.9 `x402` (coinbase, Apache-2.0, HEAD 2026-01-16) [H]

- `typescript/packages/mechanisms/evm/src/signer.ts:1-60`: `ClientEvmSigner = {address, signTypedData}` and `FacilitatorEvmSigner` (`verifyTypedData`, `getCode`, `sendTransaction`). The client side only needs typed-data signing, i.e. exactly what PayBox's `typedData` intent offers.
- `typescript/packages/mechanisms/evm/src/exact/facilitator/scheme.ts:260-395`: parses **ERC-6492**-wrapped signatures, optionally deploys the ERC-4337 wallet, and branches on signature length (65-byte ECDSA vs "smart wallet" bytes signature for ERC-1271). A reference for how smart-wallet signatures are treated *for EIP-3009 transfers* (not CTF orders).
- `typescript/packages/extensions/src/bazaar/*`: discovery extension (`declareDiscoveryExtension`) so a facilitator can index a paid endpoint; relevant if we publish an aggregated-signals service that PayBox `discover_services` could find (M; PayBox's catalogue source not verified here).
- `examples/typescript/clients/mcp/index.ts` + README: MCP server that pays x402 resources with `McpServer` (high-level). `examples/typescript/servers/{express,hono,advanced}`: server patterns incl. dynamic price and hooks. **Stale risk**: clone is 9 months old; the own-repo-B apps already depend on `@x402/*` `^2.9.0`.

### 3.10 `own-repo-H` (own, Jul 2026) [H]

- `apps/api/src/gating.ts:170-270` and `agentGating.ts:1-130`: x402 **v2 on Hono** with `exact` and `upto` schemes (`@x402/hono`, `@x402/evm/upto/server`), facilitator selection (Coinbase CDP facilitator when keys exist, else configured URL) at `:182-192`, per-route price table, and `setSettlementOverrides` to settle the exact computed amount under an `upto` ceiling. No tests found. **COPY-ADAPT** (best local x402 *server* reference if we sell signals).

### 3.11 `own-repo-G/apps/indexer/src/api/` (own, active) [H]

- `ops-auth.ts` (1,122 lines): header `:1-66` documents the model; `:112-113` ERC-1271 magic `0x1626ba7e`; `:170-178` minimal ABI; `:483-680` `verifyOpsSignature` (hex-shape check, domain, seat in signed struct, issuedAt skew +60s / freshness 300s / TTL <= 900s, live allow-list, EOA recover only for 65-byte sigs, then `getCode` -> `isValidSignature`); `:682-709` code-presence cache asymmetry.
  - Key design decisions worth copying: **never use viem's universal validator on an unchecked address because it accepts ERC-6492 counterfactual signatures**; 1271 signatures have no replay protection of their own so the signed struct must carry the account and a server nonce; RPC failure -> 503, never "open".
  - Tied to `ops-types.generated.ts`, `ops-store.js` (sessions, nonces, attempt log) and the seat model, so **copy the pattern, not the file**.
- `ops-limit.ts:41-102` fixed-window `takeToken` with bounded bucket map and `Retry-After`; `:166-207` `readCappedBody` (byte cap before parse); `:124-128` salted IP hash. Inbound-server guards; **IDEA/COPY-ADAPT** for a signals API; not needed inside a PayBox plugin.
- Verification is by a fixture harness (`scripts/ops-fixture.ts`, `run-ops-fixture.mjs`) rather than Vitest.

### 3.12 `own-repo-F` (own, Sep 2026) [H]

- `packages/sources/src/aggregate.ts` (465 lines; tests in `test/aggregate.test.ts` 365 lines + `adapters.test.ts`): header `:1-27` states the methodology: per-source time-weighted mid with spread cap and max-age, group medians ("one operator = one vote"), cross-group outlier drop, **ABSTAIN if dispersion too high or too few groups survive**, trimmed mean with one half-even rounding, bigint arithmetic, no floats on the value path. `timeWeightedMid` `:91-121`, `trimmedMean` `:267-277`, `aggregateIndex` `:324-413`.
  - Maps to cross-venue consensus: venue = source, operator-group = venue family, "price" = implied probability. FX/uiMultiplier pieces are not needed.
- `apps/signer/src/eip712.ts:1-60`: "ISOLATED ENCODING MODULE" with parity vectors against the Solidity contract (`test/vectors/*.json`, written by a Foundry test). **Pattern to copy** for XO order digests: derive vectors from the exchange contract itself and assert the TS digest equals them (would have caught the Polymarket V1/V2 and nonce issues).
- `apps/signer/src/keys/kms.ts` (+`der.ts`): AWS-KMS-style signer with DER parsing; not needed with PayBox.
- 71 test files; "arbitrage" appears only in contract/risk docs (Uniswap pools, LP exits), not cross-venue trading.
- Hard-coded keys here are **public Anvil dev keys** (deploy script comments say "public test keys, never real ones"; I confirmed three of the inline keys match well-known Anvil defaults by comparison, without printing them; `deploy-46630.sh:104` and the JSON vector keys were not matched against that list, so treat them as unverified test keys).

### 3.13 Not reusable / not relevant (skim results) [H]

- `own-repo-E`: Azuro SDK Next.js sports-betting UI (Privy Safe smart wallets + Pimlico paymasters). **Licence forbids reuse outside the Azuro project.**
- `txApi`: Elysia/Mongo/viem four.meme trade parser (third-party). No prediction-market content.
- `scaffold-x402`: SE-2 template, `middleware.ts` of 40 lines using `x402-next` (legacy v1-era package). Template only.
- `own-repo-K`: casino backend (NestJS) and GMX price keeper. Contains hard-coded API keys. Not relevant.
- `own-repo-J`: empty. `own-repo-I`: scaffold; `TwapOrderBook` ERC-1271 CoW design docs only; x402 stub is a TODO.
- `own-repo-Q` (own, Oct 2025): LLM trading loop (TAAPI indicators, TP/SL) in Python against Aster/Hyperliquid APIs; only skimmed (README, file list, one grep), so signing and risk-cap handling were not assessed. Not reused.
- `igmi-dapp`: only `ZeroDevSmartWalletConnectors` import from `@dynamic-labs/ethereum-aa` (UI connector, no signing code).

---

## 4. Prioritised reuse table (for our tasks)

Rank = value x readiness. "Fix" lists blockers found in review.

| # | Our task | Best local source (path : lines) | Verdict | Fix / notes |
|---|---|---|---|---|
| 1 | Market normalisation + Polymarket/Limitless read clients | `own-repo-B/apps/webapp/lib/markets/{types.ts:1-112, polymarket.ts:79-212, limitless.ts:59-158}` | **COPY-ADAPT** | Own code. `resolved` flag, `null` not 0.5, add bid/ask/depth, extract from React hooks, add XO adapter, re-verify 2026-04 wire shapes. |
| 2 | Cross-venue fair value / edge signal | `own-repo-F/packages/sources/src/aggregate.ts:1-27, 91-121, 267-277, 324-413` | **COPY-ADAPT (partial)** | Own code. Reuse TWM + staleness + median + outlier + ABSTAIN + trimmed mean. Edge must use *executable* prices (depth, fees), not Gamma `outcomePrices`. |
| 3 | Caching / timeout / retry | `otaku/.../polymarket.service.ts:203-325` (MIT) and `own-repo-C/apps/polymarket-copier/polymarket-client.ts:278-318` | **COPY-ADAPT** | Add 429 + `Retry-After`, jitter, no retry on 4xx, per-host concurrency cap; keep MIT notice for otaku code. |
| 4 | Copy-trading / trade-following (read side) | `otaku/.../polymarket.service.ts:867-1045, 1578-1760`; `own-repo-B/apps/backend/src/runners/polymarket-ws.ts:1-42` | **COPY-ADAPT** | Bound the dedupe set, per-fill ids, leader allow-list; read-only. Execution side must go through PayBox, not through any local signing code. |
| 5 | Verify signed typed data == quote; ERC-1271 check | `own-repo-G/apps/indexer/src/api/ops-auth.ts:36-66, 483-709` | **COPY-ADAPT (pattern)** | Re-key to the XO domain; decide whether XO accounts can be undeployed (6492) before copying the "getCode first" rule. |
| 6 | EIP-712 order digest parity vectors | `own-repo-F/apps/signer/src/eip712.ts:1-60` + `test/vectors/*.json` | **COPY-ADAPT (pattern)** | Needs XO exchange source/ABI; generate vectors from the XO contract, not from docs. |
| 7 | Best-price / amounts maths | `own-repo-B/.../orderbook.ts:33-53`, `polymarket-amounts.ts:47-80` | **COPY** (+ rounding) | Confirm XO tick size, size increment, decimals. |
| 8 | HMAC L2 auth | `own-repo-B/.../polymarket-api-key.ts:143-216` | **COPY-ADAPT after fix** | Keep `=` padding (5.3). XO's scheme is unverified; only useful if XO mirrors Polymarket. Credential storage must be redesigned (gate 1). |
| 9 | EIP-712 CTF order build + sign | `own-repo-B/.../polymarket-order.ts:30-45, 59-165`, `clob-types.ts:24-95` | **IDEAS** (adapt only if XO struct matches V1) | V1 struct; Polymarket V2 differs (5.4); nonce handling wrong (5.2). Take the struct from XO docs/contract. |
| 10 | x402 server (sell signals) | `own-repo-H/apps/api/src/{gating.ts:170-270, agentGating.ts:1-130}`; `own-repo-B/apps/backend/src/services/ugc/x402.ts:1-228` | **COPY-ADAPT** | Own code. Pick `exact` vs `upto`; confirm facilitator supports the chosen network; remove hard-coded addresses. |
| 11 | x402 client | `own-repo-B/apps/webapp/lib/x402-payment.ts`; `x402/typescript/.../signer.ts` | **IDEAS** | PayBox `pay_x402`/`use_service` already covers this. |
| 12 | MCP server scaffold (own aggregator MCP) | `x402/examples/typescript/clients/mcp/index.ts` (`McpServer`), `own-repo-D-mcp-server/src/index.ts:136-295` | **IDEAS** | Use high-level `McpServer`+zod; never hold keys or take a model-supplied "allow payment" flag. A PayBox Open Plugin is a single-file ES module, not an MCP server (plan claim, unverified). |
| 13 | Smart-account (Kernel/ZeroDev) signing | none | **NOT FOUND** | Only x402's 6492/1271 handling (`scheme.ts:260-395`) and Polymarket `POLY_1271` as references. |
| 14 | PayBox-like agent wallet | `otaku/src/plugins/plugin-cdp`, `own-repo-D-mcp-server` | **ANTI-PATTERNS** | No caps/approvals. The plan's guardrails have no local precedent; the remote-signer adapter idea (3.7) is the one useful concept. |
| 15 | Market equivalence / matching | `own-repo-C/packages/migrations/seed.sql:61-79`; `polymarket-copier/market-rephraser.ts:94-206` | **IDEAS** | Manual/LLM-curated only. Automated matching with resolution-rule comparison must be built. |
| 16 | Bridge / funding (gate 6) | `otaku/src/plugins/plugin-relay` | **IDEAS** | Uses local hot key; chain 3223 support unknown. |
| 17 | Market creation from another venue | `own-repo-C/apps/polymarket-copier/*` | **IDEAS, AVOID seeding logic** | Prompt spec yes; random variance/skip no. |

### Concrete copy-adapt file list (with ranges)

1. `own-repo-B/apps/webapp/lib/markets/types.ts` 1-112; `polymarket.ts` 79-212, 332-377; `limitless.ts` 59-158; `lib/trading/prediction/limitless-api.ts` `extractOutcomeTokens` (+ its 13 vectors in `limitless-api.test-data.ts`).
2. `own-repo-B/apps/webapp/lib/trading/prediction/orderbook.ts` 33-53; `polymarket-amounts.ts` 47-80 (+ `*.test-data.ts`).
3. `otaku/src/plugins/plugin-polymarket-discovery/src/services/polymarket.service.ts` 49-87, 203-325, 867-1045, 1470-1560, 1578-1760 (MIT attribution to elizaOS contributors).
4. `own-repo-B/apps/backend/src/runners/polymarket-ws.ts` 1-42 and `types/polymarket.ts` 1-60.
5. `own-repo-F/packages/sources/src/aggregate.ts` 1-27, 91-121, 267-277, 324-413 (+ `decimal.ts` helpers).
6. `own-repo-G/apps/indexer/src/api/ops-auth.ts` 36-66, 112-113, 170-178, 483-709 (pattern); `ops-limit.ts` 41-102.
7. `own-repo-H/apps/api/src/gating.ts` 170-270; `agentGating.ts` 1-130 (only if an x402 signals API is in scope).
8. `own-repo-B/apps/webapp/lib/trading/prediction/polymarket-api-key.ts` 143-216 **after** fixing the padding (only if XO uses the same scheme).

### Ideas only (do not copy code)

`polymarket-order.ts` / `clob-types.ts` structure; `use-polymarket-trade.ts` state machine; `own-repo-C` equivalence schema, rephrase prompt, price-routing router, `instantArbitrage`; `own-repo-D-mcp-server` tool surface; `plugin-relay` quote/execute/status flow; remote-signer adapter (`polymarket-cdp-wallet-compatibility.md`).

### Do not reuse

`polymarket-proxy.ts`, `polymarket-nonce.ts` (defects below); `own-repo-E` (licence); `polymarket-copier` odds-variance/skip/seed logic; `own-repo-D-mcp-server` key/`allowPayment` model; `plugin-cdp` as a template for money tools; `txApi`, `own-repo-K`, `scaffold-x402` (irrelevant).

---

## 5. Verified defects and staleness in the local Polymarket write path

All four were checked against Polymarket's public repos via `gh api` read-only (primary source, fetched 2026-10-19).

### 5.1 Wrong Safe-proxy salt (H)
`own-repo-B/.../polymarket-proxy.ts:40-50` derives the CREATE2 salt as `keccak256(abi.encode(eoa, nonce=0))` (64 bytes). Upstream `Polymarket/builder-relayer-client/src/builder/derive.ts` `deriveSafe` uses `keccak256(encodeAbiParameters([{ name: 'address', type: 'address' }], [address]))` (32 bytes, address only). Different salt -> different address. The local test suite only has generic EIP-1014 vectors, so it cannot catch this; the planned round-trip against `/auth` was never done. Funds sent to a wrongly derived proxy would be unrecoverable. Upstream also now has Solady ERC-1967-based derivations (repo pushed 2026-10-08), so the wallet model has changed since April.

### 5.2 Eager-incrementing nonce is invalid on the exchange (H)
`polymarket-nonce.ts:72-79` increments per order (0,1,2...). Upstream `ctf-exchange/src/exchange/mixins/NonceManager.sol`: `isValidNonce(usr, nonce) = nonces[usr] == nonce`; the on-chain nonce only changes via `incrementNonce()` (used for cancel-all). Order nonces beyond the on-chain value are invalid, so the second and later orders would be rejected or unmatchable. The local comment "Polymarket's CLOB accepts gaps" has no source. For XO: read the exchange's nonce rule from the contract, do not copy this counter.

### 5.3 L2 HMAC output padding (H)
Local `base64UrlEncode` (`polymarket-api-key.ts:191-196`) strips `=`. Upstream `Polymarket/clob-client-v2/src/signing/hmac.ts` says: "Must be url safe base64 encoding, but keep base64 "=" suffix". A 32-byte HMAC encodes to 44 chars with one `=`. Everything else (message = timestamp + method + path + body; key = base64url-decoded secret; SHA-256) matches upstream. The local tests encode RFC 4648 unpadded vectors, so they pass while the header is wrong. Likely 401s on every authenticated call.

### 5.4 V1 order struct vs Polymarket CTF Exchange V2 (H for the struct, M for "V1 retired")
Local EIP-712 type: `Order(salt,maker,signer,taker,tokenId,makerAmount,takerAmount,expiration,nonce,feeRateBps,side,signatureType)` (V1, matches upstream `ctf-exchange` `OrderStructs.sol`). Upstream `Polymarket/ctf-exchange-v2` (audited March 2026; clients `clob-client-v2`, `py-clob-client-v2` pushed 2026-10-15) uses `Order(salt,maker,signer,tokenId,makerAmount,takerAmount,side,signatureType,timestamp,metadata,builder)` with no taker/expiration/nonce/feeRateBps. Whether V1 still accepts orders was not established. Both versions include `POLY_1271` (=3) as a signature type; the local `ClobSignatureType` omits it. Consequence for XO: whichever lineage XO forked determines the struct; **never carry a struct across from the local code**.

Other smaller issues: `use-polymarket-trade.ts:144-147` forces `negRisk: true` for every market; the comment in `polymarket-order.ts:22-24` says neg-risk "handles most binary markets" while `signPolymarketOrder` defaults to the standard exchange; `polymarket-proxy.ts:8-10` header still says "THROWS until verified" though the gate was removed.

---

## 6. Mapping to the feasibility gate (what local code can and cannot say)

| Gate | Local evidence | Status |
|---|---|---|
| 1 Auth/credentials | Polymarket-style L1 EIP-712 -> API key, L2 HMAC (pattern verified against upstream, with the padding fix). Local code keeps creds in browser `localStorage`, which does not exist in a plugin. XO's auth is not shown anywhere locally. | partial (pattern only) |
| 2 Order flow | EIP-712 build -> sign -> POST implemented for Polymarket V1 and Limitless; unvalidated live. XO struct unknown. | partial |
| 3 Smart wallet ownership | No Kernel/ZeroDev/permissionless.js code. ERC-1271 verification pattern exists (ops-auth, x402 facilitator). | unanswered |
| 4 Chain 3223 + gas | Nothing. | unanswered |
| 5 Market creation | Only programmatic creation on the author's own Solana programs (`polymarket-copier`). Nothing for XO. | unanswered |
| 6 Funding/bridge | Relay SDK usage pattern only (hot-key, 5 chains). | unanswered |
| 7 Terms/jurisdictions | Only a stale (Dec 2025), secondary, agent-written Polymarket US note. | unanswered |
| 8 Sign-then-submit + autonomous auto-sign | `buildPolymarketOrder`/`signPolymarketOrder` split and the hook's state machine show the prepare -> sign -> submit shape. Nothing on PayBox grants. | partial (shape only) |
| 9 Blockscout read fallback | No Blockscout code anywhere. | unanswered |

---

## 7. Secrets and hygiene findings (locations only; no values recorded)

- **contains hard-coded secret at** `own-repo-K/backend/packages/config/config.webserver.ts:67` (`seonApiKey`).
- **contains hard-coded secret at** `own-repo-K/backend/packages/config/config.common.ts:26` (`jupiterApiKey`).
- Same keys in the gitignored copies `own-repo-K/backend/packages/config/config.webserver.local.ts:67` and `config.common.local.ts:26`.
- `own-repo-K` has no `.git` of its own; git commands there resolve to a repository rooted at `<home>`. Check what that repo tracks.
- `own-repo-F` inline private keys (`packages/contracts/script/testnet/deploy-46630.sh:78,104`, `script/deploy/rehearse.sh:36`, `apps/signer/test/kms.test.ts:107`, JSON vectors): documented as public Anvil/test keys; three matched known Anvil defaults. Not secrets, but make sure none is ever funded.
- `own-repo-B/apps/backend/src/services/ugc/x402.ts` hard-codes a wallet address in `extra.forwardingAddress` (public address, not a secret; remove before reuse).
- `own-repo-C/apps/bet-router-rofl/README.MD` contains setup text for importing a private key into the Oasis CLI and a GitHub PAT with "short expiry" instructions (placeholders only). Not followed.
- Other scan hits (64-hex strings) were tx hashes, init-code hashes, CREATE2 salts and token ids.
- Not scanned/opened by design: any `.env*`, `.pem`, `*.key`, keystore files; `own-repo-B/.claude/settings.local.json` (matched polymarket/limitless in the grep; not opened).

---

## 8. NOT FOUND (documented absences)

- XO Market code or docs locally. (searched: `xo\.market|XO Market|xo-market` across the folder; zero hits in repo code)
- Kalshi client/code. (searched: kalshi across folder; only icons/mock data in `own-repo-C/apps/web-frontend`, two docs mentions in `own-repo-B/apps/docs`)
- Trueo, Quotient, Metaculus, PredictIt, Opinion code or references. (searched: those names in own-repo-B, own-repo-B2, own-repo-C, otaku, own-repo-D, own-repo-F, own-repo-H, own-repo-G, own-repo-I, txApi, scaffold-x402, x402-starter-kit, own-repo-E, own-repo-N, mono-agent, ignotus-ai; "quotient" only appears as a math term in vendored Uniswap code). Manifold appears only in mock data.
- Automated cross-venue market matching. (searched: `market matching|matching markets|unified order ?book` zero hits; equivalence is a hand/LLM-curated table)
- Real arbitrage/edge detector. (searched: `arbitrage`; hits are contract/AMM docs, the `instantArbitrage` flag, and "IGNORE THIS" dead package)
- Kernel/ZeroDev/permissionless.js signing code. (searched: `@zerodev`, `permissionless` imports, `viem/account-abstraction`, `@biconomy`, `@rhinestone`; only `igmi-dapp` imports a Dynamic ZeroDev *connector* and otaku has an AA overview doc)
- Blockscout client code. (searched: `blockscout` in key repos)
- Polymarket order-placement code that has been validated live. (status doc leaves it unchecked)
- Any PayBox, MoonPay, `io.paybox/transactionProposal` or `@paybox-sh/sdk` usage. (searched: `paybox|moonpay`, case-insensitive, across own-repo-B, own-repo-B2, own-repo-C, otaku, own-repo-D, own-repo-F, own-repo-H, own-repo-G, own-repo-I, x402, x402-starter-kit, scaffold-x402, txApi, own-repo-E, own-repo-Q: zero hits)
- A working automated test of `buildClobL2Headers` or of EOA->proxy derivation against known-answer data.
- Outbound API rate limiting beyond fixed delays and retries (own-repo-B: none; copier: fixed 100 ms delay + 3 retries; otaku: timeout + 3 retries, no 429/`Retry-After` handling).

---

## 9. Design implications

1. Build the aggregation layer as **read-only first**, on top of the own-repo-B normalised model plus an XO adapter; keep execution separate and routed through PayBox.
2. For "edge" use *executable* prices: top-of-book and depth (CLOB `/book`, `/books`) with fees, not last-trade `outcomePrices`. Return `null` when unknown; apply the own-repo-F ABSTAIN rule (too few venues, stale quotes, wide spread, high dispersion).
3. Cross-venue arbitrage needs a **resolution-equivalence check** (same event, source, date, threshold, voiding rules, oracle/dispute process) before any price comparison; the copier prompt is a decent checklist. Treat "same question" as a signal, not proof. (My inference, M.)
4. For XO signing, treat the local code as a template for *process* (build -> preview -> sign -> verify -> submit) and generate order digests from the XO contract source with parity vectors (own-repo-F pattern). Do not hard-code any struct or nonce rule from Polymarket code.
5. Any per-user HMAC credentials cannot follow the own-repo-B `localStorage` model; gate 1 stays open.
6. Where an x402 service is in scope, reuse own-repo-H/own-repo-B server flows and let PayBox pay (`use_service`); do not build a client.
7. If trade-following is in scope, keep it signal-only (leaders, position diffs); every resulting order must still pass the plan's caps and quote -> verify -> submit chain. Do not copy random-variance or cross-venue price-seeding behaviours from the copier.
8. Add known-answer tests for every auth/signing helper (the local suite passed with real bugs because it only had self-consistent vectors).

## 10. Risks

- Reusing the own-repo-B Polymarket write path as-is would (a) derive a wrong deposit address, (b) send invalid nonces, (c) mis-encode HMAC signatures, (d) sign a possibly retired struct.
- Team/third-party licence exposure: `own-repo-C` (co-authored), `own-repo-E` (Azuro), elizaOS MIT notices, coinbase Apache NOTICE.
- Stale sources: x402 clone (2026-01), otaku research docs (2025-12), own-repo-B wire-shape notes (2026-04), Polymarket has since moved to V2 clients (2026-10).
- Hot-key or unguarded-signing patterns in `own-repo-D-mcp-server` (env private key), `plugin-relay` (local key import) and `plugin-cdp` (no caps).
- Copying another venue's markets or odds into XO (as the copier does) carries IP/ToS and manipulation-optics risk, and conflicts with the plan's creation-lint guardrails.

## 11. Suspicious content

- No text addressed to AI agents with instructions was found in the files read. Several repos contain `CLAUDE.md`/agent-loop notes written by their authors (`own-repo-B/CLAUDE.md`, `otaku/CLAUDE.md`, `own-repo-D/agent/CLAUDE.md`, `ctf-exchange-v2/CLAUDE.md` listed but not read); they were treated as data and not followed.
- Operational instructions found and not followed: `own-repo-C/apps/bet-router-rofl/README.MD` (import a private key into Oasis CLI; create a GitHub PAT), `x402-starter-kit`/`otaku/docs/x402-payments.md` (use a wallet private key).

---

## Sources

Local files (all read in this session unless marked skim):
- Plan inputs: `docs/plan.md`, `docs/research-notes.md`.
- own-repo-B: `apps/webapp/lib/markets/{types,polymarket,limitless,index}.ts`; `apps/webapp/lib/trading/README.md`; `.../prediction/{polymarket-api,polymarket-api-key,polymarket-order,polymarket-proxy,polymarket-nonce,polymarket-amounts,orderbook,clob-types,limitless-api,limitless-order,providers,use-polymarket-trade}.ts`, `POLYMARKET_CLOB_NOTES.md`, test files (listed, grep-checked); `apps/webapp/lib/x402-payment.ts`; `apps/webapp/package.json`; `apps/backend/src/{runners/polymarket-ws.ts,routes/polymarket.ts,routes/x402.ts,services/polymarket/markets.ts,services/ugc/x402.ts,services/ugc/create-prediction-market-post.ts (skim),clients/redis-cache.ts,clients/base-client.ts,types/polymarket.ts}`; `TRADING_INTEGRATION_STATUS.md` (grepped, line 158 quoted), `TRADING_TEST_COVERAGE_ISSUES.md` (head), `CLAUDE.md`. Quote: "Real end-to-end test with small YES bet on live market. Polymarket has no public testnet." (`TRADING_INTEGRATION_STATUS.md:158`, unchecked item).
- own-repo-B2: `package.json`, `src/services/ugc/x402.ts` (head diff).
- own-repo-C: `README.MD`, `apps/polymarket-copier/{index,market-rephraser,polymarket-client,types}.ts`, `README.md`, `CHANGELOG.md`, `package.json`; `apps/marketplace-adapter-rest-api/index.ts`; `packages/common/src/{types.ts,marketplace-adapters/types.ts}`; `packages/migrations/seed.sql:1-100`; `apps/bet-router-rofl/{README.MD,handlers/bet_slip_created_handler.py,bet_execution/optimal_betting.py:1-440,main.py (grep)}`; `apps/agent/polybet_agent_v3.py` (outline); `contracts/contracts/polybet.sol:295-314`.
- otaku / own-repo-D: `plugins/plugin-polymarket-discovery/{README.md,src/services/polymarket.service.ts (1-100, 270-350, endpoint grep),…}`, `docs/research/{polymarket-cdp-wallet-compatibility.md,polymarket-integration-requirements.md (sections 3,6),polymarket-discovery-roadmap.md (grep)}`, `docs/x402-payments.md`, `plugins/plugin-cdp` (grep), `plugins/plugin-relay/src/services/relay.service.ts` (head/grep), `LICENSE`; `own-repo-D/packages/own-repo-D-mcp-server/src/index.ts`, `package.json`; `own-repo-D/packages/x402-solana/{package.json,README.md}`; `diff -rq` results for otaku vs own-repo-D/agent and x402-starter-kit vs own-repo-D/facilitator.
- x402: `typescript/packages/mechanisms/evm/src/signer.ts`, `.../exact/facilitator/scheme.ts:255-395`, `typescript/packages/extensions/src/bazaar/index.ts` (head), `examples/typescript/clients/mcp/README.md`, `LICENSE`, `NOTICE`.
- own-repo-H: `apps/api/src/{agentGating.ts,gating.ts (grep + ranges)}`.
- own-repo-G: `apps/indexer/src/api/{ops-auth.ts:1-200,483-722,ops-limit.ts:1-208}`, `desk-strategy.ts` (grep).
- own-repo-F: `README.md`, `packages/sources/src/aggregate.ts:1-70` (+ export grep), `apps/signer/src/eip712.ts:1-60`, `docs/runbooks/testnet-46630.md` (grep); script/test key lines (masked, classification only).
- own-repo-E: `README.md`, `LICENSE.md` (head), `package.json`. txApi, scaffold-x402, x402-starter-kit, own-repo-K, own-repo-J, own-repo-I, own-repo-Q: READMEs/listings only.
- Scratch scripts (not in repo): `<scratch>/{g.sh,g2.sh,secscan.sh,secscan2.sh}`.

Primary-source checks (GitHub, read via `gh api`, no code cloned or run):
- `Polymarket/ctf-exchange` `src/exchange/mixins/NonceManager.sol` -- `isValidNonce`: `return nonces[ usr] == nonce;` (repo pushed 2026-05-11).
- `Polymarket/ctf-exchange` `src/exchange/libraries/OrderStructs.sol` -- V1 `Order` typehash and `SignatureType` incl. `POLY_1271` ("3: EIP1271 signatures signed by smart contracts").
- `Polymarket/builder-relayer-client` `src/builder/derive.ts` -- `deriveSafe` salt `keccak256(encodeAbiParameters([{ name: 'address', type: 'address' }]` (repo pushed 2026-10-08).
- `Polymarket/clob-client-v2` `src/signing/hmac.ts` -- "Must be url safe base64 encoding, but keep base64 "=" suffix"; `src/endpoints.ts` -- `CREATE_API_KEY = "/auth/api-key"`, `DERIVE_API_KEY = "/auth/derive-api-key"`, `POST_ORDER = "/order"`, `GET_PRE_MIGRATION_ORDERS`.
- `Polymarket/ctf-exchange-v2` `README.md` (audits "March 2026"), `src/exchange/libraries/Structs.sol` -- V2 `Order` comment `timestamp,bytes32 metadata,bytes32 builder`.
- Org repo listing (pushed dates): `py-clob-client-v2` 2026-10-15, `clob-client-v2` 2026-10-15, `ctf-exchange-v2` 2026-08-03, `clob-client` 2026-05-25.


---

## Verification (2026-10-19)

Adversarial re-derivation by an independent verifier. Read-only; no .env, key or credential file opened, nothing run or cloned. Primary sources re-read this session: the local files named below and Polymarket repos via `gh api` (raw reads). Confidence tags as above (H = read first-hand this session).

### A. Confirmed from primary source (no change)

- **Defaults and resolved flag (H)**: `own-repo-B/apps/webapp/lib/markets/polymarket.ts:115` is `resolved = resolvedStatus === "resolved" || wire.closed === true`; `:130` is `Number(prices[idx] ?? 0.5)`; `limitless.ts:94,97,113,118` default to 0.5. `types.ts` (112 lines) contains no bid/ask/depth field (grep zero).
- **Safe-proxy salt (H)**: local `polymarket-proxy.ts:40-50` salts with `keccak256(abi.encode(eoa, nonce))` (64 bytes); upstream `Polymarket/builder-relayer-client/src/builder/derive.ts` `deriveSafe` salts with `keccak256(encodeAbiParameters([address]))` (32 bytes). The init-code hash constant is identical in both, so only the salt differs. Header comment in the local file still says it "THROWS until verified" while `isPolymarketProxyDerivationEnabled()` returns true.
- **Nonce (H)**: `polymarket-nonce.ts:72-79` increments eagerly from 0; upstream `NonceManager.sol` `isValidNonce(usr, nonce) = nonces[usr] == nonce`, enforced in `Trading.sol:82` as `if (!isValidNonce(order.maker, order.nonce)) revert InvalidNonce();`. Extra mismatch found: the contract keys the nonce on `order.maker` (the proxy/safe), the local counter is keyed on the signer EOA.
- **HMAC padding (H)**: upstream `clob-client-v2/src/signing/hmac.ts`: "Must be url safe base64 encoding, but keep base64 "=" suffix". The newer unified SDK (`Polymarket/ts-sdk/packages/client/src/hmac.ts`) says "base64url-encoded with padding preserved". Local `polymarket-api-key.ts:191-196` ends with `.replace(/=+$/g, "")`. Message format and decoded-secret key match.
- **Orders (H)**: V1 typehash in upstream `OrderStructs.sol` matches the local type list exactly; V2 `Structs.sol` has `Order(salt,maker,signer,tokenId,makerAmount,takerAmount,side,signatureType,timestamp,metadata,builder)`; V2 README audits table lists Quantstamp and Cantina, March 2026. `POLY_1271` (=3) exists in both; local `clob-types.ts:53-58` omits it. `use-polymarket-trade.ts` hard-codes `negRisk: true` and posts `{order, signature}`.
- **Status doc (H)**: `own-repo-B/TRADING_INTEGRATION_STATUS.md:158` is an unchecked box "Real end-to-end test with small YES bet on live market. Polymarket has no public testnet."
- **ops-auth.ts (H)**: 1,122 lines; header `:36-66` states getCode-first rule and why viem's universal validator is avoided (ERC-6492); `ERC1271_MAGIC = "0x1626ba7e"` at `:113`; `403 seat_not_deployed` at `:648`; RPC failures return 503 (`:617,642,666`); skew/freshness/TTL at `:98-102,520-545`.
- **own-repo-F aggregate.ts (H)**: 465 lines; header methodology as described (time-weighted mid, spread cap, per-group median, outlier drop, dispersion, ABSTAIN_SOURCES/HALT/DISPERSION, trimmed mean). Caveat: it imports `@own-repo-F/config` (`getQualifiedGroups`, `sourcesConfig`), so it is not standalone, and it is built for 18-decimal price indices, not probabilities.
- **own-repo-D-mcp-server (H)**: `assertUrlAllowed` returns immediately when `ALLOWLIST_HOSTS` is unset (allow-all); the only payment guard is a caller-supplied `allowPayment`; key comes from env `PRIVATE_KEY`. 306 lines.
- **own-repo-C (H)**: random 1/6 marketplace skip at `index.ts:294-301`; `calculateOddsWithVariance` at `:519-554`; `OrderBookMarket.get_current_price` returns the placeholder 0.5 (`optimal_betting.py:185-190`); `seed.sql` `external_markets.price_lookup_method` CHECK list is `canibeton-lmsr | polymarket-orderbook | limitless-orderbook`.
- **polymarket-ws.ts (H)**: module-level `Set` keyed on `transactionHash`, `.connect()` at import, log line commented out.
- **x402 flows (H)**: own-repo-B backend reads only the `X-PAYMENT` request header (`x402.ts:154`) and returns a `settle()` closure to call after the work. own-repo-H `gating.ts:170-275` registers `exact` and `upto`, picks the CDP facilitator only when CDP keys exist, else a configured URL.
- **x402 facilitator (H)**: `scheme.ts` uses `parseErc6492Signature`, treats signatures longer than 130 hex chars as smart-wallet, `deployERC4337WithEIP6492` defaults to false. Clone HEAD author date 2026-01-16 (commit date 2026-01-17).
- **Licence/ownership (H)**: `own-repo-E/LICENSE.md` is the Azuro DAO licence ("only use the software if you work with the Azuro project"; no hosted service; licence-key must not be circumvented). `diff -rq` empty for otaku vs `own-repo-D/agent` plugin dir and for x402-starter-kit vs `own-repo-D/facilitator` (only `.git` differs). `git -C own-repo-K rev-parse --show-toplevel` is the home directory. `relay.service.ts` imports arbitrum, base, mainnet, optimism, polygon and `privateKeyToAccount`.
- **otaku retry (H)**: `retryFetch` retries every error at 1s/2s/4s with no status or `Retry-After` inspection; plugin has no test files.
- **Notes hygiene (H)**: the notes file contains no wallet address, key, token or API-key value (only the public ERC-1271 magic value). Secret-bearing lines are cited by path:line only.
- **NOT FOUND re-checked with different keywords (H)**: no XO Market, Trueo, Quotient, Metaculus, PredictIt, Opinion, or PayBox/MoonPay code anywhere under the github folder (`xo\.market|xo-market|XO Market|xomarket|xo-docs`, `trueo`, `quotient` with product-like suffixes, `paybox|pay-box|io\.paybox|@paybox`). Only PayBox hit is a CSS class `pay-box` in `retaplus` checkout. Kalshi appears only as docs text in `own-repo-B/apps/docs/docs/{user/creating-posts,developer/post-types}.md` and icon/mock data in own-repo-C. No `@zerodev`, `createKernelAccount`, `viem/account-abstraction` imports; no automated cross-venue matcher or arbitrage detector (searched `findArbitrage`, `cross-venue`, `price discrepancy`, `implied probability`, `kelly`).

### B. Refuted

1. **"No Blockscout client code ... zero hits in own-repo-H and others" (REFUTED; moves gate 9).** `own-repo-H` is on the researcher's own searched list yet contains Blockscout client code: `own-repo-H/apps/api/src/routes/explorer.ts:542-545` (`BLOCKSCOUT_HOST` map for chains 1, 8453, 4663), `:660-693` `fetchTopHoldersBlockscout` using `/api/v2/tokens/{addr}/holders`; `own-repo-H/packages/etherscan/src/index.ts:6-12,63` (Blockscout base-URL map, V1 API); `own-repo-H/apps/agent/src/backfillContext.ts:59`. A separate own repo, `own-repo-P/apps/keeper/src/blockscout.ts` (479 lines, last commit 2026-08-06), is a dedicated Blockscout v1 (`/api?module=token&action=getTokenHolders`) and v2 (`/api/v2/tokens/...`) client with measured per-IP rate limits, a `Gate` that reads `x-ratelimit-*` headers and fails fast. All of it targets Robinhood Chain (4663), Ethereum and Base, not XO's chain; whether Blockscout indexes XO's chain is not answerable locally. Gate 9 should read **partial (pattern only)**, not unanswered.
2. **"No 429/Retry-After handling anywhere" (REFUTED as a repo-wide statement).** True for the Polymarket paths (own-repo-B, copier, otaku). False locally: `own-repo-P/apps/keeper/src/blockscout.ts:161-181` treats 429 and 503 as throttle, parses the `retry-after` header, and absorbs `x-ratelimit-remaining/reset`. `Retry-After` also appears in `amplestock/apps/keeper/src/{index,jobs/index}.ts` and `inbox-zero/apps/web/utils/outlook/retry.ts` (listed, not read in depth). The own-repo-P gate is a better copy-adapt source for rate-limit handling than the otaku/copier helpers.
3. **"no Polymarket testnet" as a fact in the structured summary (REFUTED / stale).** This is the local status doc's claim, not verified. Upstream `ctf-exchange-v2` README lists an **Amoy** deployment table (CTFExchangeV2 and collateral contracts) and `clob-client-v2` README says `Chain.AMOY // for testnet`. Whether a live CLOB testnet exists is unverified; do not assert either way.

### C. Corrected (partly right)

4. **"Polymarket now has CTF Exchange V2 / clients moved to V2 in 2026-10" is incomplete (CORRECTED).** Newer facts, all H from GitHub: the V1 repos `ctf-exchange`, `clob-client`, `py-clob-client`, `rs-clob-client` are **archived**; the `ctf-exchange` README banner reads "This repository has been archived and is no longer maintained. Contract addresses have been updated. Please refer to the V2 repository". `clob-client-v2` README (pushed 2026-10-15) now carries "This package is deprecated. Please migrate to the unified Polymarket SDK" and references an "Exchange V3" (`createExchangeV3OrderFromAmounts.ts`, `src/types/ordersV3.ts`, V3 adds an `expiration` field). A unified `Polymarket/ts-sdk` was pushed 2026-10-16. So the local V1 struct is more stale than stated, and the "V2 is current" framing is itself already superseded. Whether V1 orders are still accepted remains **unverified** (docs migration page fetched; it does not say). The archive banner makes "V1 contracts replaced" likely (M) but is not proof of rejection.
5. **plugin-cdp "no approval gate" is overstated (CORRECTED, M).** `plugin-cdp/actions/cdp-wallet-token-transfer.ts:60` and `cdp-wallet-nft-transfer.ts:30` descriptions contain a prompt-level instruction: "you MUST present a clear summary ... and get explicit user confirmation". It is LLM-enforced only, not code-enforced. The finding that there are no spend limits, allow-lists or simulation in code holds.
6. **polymarket-copier size (CORRECTED).** Components sum to 1,582 lines (689 + 376 + 327 + 190), not 1,961.
7. **otaku plugin action count (CORRECTED).** 19 `*.action.ts` files in `plugin-polymarket-discovery/src/actions` (not 22). Service 1,815 and `types.ts` 482 lines are right.
8. **Odds variance wording (CORRECTED, minor).** Code adds or subtracts a random absolute probability offset drawn from `oddsVarianceRange` (README examples 15-25% and 20-30%), clamps to [0.05, 0.95] and renormalises: percentage points, not relative percent. Conclusion (do not copy) unchanged.
9. **Row 7 "COPY" for `polymarket-amounts.ts` / `orderbook.ts` is too optimistic (CORRECTED).** `computeClobAmounts` does `Math.round(sizeUsd * 1e6)` and `Math.round(collateralWei / price)` in JS floating point with no tick/size quantisation. For money paths this must be rewritten with bigint and the venue's tick rules; treat as COPY-ADAPT (rewrite), not COPY. `orderbook.ts` best-price scan is fine as a reference.
10. **Gate 6 bridge inventory incomplete (CORRECTED).** Besides Relay (`otaku`, duplicated in `own-repo-D/agent`), the folder also has `own-repo-I/worker/src/types/bridge.ts` (own scaffold; frozen `BridgeProvider` interface for Circle CCTP v2 with Across as alternate) and `own-repo-N/packages/plugin-evm/src/actions/bridge.ts` (LI.FI SDK, third-party elizaOS clone, last commit 2025-03, stale). None addresses XO's chain, so gate 6 stays **unanswered**.
11. **Secrets finding is incomplete (CORRECTED; security-relevant).** The notes list only `seonApiKey` (`config.webserver.ts:67`) and `jupiterApiKey` (`config.common.ts:26`); both line numbers are right. Name-and-shape scan (values not recorded) shows many more non-empty secret-named fields in the same two files: `config.common.ts:13 password`, `:22 privateKey`, `:25 intercomSecretKey`, `:30 solanaRpcEndpoint` (an RPC URL with an embedded `api-key=` query parameter); `config.webserver.ts:10 secret`, `:14 metricsAccessToken`, `:33 secretAccessKey`, `:37 apiKey`, `:38 privateKey`, `:44 totpStorageSecret`. Whether each is real or a placeholder was not determined (some are short placeholder-like strings). Treat the whole config set as needing review and rotation. `config.*.local.ts` are ignored by `own-repo-K/backend/.gitignore:13`; the non-local files are not tracked by the home-directory repo (`git ls-files` finds none), but that repo's root is the home directory. Verifier note: one masking command failed and a single RPC URL key was briefly visible in the verifier's tool output; it is not recorded anywhere.
12. **own-repo-F key at `deploy-46630.sh:104` (CLARIFIED, M).** It is `LOCAL_POSTER_KEY` inside the `ANVIL=1` branch, annotated "public test keys, never real ones" and paired with the well-known Anvil account index 10; the key itself is not one of the first three Anvil defaults (the three other inline keys checked are). Consistent with a public dev key, not independently proven.

### D. Unverifiable this session

- Whether Polymarket V1 contracts/CLOB still accept orders (see 4).
- Whether any CLOB testnet is live (see 3).
- Whether `own-repo-C` co-authors consent to reuse (no local evidence either way).
- Whether the own-repo-B Polymarket/Limitless wire shapes still match live APIs (not called; Limitless and Gamma responses not fetched).
- Vitest "19 files / 310 tests green": 19 `*.test.ts` files confirmed under own-repo-B; the 310-pass count is the author's own report and was not re-run.
- Everything about XO (struct, nonce, auth, chain, gas, terms): no local source; no change to the "unanswered" verdicts for gates 3, 4, 5, 6, 7.

### E. Missed local material (additive)

- `own-repo-P/apps/keeper/src/blockscout.ts` and the own-repo-H Blockscout code (see B1): the best local reference for a read-side explorer fallback and for header-driven rate limiting.
- `own-repo-L/contracts/src/PredictionMarket.sol` (178 lines, MIT, the author's commits to 2026-04): an own parimutuel per-table pool contract on Base (a two-sided table game, fixed rake split). Not cross-venue and not a CTF/CLOB design, so low relevance to XO aggregation; listed so it is not mistaken for a missing venue adapter.
- `otaku/docs/evm-wallets/{01,04}-*.md` contain `permissionless.js` SimpleSmartAccount snippets (doc only, dated Dec 2025 to Jan 2026, stale, not Kernel). They do not answer gate 3.
- Polymarket now also publishes `polymarket-us-python` / `polymarket-us-typescript` (pushed 2026-10-09; repo names only, content not read), so the otaku "US users are geoblocked" note is stale beyond its December 2025 date. Gate 7 stays unanswered for XO.
- `globalpvp`, `indexpvp`, `romapvp`, `worldcuppvp`, `stonks-exchange` match "prediction market" only in README/design comparison text (stonks-exchange README commit: "Cut prediction markets from the roadmap"); not inspected further.

### F. Gate verdict changes

| Gate | Researcher | Verified | Why |
|---|---|---|---|
| 9 Blockscout read fallback | unanswered | **partial (pattern only)** | Local Blockscout v1/v2 clients exist (own-repo-P, own-repo-H) for other chains; nothing for XO's chain. |
| All others (1-8) | as stated | unchanged | No contrary evidence found. Gate 2 note: the Polymarket struct it cites is two generations stale (V1 archived, V2 client deprecated, V3 exists). |

### G. Added sources (verifier)

- `Polymarket/ctf-exchange` README.md (archive banner), `src/exchange/mixins/Trading.sol` (line 82), `NonceManager.sol`, `OrderStructs.sol`; `Polymarket/ctf-exchange-v2` README.md (Amoy table, audits), `src/exchange/libraries/Structs.sol`; `Polymarket/clob-client-v2` README.md ("This package is deprecated"), `src/signing/hmac.ts`, `src/order-builder/helpers/createExchangeV3OrderFromAmounts.ts`, `src/types/ordersV3.ts`; `Polymarket/ts-sdk` `packages/client/src/hmac.ts` ("padding preserved"); `Polymarket/builder-relayer-client` `src/builder/derive.ts`, `src/constants/index.ts`; org repo list with `archived` flags (fetched 2026-10-19); https://docs.polymarket.com/migrate/clob-sdk-to-unified-sdk (fetched; silent on V1 acceptance and testnet).
- Local: `own-repo-P/apps/keeper/src/blockscout.ts:12-30,70-181`; `own-repo-H/apps/api/src/routes/explorer.ts:534-693`; `own-repo-H/packages/etherscan/src/index.ts:6-12,63`; `otaku/src/plugins/plugin-cdp/actions/{cdp-wallet-token-transfer.ts:60,cdp-wallet-nft-transfer.ts:30}`; `own-repo-I/worker/src/types/bridge.ts:1-40`; `own-repo-N/packages/plugin-evm/src/actions/bridge.ts:3`; `own-repo-L/contracts/src/PredictionMarket.sol:1-60`; `own-repo-K/backend/packages/config/config.{common,webserver}.ts` (names and shape only).
