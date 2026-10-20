# Groovy Market - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: public unauthenticated GETs (Google DNS-over-HTTPS, Wayback CDX and id_ snapshots, GitHub public REST/`gh api` raw file reads), WebFetch of predictionindex.xyz. No account, wallet, key, signature, POST/PUT/DELETE or PayBox tool used. Third-party content (the GroovyMarket GitHub repos, archived pages) treated as untrusted data; nothing was executed or cloned. No instructions aimed at AI agents were seen.

Research limit: the shared WebSearch budget was exhausted after the first query (it returned nothing about Groovy Market). The X account (@GroovyMarket_) and any docs site could not be read; discovery therefore rests on DNS, Wayback and the venue's own public GitHub org.

Tags: **H** = read first-hand in a primary source this session; **M** = inferred or secondary; **L** = weak/stale.

Fixtures (all < 5 KB): `docs/research/fixtures/groovy-market/`. There is no live API, so these are evidence of death and of the code history, not market data.

---

## 0. Bottom line

1. **NOT live (H for DNS, M for the "dead" conclusion).** `playground.groovy.market` and the apex `groovy.market` both return DNS status 3 (NXDOMAIN) from Google DoH on 2026-10-19, with the `.market` registry SOA as authority. The domain is not in the zone at all (expired or deregistered). That is why the site is "unreachable". A transient resolver fault cannot be fully excluded, but NXDOMAIN with a registry SOA is a definitive "name does not exist" answer.
2. **It was a small, testnet-style / play-money project (M).** Its own source uses `MOCK_USDC` and `MOCK_CONDITIONAL_TOKENS` env names, has a faucet page and a `mint-tokens` route, and the final public hostname was `playground.`. Never evidenced as real-money.
3. **Architecture is a Polymarket CTF-Exchange clone on Sei EVM (M, from source).** Conditional tokens + CTF exchange with signed-order matching, Polymarket-style proxy-wallet and Safe factories, off-chain order matching with an on-chain `matchOrders` by a relayer. This is the only reason it was ever a candidate: it is an already-covered model and no independent liquidity.
4. **No docs, no public API documentation, no volume figure anywhere (H: NOT FOUND).** predictionindex.xyz lists it with volume "n/a".
5. **adapter_priority = skip.** Dead domain, no liquidity, no docs, last code activity June 2025 (public GitHub), play-money.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| `dns.google/resolve?name=playground.groovy.market&type=A` (2026-10-19) | `Status: 3` (NXDOMAIN), authority `market.` SOA `v0n0.nic.market`. Fixture `dns-playground-groovy-market-A-2026-10-19.json` | H |
| `dns.google/resolve?name=groovy.market&type=NS` (2026-10-19) | `Status: 3` NXDOMAIN. Fixture `dns-groovy-market-NS-2026-10-19.json` | H |
| `curl` to `playground.groovy.market`, `groovy.market`, `www.`, `docs.`, `api.`, `app.` | "Could not resolve host" for the two first-party names tried by curl; `dig +short` empty for all five hostnames | H |
| Wayback CDX for `groovy.market` | Captures from 2025-02-27; a real landing page (HTTP 200, 5.5 KB) on 2025-05-14; by 2025-07 to 2025-11 the root returns 302; the 2025-11-08 capture redirects to `https://playground.groovy.market/` (Cloudflare). Fixture `wayback-cdx-root-captures.txt` | H |
| Wayback 2026 captures (2026-03-17 to 2026-04-03) | Paths under `/march-chadness/`, `/feed/`, `/api/auth/session` exist in the index but the bodies I fetched are an archive "Redirecting..." interstitial with an ad-block-detection script, not site content. So they show the URL space existed into spring 2026 but do not prove the site was serving. | M |
| Public GitHub org `GroovyMarket` | 10 repos, all created 2025-06-19/20, last pushed 2025-06-24; profile updated 2025-11-20. Zero followers. No 2026 commits. Fixture `github-GroovyMarket-repos.json` | H |
| predictionindex.xyz/ecosystem | Row: "Groovy Market", chain EVM, outcome Binary, status Live, volume n/a, website `playground.groovy.market`, X `@GroovyMarket_`. The directory flag is stale relative to DNS. | H (listing) / contradicted |
| Independent 2026 news or analytics coverage | NOT FOUND (searched: one WebSearch "Groovy Market prediction market", returned only generic results; search budget then exhausted) | - |

Verdict: **still_live = false** (domain no longer exists in DNS on 2026-10-19; no evidence of any 2026 activity).

---

## 2. Kind and market model

- Kind: on-chain CLOB, off-chain order book with on-chain settlement ("onchain-other"). (M, from repo source)
- Landing-page copy (Wayback 2025-05-14, H): "GroovyMarket | Turn Predictions Into Profit with Creator-Powered Markets" / "empowers creators to launch fun, social prediction markets". So the pitch was creator/social markets.
- Binary YES/NO; also "grouped" parent/child markets (a parent with child binary markets), seen in the `/api/markets/[id]/orderbook` route that branches on `type === "grouped"`. (M, from `GroovyMarket/groovy-market`)
- Outcomes tokenised as Gnosis-style conditional tokens (`ctf.ts`, `mock-ctf.json`, `approve-conditional-tokens`, `split-position`, `merge-positions`, `redeem-positions` routes) traded against a collateral token via a CTF exchange contract (`ctf-exchange.json`, `matchOrders`, `hashOrder`, `feeRateBps`). (M)
- Order book fields returned by their own API: `yesAsks, noAsks, yesBids, noBids, bestPrices` (from the route source; not confirmed against a live response). (M)
- Market categories evidenced in source: sports (cron `sports/create-upcoming`, `publish/single`, `publish/grouped`, leagues, matches), crypto price (cron `crypto/price`, `market-cap`, `resolution` for BTC, ETH, SEI), plus a separate "March Chadness" NCAA bracket contest product with its own Solidity contracts (`MarchMadness/*`, ticket NFTs). (M)

## 3. Chains and collateral

- Chain: Sei EVM (M). Evidence: `contracts/data/precompile.ts` uses the Sei address precompile at `0x...1004` (`getSeiAddr`), the repo `groovy-march-chadness-contracts` has `script/DeploySei.s.sol`, and the crypto crons track `sei-network`. Whether it ran on Sei mainnet (pacific-1) or testnet (atlantic-2) is NOT FOUND; naming (`MOCK_USDC`, faucet, `playground` host) points to testnet or play-money. Directory says only "EVM".
- Collateral: a mock USDC (`NEXT_PUBLIC_MOCK_USDC`), minted by a faucet/`mint-tokens` route. (M)
- Contract addresses: NOT FOUND (they are `process.env` values; no `.env.example` in the app repo; I did not read any credential file).

## 4. Read API

- Official public API: **none documented; none reachable.** No docs site, no OpenAPI, no developer page found (searched: DNS for docs./api./app., Wayback, GitHub org).
- The Next.js app exposed internal unauthenticated-looking route handlers (from source, M): `GET /api/markets/list`, `/api/markets/[id]`, `/api/markets/[id]/orderbook`, `/api/markets/[id]/last-price`, `/api/markets/[id]/price-history`, `/api/markets/[id]/orders`, `/api/leaderboard/{profit,volume}`, `/api/search`, `/api/sports`, `/api/leagues`, `/api/positions/user-positions-public`. These are first-party frontend endpoints, undocumented and unstable, and the host is gone.
- Websocket: NOT FOUND.
- Rate limits / auth: NOT FOUND. Order and position routes use NextAuth + Dynamic auth (embedded wallets) per source (M).
- No live response shapes could be confirmed: base URL does not resolve. No market-data fixtures saved.

## 5. Trade path

- None for an outside agent today (host dead). Historically (M, from source): orders were EIP-712-style signed (`hooks/order/use-create-signed-order.ts`, `hash-order`), posted to `/api/orders/limit-order` or `/market-order`, matched by the server, and settled by a relayer calling `matchOrders` on the CTF exchange; wallets were Polymarket-style proxy wallets with a gasless forwarder (relayer key server-side). Auth via Dynamic/NextAuth session, not a public API key.
- PayBox reachability: **no.** There is no live endpoint and no mainnet-collateral deployment evidenced. In principle an EVM wallet could sign orders for a Polymarket-clone, but Sei is not among the chains this plugin targets and the venue is dead.

## 6. Fees

- `FEE_RATE_BPS = 200` (2%) hard-coded in `lib/config.ts`, applied as `feeRateBps` on orders (H for the constant in the repo, M for how it was charged; whether live deployment used it is unknown). March Chadness: referral commission >= 10% of ticket value, 10% to a bonus pot (from the app's terms text, M).

## 7. Resolution and dispute risk

- Crypto markets: cron fetches the exact-date price from CoinGecko and resolves automatically on-chain (`crypto/resolution` route, `fetchExactDatePrice`, `resolveMarket`). Single centralized data source, resolver key held by the operator. (M)
- Sports: operator-run publish/fix crons from an external sports API. (M)
- Oracle contract `oracle.json` + `ORACLE_RESOLVER` owned by the operator; no dispute window evidenced. Dispute risk: high (centralized, unaudited; the only audit PDF in the repo is Polymarket's proxy-wallet report, copied from upstream).

## 8. Geo / ToS / automation

- App T&C text in source is a template ("Termify") with a TODO to update it; the real ToS is NOT FOUND (site gone). Nothing about geoblocking or automation rules. No quote.

## 9. Liquidity

- Volume/OI/TVL: **NOT FOUND**; predictionindex lists "n/a". Play-money mock USDC means any figure would be meaningless for arbitrage anyway.

## 10. Event overlap and shared liquidity

- Categories (sports fixtures, crypto price-by-date, SEI price) overlap other venues in principle, but with no liquidity and no live host there is no arbitrage leg.
- Shared liquidity: none known; it ran its own off-chain book (M). Code lineage: copy of Polymarket CTF exchange / proxy wallet (M).

## 11. Adapter recommendation

**skip.** Dead domain (NXDOMAIN), play-money, no docs, no activity after mid-2025 in public code. Re-check only if `groovy.market` resolves again. Do not spend adapter effort; the code-pattern is already covered by the Polymarket adapter.

---

## Sources

- https://predictionindex.xyz/ecosystem - directory row (WebFetch, small-model summary of the table, M/H as noted)
- https://dns.google/resolve?name=playground.groovy.market&type=A and `...groovy.market&type=NS` - NXDOMAIN, 2026-10-19 (H)
- https://web.archive.org/cdx/search/cdx?url=groovy.market - capture index (H)
- https://web.archive.org/web/20250514004913id_/https://groovy.market/ - archived landing page, title/description (H)
- https://web.archive.org/web/20251108024337id_/https://groovy.market/ - 302 to `playground.groovy.market` (H)
- https://api.github.com/users/GroovyMarket and `/repos` - org profile and repo list (H)
- https://github.com/GroovyMarket/groovy-market (files `lib/config.ts`, `contracts/data/precompile.ts`, `app/api/markets/[id]/orderbook/route.ts`, `app/api/markets/cron/crypto/resolution/route.ts`, `lib/order/hash-order.ts`, file tree) (H as to the code content, M as to what ran in production)
- https://github.com/GroovyMarket/groovy-march-chadness-contracts , `groovy-proxy-wallet`, `groovy-bracket-core`, `groovy-event-listener` - file trees only (H)
- Not reachable: https://playground.groovy.market/ , https://twitter.com/GroovyMarket_ (not fetched), any docs.

## Not found

- Live site, docs, API reference, websocket, rate limits, ToS/geo rules, contract addresses, mainnet vs testnet, volume/TVL, resolution/dispute policy text, 2026 news.
- Searched: WebSearch (one query, budget exhausted), DNS (5 hostnames), Wayback CDX, GitHub org + repos.

## Suspicious content

None observed. (Wayback 2026 interstitial pages contained an ad-block detection script; irrelevant, not followed.)
