# Atomic Wallet (Polymarket front end) - adapter spec

Researched 2026-10-19. READ-ONLY: page reads (WebFetch, WebSearch), unauthenticated GETs to `data-api.polymarket.com`, `api.llama.fi`, `docs.polymarket.com`, `atomicwallet.io/robots.txt` (User-Agent `insurance-markets-research/0.1`). No account, wallet, key, signature, POST/PUT/DELETE, PayBox call or browser automation. Atomic's Terms of Service page was NOT fetched (its robots.txt disallows `/terms-of-service`). Third-party text was treated as untrusted data; none of it contained instructions aimed at agents.

Tags: **H** = read first-hand this session in a primary source (cited); **M** = secondary, small-model page summary, or my inference; **L** = weak or stale (older than 6 months).

Fixture: `docs/research/fixtures/atomic-wallet/polymarket_data-api_builders_atomic_wallet_rows_2026-10-19.json` (5.7 KB; Atomic's leaderboard row for DAY/WEEK/MONTH/ALL plus its monthly series).

Sibling: `docs/research/venues/metamask-polymarket-integration.md` covers the same pattern (wallet front end on Polymarket's CLOB) and the Polymarket builder endpoints in more depth.

---

## 0. Verdict

**adapter_priority: skip** (as a venue or arbitrage leg). Registry record only.

1. **Live, but a front end, not a venue.** Atomic Wallet (multi-chain self-custody wallet) has a "Prediction Markets powered by Polymarket" feature (H, https://atomicwallet.io/academy/prediction-markets). It routes orders to Polymarket's CLOB with a registered Polymarket builder code. It has no book, no oracle, no public API of its own.
2. **Not an independent arbitrage leg.** It shares 100% of liquidity and resolution with Polymarket International (same market, same tokens, same UMA resolution). Anything Atomic shows is Polymarket's price, possibly plus an unknown Atomic fee.
3. **Tiny.** $2.49M all-time builder-attributed volume (rank 111 of the leaderboard), 549 users; only $109K and 52 users for 2026-10-01..10-19 and $428 / 2 users on the latest day (H, section 5). Trending down from a $1.07M peak in July.
4. The discovery hint ("$2.49M all-time, 547 users") is confirmed (now $2.4926M / 549). "No product page found" is corrected: product pages exist (section 1).

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| https://atomicwallet.io/ home page (fetched 2026-10-19) | Home page lists swap, buy, staking, gift cards; **no mention of prediction markets** on the home page | H (fetch-tool summary) |
| https://atomicwallet.io/academy/prediction-markets | "Prediction Markets powered by Polymarket": Yes/No shares, politics/sports/crypto/pop culture; fund with USDT/USDC from Ethereum, Solana, BSC, Tron, Base, Optimism, Arbitrum; no KYC claimed; available in the mobile app (browser extension is desktop only and not stated to support it) | H (fetch-tool summary; marketing copy) |
| https://atomicwallet.io/blog/articles/atomic-prediction | Step-by-step guide, article "last updated January 16, 2026"; trades in the "Trade" tab or "Explore Polymarket" on mobile | H (summary) |
| https://atomicwallet.io/blog/articles/atomic-wallet-2025-year-in-review (updated 2026-01-20) | says prediction markets "launch soon", public access "expected in Q1" 2026 | H (summary) |
| Polymarket Data API `/v1/builders/leaderboard` | Atomic Wallet row in DAY, WEEK, MONTH and ALL windows on 2026-10-19, `verified: true` | H |
| Polymarket builder volume series | monthly attributed volume every month Jan to Oct 2026 | H |
| Independent coverage | none found by WebSearch (extended); DefiLlama has "Atomic Perps" (Interface, a different product) but no Atomic prediction entry | M (absence) |
| Launch date | Not stated. Between roughly Jan 2026 (first builder volume 2026-01, $17.7K) and Q1 2026. No launch article date found. | M |
| Mobile status | Inconsistent: older academy pages say "Predictions Mobile coming soon"; newer pages describe mobile steps | M |

**still_live = true**, but small and with inconsistent marketing copy (some Atomic pages say "launch soon" while the builder data shows trading since January 2026).

---

## 2. Kind and market model

- kind: **broker-or-frontend** (wallet-embedded front end) over **Polymarket International**.
- Market model: identical to Polymarket: binary and multi-outcome (neg-risk) markets, central limit order book, outcomes are ERC-1155 Conditional Tokens on Polygon, pUSD/USDC collateral. See the Polymarket venue note for details; nothing Atomic-specific is documented (NOT FOUND, searched: atomicwallet.io pages above, search).
- Atomic says it uses "separate proxy addresses" for prediction balances (H, https://atomicwallet.io/academy/articles/is-polymarket-safe, summary); consistent with Polymarket proxy/deposit wallets. Not verified at contract level.

## 3. Chains and collateral

- Trading chain: **Polygon**. Atomic's guide says trades use **USDC.e on Polygon** and POL for gas (H summary; the guide itself is internally inconsistent, "USDC.e (POL)"). Collateral naming may be stale versus Polymarket's current collateral (CLOB V2 era); check the Polymarket note.
- Funding: Atomic claims users can deposit USDT/USDC from Ethereum, Solana, BSC, Tron, Base, Optimism, Arbitrum into a "prediction balance" without manual bridging (H summary, marketing). Routing/bridge provider and fees: NOT FOUND (searched: atomicwallet.io prediction pages).

## 4. Read API, trade path

- **Atomic's own API: none found** (NOT FOUND, searched: atomicwallet.io, GitHub `gh api search/repositories q=atomicwallet` returned 404/nothing, web search). Atomic's wallet is closed source as far as found.
- **Read market data from Polymarket instead** (Gamma/CLOB/Data API; see Polymarket note). Because Atomic only re-skins Polymarket, there is nothing to read from Atomic.
- Only Atomic-specific read signal: Polymarket's undocumented builder endpoints (H, fixture):
  - `GET https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod=DAY|WEEK|MONTH|ALL&limit=50&offset=N` returns `[{rank, builder, builderCode, volume, activeUsers, verified, builderLogo}]` (Atomic is at offset 50-100 for DAY/WEEK/MONTH and 100-150 for ALL).
  - `GET https://data-api.polymarket.com/v1/builders/volume?timePeriod=MONTH|ALL` returns bucketed `{dt, builder, builderCode, volume, activeUsers, rank}` rows (MONTH = 2,920 rows, large; filter client-side).
  - Atomic's **builder code**: `0x568ba072ec1bb84311d23a331e7df66dc482ff63e93dd1282751b6de5bf0886e` (H, same value in all rows). Public, but using it from another bot would misattribute volume and fees; do not.
- Trade path via Atomic: **none programmatic** (in-app only; transactions signed on-device by the user's key; no API). To trade the same liquidity programmatically, use Polymarket's own CLOB (EIP-712 signed orders; see Polymarket note).
- PayBox reachability: **no** via Atomic (no API, no contract of its own). Polymarket itself would be reached via signed orders, not via Atomic. paybox_reachable = no.

## 5. Liquidity (all dated 2026-10-19; H, Polymarket builder endpoints)

| Window | Builder-attributed volume | Active users | Rank |
|---|---|---|---|
| Latest day | $428 | 2 | 86 |
| Week | $8,484 | 12 | 86 |
| Month (rolling) | $109,172 | 52 | 93 |
| All-time | $2,492,599 | 549 | 111 |

Monthly (Polymarket `/v1/builders/volume?timePeriod=MONTH`): Jan 2026 $17.7K (15 users); Feb $229K; Mar $162K; Apr $185K; May $28.7K; Jun $361K; **Jul $1.069M (226 users)**; Aug $200K; Sep $131K; Oct 1-19 $109K (52 users).

Caveats: this is volume Polymarket credits to the builder code, not TVL or open interest; whether both sides of a trade are counted is not stated (see Polymarket builder overview, per sibling note). The leaderboard shows small count of "active users" so this is retail-scale flow. The ALL window only has one 2026 bucket ($2,492,698 / 549), so Atomic's builder code has no history before 2026 (H).

## 6. Fees

- Atomic's pages list **no trading fee** (H, fetch-tool summaries of prediction-markets, atomic-prediction, is-polymarket-safe, is-polymarket-legal; search found only generic "withdrawal fee is lower than other exchanges" claims). **Atomic's fee: NOT FOUND (searched: atomicwallet.io prediction pages, web search).**
- Polymarket side (H, https://docs.polymarket.com/programs/builders/fees.md): when a builder code is attached, a builder fee is charged "alongside any platform fee", flat % of notional, configured by each builder within enforced limits, additive to platform fees. Per sibling note the caps are taker <= 100 bps, maker <= 50 bps (H there). Atomic's chosen rate is not published (NOT FOUND).
- Network gas in POL for on-chain steps (H, Atomic guide).
- Arbitrage consequence (M): an Atomic-routed leg costs at least Polymarket's taker fee and possibly up to 1% builder fee, with no price advantage, so Polymarket direct dominates it.

## 7. Resolution

Identical to Polymarket (UMA optimistic oracle; dispute risk as in the Polymarket note and `docs/aggregation-design.md` section on resolution). Atomic adds no oracle of its own (H by construction; Atomic copy says "payouts are enforced by smart contracts", marketing).

## 8. Geo, ToS, automation

- Atomic markets itself as "No KYC, no accounts" (H quote, https://atomicwallet.io/academy/prediction-markets) but its own academy pages disagree on restrictions: one lists "the United States, United Kingdom, France, Germany, Italy, Australia, Japan, Russia, Iran, North Korea ... and other restricted jurisdictions", updated May 1, 2026 (H summary, https://atomicwallet.io/academy/articles/is-polymarket-legal); the app guide lists a different set (Belgium, Poland, Singapore, Thailand, Taiwan, Ontario, no Germany/Italy/Japan) (M, search snippet). Treat both as unverified; the authoritative text is Atomic's Terms of Service, which I did not read (robots.txt disallows `/terms-of-service`). NOT FOUND: an authoritative list.
- Polymarket "prohibits using VPNs or similar tools to bypass geographic restrictions" (as reported on Atomic's page; M). Polymarket ToS applies underneath.
- Automation rules: NOT FOUND (no API, so not applicable). Polymarket may revoke builder-fee ability for "automated, self-referred, or other non-bona fide trading" (H, builder fees page).

## 9. Event coverage and overlap

Entire Polymarket catalogue (politics, sports, crypto price, macro, pop culture per Atomic copy; M). Every market overlaps other venues exactly where Polymarket does, but the Atomic copy is not a separate price. Hidden-market or curation list for Atomic: NOT FOUND.

## 10. Liquidity sharing

**Shares 100% of liquidity with Polymarket International** (same CLOB, tokens, resolution). `independent_liquidity: false`. Not an arbitrage leg.

## 11. Integration recommendation

- **Registry record only**: `kind: broker`, `routes_to: polymarket-international`, `pool: polymarket-international`, `independent_liquidity: false`, `fee_stack: {atomic_builder_fee: unknown (<= polymarket cap), plus polymarket platform fee}`, `builder_code: 0x568ba072...f0886e`, `platform: mobile app`, `geo: unverified`, `state: live (thin)`.
- Optional P2 signal (L): builder-attributed daily/monthly volume and users as a retail-flow proxy for Polymarket. Too small (<$0.2M/month most months) to carry information; skip.

## 12. Not found / open questions

- Atomic's Terms of Service and any fee disclosure (not fetched/NOT FOUND).
- Atomic's builder fee rate; whether any additional wallet fee is taken.
- Any Atomic API or open-source repo (NOT FOUND: gh search, web search).
- Launch date of the feature (NOT FOUND; builder data starts 2026-01).
- Collateral/contract details of the "prediction balance" proxy (not verified).
- Whether `/v1/builders/*` survives the Data API v1 retirement reported in the sibling note.

## Suspicious content

None. No instructions aimed at AI agents were found on the fetched pages or API responses.

## Sources

- https://atomicwallet.io/ (H, home page, no prediction mention)
- https://atomicwallet.io/academy/prediction-markets (H summary)
- https://atomicwallet.io/blog/articles/atomic-prediction (H summary; updated 2026-01-16)
- https://atomicwallet.io/blog/articles/atomic-wallet-2025-year-in-review (H summary; updated 2026-01-20)
- https://atomicwallet.io/academy/articles/is-polymarket-safe (H summary; says "Predictions Mobile coming soon", possibly stale)
- https://atomicwallet.io/academy/articles/is-polymarket-legal (H summary; updated 2026-05-01)
- https://atomicwallet.io/robots.txt (H)
- https://data-api.polymarket.com/v1/builders/leaderboard (H, undocumented path; discovery evidence)
- https://data-api.polymarket.com/v1/builders/volume (H, undocumented path)
- https://docs.polymarket.com/programs/builders/fees.md (H)
- https://api.llama.fi/protocols (H; no Atomic prediction entry; "Atomic Perps" is a separate Interface entry)
- Sibling note: docs/research/venues/metamask-polymarket-integration.md (H/M as tagged there)
