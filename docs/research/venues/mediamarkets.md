# MediaMarkets (mediamarkets.net) - venue spec

Researched 2026-10-19. Verdict: **skip**. Site is disabled, no repos, no docs, no API, no verifiable markets or liquidity. Appears to be an abandoned or token-launch-stage project.

## Liveness
- [H] `https://mediamarkets.net` and `https://www.mediamarkets.net` return HTTP 402 with body `Payment required / DEPLOYMENT_DISABLED` and header `x-vercel-error: DEPLOYMENT_DISABLED`, server Vercel, date 2026-10-19. This is Vercel's "deployment disabled" response (typically a suspended/over-limit/billing-disabled Vercel project), NOT an x402 payment challenge. There are no payment requirements to record.
- [H] `docs.mediamarkets.net` and `api.mediamarkets.net` return HTTP 404 `DEPLOYMENT_NOT_FOUND` (Vercel); no such deployments exist. DNS: nameservers ns1/ns2.vercel-dns.com, A records 216.150.16.193 / 216.150.1.193.
- [H] GitHub org `MediaMarkets` (https://github.com/MediaMarkets): type Organization, created 2026-01-02, last updated 2026-01-02, location "Germany", blog mediamarkets.net, **0 public repos**, 0 followers. Bio: "Turn any content into prediction markets. Build markets from predictions and trade on outcomes. CA: wZMFVr8fhA3qZjhSbUnFGZgtp3pRKibghivi29Fpump", twitter_username MediaMarketsSol.
- [H] The "CA" is a Solana-format address ending in "pump" (pump.fun-style vanity suffix), i.e. a memecoin contract address, not a market contract. DexScreener (`api.dexscreener.com/latest/dex/tokens/<CA>` and `/token-pairs/v1/solana/<CA>`) returns no pairs (`pairs: null` / `[]`); pump.fun frontend API returned 404 for the coin. So no trading pair is indexed. [M] consistent with a dead or never-launched token (could also be an API/indexing gap).
- NOT FOUND (searched: mediamarkets.net via curl/WebFetch, GitHub org + repo search "mediamarkets prediction", DexScreener, pump.fun API): any docs, whitepaper, app, API, contract, market list, volume, or fee schedule.
- NOT FOUND: independent coverage or X posts. X (x.com/MediaMarketsSol) WebFetch returned HTTP 402 (blocked); WebSearch budget was exhausted this session so no web search was possible. Treat any further liveness claim as unverified.

## Spec fields
- Kind: [L] onchain-other (Solana, per bio). Market model: NOT FOUND (no docs). Tagline implies user-generated markets from "content" but no mechanism is documented. Outcome tokenisation: NOT FOUND.
- Chains/collateral: [L] Solana implied only by the address format; collateral NOT FOUND.
- Read API: none found (`exists: none`). No base URLs, docs, auth, rate limits, websocket.
- Trade path: none found. PayBox reachability: no, nothing to propose or sign against (no known program ID or contract).
- Fees: NOT FOUND. Resolution mechanism / dispute risk: NOT FOUND.
- Geo/ToS/automation: NOT FOUND (site disabled).
- Liquidity: NOT FOUND; no volume/OI/TVL source. Liquidity sharing: unknown.
- Event overlap: unknown; no market list.

## Fixtures
None saved (no public API responses exist).

## Suspicious content
None embedded in fetched pages. Note: the bio's token address is a promotional memecoin pointer; do not treat as a venue contract.

## Sources
- [H] https://mediamarkets.net (402 DEPLOYMENT_DISABLED, 2026-10-19)
- [H] https://github.com/MediaMarkets (via `gh api users/MediaMarkets`, 2026-10-19)
- [H] https://api.dexscreener.com/latest/dex/tokens/wZMFVr8fhA3qZjhSbUnFGZgtp3pRKibghivi29Fpump (no pairs)

## Open questions
- Is the project relaunching on a different domain? Check @MediaMarketsSol on X manually.
- Re-check only if a real program ID or app URL surfaces.
