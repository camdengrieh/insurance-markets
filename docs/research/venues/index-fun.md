# Index Fun (index.fun) - venue spec

Researched 2026-10-19. Read-only. Tags: H = read first-hand this session (primary), M = secondary/inferred, L = weak/stale.

## Verdict

Adapter priority: **skip**. The official domains `index.fun` and `app.index.fun` do not resolve (NXDOMAIN from the .fun registry). I found no public API, docs or repo. Prediction rounds were small up/down index-price markets even when apparently live. Venue is probably dead or at least unreachable. Confidence medium.

## Liveness (2026)

- `index.fun`, `app.index.fun` (also www, docs, api subdomains): Cloudflare DoH and Google DoH both return Status 3 (NXDOMAIN) with the `.fun` zone SOA (ns.trs-dns.com, serial 1792385016, which is about 2026-10-19). Local resolver and WebFetch also fail (`getaddrinfo ENOTFOUND`). **H** (checked 2026-10-19 via https://cloudflare-dns.com/dns-query and https://dns.google/resolve).
  - Caveat: NXDOMAIN means the registration lapsed or was removed (or delegation was dropped). It does not prove the contracts are dead.
- Wayback CDX shows index.fun HTTP 200 captures in Sept 2024 (https://web.archive.org/cdx/search/cdx?url=index.fun). **H**, but old.
- https://predictionindex.xyz/ecosystem (data refreshed 2026-10-18/19 per the page's own timestamps) still lists Index Fun: Chain Sonic, Status "Live", Outcome Binary, Total volume n/a, links app.index.fun/explore and X @indexdotfun. **H**. The directory's status is stale relative to DNS and is likely not re-verified.
- A web search summary (from a prior search this session, not primary) described it as "live on Sonic, binary, continuous double auction, volume under $100k at time of listing", with daily settlement. **M/L**, listing date unknown, probably 2025.
- A third-party airdrop tracker page noted as about 440 days old said no airdrop announced. **L** (stale).
- Could not run follow-up searches for shutdown news: the shared web search budget was exhausted. The X account @indexdotfun was not checked (no browser automation, X is not fetchable). Open question.

## What it was (M/L, from search summary only)

- Product: "Create and trade real world indexes" (index.fun title). Users create custom indexes (stocks, crypto, commodities, memes via live data feeds) and bid UP or DOWN in USDC on short rounds. Correct side shares rewards pro-rata by bid size, unresolved rounds refunded. Settles daily per official site text quoted by search. **L/M**
- Market model: binary (up/down on an index price), per directory. Mechanism per directory: continuous double auction (order book). Pari-mutuel-like payout was described by the airdrop/aggregator text. These two descriptions conflict; unresolved. Outcome tokenisation: NOT FOUND.
- Chain: Sonic (per predictionindex.xyz, **H** for that listing). Collateral: USDC (M/L).
- Audits: Sherlock contest "Index Fun Order Book Contest - 23,000 USDC" exists at https://audits.sherlock.xyz/contests/1197 (**H** for the title and reward only; dates, scope, repo not rendered). Rezolv Solutions also named as auditor (M/L). The order book was apparently a new service, so the order book may never have gone fully live. Sherlock repo `sherlock-audit/2025-*-index-fun*` not found in the org repo listing by name (searched for "index" in org repo names; only unrelated 2023/2024 Index repos).

## Read API

- exists: **none found** (searched: WebFetch of index.fun, app.index.fun both unreachable; GitHub search for index.fun/indexdotfun repos returned nothing relevant; no docs URL found).
- Base URLs: NOT FOUND. Docs URL: NOT FOUND. Websocket: NOT FOUND. Rate limits: NOT FOUND.
- On-chain: contract addresses on Sonic NOT FOUND (not in any source read).
- Fixtures: none saved (no endpoint to hit). `docs/research/fixtures/index-fun/` was created empty.

## Trade path

None documented. If live, trading would be via a web app wallet connection on Sonic. PayBox reach: Sonic is not in the list of chains known to be supported (Base, Ethereum, BNB, Arbitrum, Polygon, Solana), so **paybox_reachable: no** (M; Sonic support not verified, and the venue itself is unreachable).

## Fees, resolution, geo/ToS

- Fees: NOT FOUND. Resolution: described as daily settlement against index data feeds (L); oracle, dispute process NOT FOUND. Geo/ToS/automation: NOT FOUND (site unreachable).

## Liquidity and overlap

- Volume: "<$100k" at directory listing time (L, undated); predictionindex.xyz shows "n/a" (H, 2026-10-19). TVL/OI NOT FOUND.
- Event categories: index price up/down rounds on custom indexes. Not event contracts; little direct overlap with sports/politics/macro venues. Crypto price up/down could loosely overlap Polymarket/Limitless short-term crypto markets, but with custom index definitions it is not a clean arbitrage leg.
- Shared liquidity with another venue: no evidence of that (independent but thin).

## Suspicious content

None encountered.

## Open questions

- Is @indexdotfun on X announcing a shutdown or a new domain? Is there a replacement domain?
- Sonic contract addresses and whether the order book v2 ever launched (Sherlock contest 1197 repo/README).

## Sources

- https://predictionindex.xyz/ecosystem (H, fetched 2026-10-19)
- https://audits.sherlock.xyz/contests/1197 (H, title only)
- https://cloudflare-dns.com/dns-query?name=index.fun&type=A and https://dns.google/resolve?name=index.fun&type=SOA (H, NXDOMAIN 2026-10-19)
- https://web.archive.org/cdx/search/cdx?url=index.fun (H, 2024 captures)
- Web search summary results mentioning https://index.fun/ and https://airdrops.io/index-fun/ (M/L, not fetched directly)
