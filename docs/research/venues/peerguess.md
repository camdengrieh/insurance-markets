# Venue spec: Peerguess (GUESS)

Researched 2026-10-19. Tags: H = read first-hand in a primary source this session (URL given), M = secondary or inferred, L = weak or stale. "NOT FOUND (searched: ...)" means searched and absent, not guessed.

## Verdict

- **Adapter priority: skip.** There is no live venue to integrate. The official domain `peerguess.com` is a parked "This website is for sale!" page, the only on-chain artefact is a plain ERC-20 token (GUESS on Ethereum, deployed 2017-12-10) with no market logic, no DEX pool, no TVL, no API, no docs, no repo with code, and a dead whitepaper link. [H]
- The CoinMarketCap "prediction markets" row is a token listing, not a venue. The page itself shows price "$--" in the category table, no market cap and no volume. [H]
- Nothing here is useful as an arbitrage leg, a price signal or a resolution source. Re-check only if a new owner relaunches under a different domain (nothing indicates that).

## 1. Liveness [H unless noted]

| Check | Result | Source |
|---|---|---|
| Official site `https://peerguess.com/` | HTTP 200 parked-domain template, title "peerguess.com - This website is for sale! ...". `www.`, `docs.` and `app.` subdomains return the same page (wildcard parking). `peerguess.io`, `.app`, `.xyz` do not resolve. NS = `ns1/ns2.abovedomains.com` (parking provider). `last-modified` header 2026-10-15 is the parking template, not product content. | curl and WebFetch 2026-10-19; fixture `peerguess.com-parked-page.txt` |
| Whitepaper `https://peerguess.com/files/White%20Paper.pdf` (path listed on CoinMarketCap) | HTTP 441, empty body | curl 2026-10-19 |
| GitHub | Exactly one repo matches `peerguess` (`peerguess/peerguess.com`, "peerguess platform official website"): created and last pushed 2017-12-10, size 0, a single "Initial commit", no code. No org repos (`orgs/peerguess` 404). | `gh api` 2026-10-19; fixture `github-peerguess-repo.json` |
| Telegram `t.me/peerguess` | Exists; description "collaborative cryptocurrency ticker", 81 members. Post dates not visible. | WebFetch 2026-10-19 |
| X `@peerguess` | NOT CHECKED: WebFetch of `https://x.com/peerguess` returned HTTP 402 (no body, no payment requirements disclosed). Treated as the fetcher being blocked by X, not a venue paywall; stopped there per rules. | WebFetch 2026-10-19 |
| DefiLlama | No protocol named peerguess and none with symbol GUESS among 8,758 protocols from `https://api.llama.fi/protocols`. | curl 2026-10-19 |
| CoinGecko | `/api/v3/search?query=peerguess` returns empty lists; `/api/v3/coins/peerguess` and `/coins/guess` return `{"error":"coin not found"}`. The Blockscout token icon still points at an old CoinGecko asset (`coins/images/1743`), so it was listed once and is now gone. | curl 2026-10-19 |
| DexScreener | `GET /latest/dex/tokens/0xbdcf...` returns `{"pairs":null}`: no trading pair on any DEX it indexes. | curl 2026-10-19; fixture `dexscreener-no-pairs.json` |
| CoinMarketCap | `https://coinmarketcap.com/currencies/guess/` still shows a page: "PeerGuess is a cryptocurrency token that operates on Ethereum", price 0.00010377 USD (+2.41% 24h), supply 200,000,000, "60,537,668 in circulation" in the About text but "0 GUESS" in the stats block (internally inconsistent). No market cap or volume stated, no GitHub or docs link. The page does not say the project is inactive. | WebFetch 2026-10-19 (page text extracted by a summariser, M for exact numbers) |

Conclusion: the venue, if it ever operated as a market, is defunct. The only living thing is a stale listing on aggregator sites. [H for the observations, M for the inference]

## 2. Kind and market model

- Kind: **dead / token-only.** Not a prediction market in any form I can verify. [H that no market exists today]
- What it was supposed to be: the only primary-source hint is the Telegram description "collaborative cryptocurrency ticker" [H]. Combined with the name and the 2017-12 token date, it was probably a 2017-era ICO-style project for crowd-sourced crypto price guesses [L, inferred from name and Telegram blurb; whitepaper unavailable]. Any claim about order book vs parimutuel vs AMM, categorical vs scalar, or outcome tokenisation: NOT FOUND (searched: peerguess.com, whitepaper URL, GitHub repo, CMC page, Telegram page, DefiLlama, CoinGecko, DexScreener; web search budget was exhausted so no search-engine query was possible, and third-party archive services were not used).
- Outcome tokens: none. The verified contract exposes only ERC-20 functions plus `approveAndCall` and `version`; events are `Transfer` and `Approval` only. [H: Blockscout verified source, contract name `GUESS`, Solidity 0.4.19, verified 2019-04-24]

## 3. Chains and collateral [H]

- Ethereum mainnet only: token `0xBDCFbf5C4D91Abc0bC9709C7286d00063c0e6F22`, name/symbol GUESS, **2 decimals**, total supply 20,000,000,000 base units = 200,000,000.00 GUESS. Created in tx `0x66ad4efb5d9e21613fec37391be39ffe5c0b1f64de24283d5312ffc3f7a1e036` at 2017-12-10 15:13:06 UTC (block 4708923), by `0x0B59C683540c2e25d68f1FCd9D4e070aCF20f4Cb`. Source: `https://eth.blockscout.com/api/v2/tokens/0xbdcfbf5c4d91abc0bc9709c7286d00063c0e6f22`, `/addresses/...`, `/smart-contracts/...`, `/transactions/...`.
- 981 holders, 3,157 transfers; the single largest holder (`0xEF976b95629D4D46ff2d7a6384251Ab97B8a9Af5`, an EOA) holds 131,312,314.01 GUESS, about 65.7% of supply. Last transfer on the first page of transfers: 2024-11-05 01:50:11 UTC (2,290,669.33 GUESS from that holder to another EOA). Earlier visible transfers 2021-10-11, 2021-12-28/29, 2022-07-28. [H]
- Collateral: none. There is no market contract that takes collateral.

## 4. Read API

- **None.** exists = none. No official REST, GraphQL, websocket or subgraph. NOT FOUND (searched: peerguess.com and subdomains docs./app./www., GitHub repo contents, CMC links (X and Telegram only), DefiLlama, CoinGecko).
- The only machine-readable data is third-party explorer data about the ERC-20 token (Blockscout v2 REST, no key required). It is useful only to prove the token is idle; it carries no market data. Fixtures saved: `blockscout-token.json`, `blockscout-token-counters.json`, `blockscout-token-transfers-first5.json`.
- Response shape confirmed (Blockscout, third-party): token object keys `address_hash, circulating_market_cap, circulating_supply, decimals "2", exchange_rate, holders_count "981", icon_url, name "GUESS", reputation, symbol, total_supply "20000000000", type "ERC-20", volume_24h`; `exchange_rate`, `circulating_market_cap` and `volume_24h` are all null. [H]

## 5. Trade path

- **None.** No order placement, no signing scheme, no contract to propose transactions against. The only on-chain action possible is a plain ERC-20 `transfer`/`approve` of GUESS, which does not trade anything. [H]

## 6. PayBox reachability: **no**

- An EVM wallet (Ethereum) could hold or transfer GUESS, but there is no market, venue, pool, or order flow to reach, and no DEX liquidity (DexScreener: no pairs; Blockscout `exchange_rate` null). [H]

## 7. Fees

- NOT FOUND (searched: all sources above). No fee schedule exists. GUESS transfers cost normal Ethereum gas only. [H for the contract; the contract has no fee logic]

## 8. Resolution and dispute risk

- NOT FOUND. No oracle, resolver or dispute mechanism is on chain (ABI shows none) and no documentation is reachable. Any hypothetical market would have no defined resolution. [H for the contract, NOT FOUND for any off-chain mechanism]

## 9. Geo, ToS, automation

- Parked page links only to `/terms.html` and `/privacy.html` generic parking-provider pages (per WebFetch summary), which describe the domain, not a product. No geo rules, no automation rules. Not meaningful. [M]
- Trademark/name caution: the name could be reused by someone else after the domain sale. Do not assume a future "Peerguess" is the same entity. [M]

## 10. Liquidity [dated]

| Metric | Value | Source and date |
|---|---|---|
| TVL | none (not in DefiLlama) | `api.llama.fi/protocols`, 2026-10-19 [H] |
| DEX liquidity / pairs | none | DexScreener, 2026-10-19 [H] |
| Exchange rate (explorer) | null | Blockscout, 2026-10-19 [H] |
| CMC quoted price | 0.00010377 USD | CMC currency page, 2026-10-19 [M]; with 60.5M "circulating" that would be about $6.3K "market cap", but CMC shows no market cap or volume, and the figure is untraceable to any trading venue [L] |
| Token activity | 3,157 lifetime transfers, last 2024-11-05 | Blockscout [H] |
| Prediction volume / OI | none | NOT FOUND |

## 11. Event overlap for arbitrage

- None. No event markets exist. NOT FOUND (searched: site, whitepaper link, repo, listings).

## 12. Shared liquidity

- None to share. Not an independent arbitrage leg because it is not a venue.

## Not found (searched)

- Any live Peerguess product, app, docs, API, subgraph or market contract (peerguess.com and subdomains, GitHub, CMC, DefiLlama, CoinGecko, DexScreener, Blockscout).
- The whitepaper (CMC-listed path returns 441). Recovering it would need an archive service; not used under the session rules.
- Any search-engine corroboration of what the project did: WebSearch budget was exhausted when this task ran (two attempts refused), so no search-based evidence is included.
- X (`@peerguess`) content: fetch returned 402 and was not pursued.
- Telegram post history and dates (only the channel description and member count were visible).

## Open questions

- None that change the verdict. If the whitepaper were recovered it would tell what the 2017 concept was, but a defunct concept is not integrable.
- Optional follow-up for a human with search access: confirm via a search engine that no relaunch exists under another domain (the CMC listing still points to `peerguess.com`, so a relaunch would normally update it).

## Suspicious or agent-directed content

- None found. The parked page and API responses contained no instructions aimed at agents. The parked page carries a `data-adblockkey` attribute (parking-provider anti-adblock key), which is boilerplate and was ignored.

## Sources

- https://coinmarketcap.com/view/prediction-markets/ (row "PeerGuess GUESS", in the unranked block at the bottom, price "$--") [H]
- https://coinmarketcap.com/currencies/guess/ (project description, links to peerguess.com, X, Telegram; Ethereum contract) [H, summarised text]
- https://peerguess.com/ and `/files/White%20Paper.pdf` (parked / 441) [H]
- https://t.me/peerguess ("collaborative cryptocurrency ticker", 81 members) [H]
- https://github.com/peerguess/peerguess.com via `gh api repos/peerguess/peerguess.com` [H]
- https://eth.blockscout.com/api/v2/tokens/0xbdcfbf5c4d91abc0bc9709c7286d00063c0e6f22 (+ `/counters`, `/transfers`, `/holders`), `/addresses/0xbdcf...`, `/smart-contracts/0xbdcf...`, `/transactions/0x66ad...e036` [H, third-party explorer]
- https://api.llama.fi/protocols [H]
- https://api.coingecko.com/api/v3/search?query=peerguess and `/coins/peerguess`, `/coins/guess` [H]
- https://api.dexscreener.com/latest/dex/tokens/0xbdcfbf5c4d91abc0bc9709c7286d00063c0e6f22 [H]
- https://x.com/peerguess (HTTP 402 to WebFetch, no content) [not read]

Fixtures: `docs/research/fixtures/peerguess/` (blockscout-token.json, blockscout-token-counters.json, blockscout-token-transfers-first5.json, coingecko-coins-peerguess-404.json, dexscreener-no-pairs.json, github-peerguess-repo.json, peerguess.com-parked-page.txt).
