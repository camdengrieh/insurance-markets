# OracleX (OEX): venue spec for the aggregator / arbitrage scanner

Researched 2026-10-19. Read-only: official sites, official whitepaper PDFs, public GitHub (via `gh api`), public unauthenticated GETs to DexScreener, GeckoTerminal, CoinGecko and Telegram's public channel preview. Nothing was signed, posted, paid, or created. No Cloudflare challenge was bypassed.

Confidence tags: **H** = read first-hand in a primary source this session, **M** = secondary or inferred, **L** = weak or stale.

## Verdict

**adapter_priority: skip.** No evidence of a functioning, integrable prediction market on 2026-10-19.

- The only verifiable on-chain footprint is a plain BEP-20 token (OEX). It trades about $1 per day on a single PancakeSwap v2 pool. [H, DexScreener, fixture `dexscreener-oex-token-pairs.json`]
- No market contract address, no ABI, no API, no SDK and no docs site for the prediction product could be found. The whitepaper is a design, not a spec. [H, see "NOT FOUND"]
- The dapp (`oraclex.market`) sits behind a Cloudflare managed challenge (HTTP 403, `cf-mitigated: challenge`) for non-browser clients, so even its existence as a working app was not verifiable. I did not bypass it. [H, fixture `oraclex-market-cloudflare-challenge-headers.txt`]
- The project's own Telegram channel switched in Aug 2026 to teasers for a different brand, "Future Station", then posted a "Global Ecosystem Strategy Upgrade" (2026-09-20) and an "Official Reminder, beware of unofficial project information" about rumours (2026-09-29). The token hit its all-time low on 2026-10-01. [H, Telegram preview page; H, CoinGecko] This reads as a pivot or wind-down (M).
- Even if it were running, the design is user-created pools settled by votes with a project-minted stablecoin (USDX) that can only be minted by staking OEX. That is not an independent, tradable price leg for an arbitrage scanner. [M]

**Revisit trigger (cheap, scriptable):** (a) DexScreener `h24` volume on pair `0xCf0270Ff8021ec98dB24bab9E9e35EaCB0E392CF` rising above dust; (b) a published market contract address or API on oraclex.ai / oraclex.club; (c) a relaunch post in the Telegram channel `OracleX_Channel_EN`.

## 1. Identity and is-it-live

| Item | Finding | Tag / source |
|---|---|---|
| Official site | https://oraclex.ai/ (marketing site, 9 languages, links to "DAPP", whitepapers, X, Telegram). Listed as official on both CoinMarketCap and CoinGecko. | H: https://oraclex.ai/ , https://coinmarketcap.com/currencies/oraclex/ (fetch-summarised), CoinGecko API fixture |
| Dapp | https://oraclex.market/ (linked from oraclex.ai). HTTP 403 Cloudflare managed challenge for curl and WebFetch. Content unknown. | H (headers); content NOT FOUND |
| Knowledge base | https://oraclex.club/ ("Oracle X Database"): marketing/media hub, no trading docs. Its only API reference is `https://api.oraclex.club/api/queryData`, a CMS feed for media cards (from inline page script), not market data. Not probed. | H: page source |
| Token | OEX, BNB Smart Chain, `0xB1A3810fCe5678128B6a61A41871Ea344B938e76`, 10B supply, 18 decimals | H: CoinGecko API (`platforms`), GeckoTerminal fixture |
| X account | Site links `https://x.com/OracleX_Ai`; CMC lists `https://twitter.com/OEXCHAIN` (mismatch; two accounts or a rebrand). WebFetch on x.com returned HTTP 402; body not retrieved. | H (the link lists), activity NOT FOUND |
| Telegram | Channel `OracleX_Channel_EN`: 125 subscribers; group `OracleX_Group_EN`: 959 members (public preview, 2026-10-19). Daily "good morning" posts through 2026-08-20, then a gap, then 2026-09-20 and 2026-09-29 announcements. | H: https://t.me/s/OracleX_Channel_EN , https://t.me/OracleX_Group_EN |
| Launch | "Global public beta" announced for 2025-12-01 (press release via GlobeNewswire/Bitget/ChainCatcher). Pancake pair created 2025-12-02. | M: Bitget repost https://www.bitget.com/news/detail/12560605089689 (WebFetch of GlobeNewswire itself returned 403); H: DexScreener `pairCreatedAt` |
| Token price path | ATH about $0.13 (CoinGecko, 2025-12-15) / $0.1771 (CMC, 2025-12-02); ATL $0.00001093 on 2026-10-01; now $0.000011. About -99.99% from the 0.1 USDT "initial offering price" the site states. | H: CoinGecko fixture; M: CMC (fetch-summarised) |

Name collisions (not this venue): oraclex.io = "AI Lead Generation", oraclex.app = "AI-Powered Trading Journal", oraclex.com = domain for sale, oraclex.xyz = stub redirect. GitHub also hosts unrelated hackathon projects called OracleX (on Shardeum, on 0G, others). [H: page titles and `gh api search`, 2026-10-19]. Do not confuse with Quotient or other "oracle" venues.

## 2. What it claims to be

- Self-description: "the world's first decentralized collective consensus platform based on swarm intelligence"; Proof-of-Contribution / Proof-of-Behavior (PoC / PoB) mining that pays OEX to users who make predictions. [H, https://oraclex.ai/ strings, fixture `oraclex-ai-site-strings-en.js`; whitepaper]
- Dual token: **OEX** (10B fixed supply, governance/equity, "1 OEX = 0.1 USDT initial offering price") and **USDX** (platform stablecoin "1 USDX = 1 USDT", "used for prediction voting settlement"). USDX "cannot be purchased directly; it must be minted by staking OEX", ratio dynamic 10% to 50%, with a "120% digital vault" / Central Reserve Fund of USDT claimed as backstop. [H, site strings + academic whitepaper]
- Roadmap claims (not evidence of delivery): Phase 1 Q4 2025 contract audit, mainnet, basic prediction trading; Phase 2 Q1-Q2 2026 diversified markets, "complete SDK and development documentation", $200k average daily volume; Phase 3 Q3-Q4 2026 AI discovery, $1M average daily volume. [H: site strings, as claims]. Reality check: SDK/docs NOT FOUND; token volume about $1/day.

## 3. Kind and market model

kind: **other** (token-incentivised, user-created prediction pools; not a CLOB, not an AMM with a public pool contract).

- Event types claimed: binary (Yes/No, settle 0 to 1), scalar, categorical; roadmap items: index, conditional and range predictions. Categories claimed: sports, crypto, politics, entertainment, social hotspots. [H as a claim: site strings]. No actual market list was reachable. [NOT FOUND]
- Flow per the site: "Creator -> Create a USDX pool, stake OEX -> Prediction event -> Announce results -> if the prediction is correct, get tokens + profit; if wrong, lose tokens -> Voter. Voter -> Vote with USDX -> Prediction event". [H, site strings]. Whitepaper step 5: "winners who used USDX are rewarded, and the protocol collects a service fee"; fee taken from "the winning pool". [H, whitepaper]
- Inference: pooled/parimutuel-style payout, no order book, no tradable outcome tokens documented. Prices are therefore pool ratios at best, not executable quotes. [M, inferred from the above; the dapp could not be inspected]
- Outcome tokenisation: NOT FOUND.

## 4. Chains and collateral

- Chain: BNB Smart Chain for OEX. [H] Whether markets live on BSC or elsewhere: not stated in any primary document (the Bitget repost says only "dual-token structure of OEX + USDX"). CoinGecko's description says "built on the Binance Smart Chain" [H as a CG statement; M as to accuracy].
- Collateral: USDX (minted from staked OEX) for predictions; USDT as reserve backstop. USDX contract address: NOT FOUND. OEX token contract is a minimal ERC-20 whose ABI (third-party registry copy) also exposes owner-only `setName`, `setSymbol`, `withdrawToken`, `transferOwnership`, `renounceOwnership`; no staking, minting or market functions. [M: https://github.com/KeystoneHQ/Smart-Contract-Metadata-Registry (bsc/0xb1a3...), ABI function names only; ownership state not checked]
- Audit: roadmap says "smart contract audit by a security company"; no audit report found. [NOT FOUND]. CMC shows a "CertiK rating 2.9" next to the token (M, fetch-summarised; meaning unverified, likely a Skynet-style score, not an audit).

## 5. Read API

**exists: none** (nothing official or public for markets, prices, books, trades or resolution).

- Searched: oraclex.ai (HTML, `i18n/en.js`, `script.js`, `script-pack.js`), oraclex.club (HTML + inline script + `js/lang/en.js`), whitepaper repo, GitHub code search for the token address, CoinGecko `links`/`repos_url` (empty). Only API-like host seen: `api.oraclex.club/api/queryData` (media CMS, undocumented, not probed).
- No on-chain event ABI or subgraph for markets was found, so even an "on-chain-only" adapter is not possible without the unknown market contract addresses.
- Token-level data only (usable for a "is the venue dead" health check, not for pricing events): DexScreener `GET https://api.dexscreener.com/latest/dex/tokens/0xB1A3810fCe5678128B6a61A41871Ea344B938e76` (200, 781 bytes, fixture `dexscreener-oex-token-pairs.json`) and GeckoTerminal `GET https://api.geckoterminal.com/api/v2/networks/bsc/tokens/{addr}` (200; the `/pools` sub-call returned 429; fixture `geckoterminal-oex-token.json`). CoinGecko `GET https://api.coingecko.com/api/v3/coins/oraclex` (200, fixture `coingecko-oraclex-coin.json`). Rate limits for these third-party free tiers are undocumented here and clearly low (GeckoTerminal 429 within about 2 calls). [H]
- WebSocket: NOT FOUND.

## 6. Trade path and PayBox reachability

- Trade path: **none documented**. No SDK, no signing scheme, no contract ABI for the market, no order API. Participation per the whitepaper is: stake OEX on-chain, mint USDX, "vote" on events via the dapp. [H as design; implementation NOT FOUND]
- PayBox: **no**. BNB Chain is generally a chain PayBox can act on (M, PayBox tool descriptions), so *if* the market contracts were published, an EVM wallet could propose calls. They are not published, the dapp is challenge-gated, USDX has no direct purchase route (must stake OEX), and OEX's only liquidity is one thin Pancake v2 pool. No transaction proposal can be built from what is public.

## 7. Fees

- Whitepaper: "The protocol collects a fee (e.g., 5%) from the winning pool of all prediction events"; part used to buy back and burn OEX. "e.g." means illustrative, not a confirmed schedule. [H, academic whitepaper section 6]
- Minting ratio 0.1 to 0.5 of staked OEX value into USDX; "soft liquidation" suspends mining yield when the collateral ratio drops (no forced liquidation). [H, whitepaper section 4]
- Gas on BSC and any dapp fees: NOT FOUND.

## 8. Resolution and dispute risk

- Design (whitepaper section 7, "Wager-Based Governance"): the event creator submits an outcome; challenge period; any user can dispute by staking OEX; OEX-staking DAO nodes not involved in the event vote; losing side forfeits staked OEX to the winner and voters. [H as a design; no contract, parameters or challenge window found]
- Risk: resolution is controlled by the creator first and by OEX holders second, with OEX now worth about $73k FDV. Cheap to capture. Combined with the creator-sets-the-question model, resolution risk is very high (M). Any cross-venue pair on OracleX would carry unbounded basis risk.

## 9. Geo / ToS / automation

- Terms of service, geo restrictions, KYC and automation rules: NOT FOUND (searched: oraclex.ai, oraclex.club, the whitepaper PDFs, the repo README). The site's "global consensus programme" lists planned rollout phases starting with SG/HK/AE/MY/TW/KR/SA/JP, then US/IN/GB/FR/TR/AU, then others; that is marketing, not a legal list. [H: oraclex.club page]
- Automation: the dapp domain challenges non-browser clients (Cloudflare managed challenge), which signals bot-mitigation. Scripting around it was out of scope and is not recommended.

## 10. Liquidity (all token-level; no prediction-market volume/OI/TVL found)

| Metric | Value | Source, date |
|---|---|---|
| OEX/USDT PancakeSwap v2 pool liquidity | $96,187 (48,093 USDT + 4.376B OEX) | H, DexScreener, 2026-10-19 |
| OEX 24h volume | $0.99; 1 buy, 0 sells in 24h | H, DexScreener, 2026-10-19 (CoinGecko: $1.99 total volume, updated 2026-10-19) |
| OEX FDV / market cap | about $73k FDV (DexScreener); CMC shows about $110k and 25.07K holders | H / M, 2026-10-19 |
| Prediction-market volume, OI, TVL, market count | NOT FOUND (DefiLlama not checked: no protocol slug found; a search for one was not possible, see open questions) | |

## 11. Event overlap and shared liquidity

- Claimed categories (sports, crypto, politics, entertainment) overlap every major venue in principle. No verified markets exist to match against. For the aggregator this means: nothing to link.
- Shared liquidity: none identified. It is also not an independent leg because it has no executable liquidity (parimutuel-style pools settled by a token-vote, thin token).
- As a *signal* source it has no value either: no read API, and the pool ratios cannot be read.

## 12. Suspicious / promotional content seen (all treated as untrusted data)

- oraclex.club embeds a Binance Square affiliate/referral link and promotional urgency copy ("won't miss any opportunity that could increase your gains"). Aimed at humans, not at AI agents. Not followed.
- Telegram channel: "Official Reminder, beware of unofficial project information" and "evaluate market rumors rationally", no details. Not an instruction to agents.
- The whitepaper PDF lists a free-webmail contact address for its author; not recorded here. Commercial whitepaper `OracleX-en.pdf` is image-only (scanned pages) and could not be text-extracted in this environment (no poppler installed); only the academic PDF (`static/academic/OracleX_Behavior_Protokoll_en.pdf`, identical to the GitHub-hosted copy) was decoded (best-effort, standard-library glyph decoding). Formulas were not recoverable; narrative text was.
- No instructions aimed at AI agents were found in any fetched page.

## NOT FOUND (searched: oraclex.ai, oraclex.club, oraclex.market headers, the whitepaper PDFs, `eliasoraclex/OracleX-` repo, GitHub search by name and by token address, CoinGecko, CMC, DexScreener)

- Market contract addresses, USDX contract address, staking contract address, ABIs.
- Any REST/GraphQL/WebSocket API, SDK, or developer docs (the roadmap promised "SDK and development documentation" in Q1-Q2 2026).
- Any list of live markets, any market's price or volume, any resolution history.
- Terms of service, geo-block list, fee schedule actually applied.
- Any independent audit report; any independent press coverage beyond launch press releases.
- Evidence the prediction dapp has had real users in 2026.

## Open questions

- Is `oraclex.market` serving a working dapp? (Needs a normal browser; out of scope for this read-only, no-browser pass.)
- What does the "Future Station" rebrand mean for the OracleX prediction product?
- Web search budget for this session was exhausted after one search; further discovery was by direct fetches of known hosts. A DefiLlama / Dune / BscScan check for market contract activity was therefore not done and could change the picture only marginally given the token numbers.

## Sources

- https://oraclex.ai/ (official marketing site), https://oraclex.ai/i18n/en.js?v=1.9 (site strings, saved as fixture), https://oraclex.ai/static/academic/OracleX_Behavior_Protokoll_en.pdf (academic whitepaper, decoded), https://oraclex.ai/OracleX-en.pdf (commercial whitepaper, image-only, created 2025-11-18 per PDF metadata via WebFetch) [H]
- https://oraclex.club/ (knowledge base; inline script references api.oraclex.club) [H]
- https://oraclex.market/ (dapp; Cloudflare challenge, not bypassed) [H, headers only]
- https://github.com/eliasoraclex/OracleX- (README + same academic PDF; created and last pushed 2025-10-31; no contracts) [H, `gh api`]
- https://api.dexscreener.com/latest/dex/tokens/0xB1A3810fCe5678128B6a61A41871Ea344B938e76 [H, 2026-10-19]
- https://api.geckoterminal.com/api/v2/networks/bsc/tokens/0xB1A3810fCe5678128B6a61A41871Ea344B938e76 [H, 2026-10-19]
- https://api.coingecko.com/api/v3/coins/oraclex [H, `last_updated` 2026-10-19]
- https://coinmarketcap.com/currencies/oraclex/ (via WebFetch summary) [M]
- https://www.bitget.com/news/detail/12560605089689 (repost of the launch article; the GlobeNewswire original returned HTTP 403) [M]
- https://t.me/s/OracleX_Channel_EN , https://t.me/s/OracleX_Group_EN (public preview pages) [H]
- https://raw.githubusercontent.com/KeystoneHQ/Smart-Contract-Metadata-Registry/main/bsc/0xb1a3810fce5678128b6a61a41871ea344b938e76.json (OEX ABI function names) [M]
- One WebSearch ("OracleX OEX prediction market") returning promotional and auto-generated price pages; ignored for facts except the existence of the Dec 2025 launch release [L]

Fixtures: `docs/research/fixtures/oraclex/` (`dexscreener-oex-token-pairs.json`, `geckoterminal-oex-token.json`, `coingecko-oraclex-coin.json`, `oraclex-ai-site-strings-en.js`, `oraclex-market-cloudflare-challenge-headers.txt`). All are token-level or site-text samples; there is no prediction-market API response to capture.
