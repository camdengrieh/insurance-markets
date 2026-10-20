# AnyMarkets (any.markets) - venue spec

Researched 2026-10-19. Read-only. Tags: H = read first-hand in a primary source this session, M = secondary/inferred, L = weak/stale.

## Verdict

Adapter priority: **skip**. Liveness is NOT confirmed and probably negative: the only official domain serves an S3/CloudFront "NotFound" on every path, there is no docs host, no API host, no repo, and the only third-party directory entry was last verified 2026-03-25 and says chain, fees, volume, resolution are all unknown. Nothing here is integrable. Revisit only if the domain starts serving content.

## Liveness

- [H] `https://any.markets/` and `/index.html`, `/llms.txt`, `/robots.txt`, `/sitemap.xml`, `/markets`, `/docs`, `/api` all return HTTP 404, `content-type: application/xml`, `server: AmazonS3`, body `<Error><Code>NotFound</Code><Message>The resource you requested does not exist</Message>` fronted by CloudFront (2026-10-19). This is the signature of a CloudFront distribution pointing at an S3 bucket with no objects (or a deleted site), not an application error. `www.any.markets` same 404.
- [H] DNS: `any.markets` resolves to CloudFront IPs; nameservers are Cloudflare. `app.`, `docs.`, `api.any.markets` do NOT resolve (NXDOMAIN-style resolution failure).
- [H] pmwisdom.com lists it as "Active" but with data completeness 55%, "last verified March 25, 2026" (7 months old, possibly stale). One anonymous 1.0 review.
- NOT FOUND (searched: WebSearch "AnyMarkets any.markets prediction market" returned nothing for the domain; a second search for "AnyDotMarkets" could not run because the session search budget was exhausted; GitHub repo search for "any.markets" returned no matching repo).
- [H] X account `x.com/AnyDotMarkets` fetch returned HTTP 402 Payment Required (no body retrieved; nothing paid, stopped). Telegram `t.me/AnyDotMarkets` is linked from pmwisdom but not fetched. Account activity/recency therefore UNKNOWN.

## Name collision warning

`anymarket.net` ("anymarket", powered by "AnyBid"/"anybet") is a different thing: an aggregator over Polymarket, Kalshi and Limitless with a web app marked Live and a bonding-curve "native markets" feature marked "Coming soon" ([H] https://www.anymarket.net/ fetched 2026-10-19; its marketing claims are unverified). The site never mentions any.markets, so no relationship is established. Do not conflate the two. Any adapter for anymarket.net would be an aggregator (not an independent liquidity leg).

## Kind and market model

- [M] pmwisdom: "permissionless prediction market platform" where anyone can create binary outcome markets on memecoins, crypto prices, commodities, sports. Market types listed: event, prediction, meme coin, sports, commodity. Pricing mechanism (order book vs AMM vs parimutuel), outcome tokenisation: NOT FOUND (searched: pmwisdom page, any.markets paths, web search, GitHub search).

## Chains, collateral

NOT FOUND. pmwisdom explicitly lists "chain/blockchain not confirmed" as a data gap.

## Read API

exists: none found. No base URL, docs URL, endpoints, auth, rate limits or websocket found. NOT FOUND (searched: any.markets root/docs/api paths, docs/api subdomains, pmwisdom page, GitHub search). No fixtures saved (no API to sample).

## Trade path / PayBox reachability

NOT FOUND, so cannot be assessed. paybox_reachable = unknown (chain and trading mechanism both undisclosed). Do not assume EVM.

## Fees

- [M] Market creators earn 1% of total trading volume on their markets (pmwisdom). Trading/protocol fee formula, who pays: NOT FOUND.

## Resolution

NOT FOUND. pmwisdom flags "Resolution Risk" as a concern; permissionless creation of memecoin/sports markets implies creator- or oracle-defined resolution with dispute risk (M, inference only).

## Geo / ToS / automation

NOT FOUND (site has no content). pmwisdom lists it as unregulated (M).

## Liquidity

NOT FOUND (no volume/TVL reported anywhere). pmwisdom lists "low liquidity" as a risk flag (M, verified 2026-03-25).

## Event overlap / shared liquidity

Claimed categories (crypto prices, commodities, sports) would overlap Polymarket/Kalshi/Limitless in principle (M), but with no confirmed liquidity or API there is no arbitrage leg. Shared liquidity with another venue: unknown.

## Suspicious content

None found. pmwisdom footer links to /llms.txt (a directory index; contains no instructions aimed at AI in what was read). No instructions aimed at AI in the pmwisdom page or anymarket.net.

## Open questions

- Is the project defunct, rebranded or moved to another domain? (check X/Telegram when accessible without payment)
- Which chain and which contracts, if any?

## Sources

- https://pmwisdom.com/projects/anymarkets [H for what it says; its facts are M]
- https://pmwisdom.com/llms.txt [H]
- https://any.markets (and paths above) [H, 404]
- https://www.anymarket.net/ [H, different project]
- https://x.com/AnyDotMarkets [H: HTTP 402, no content]
- WebSearch "AnyMarkets any.markets prediction market" 2026-10-19 [H: no hit for domain]
