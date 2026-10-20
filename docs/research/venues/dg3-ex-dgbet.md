# DG3 (ex-DGbet) - venue spec for the aggregator / arbitrage scanner

Researched 2026-10-19. READ-ONLY: WebFetch/WebSearch, unauthenticated GETs of public pages and one public Polymarket data-api endpoint. No account, wallet, key, signature, POST/PUT/DELETE or PayBox tool. Third-party text treated as untrusted data; no embedded instructions seen.
Tags: **H** = read first-hand in a primary source this session (URL cited); **M** = secondary or inferred; **L** = weak or stale.
This note supersedes/overlaps `dgbet.md` (same venue researched under the old name); conclusions agree and were re-verified this session.

## 0. Verdict

**adapter_priority: skip.** DG3 is not a venue. It is a front-end that routes orders to other venues, with no public API of its own.

1. Live, rebranded: `https://dgbet.fun/` returns HTTP 301 to `https://dg3.trade/` (H, curl -I 2026-10-19). Site is up, "Alpha access rolling out now"; blog posts through Sep 3 2026 (H, https://dg3.trade/blog).
2. Current product = "keyboard-first prediction market intelligence terminal", **Polymarket only**: "DG3 is currently in Phase 0, live on Polymarket only"; "Every order routes through to Polymarket"; market data comes from "Polymarket's own CLOB API" (H, https://dg3.trade/faq, https://dg3.trade/docs). Same order book as Polymarket, so **zero independent liquidity**: it is not an independent arbitrage leg.
3. Legacy product (2024 DGbet sportsbook) "pulled liquidity from Azuro, Overtime, and SXbet" (H, https://dg3.trade/about via search summary; and sportsbook bundle host scan, see `dgbet.md`). Those are separate venues with their own adapters.
4. Proof of the Polymarket tie: Polymarket builder "DG3" is verified, all-time rank 43, 213 active users, ~$16.95M builder-attributed volume (H, https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod=ALL&limit=50&offset=0, 2026-10-19; fixture `polymarket_builder_leaderboard_dg3_2026-10-19.json`). That volume is Polymarket volume, not additional.

Build adapters for Polymarket / Overtime / SX Bet / Azuro. At most, DG3 builder volume is a weak "flow/signal" datapoint and the DG3 blog ("No Vig API", "Arbitrage Calculator") is marketing content (M).

## 1. Liveness (H)

| Check | Result | Source |
|---|---|---|
| dgbet.fun | 301 to https://dg3.trade/ | curl -I 2026-10-19 |
| dg3.trade | 200 | curl -I 2026-10-19 |
| Launch | Smol Launch lists "Launched: August 2026" (M); About says first version 2024 | https://smollaunch.com/products/dg3 (search result) |
| Blog | latest post Sep 3 2026 | https://dg3.trade/blog |
| Sportsbook | https://sportsbook.dg3.trade/sportsbook serves live Overtime games (Base default) | `dgbet.md` fixture |

## 2. Kind and market model

- Kind: non-custodial broker/front-end ("only constructs and routes trade orders to Polymarket on the trader's behalf") (H, FAQ).
- Market model = Polymarket's: binary/categorical outcome tokens (ERC-1155 CTF), CLOB. DG3 adds no market model of its own. Covers "Sports and Esports" only (H, docs).
- Extra features (Kelly sizing "Automate", 1-Click Trade, +EV ranking vs sharp-book no-vig odds) are UI features (H FAQ; M for the Pinnacle claim, search summary).

## 3. Chains and collateral

Polygon, USDC (Polymarket). FAQ names no chain; docs/`WALLET_CHAIN_MISMATCH` error per prior note (see `dgbet.md`, H). Legacy sportsbook: Overtime on Base/OP/Arb etc. Not independent.

## 4. Read API

- Official DG3 API: **NOT FOUND** (searched: FAQ, docs first 100k chars, blog index, search). docs page says nothing on API; FAQ says no public API or bot access mentioned.
- Use Polymarket instead: Gamma/CLOB/data-api (covered by the parallel Polymarket workflow). The one DG3-adjacent public endpoint is Polymarket's builder leaderboard (see fixture): `GET https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod=ALL&limit=50&offset=0` returns rows `{rank, builder, builderCode, volume, activeUsers, verified, builderLogo}` (H).
- Blog post "No Vig API: Pulling Fair Odds Programmatically" (Aug 25 2026) exists (H listing) but is a tutorial, not confirmed to be a DG3 API (L).

## 5. Trade path

Orders signed client-side as Polymarket orders, using a Privy embedded wallet (Google/X/Discord login) or an external wallet ("Wallet prompt required on every trade") (H, docs). No third-party order API, SDK or key issuance found. **PayBox: no** for DG3 itself; to trade the same book an agent would use Polymarket's CLOB directly (EIP-712 signed orders on Polygon, API creds), which is the Polymarket adapter's concern. Attribution via a Polymarket builder code is how DG3 earns, but using it is not needed by an aggregator.

## 6. Fees

DG3 charges "a small fee on trades routed through the terminal"; Polymarket fees separate; waived first 10 days; rebate program can offset part (H, FAQ). Formula **NOT FOUND**; earlier note saw sample "$1.20 DG3 fee on $200" (~0.6%, M single data point). DG3 says "free to use", no subscription.

## 7. Resolution

Inherited entirely from Polymarket (UMA optimistic oracle). DG3 has none (M).

## 8. Geo / ToS / automation

FAQ lists no restricted jurisdictions, says legality "depends on jurisdiction" (H). Terms URL 404 per prior note (`dgbet.md`). Automation rules: NOT FOUND. Any restrictions that matter are Polymarket's.

## 9. Liquidity

- Builder-attributed Polymarket volume ~$16.95M all-time, 213 users (H, leaderboard 2026-10-19). Homepage self-claim "$25M+ Total Volume Traded" is undated marketing (L).
- No TVL/OI of its own; DefiLlama has no entry (per `dgbet.md`).

## 10. Event overlap

Sports and esports only (H, docs). Overlaps Polymarket/Kalshi/SX sports, but only via Polymarket's book.

## 11. Shared liquidity

**100% shared with Polymarket** (current terminal); legacy sportsbook shared with Overtime/SX Bet/Azuro. Not an independent leg.

## 12. Open questions

- Whether the legacy sportsbook subdomain stays alive after the Polymarket pivot.
- DG3 fee formula; post-rebrand ToS.

## Sources

- https://dgbet.fun/ (301), https://dg3.trade/ , https://dg3.trade/faq , https://dg3.trade/docs , https://dg3.trade/about , https://dg3.trade/blog
- https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod=ALL&limit=50&offset=0
- https://smollaunch.com/products/dg3 , https://polymart.app/dg3 (search results, M)
- Sibling note: `docs/research/venues/dgbet.md`
- Fixtures: `docs/research/fixtures/dg3-ex-dgbet/`
