# Diviner Protocol (DPT): venue spec for the aggregator / arbitrage scanner

Researched 2026-10-19. Read-only: CoinMarketCap pages, DNS and RDAP lookups, public Telegram preview pages, GeckoTerminal / DexScreener / DefiLlama / CoinGecko public GETs, GitHub code search via `gh`. Nothing was signed, posted, paid or installed. No JSON-RPC calls were made (POSTs are out of scope), so no on-chain state was read directly.

Confidence tags: **H** = read first-hand in a primary or authoritative source this session, **M** = secondary or inferred, **L** = weak or stale. "(fetch-summarised)" = read through the WebFetch summariser, not raw.

Limits of this pass: the shared WebSearch budget ran out after one search, so there was no independent news corroboration. BscScan, CryptoRank and the CertiK Skynet page were not readable (HTTP 403 / 404). `x.com/DivinerProtocol` returned HTTP 402 to the fetcher; recorded and stopped, nothing paid. Web-archive services were not used. The project's whitepaper and docs could not be read because their domain no longer resolves (see section 1).

## Verdict

**adapter_priority: skip. still_live: false (confidence high).**

- Every official web property hangs off `diviner.finance`, and that domain does not resolve (NXDOMAIN). The registry record shows `clientHold` (registrar-imposed DNS suppression). So the app, docs and whitepaper are all unreachable. [H]
- The only active-looking artefact is the DPT token: GeckoTerminal shows zero trades in 24h on every pool and about $1.1k to $2.2k of total pool reserves. [H, 2026-10-19]
- The Telegram announcements channel's last post is 2023-11-30, a promotional TaskOn "500,000 DPT reward" campaign for a "Diviner Metaverse". The project's own self-description had drifted from "prediction marketplace" to "metaverse". [H]
- No API, no subgraph, no repo, no listing on DefiLlama, no DexScreener pairs. Nothing to integrate. [H]
- Nothing in the evidence shows that a prediction market with real positions ever launched. CryptoTotem (via the search snippet, L) listed a derivatives launch planned for Sep 2022 and an IDO on 2021-11-26 at 0.015 USD. [L]

Revisit trigger (cheap, scriptable): `dig +short A app.diviner.finance` returns an address again, or a new post appears at `https://t.me/s/DivinerProtocol_News` dated after 2023-11-30. Otherwise do not revisit.

## 1. Is it still live? (piece by piece)

| Piece | Status 2026-10-19 | Evidence |
|---|---|---|
| diviner.finance, www., app., docs. | **NXDOMAIN / no A record.** `curl` gives "Could not resolve host". | H: `dig`, `curl`; fixture `dns-and-negative-checks.txt` |
| Domain registry record | Registered 2021-09-15, transferred 2021-11-22, expiration 2027-09-15, last changed 2026-09-15. Status: `client hold`, `client delete prohibited`, `client transfer prohibited`, `auto renew period`. A `clientHold` is set by the registrar and removes the domain from DNS; the reason (non-payment, abuse report, owner action) is not visible. | H: RDAP `https://rdap.identitydigital.services/rdap/domain/diviner.finance`; fixture `rdap-diviner-finance-trimmed.json`. Interpretation of the hold: M |
| GitBook space | `https://diviner-protocol.gitbook.io` answers HTTP 307 to `https://docs.diviner.finance/`, i.e. back to the dead custom domain. `/llms.txt` and `/robots.txt` redirect the same way. No docs content is reachable. | H: `curl -I` |
| Telegram group `t.me/DivinerProtocolOfficial` | Exists: "5 132 members, 58 online" (counts are not proof of activity). Bio: "aims to build up a gamified & diversified prediction marketplace", website `https://app.diviner.finance/`. Last-message date not readable (no public preview). | H: `https://t.me/DivinerProtocolOfficial`; fixture `telegram-channel-meta.json` |
| Telegram announcements `t.me/DivinerProtocol_News` | 3,150 subscribers. Preview shows 20 posts, 2023-10-31 to 2023-11-30; last two are the TaskOn reward campaign and a retweet. Bio there reads "gamified & diversified **metaverse**". No post in the 23 months since. | H: `https://t.me/s/DivinerProtocol_News` |
| X / Twitter `@DivinerProtocol` | NOT READ: fetcher got HTTP 402. | H (402 recorded) |
| GitHub | No org or user `DivinerProtocol` (404). Code search for `"diviner.finance"` finds only third-party token lists (Beefy, PancakeSwap forks) | H: `gh api` |
| CoinMarketCap `/currencies/diviner-protocol/` | Page labelled "This is a preview page"; circulating supply 0, price not shown; UCID 13841. In the prediction-markets category table it sits in the unranked block with price "$--" and no market cap or volume. | H (fetch-summarised): https://coinmarketcap.com/currencies/diviner-protocol/ and https://coinmarketcap.com/view/prediction-markets/ |
| CoinGecko API | `/coins/diviner-protocol` returns 404 `coin not found` (one earlier call hit a 429). Whether CoinGecko lists it under another id is unknown. | H: fixture `dns-and-negative-checks.txt` |
| DefiLlama | **NOT FOUND**: 8,758 protocols scanned, none with "diviner" in name, slug, url or twitter. | H: `https://api.llama.fi/protocols`, 2026-10-19 |
| DexScreener | `{"schemaVersion":"1.0.0","pairs":null}` for the DPT token (no indexed pairs). | H: `https://api.dexscreener.com/latest/dex/tokens/0xe69caef10a488d7af31da46c89154d025546e990` |
| DPT token (BNB Smart Chain) | Exists, 1B supply, 32,235 holders, top-10 holders own 94.8% (as of 2026-10-18). | H: GeckoTerminal; fixture `geckoterminal-bsc-dpt-info.json` |
| Bitget "what is" page | Says the price "has not been updated or has stopped updating"; ATH $0.07290; FDV $45,287.94 (stale). Text is generic machine-written filler, low value. | M (fetch-summarised): https://www.bitget.com/price/diviner-protocol/what-is |

Net: the venue is dead or abandoned as a prediction product. The 2026 liveness evidence is the DNS failure, the registry hold, the zero-volume token and the silent announcement channel.

## 2. Kind and market model

- **Kind:** other. A GameFi / "metaverse" token project with a stated intention to run a gamified prediction marketplace. [M] The CMC description says it "combines DeFi and NFT concepts into a prediction and play-to-earn ecosystem", tagline "Free to predict, predict to earn". [H, fetch-summarised: CoinMarketCap page]
- **Market model (binary / categorical / scalar; order book / AMM / parimutuel; outcome tokenisation):** NOT FOUND (searched: CoinMarketCap page, Bitget page, Telegram bios and the 20-post announcements preview, GeckoTerminal token info, GitHub code search, DefiLlama). The whitepaper at `docs.diviner.finance` is the only likely source and is unreachable. I will not guess.
- Token features listed in a search snippet (L): LP staking rewards, prediction reward shares, buy-back and burn. [L, from WebSearch snippet of other sites, not read first-hand]

## 3. Chains and collateral

- **Chain:** BNB Smart Chain (chain id 56) for the DPT token. [H: GeckoTerminal token id `bsc_0xe69c...`; Beefy address book `chainId: 56`]
- **DPT token contract:** `0xe69caef10a488d7af31da46c89154d025546e990`, 18 decimals, total supply 1,000,000,000. [H]
- **Prediction-market contracts:** NOT FOUND (searched: GitHub code search, token pages, docs, CMC). No address for any market, pool or oracle contract was found.
- **Collateral for markets:** NOT FOUND.
- CryptoTotem (via search snippet) calls the token an ERC-20 from a Vietnam-registered team; the on-chain data says BSC. Treat the snippet as unreliable. [L]

## 4. Read API

**Exists: none.** Classification `none`.

- Official docs: unreachable (`docs.diviner.finance` NXDOMAIN). [H]
- Base URLs: none live. The Telegram bios reference `app.diviner.finance` (app) only; no API host named anywhere I could read. [H]
- Key endpoints for markets, prices/books, trades, resolution: NOT FOUND (searched: all of the above plus DexScreener, which has no pairs, and DefiLlama, which has no entry).
- Auth, rate limits, websocket: not applicable.
- The only machine-readable data about the project is token-level (GeckoTerminal) and is useless for market arbitrage. Sample shapes are saved anyway as evidence of death, not as an integration target.

### Fixtures (docs/research/fixtures/diviner-protocol/)

- `geckoterminal-bsc-dpt-pools.json` (8.2 KB): `GET https://api.geckoterminal.com/api/v2/networks/bsc/tokens/0xe69caef10a488d7af31da46c89154d025546e990/pools`, 2026-10-19. Six PancakeSwap v2 / BakerySwap pools, all with `volume_usd.h24 = 0.0` and zero transactions. Largest is DPT/WBNB (`0x141e...2c24`, created 2021-12-16), reserve about $2,177, token price about $0.0000154. [H]
- `geckoterminal-bsc-dpt-info.json` (1.2 KB): `.../tokens/<addr>/info`. Website `https://diviner.finance/`, telegram `DivinerProtocolOfficial`, twitter `DivinerProtocol`, description "aims to build up a gamified & diversified prediction marketplace", 32,235 holders, top 10 hold 94.79%, `gt_verified: false`. [H]
- `rdap-diviner-finance-trimmed.json`: registry status and events (entities and notices removed). [H]
- `telegram-channel-meta.json`: group / channel bios, member counts and the date range of the announcements preview. [H]
- `dns-and-negative-checks.txt`: DNS failures, DexScreener null pairs, DefiLlama / CoinGecko negatives, the x.com 402. [H]

## 5. Trade path

None. No order API, no documented contract ABI, no live frontend. A BSC wallet could swap the DPT token on PancakeSwap v2, but that is a token swap into a near-zero-volume asset, not a prediction-market position. [H for token pools; the absence of any market interface is H-by-absence]

## 6. PayBox reachability

**paybox_reachable: no.** An EVM wallet on BNB Chain is technically able to hold or swap DPT, so chain support is not the blocker. The blocker is that there is no prediction market to trade: no live app, no documented contracts, no API. [H]

## 7. Fees

NOT FOUND (searched: all reachable pages). Only the token's buy-back-and-burn and LP-reward features were mentioned in a search snippet. [L]

## 8. Resolution mechanism and dispute risk

NOT FOUND. No oracle, no dispute process, no contract described anywhere readable. Dispute risk cannot be assessed, which for an aggregator means "treat as unresolvable".

## 9. Geo / ToS / automation

NOT FOUND (the site and any ToS page are unreachable). Registration claims from a third-party snippet say the team is Vietnam-registered. [L]

## 10. Liquidity (all dated 2026-10-19 unless noted)

- Prediction-market volume / OI / TVL: **none found**. DefiLlama has no entry. [H]
- DPT token pools (GeckoTerminal): DPT/WBNB reserve about $2,177 (token-level total reserve reported as about $1,113), 24h volume $0, 24h transactions 0 on all six pools. [H]
- Token FDV about $15.4k (GeckoTerminal, 2026-10-19). Bitget shows FDV $45,287.94 and ATH $0.0729 but the figures are stale. [H / M]
- CMC shows market cap "not listed", circulating supply 0. [H]
- Holder concentration: 32,235 holders, top 10 own 94.8% (GeckoTerminal, 2026-10-18). [H]

## 11. Event categories overlapping other venues (arbitrage relevance)

NOT FOUND. No market list exists in any readable source, so no sports / politics / crypto-price / macro overlap can be claimed. Arbitrage value: none.

## 12. Shared liquidity

Not applicable. No market liquidity exists, so it is not an independent arbitrage leg and not a duplicate of any other venue.

## 13. Open questions

- What did the 2022 prediction product actually look like, and did it ever go live with real positions? The whitepaper is the only source and is behind the dead domain. A web-archive lookup of `docs.diviner.finance` could answer it but was out of scope for this pass.
- Why is `diviner.finance` under `clientHold`? Cause is not visible from RDAP.
- Is the DPT token on CoinGecko under a different id? `diviner-protocol` returns 404.

## Suspicious content

No instructions aimed at AI agents were found. Items worth noting as low-quality or promotional content only:

- The Bitget "what is" page opens with machine-generated filler (fetch-summarised report quotes "Sure, here you go:"), not an instruction to this agent.
- Telegram announcements promote a TaskOn campaign ("Share 500,000 DPT reward") with a link; not followed.

## Sources

- https://coinmarketcap.com/view/prediction-markets/ (H, fetch-summarised): row for Diviner Protocol, unranked, "$--"
- https://coinmarketcap.com/currencies/diviner-protocol/ (H, fetch-summarised): preview page, description, links, UCID 13841
- https://api.geckoterminal.com/api/v2/networks/bsc/tokens/0xe69caef10a488d7af31da46c89154d025546e990/pools , `/info` and the token root (H): pools, volume, holders, website
- https://rdap.identitydigital.services/rdap/domain/diviner.finance (H): registry status and dates
- https://t.me/DivinerProtocolOfficial , https://t.me/DivinerProtocol_News , https://t.me/s/DivinerProtocol_News (H): bios, member counts, post dates
- https://diviner-protocol.gitbook.io (H): 307 redirect to `docs.diviner.finance`
- https://api.dexscreener.com/latest/dex/tokens/0xe69caef10a488d7af31da46c89154d025546e990 (H): `pairs: null`
- https://api.llama.fi/protocols (H): no match
- https://api.coingecko.com/api/v3/coins/diviner-protocol (H): 404
- https://www.bitget.com/price/diviner-protocol/what-is (M, fetch-summarised): stale price notice
- https://github.com/beefyfinance/beefy-api (`packages/address-book/src/address-book/bsc/tokens/tokens.ts`, read via `gh api`) (H): DPT token entry, chainId 56, website `https://www.diviner.finance/`
- WebSearch "Diviner Protocol DPT prediction market" (L): snippets referencing CryptoTotem (IDO 2021-11-26, derivatives planned Sep 2022), Bitget, BscScan, CryptoRank; those pages were not all readable
- Not readable: BscScan (403), CryptoRank (403), CryptoTotem (404 on direct fetch), CertiK Skynet (404), x.com (402)
