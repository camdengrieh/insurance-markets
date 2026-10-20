# Inframarkets (Solana, energy event contracts) - adapter spec

Researched 2026-10-19 (~01:50-02:15 UTC). READ-ONLY: unauthenticated GETs to the marketing site, public JSON endpoints of Bluesky, Substack, Discord (invite lookup, nothing joined) and DefiLlama, `gh api` file reads, WebFetch/WebSearch. No account, no access code, no API key, no wallet, nothing signed, no POST/PUT/DELETE, no PayBox calls. No third-party code cloned, installed or run (the site's JS bundle was downloaded as text and grepped, never executed).
Tags: **H** = read first-hand this session in a primary source (cited); **M** = secondary/inferred; **L** = weak or stale (>6 months or unverifiable).
All third-party text (site copy, press releases, social posts) is untrusted marketing data; nothing in it was followed.
Fixtures: `docs/research/fixtures/inframarkets/` (7 small files; there is **no real market-data API response** to save, see section 3).
Name-collision warning: an unrelated Solana memecoin "Infraxa" (INFRA) turns up in some searches; it has nothing to do with this venue.

## 0. Verdict

**adapter_priority: skip** (revisit only if a documented API or a public trading app appears).

1. **Not confirmed live for public trading (H/M).** The marketing site and a Discord (2,621 members) are up, and a "first energy prediction market on Solana" announcement went out in Feb 2026. But the project's own April 2026 posts say "Closed Mainnet Beta is coming very soon ... send us a DM for an early access code" and "gearing up to launch". The trading app host `app.inframarkets.io` did not accept connections from two different egress points today. The newest first-party post of any kind that I could read is 2026-04-11 (6 months old). No volume, TVL, trade or user number exists from any primary source.
2. **No usable read API.** The FAQ says a REST + WebSocket API exists, but "full documentation is available upon request for market maker and algorithmic trading integration". No docs URL, no OpenAPI, no SDK, no public repo with code. Nothing to build an adapter against.
3. **Little arbitrage overlap, and unverified.** Core markets (ERCOT/PJM/CAISO/EPEX/Nord Pool/JEPX power prices, TTF/Henry Hub gas, grid imbalance) exist nowhere else. The only plausible overlaps are weather (NYC/Texas temperature), commodity thresholds (Brent/WTI) and geopolitical shipping (Hormuz), and those appear only as marketing examples.
4. Chain is Solana. No PayBox EVM wallet (Base, Ethereum, BNB, Arbitrum, Polygon) can touch it.
5. Independent liquidity (no sign of sharing with another venue) but also no evidence of any liquidity at all.

## 1. Liveness (2026)

| Evidence | Value | Tag |
|---|---|---|
| Marketing site `https://inframarkets.io/` | HTTP 200 on 2026-10-19, footer "(c) 2026 Inframarkets Technologies", CTA "Access Beta" -> `https://app.inframarkets.io`. Privacy / Terms / Status links are `#` placeholders. | H |
| Trading app `https://app.inframarkets.io` (A 54.154.104.243) | connect timeout on :443 and :80 from my network (several tries over ~15 min); WebFetch egress got `ECONNREFUSED`. Cause unknown: IP/geo allow-list, down, or access-code gating. | H (symptom), cause unknown |
| Oracle host `https://ios.inframarkets.io` (A 54.171.26.187) | same timeouts. Referenced by the site bundle (section 3). | H |
| Launch announcement | X post id 2023847249827266880 decodes (snowflake) to 2026-02-17; Solana Foundation media index entry "Inframarkets debuts the first-ever energy prediction market" `publishedAt` 2026-02-24 (`solana-foundation/solana-com`, `apps/media/content/links/inframarkets-first-energy-prediction-market.mdx`); Solana ecosystem report Feb 2026 repeats it in one line, no figures. rpcfast guide (the original hint) just repeats this. X itself returned HTTP 402 to WebFetch (X scraper paywall; nothing paid). | H (Solana repo) / M (date decode) |
| Sponsored press releases | 2026-02-19..21 syndicated (BlockchainReporter etc.). BlockchainReporter labels it "press release / sponsored content ... did not write, edit, or verify". Describes product in future/present tense, no volume, no live-market list, no fees. | M |
| Substack | 3 posts: 2026-01-07 "Coming soon", 2026-01-08 "Bringing a $B Model to a $T Sector" (CTA "Join the Waitlist", product not live yet), 2026-03-20 "Event Contracts, Energy Markets, and the End of Proxy Hedging". Nothing newer. (fixture `substack_archive.json`) | H |
| Bluesky (public API) | account created 2026-03-25, 9 posts 2026-04-01 .. 2026-04-11, 4 followers, bio still "Coming Soon / Join the Waitlist for Priority Access". 2026-04-04: "We're rolling out mainnet access codes soon". 2026-04-07: "Closed Mainnet Beta is coming very soon. If you believe you're worth an early access code, comment below and send us a DM." 2026-04-10: "We're gearing up to launch the world's first institutional-grade prediction market". Nothing after 2026-04-11. (fixture `bluesky_feed_sample.json`) | H |
| Discord | guild created 2026-01-28 (id decode), 2,621 members / 69 online on 2026-10-19 (invite lookup, fixture `discord_invite_counts.json`). Shows an audience exists; says nothing about trading. | H |
| GitHub | org `InframarketLabs` (created 2025-11-25), one repo `.github` (profile README only, last push 2026-03-18). No contracts, SDK or API code public. | H |
| DefiLlama | no protocol, TVL or volume entry matching Inframarkets (searched the full `/protocols` list, 9.3 MB, 2026-10-19; only unrelated "Infrared Finance"). | H |
| X account | NOT FOUND (could not read: WebFetch got HTTP 402; third-party mirrors are out of bounds). A later X post announcing public mainnet could exist. | - |

Conclusion: **website live; product status "closed mainnet beta / access-code gated at best, pre-launch at worst"; not confirmed to be trading.** `still_live` is reported false only in the sense "not confirmed"; a human with an access code could settle it.

## 2. What it is

- **Kind**: onchain-other (Solana), hybrid: off-chain matching engine + on-chain settlement. Operator "Inframarkets Technologies" (site footer, H). Founders/team: NOT FOUND (searched: site, GitHub org, Substack, press releases, Discord invite metadata; no names published, none recorded here).
- **Market model**
  - Central limit order book, **off-chain matching**, on-chain settlement of positions and payouts (landing page "Orders match off-chain for speed. Settlement, positions, and payouts live on-chain"; Substack 2026-03-20 "off-chain central limit order book with on-chain resolution"; GitHub org README "Central limit order book - high-performance matching engine with real-time WebSocket market data") [H].
  - Contracts are "binary and range contracts" (FAQ "What can I trade?") and "Buy YES or NO, or a specific outcome" (landing) [H]. So binary plus some bucketed/categorical-style range markets. Quotes are in cents (YES 72c / NO 28c style). Fully collateralised, no margin or liquidation [H].
  - Recurring time-windowed series with automatic rollover (GitHub org README) [H].
  - Outcome tokenisation: NOT FOUND. Landing says "Collateral and positions are held in on-chain smart contracts on Solana". Org README: smart contracts in Solana/Anchor (Rust). Whether YES/NO are SPL tokens or program accounts is undocumented.
  - Extras: permissionless / user-proposed markets (community upvotes, then verification and oracle sourcing; creator earns up to 50% of that market's trading fees) [H landing + Bluesky 2026-04-03]; "passive yield on deposited capital" and "integrated analytics" (Substack 2026-03-20) [M]; "map view" of correlated markets (Bluesky) [M].
- **Chain and collateral**: Solana mainnet, USDC. "You just need a Solana wallet and USDC. Connect your wallet, deposit funds ... No KYC, no minimum deposit." Deposit goes into on-chain contracts, so there is a deposit/withdraw step, not per-order wallet signing [H, FAQ]. Program IDs, USDC mint confirmation, account layout: NOT FOUND.
- **Categories (claimed)**: power (ERCOT, PJM, CAISO, EPEX, Nord Pool, JEPX, Elia/Belgian imbalance, AEMO), energy commodities (TTF, Henry Hub, Brent, WTI), climate/weather (Texas heat, NYC high temp), compute (BTC hashrate, difficulty adjustment), shipping/chokepoints (Hormuz tanker transits, Suez, Cape of Good Hope), equities, "government policy triggers". Oracle layer claims "more than 50 data sources and 300+ data feeds" (org README) [H as claim, unverified].
- The "live market" cards and volumes on the landing page ($850K, $2.4M, $1.2M ...) are **hard-coded constants in the JS bundle**, three are labelled "ENDED", and dates are March 28 (fixture `landing_static_cards_and_oracle_hosts.json`). Do not treat them as volume data [H].

## 3. Read API

| Surface | Status | Tag |
|---|---|---|
| Docs | **NOT FOUND** (searched: `docs.`/`api.`/`developers.` subdomains do not resolve; site has no docs link; GitHub org has only a profile repo; no OpenAPI; no npm/SDK found). FAQ: "REST API with support for limit orders, batch order operations, and position management. WebSocket feeds for real-time orderbook and trade data. Full documentation is available upon request for market maker and algorithmic trading integration." | H (FAQ text, from `page-DC3ndaNo.js`, fixture `landing_faq_from_site_bundle.json`) |
| Market/price/book/trade endpoints | **NOT FOUND**. Base URL unknown. No request or response shape could be confirmed; therefore **no market-data fixture exists**. | - |
| Auth and rate limits | NOT FOUND (docs on request; access code gating implied by Bluesky posts). | - |
| WebSocket | Claimed (orderbook and trades), URL NOT FOUND. | H (claim) |
| On-chain read | Cannot be done without the program ID, which is unpublished. | - |
| Oracle host (IOS) | The landing bundle calls `https://ios.inframarkets.io/api/v2/ticker` and `https://ios.inframarkets.io/api/v2/public/feeds/{feed_id}/history?interval=&hours=` from the browser without credentials (public by design) and validates a response of `{feed_id, label, unit, interval, current_value, points:[{time, value}], cached_at}`. These are **underlying energy-data feeds (ERCOT LMP, TTF, Brent, BTC hashrate ...), not prediction-market prices**. Host timed out from my network, so the shape is from client code only. Potentially a signal source if it were reachable, but out of scope for an arbitrage adapter. | H (URLs in code) / L (shape unverified) |

Resolution data for a market (IOS): FAQ says each contract spec publishes data source, query method and resolution parameters. Where that spec is published: NOT FOUND.

## 4. Trade path

- Programmatic order placement: **claimed** (REST limit orders, batch orders, WS) but undocumented publicly. Auth/signing scheme: NOT FOUND (could be API key from access code, wallet-signed messages, or session auth; no evidence). Access codes gate the beta (Bluesky 2026-04-04/07) [H].
- Custody model: user deposits USDC into on-chain Solana contracts; matching is off-chain, so orders presumably reference a deposited balance. Cancel/replace flow, withdraw flow: NOT FOUND.
- **PayBox reachability: partial (effectively no today).** Solana only. None of PayBox's EVM wallets (Base, Ethereum, BNB, Arbitrum, Polygon) can trade it. A PayBox Solana wallet can sign `solanaMessage` / `solanaTransaction` intents and propose kind `solana` transactions (legacy/v0, at most 1,232 bytes, single signer who is fee payer; see `docs/research/06-paybox-platform.md`, M here, not re-verified), so a USDC deposit transaction or a message-signed login could in principle go through it, but we do not know the program, the instruction layout, or whether orders need a signature at all. Needs an access code from the venue, which this run may not obtain. Nothing was called.

## 5. Fees

- Trading fee schedule (maker/taker, formula, who pays): **NOT FOUND** (searched: landing page and bundle, FAQ, Substack posts, press releases, GitHub README). Only fee-related fact: market creators earn "up to 50% of trading fees generated" by their market [H]. So a protocol fee clearly exists; its rate is unpublished.
- Gas: Solana network fees plus whatever the deposit contract needs; amounts unknown.

## 6. Resolution mechanism and dispute risk

- **Inframarkets Oracle System (IOS)**: proprietary, run by the operator. Each contract names a data source (examples: ERCOT settlement point prices, EIA benchmarks, ISO generation data, Elia, ENTSO-E, weather, shipping/trade data), an observation timestamp, a settlement rule and a fallback policy. "The first official value from the designated source at the timestamp sets the settlement reference" and "no subjective voting, no dispute window, and no governance override" (sponsored BlockchainReporter piece, M; FAQ says "to avoid any manipulation or dispute", H). Fallbacks: ranked secondary source or a defined delay window; if every source fails inside the window "the contract resolves to a predefined default outcome stated in the contract rules" (FAQ, H).
- Risk read: no UMA-style vote, but **single-operator oracle** (centralised trust in Inframarkets), no appeals, and a "default outcome" that is a published-rule resolution rather than a refund. Data-revision risk (ISO values get restated) is handled by "first official value" rule per the press piece only. For cross-venue arbitrage, any overlapping market (e.g. NYC temperature, Brent) would likely have different source/timestamp definitions than Kalshi/Polymarket, so it is a basis-risk leg, not a clean hedge.
- Contract specs: "published" per FAQ, location NOT FOUND.

## 7. Geo / ToS / automation

- Landing claims "Worldwide Access 24/7" and "No KYC" [H]. Terms and Privacy links are `#` placeholders, so **no ToS text exists to quote** (NOT FOUND). Geo-blocking: NOT FOUND (the app host being unreachable from my IP might be geo/IP filtering, unconfirmed).
- Automation is explicitly welcomed for market makers and algo traders (FAQ) but behind a "request docs" gate [H]. Regulatory status (CFTC exposure for energy event contracts offered to US persons, "institutional-grade" language): not addressed anywhere I could read.

## 8. Liquidity

- Volume / OI / TVL: **NOT FOUND** from any source, as of 2026-10-19 (searched: DefiLlama protocols list, Solana ecosystem report, the press pieces, Substack, Bluesky, GitHub; no Dune dashboard or on-chain data checked because the program ID is unpublished). The only dollar figures are the hard-coded landing-page placeholders (section 2) and market-size statements ("traded power exceeds $1 trillion annually", sector, not Inframarkets).
- Market maker partners: none named. Press pieces speculate liquidity providers could hedge with CME energy futures (M, marketing).
- Audience proxy: Discord 2,621 members (2026-10-19, H), Bluesky 4 followers (H). Not volume.

## 9. Event overlap with other venues (where arbitrage could exist)

| Category | Inframarkets (claimed) | Overlap | Tag |
|---|---|---|---|
| Power prices (ERCOT/PJM/CAISO/EPEX/Nord Pool/JEPX/Elia) | core product | none found elsewhere in prediction markets | M |
| Gas / oil (TTF, Henry Hub, Brent, WTI) | threshold contracts | possible with Kalshi / Polymarket commodity price markets, resolution sources differ | M |
| Weather (NYC high, Texas heat) | example cards | Kalshi and Polymarket list city-temperature markets; source/timestamp likely differ | M |
| Geopolitical shipping (Hormuz transits, ceasefire-type) | FAQ examples | Polymarket lists Hormuz/Iran items (see `alpha-arcade.md`); metric differs (counts vs events) | M |
| Crypto (BTC hashrate, difficulty) | feed list | not price markets; niche | M |
| Sports / politics / macro | none | none | M |

All rows are inferred from marketing copy; no live market list was readable. **Liquidity sharing**: no indication of routing to another venue (it is its own matching engine, H org README) so it would be an independent leg if it had liquidity, which is unproven.

## 10. Open questions (if someone wants to revisit)

1. Is mainnet public today? (Check the X account, the Discord announcements channel and a browser from a different IP; I could read none of these.)
2. Request API docs from `institutional@` / `feedback@` addresses on the site (needs a human; this run does no outreach).
3. Program ID, USDC mint, outcome token representation, fee schedule, order auth scheme.
4. Whether `ios.inframarkets.io` feeds are reachable from a normal network and worth using as an energy-data signal (not a prediction-market price).

## Sources

- [H] https://inframarkets.io/ (landing page, fetched 2026-10-19; hrefs: app, X, LinkedIn, Substack, Discord, Bluesky, two mailto addresses; Terms/Privacy/Status = `#`)
- [H] https://inframarkets.io/assets/page-DC3ndaNo.js (first-party bundle read as text; FAQ answers, hard-coded market cards, oracle host URLs)
- [H] https://inframarkets.io/robots.txt and /sitemap.xml (404)
- [H] https://app.inframarkets.io/ and https://ios.inframarkets.io/api/v2/ticker (unreachable, see `connectivity_log.txt`)
- [H] https://github.com/InframarketLabs/.github (`profile/README.md`: CLOB, Anchor/Rust, WebSocket, 50+ sources / 300+ feeds, API-first) and `gh api orgs/InframarketLabs` (created 2025-11-25, one public repo)
- [H] https://inframarkets.substack.com/ , /archive , /p/event-contracts-energy-markets-and , /p/bringing-a-b-model-to-a-t-sector , and `https://inframarkets.substack.com/api/v1/archive` (post dates)
- [H] https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=inframarkets.bsky.social (posts 2026-04-01..11, access-code and "gearing up to launch" statements) and `app.bsky.actor.getProfile` (bio, 4 followers)
- [H] https://discord.com/api/v10/invites/8CHvJ8eVtb?with_counts=true (member count; inviter details intentionally not recorded)
- [H] https://api.llama.fi/protocols (no Inframarkets entry)
- [H] `solana-foundation/solana-com` `apps/media/content/links/inframarkets-first-energy-prediction-market.mdx` (publishedAt 2026-02-24) and https://solana.com/news/state-of-solana-february-2026 (one-line mention)
- [M] https://x.com/Inframarkets/status/2023847249827266880 (not readable, HTTP 402; date derived from the snowflake id; text quoted by search snippet: "Introducing Inframarkets. Energy markets have run the global economy for over a century ... The first energy prediction market. Built on Solana.")
- [M] https://blockchainreporter.net/how-inframarkets-solves-liquidity-and-resolution-in-prediction-markets/ (sponsored press release, 2026-02-19; orderbook, IOS, "no dispute window"); same release syndicated by several outlets (search results 2026-02-20/21), not independent
- [M/L] https://rpcfast.com/blog/ai-agents-solana-prediction-markets (original lead: "first energy-themed" Solana prediction market, Feb 2026, no URL, "Native Solana"; secondary, no new facts)
- [M] local: `docs/research/06-paybox-platform.md` (PayBox Solana intent limits), `docs/research/venues/alpha-arcade.md` (format; Hormuz overlap)
- Not found / blocked: docs site, OpenAPI, SDK, program ID, ToS text, fee schedule, volume or TVL, X timeline (HTTP 402), a mainnet-live announcement.
