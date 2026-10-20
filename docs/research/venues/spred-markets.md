# spred.markets (SPRED) - venue spec

Research date: 2026-10-19. Read-only. Tags: H = read first-hand this session in a primary source (URL given), M = secondary/inferred, L = weak/stale.

## Verdict

- **adapter_priority: skip.** The site `spred.markets` does not resolve in DNS today, there is no API, no docs, no repo, and the only trace is a near-dormant Solana pump.fun memecoin whose description says "Polymarket intelligence terminal". Even if the terminal existed it would be a front-end on Polymarket (no independent liquidity), so it could never be an independent arbitrage leg.
- **still_live: false** for the product (domain returns no A/AAAA/CNAME record, so no site is being served). The token still trades in tiny size. Confidence medium: I could not read the X account (HTTP 402 from the fetch tool) and the web-search budget was exhausted, so I could not look for a shutdown/rebrand announcement.

## What it is (kind)

- Kind: **aggregator-or-data / "terminal" front-end for Polymarket**, tied to a Solana memecoin. Not a market venue. Has no market model of its own. (M - inferred from the token blurb; no product page could be read.)
- Self-description (token blurb, mirrored by CoinGecko and an asset list): "Discover. Trade. Track. Analyze. All in one place. No more jumping tabs, missing signals or juggling dashboards. One terminal. All the tools. Real edge. Welcome to the future of @Polymarket intelligence." (H, https://api.coingecko.com/api/v3/coins/spred, fetched 2026-10-19; also H, https://github.com/Xellar-Protocol/xellar-assets/blob/master/assets/spred_solana/info.json read via gh).
- Linked identifiers: homepage `https://spred.markets`, X account `useSpred`, Solana token mint `FRVCEaJuS8cuBTWR1JwVu35pBsKmHmt9n4LjSiF4pump` (H, CoinGecko JSON; DexScreener profile lists the same website and X account, H, https://api.dexscreener.com/latest/dex/tokens/FRVCEaJuS8cuBTWR1JwVu35pBsKmHmt9n4LjSiF4pump). The mint suffix `pump` means it was launched on pump.fun (M).
- CoinGecko categories: Prediction Markets, Solana Ecosystem, Pump.fun Ecosystem. CoinGecko adds its generic "liquidity-related risks / rug pull" additional notice. No GitHub, Telegram, Discord or whitepaper listed (H, CoinGecko JSON).

## Is it still live (2026)?

- **Domain does not resolve (H).** On 2026-10-19: `dig spred.markets A/AAAA/CNAME` and `www.spred.markets` return nothing (NOERROR, zero answers, also from the authoritative nameserver dns1.p01.nsone.net); `curl https://spred.markets` fails with "Could not resolve host". Evidence file: `docs/research/fixtures/spred-markets/dns-evidence.txt`.
- The zone still exists and is delegated to NS1 nameservers (dns1-4.p01.nsone.net) with SOA admin `domains+netlify.netlify.com`, serial 1762547147 (reads as 2025-11-07T20:25:47Z if it is a unix-time serial) (H, dig; the timestamp interpretation is M). That is consistent with a Netlify-managed domain whose site/records were removed or never published (M, inference).
- Token side: pump.fun launch pool created 2025-11-11T21:56Z, PumpSwap pool 2025-11-11T22:14Z, many Meteora pools 2025-11-11 to 2025-11-17 (H, https://api.geckoterminal.com/api/v2/networks/solana/tokens/FRVCEaJuS8cuBTWR1JwVu35pBsKmHmt9n4LjSiF4pump/pools). Last-24h activity on 2026-10-19: one sell, $42 volume, on the main PumpSwap pool (H, DexScreener and GeckoTerminal). CoinGecko market cap about $4.3k, 24h volume about $42.8, rank #9667, 66 watchlist users (H, CoinGecko web page and API, 2026-10-19). Note the CoinGecko page figures are internally inconsistent (price x supply does not equal market cap; many fragmented Meteora pools quote wildly different prices) so treat all token numbers as noise (M).
- X account `useSpred`: could not be read. WebFetch of https://x.com/useSpred returned **HTTP 402 Payment Required** with no body; per rules I stopped there and did not look for payment requirements or work around it. Recent post history therefore NOT FOUND.
- The product name "Spred" appears only as a ticker/blurb in token data. I found no independent coverage, docs, changelog, GitHub org or product page (see Not found).

## Market model, chains, collateral

- No market model (not a venue). If the terminal ever existed it would route to Polymarket (chain and collateral per the Polymarket spec from the parallel workflow, not re-verified here), so any market model would be Polymarket's, inherited not owned (M, inference from the blurb only).
- The only chain involved is Solana, for the SPRED memecoin (decimals 6, supply about 1B). That token is a speculative asset, not collateral for anything (H for chain/decimals from CoinGecko JSON; "not collateral" is M).

## Read API

- **exists: none.** NOT FOUND (searched: spred.markets does not resolve; no `api.`/`docs.` subdomain resolves (checked api.spred.markets, docs.spred.markets, app.spred.markets, www.spred.markets); GitHub repo search for "spred markets polymarket" and "useSpred" returned no repos; GitHub user `useSpred` is 404; GitHub code search for "spred.markets" returned only the Xellar asset-list entry; CoinGecko lists no repos or docs link).
- No base URLs, no rate limits, no websocket. Nothing to fixture except the third-party token data below.
- Fixtures saved (all third-party token metadata, none of it venue data), under `docs/research/fixtures/spred-markets/`:
  - `coingecko-coin-spred.json` - CoinGecko coin record (description, links, platform, mint).
  - `dexscreener-token-pairs.json` - DexScreener pair for the mint (website/social profile, liquidity, 24h volume).
  - `geckoterminal-pools.json` - GeckoTerminal pool list (pool creation dates, reserves).
  - `dns-evidence.txt` - DNS/curl evidence the site does not resolve.

## Trade path

- **none.** No order placement API, no contracts, no signing scheme documented (NOT FOUND, same searches as above). Not reachable via PayBox transaction proposals or signed orders as a venue. PayBox could only buy/sell the SPRED memecoin on a Solana DEX, which is irrelevant to this project (M).

## Fees

- NOT FOUND (no site, docs or terms readable). The only "fees" are the pump.fun / PumpSwap / Meteora pool fees on the memecoin, not relevant.

## Resolution mechanism and dispute risk

- Not applicable (no markets). If the terminal fronted Polymarket, resolution would be Polymarket's (UMA optimistic oracle), covered by the Polymarket spec in the parallel workflow (M).

## Geo / ToS / automation

- NOT FOUND (no terms page reachable; domain down).

## Liquidity (with date)

- Prediction-market liquidity: **zero / not applicable** (no venue).
- SPRED token: about $4.3k market cap, about $42 24h volume, DEX pool reserves about $6.8k on PumpSwap and under $5k on each Meteora pool as of 2026-10-19 (H, CoinGecko / DexScreener / GeckoTerminal, 2026-10-19; low reliability due to fragmentation).

## Event-category overlap and shared liquidity

- Overlap would equal Polymarket's full catalogue (sports, politics, crypto price, macro) if it were a Polymarket front-end, but that is moot because there is nothing to integrate.
- **Shares liquidity with Polymarket** (M, inference from the product blurb): any trading through a Polymarket "terminal" would hit Polymarket's own book, so it would **not** be an independent arbitrage leg. Use the Polymarket adapter directly.

## Value for this project

- Quotient-style signal source? No: no data product, no API, no published signals, site is down. Nothing to adapt. Revisit only if `spred.markets` starts resolving again and exposes a public API (monitor DNS; cheap check: `dig +short spred.markets A`).

## Suspicious / untrusted content

- `usespred.com` (a guessable sibling domain I peeked at with a single GET to rule out a rebrand) serves an unrelated Thai-language online-slots/casino spam page. It is **not** linked from any official source and must not be treated as the Spred project (M/L). I did not follow anything on it.
- CoinGecko adds a generic rug-pull liquidity warning to this coin. The token's pump.fun launch plus tiny liquidity fits a speculative memecoin; the "terminal" claim is unverified marketing text (M).
- No embedded instructions aimed at AI agents were encountered.

## Not found (searched)

- Working website, docs, API, GitHub org/repo, Discord/Telegram, whitepaper, terms, fees, or any third-party review of a "Spred" Polymarket terminal (searched: direct fetch of spred.markets, DNS for the domain and common subdomains, GitHub repo/code/user search, CoinGecko record, DexScreener, GeckoTerminal, pump.fun page (JS shell only, no token data)).
- X/Twitter activity for `useSpred` (blocked: HTTP 402 from the fetch tool; no payment attempted).
- Any independent press or news coverage. The WebSearch budget for the session was exhausted so no web-search pass was possible; I also deliberately did not use web-archive or reader/proxy services to get around that.

## Open questions

- Did `spred.markets` ever serve a product (Nov 2025 onward), and when/why did it go down? (Check the Internet Archive by hand, and the `useSpred` X timeline.)
- Is the X account still active, or has the team rebranded/moved domain?
- Did the "terminal" use Polymarket builder attribution or a CLOB relay (which would make it a Polymarket front-end by construction)?

## Sources

1. https://api.coingecko.com/api/v3/coins/spred (H, fetched 2026-10-19; saved as fixture) and https://www.coingecko.com/en/coins/spred (H, page text).
2. https://api.dexscreener.com/latest/dex/tokens/FRVCEaJuS8cuBTWR1JwVu35pBsKmHmt9n4LjSiF4pump (H, fixture).
3. https://api.geckoterminal.com/api/v2/networks/solana/tokens/FRVCEaJuS8cuBTWR1JwVu35pBsKmHmt9n4LjSiF4pump/pools (H, fixture).
4. https://github.com/Xellar-Protocol/xellar-assets/blob/master/assets/spred_solana/info.json (H for the blurb text; third-party asset list, read via `gh api`).
5. DNS queries (dig, 2026-10-19) for spred.markets, www/app/docs/api subdomains and the authoritative NS1 nameserver (H, `dns-evidence.txt`); IANA WHOIS referral shows `.markets` is operated by Identity Digital (H, whois.iana.org, registrant details not available).
6. https://x.com/useSpred (HTTP 402, unreadable; recorded, not pursued).
7. https://pump.fun/coin/FRVCEaJuS8cuBTWR1JwVu35pBsKmHmt9n4LjSiF4pump (returned only the generic site shell).
8. https://spred.markets (does not resolve).
