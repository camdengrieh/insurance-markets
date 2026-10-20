# Zethr: venue spec for the aggregator / arbitrage scanner

Researched 2026-10-19. Read-only: public unauthenticated GETs (DefiLlama, Blockscout, Medium RSS, Wayback availability), GitHub via `gh api`, WebFetch/WebSearch. Nothing was signed, posted or paid.

Confidence tags: **H** = read first-hand in a primary source this session, **M** = secondary or inferred, **L** = weak or stale. "(fetch-summarised)" = read through the WebFetch summariser, not raw.

## Verdict

**adapter_priority: skip.** Zethr is not a prediction market and is not a live venue. DefiLlama's "Prediction Market" label is wrong.

- Zethr was an Ethereum **casino dapp** (dice, penny-auction, slots) funded by a token bonding curve (ZTH) whose holders were "the house". The team announced its closure on **2018-10-29**: "Zethr is closing its proverbial doors" and "We've disabled the games on the website". [H, Medium RSS item "Zethr Blog #6 - The End", https://medium.com/feed/@zethr ; permalink https://medium.com/@zethr/zethr-blog-6-the-end-71333fa0572b (HTTP 403 to scripted fetch, text read from the RSS `content:encoded`)]
- Reason given: "the legal implications of running a fully-fledged business built on top of what could be considered a security leave us no choice." [H, same post]
- Tracxn lists it as "Deadpooled", founded 2018, "Decentralized online casino" (no shutdown date given). [M, https://tracxn.com/d/companies/zethr/__b_iMBLPkcGro4n8NjFfKJ_LVFngDS1uLWoZNqjCdyWY , fetch-summarised]
- Nothing in any source I read mentions outcome markets, events, oracles, sports or resolution. [H for the absence in the team's blog feed (6 posts, Aug-Oct 2018), the issue-tracker README and the verified contract source]
- What still exists is immutable contract state on Ethereum mainnet: a dormant bonding-curve token holding ~276 ETH that holders can still `sell` / `withdraw` / `exit` from. That is what DefiLlama's "TVL" measures. It is not tradable liquidity for any event.

The task hint "[L] Reads like a 2018-era casino dapp" is confirmed; the DefiLlama description "a decentralized prediction market where you can be the house" is a mislabel (the "be the house" tagline is the casino bankroll pitch).

## 1. Is it still live? (2026-10-19)

| Piece | Status | Evidence |
|---|---|---|
| Casino / games | Closed 2018-10-29 | H, Medium Blog #6 (above) |
| Official site `getzethr.com` | Does not resolve (`getaddrinfo ENOTFOUND`) | H, WebFetch 2026-10-19 |
| `zethr.io` | Domain now serves unrelated SEO/affiliate spam ("Best Crypto Presales to Join in 2025" in a 2025-08-24 Wayback snapshot; a 2026 fetch of `/the-zethr-plan/` returned garbled past-tense text dated 2019-07-09). Do not treat as official. | H (Wayback snapshot http://web.archive.org/web/20250824121206/https://zethr.io/), M (live fetch, garbled) |
| Medium blog `@zethr` | Last post 2018-10-29 | H, RSS lists 6 items, newest is Blog #6 |
| GitHub | Only `kryptoklob-deprecated/Zethr-Issue-Tracker` (issue tracker + contract sources; last push 2018-07-31, not archived, org name says deprecated). No active org found. | H, `gh api` |
| DefiLlama | Still lists "Zethr", id 4401, category "Prediction Market", chain Ethereum, `url: ""`, `twitter: null`, `audits: "0"`, no `deadFrom`/`deprecated` flag. TVL $668,251.79 = 276.332 WETH on 2026-10-19 (timestamp 1792377683). | H, https://api.llama.fi/protocol/zethr , https://api.llama.fi/protocols |
| Main contract on-chain | Verified, not self-destructed, 162,338 txs, 1,433 ZTH holders, balance 276.161 ETH (~$668k at the $2,420.63 Blockscout rate). Latest top-level txs: `exit` 2026-10-14, 2026-10-11, 2026-10-10, 2026-10-09; `sell`/`withdraw` bursts 2026-09-27; two dust `buyAndSetDivPercentage` txs of 0.001 and 0.002 ETH on 2026-07-28. | H, https://eth.blockscout.com/api/v2/addresses/0xD48B633045af65fF636F3c6edd744748351E020D (+ `/counters`, `/transactions`) |

DefiLlama's WETH balance for Zethr has drifted down slowly (281.09 on 2024-03-29, 279.6 mid-June 2026, 276.33 on 2026-10-15), i.e. it is a slow bleed of holder exits, not growth. [H, same API, `tokens` series]

## 2. What it actually is (market model: none)

- Not binary / categorical / scalar, not order book, not AMM-for-outcomes, not parimutuel. There are no outcome tokens. [H]
- Core contract `Zethr` (ZTH, ERC-20, 18 decimals, verified Solidity 0.4.24, verified 2019-04-24): a **pyramid-style bonding curve with variable dividend rates**. `tokenPriceInitial_ = 0.000653 ether`, ICO hard cap 250 ETH, per-address ICO limit 1 ETH, `referrer_percentage = 25`. Functions include `buy`, `buyAndSetDivPercentage`, `buyAndTransfer`, `sell`, `withdraw`, `exit`, `reinvest`, `transferTo` (ERC-223-style call into game contracts), `changeBankroll`, `injectEther`. [H, https://eth.blockscout.com/api/v2/smart-contracts/0xD48B633045af65fF636F3c6edd744748351E020D ; also https://github.com/kryptoklob-deprecated/Zethr-Issue-Tracker `Zethr.sol`]
- Original design games (from the project README): ZethRoll (dice, "akin to Etheroll"), ZethHell (penny-auction), a ZethrBankroll multisig that whitelists game contracts to pull ETH, and ERC-721 "dividend cards". [H, https://github.com/kryptoklob-deprecated/Zethr-Issue-Tracker README.md]
- Chain and collateral: Ethereum mainnet, native ETH (DefiLlama reports it as WETH). [H]
- Total supply of ZTH: 207,841.79 tokens (18 decimals; `207841792567783541601159` raw). [H, Blockscout token endpoint]

Lookalike contracts found by Blockscout name search (not verified to be related to the original team; do not assume they are):
- `0xb9ab8Eed48852DE901C13543042204c6C569B811` "ZethrGame" (ZTHG, ERC-20): verified source is a Zethr fork whose banner points at `zethr.game`, holds 111.68 ETH, 46,637 txs, 224 holders, newest top-level tx `withdraw` 2026-03-31 (older ones are `setPercentage`, `exit`, `transferTo`). Also a bonding-curve/dividend token, not a prediction market. [H for the numbers, L for who runs it]
- `0x5340b3893c8BAb2ADCe3Cb0DEBa09A369c6b69d4` (another "Zethr" ZTH): 0.31 ETH, 458 txs, 0 holders. Dead. [H]
- ERC-721 "ZethrDividendCard" `0x5a1DbFF1a772bC35F53C77509B4dC1624c65e6Ec` (8 supply) and "ZethrGameDividendCard" `0xD532375971258953263218994966e2a0a3d5C18A` (8 supply). [H]
- These are listed so the scanner does not mistake a Blockscout search hit for a Zethr market; none is an outcome venue.

## 3. Read API

- **exists: none official.** No docs site, no REST API, no websocket, no subgraph found. NOT FOUND (searched: getzethr.com [no DNS], zethr.io [spam], Medium feed, GitHub repo search "zethr", the issue-tracker repo contents).
- Third-party only: DefiLlama `GET https://api.llama.fi/protocol/zethr` (TVL history, 936 daily points since 2024-03-29) and Blockscout `GET https://eth.blockscout.com/api/v2/addresses/{addr}[/counters|/transactions]`. Both public, unauthenticated, no key. Rate limits not documented in what I read (NOT FOUND). [H]
- DefiLlama's adapter source for `zethr/index.js` could not be located (tried `projects/zethr.js`, `projects/zethr/index.js`, `zethr/index.js` in DefiLlama/DefiLlama-Adapters via `gh api`; all 404). The `tvlCodePath` is the generic `registries/sumTokens.js`. Balance matches the main contract's ETH balance to within 0.2 ETH, so the TVL is that single contract's balance. [H for the match, M for the inference]
- Fixtures saved (all <=50 KB): `docs/research/fixtures/zethr/defillama_protocol_zethr_trimmed.json`, `.../blockscout_zethr_contract_trimmed.json`, `.../medium_zethr_blog6_the_end.json`.

## 4. Trade path / PayBox reachability

- Programmatic trading of outcomes: **none** (there are no outcomes). The only callable surface is the ZTH bonding-curve contract (`buy`, `sell`, `exit`, `withdraw`, ...) via ordinary Ethereum mainnet transactions; no signed-order scheme. [H]
- An EVM wallet reachable through PayBox on Ethereum could technically submit those transactions, but there is nothing to arbitrage or quote against another venue, and buying ZTH is an unrelated, high-risk token position. **paybox_reachable: no** (for the purposes of this project).
- Nothing was submitted or signed during this research.

## 5. Fees (token contract, not a trading venue)

- Buyers choose a dividend rate from the set 2, 5, 10, 15, 20, 25, 33 percent; the rate is taken from each buy and distributed to existing holders; selling applies the average of the seller's buy-in rates. [H, issue-tracker README; M that deployed code matches exactly]
- 1% of every regular-phase buy goes to the two dividend-card holders (0.5% each); 25% of the dividend portion goes to a referrer if they hold enough tokens (`referrer_percentage = 25` confirmed in verified source). [H README, H constant in source]
- No taker/maker fee schedule exists because there is no order book.

## 6. Resolution mechanism and dispute risk

None. No events, no oracle, no resolution. The closest "risk" is that the bonding curve is a dividend-redistribution scheme whose own team cited securities-law exposure as the reason to shut down (quote above). [H]

## 7. Geo / ToS / automation

NOT FOUND (searched: getzethr.com, zethr.io, Medium feed, GitHub). No ToS or API-usage rules survive. The only legal statement is the 2018 closure rationale. [H for the absence]

## 8. Liquidity

- 276.161 ETH (~$668k) sitting in the ZTH contract; DefiLlama TVL $668,251.79, both 2026-10-19. [H, Blockscout + DefiLlama]
- That is holder-redeemable reserve in a one-contract bonding curve, not tradable depth on any market. Sell price moves with supply, so the reserve is not an order-book quote. [M]
- ZTHG lookalike: 111.68 ETH, 2026-10-19 (Blockscout). [H]
- No volume or OI exists to report.

## 9. Event categories and overlap with other venues

None. No sports, politics, crypto-price or macro markets. Zero arbitrage surface. [H]

## 10. Shared liquidity

Not applicable. It shares nothing with another venue and is not a leg.

## 11. Aggregator guidance

- **Do not build an adapter.** Recommend the registry mark `zethr` as `status: dead`, `kind: casino-token (not prediction market)` and exclude it from the active scan.
- If the discovery pipeline keys off DefiLlama's "Prediction Market" category, add a deny-list entry for DefiLlama id 4401 (and any DefiLlama entry with empty `url` and null `twitter`) so it does not resurface.
- Optional liveness check if someone revisits: poll `GET https://eth.blockscout.com/api/v2/addresses/0xD48B633045af65fF636F3c6edd744748351E020D/counters` for `transactions_count` growth (162,338 on 2026-10-19). Growth alone would only mean holder exits or dust buys; it would not indicate a venue relaunch.

## Suspicious / untrusted content

- `zethr.io` (the old project domain) now hosts affiliate-style crypto "presale" promotional content, unrelated to Zethr; the archived 2025-08-24 snapshot lists pump-style token presales with "2,000% APY" claims. No instructions aimed at AI agents seen. Treat the domain as hijacked / squatted; never use it as an official source. [H for the snapshot content]
- The verified source of the `ZethrGame` (ZTHG) lookalike carries an ASCII-art banner repeating `https://zethr.game`. Unaffiliated as far as I can tell; domain not visited. [L]

## Limitations

- WebSearch budget for the session ran out after two searches, so I did not run extra searches for a 2026 relaunch or rebrand. Evidence against one: the project's own feed ends in 2018, the old domains are gone or squatted, GitHub has no active org, and on-chain activity is exit/withdraw dust only. [M]
- Medium blocks scripted page fetches (HTTP 403); the RSS feed text was used instead.
- Wallet addresses of individual developers (present in the public contract code) are deliberately omitted.

## Sources

- https://api.llama.fi/protocols and https://api.llama.fi/protocol/zethr [H]
- https://eth.blockscout.com/api/v2/search?q=Zethr , /addresses/0xD48B633045af65fF636F3c6edd744748351E020D (+ /counters, /transactions), /tokens/0xD48B..., /smart-contracts/0xD48B..., and the ZTHG / 0x5340... address pages [H]
- https://medium.com/feed/@zethr (6 posts, newest 2018-10-29) and https://medium.com/@zethr/zethr-blog-6-the-end-71333fa0572b [H via RSS]
- https://github.com/kryptoklob-deprecated/Zethr-Issue-Tracker (README.md, Zethr.sol) [H]
- https://tracxn.com/d/companies/zethr/__b_iMBLPkcGro4n8NjFfKJ_LVFngDS1uLWoZNqjCdyWY [M]
- http://web.archive.org/web/20250824121206/https://zethr.io/ and https://zethr.io/the-zethr-plan/ (squatted domain; evidence of takeover only) [H/M]
- WebSearch result list (2018-era Medium / Steemit / BitcoinTalk / DappRadar pages, DappRadar returned HTTP 403 to fetch): https://dappradar.com/ethereum/gambling/zethr , https://bitcointalk.org/index.php?topic=4804187.0 [L, search-result titles only]
