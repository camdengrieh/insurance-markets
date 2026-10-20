# Venue spec: Cup Markets (cupmarkets.org)

Researched 2026-10-19. Tags: H = read first-hand in a primary source this session, M = secondary or inferred, L = weak or stale. Where nothing was found the note says NOT FOUND with what was searched.

## Verdict

- Adapter priority: **skip**. (H for the facts below, M for the conclusion)
  - The site, docs and any API host all return Cloudflare **HTTP 522** (origin connection timed out) on 2026-10-19, across repeated probes over about 10 minutes. I could not load a single official page.
  - The product was a one-event World Cup 2026 betting app in "open beta". The tournament ended 2026-07-19 (the docs' own dates were Jun 11 - Jul 19, 2026). No later event has dates.
  - No public API, no GitHub repo, no program ID, no fee schedule and no liquidity figure for the betting product were found. The token is down about 98% from its 2026-06-16 high and trades about $14 a day.
- Still live: **no evidence that it is.** Only the CUP memecoin still trades (6 sells and 0 buys in 24h). The domain is registered to 2027-05-17, so an outage versus a wind-down cannot be told apart from outside. I report `still_live = false` because nothing about the product is verifiable, not because I saw a shutdown notice. (H for 522 and token data, NOT FOUND for any shutdown notice)
- Prior hint (CoinGecko: "on-chain football-tournament prediction markets on Solana") is accurate as a description of what was marketed, but it is promotional text. (H that CoinGecko says it, M that the product matched it)

## What it is

- CoinGecko description, verbatim in substance: "an on-chain prediction market platform built on Solana for major global football events and sports tournaments. Users connect their wallet to explore tournament fixtures, view live market odds, place predictions on match outcomes, and compete on global leaderboards and brackets." The $CUP token "powers reward pools, stake incentives, platform revenue buybacks from unsuccessful predictions, and loyalty rewards. All settlements and reward distributions are executed transparently on-chain." (H that this is what the page says, M that it is true; source is a project-supplied listing text) [CoinGecko API, fixture `coingecko_coin_cup-markets_2026-10-19.json`]
- Official docs, seen only through a web-search tool's summary of `docs.cupmarkets.org/what-is-cup-markets` and `/` (the pages themselves were 522 for me): "a live Web3 prediction market for the 2026 World Cup, built on Solana"; users "deposit $CUP or SOL" and "place single bets or parlays on prematch and live football markets"; bets are "settled automatically with real-time odds"; $CUP is used for betting, free bet coupons, loss refunds and rewards. The World Cup is the "flagship event" (Jun 11 - Jul 19, 2026); Copa America, Africa Cup of Nations and FIFA Club World Cup are marked "Coming soon" with no dates. (M: second-hand summary of an official page that I could not open)
- Terms page (`/resources/terms`), same second-hand route: the platform is in **open beta**; "features, rules, market availability, and settlement logic can change without notice"; markets can be cancelled, for example for unreliable sports data, and then staked funds are returned on-chain with no fees. (M)
- Token launch timeline from public market data: Jupiter lists `createdAt 2026-05-20`; first Raydium pool `2026-05-23`; domain registered `2026-05-17` (RDAP). So the whole project is about five months old. (H)
- Team: NOT FOUND (searched: CoinGecko, DexScreener socials, GitHub search for "cupmarkets"/"cup markets", Bitrue article which says "Whether the developers are publicly known" is something to check).
- Socials from DexScreener/CoinGecko: X `@CupMarkets` (WebFetch returned HTTP 402, not read), Telegram `t.me/CupMarkets` (landing page shows "1 126 members"; no post text visible in the public preview). (H for the member count, NOT FOUND for posts)

## Market model

- Kind: `onchain-other`, but what it actually is looks like a **house-banked fixed-odds sportsbook with parlays and live betting**, paid out in SOL/$CUP, rather than an exchange or AMM. (M/L: inferred from "real-time odds", "single bets or parlays", "free bet coupons", "loss refunds", and "platform revenue buybacks from unsuccessful predictions". None of that proves the counterparty; the docs I could not open would.)
- Not an order book: no book or depth concept appears in any description. Not described as an AMM or parimutuel pool either, although "reward pools" and "leaderboards and brackets" hint at contest-style side games. (L)
- Outcome tokenisation: NOT FOUND (searched: CoinGecko description, search summaries of the docs, GitHub search for the project). No evidence that positions are SPL tokens; "bets" are probably program accounts or database rows. (L)
- Outcome structure: match outcomes (1X2-style, prematch and live) and parlays. Scalar: none mentioned. (M)

## Chains and collateral

- Chain: Solana only. $CUP is an SPL token, mint `BGAED7f6EcBbWPamiWxcpgXqpkGm7zpYoxmx29Jh9cUp`, 6 decimals, total supply 998,930,083.64 (Jupiter and CoinGecko agree). (H)
- Betting collateral per docs summary: **$CUP or SOL**. No USDC mentioned. (M)
- Betting program ID / contract address: **NOT FOUND** (searched: CoinGecko links and detail_platforms, DexScreener and GeckoTerminal token info, Jupiter token record, GitHub code search for the mint and for `cupmarkets.org`, DefiLlama protocol list of 8,758 entries which has no Cup Markets entry). The only on-chain identifier is the token mint. Jupiter reports a `dev` wallet for the mint; I did not chase it because on-chain reads need JSON-RPC POST, which this task rules out.
- Token liquidity (Raydium CUP/SOL pool `FUdyhYJBy1u7U1tBSaCfpF5Wc65m17UQPzUps2okRsqE`): $9,866 liquidity (DexScreener, 2026-10-19); Jupiter aggregate $4,976; 9 CUP pools across Raydium, Orca and Meteora, the rest below $1,000. (H, fixtures `dexscreener_token_pairs_2026-10-19.json`, `geckoterminal_token_pools_2026-10-19.json`, `jupiter_token_search_2026-10-19.json`)
- Consequence: even if the app were running, bankroll and settlement would be in a token with about $10k of pool depth. Any sizeable stake could not be converted without moving the price.

## Read API

- `exists`: **unknown, probably none.** The docs and site are unreachable, so I cannot say there is no API. No repo, SDK, OpenAPI, subgraph or websocket is referenced by CoinGecko, DexScreener or any search result. NOT FOUND (searched: CoinGecko `links`, DexScreener `info.websites/socials`, GitHub repo and code search, Jupiter record, DefiLlama protocols, web search for the docs).
- Probe results (all `User-Agent: insurance-markets-research/0.1`, fixture `site_probe_2026-10-19.txt`):
  - `https://cupmarkets.org/`, `https://docs.cupmarkets.org/` (and `/what-is-cup-markets`, `/resources/terms`, `/llms.txt`), `https://api.cupmarkets.org/`: HTTP 522, `server: cloudflare`, body 16 bytes. (H)
  - `/docs`, `/api`, `/markets`, `/robots.txt`, `/sitemap.xml`, `/api/markets` on the apex: connection timeouts after 15s. `www.` and `app.` do not resolve. (H)
  - The A records for the apex, `docs.` and `api.` are Cloudflare proxy addresses, so the host still has DNS and a Cloudflare proxy, but the origin behind it does not answer. (H)
- Third-party read surfaces exist **for the token only**, not for bets or odds: DexScreener `GET https://api.dexscreener.com/tokens/v1/solana/{mint}`, GeckoTerminal `GET https://api.geckoterminal.com/api/v2/networks/solana/tokens/{mint}/pools`, Jupiter `GET https://lite-api.jup.ag/tokens/v2/search?query={mint}`, CoinGecko `GET /api/v3/coins/cup-markets`. All returned 200 unauthenticated. CoinGecko and GeckoTerminal both returned 429 at times (shared IP with other agents). Samples saved. (H)
- Auth and limits: n/a for Cup Markets itself.

## Trade path

- Programmatic order placement: **none documented.** The docs summary says users "connect their wallet" and deposit $CUP or SOL on the market site, which implies a wallet-signed transaction against an unknown Solana program or a custodial deposit address. Which one is NOT FOUND. (M/L)
- No auth scheme, no signing scheme, no API keys, no SDK documented. (NOT FOUND, same search list as above)

## PayBox reachability

- `paybox_reachable`: **unknown.**
  - An EVM wallet (Base, Ethereum, BNB, Arbitrum, Polygon) cannot touch it: Solana only. (H)
  - A PayBox Solana wallet could in principle sign a Solana transaction, but no program ID, instruction layout or IDL was found and the app is down. No path to place or cancel a bet by transaction proposal or signed order is documented. Do not model it. (M)

## Fees

- NOT FOUND. Searched: CoinGecko text, search summaries of the docs and terms, Bitrue and Phantom/Solflare listing text. Only statements: cancelled markets carry no fees (terms, M); losing bets feed "platform revenue buybacks" of $CUP (CoinGecko text, M). If the model is bookmaker odds, the fee is the overround in the quoted odds, which cannot be measured without the app. (L)
- Token-level trading fees on the Raydium pool are irrelevant to the venue.

## Resolution mechanism and dispute risk

- "Settled automatically with real-time odds" and "settlements and reward distributions are executed transparently on-chain" are the only claims. Data source or oracle for results: NOT FOUND. Dispute process: NOT FOUND. (M)
- Terms (second-hand) reserve the right to change settlement logic without notice and to cancel markets over unreliable sports data. Treat as operator-controlled settlement with no neutral dispute path. (M for the terms, L for the "operator-controlled" conclusion)
- Counterparty and rug risk flags (all independent of the product's merits, all weak):
  - CoinGecko shows a Rugcheck notice that the creator "can make changes to the token contract such as contract metadata, disabling sells, changing fees, unrestrictive minting of more tokens". Jupiter's record disagrees on part of this (`mintAuthorityDisabled: true`, `freezeAuthorityDisabled: true`, `devMints: 5`). The two sources conflict and I did not resolve it. (H that both say this, L on which is right)
  - A third-party token-scoring repo logs this mint as "Case #002", dated 2026-06-08, score 35 MEDIUM, "Insider Network Detection: 4 wallets, 10% supply, common funding source", status "Potential coordinated holder cluster". (H that the file says this, L on its reliability) [github.com/nexusveritas/nexusveritas-api, `docs/case-studies/case-002-BGAED7f6.md`]
  - `cupmarkets.org` appears in the 2026-05-25 daily scan file of `phishdestroy/destroylist`, a repo that describes itself as a "Real-time phishing & scam domain blocklist". The record gives registrar Namecheap, creation 2026-05-17 and a urlscan report link (the urlscan API now needs a login, so I could not read it). It does not say why the domain was listed, and a daily scan file may contain domains that were only scanned. Treat as an L-confidence flag, not a finding. (H that the record exists, L on meaning) [fixture `phishdestroy_scan_entry_2026-05-25.json`]
  - Jupiter organic score: 0 ("low"), tag "unknown". (H)

## Geo, ToS and automation

- Restricted jurisdictions, KYC and any bot or automation rule: NOT FOUND. The terms page could not be opened. The one thing known second-hand is "open beta" with rules changeable at any time. (M)
- No quotes available beyond the above.

## Liquidity

- Betting product: volume, open interest, TVL, bankroll: **NOT FOUND**. Not listed on DefiLlama (searched the full `api.llama.fi/protocols` list on 2026-10-19 for "cup" in name, URL and Twitter fields: only unrelated "Cupid Farm" and "PupCup Hammer"). (H)
- Token only (these are not betting volumes):
  - CoinGecko 2026-10-19: price $0.00000565, market cap $5,640.78, rank 9,431, 24h volume $14.58, ATH $0.00021492 on 2026-06-16, ATL $0.00000425 on 2026-06-25, 7d -7.2%, 30d -13.6%. (H)
  - Implied ATH market cap about $215k (ATH price x 998.9M supply); a search result quoting Phantom's page gave $377K market cap and $189K 24h volume on 2026-06-13, which is stale. (M/L)
  - Jupiter: 5,108 holders, top holders 8.1% (2026-10-18/19). (H)
  - DexScreener 24h: 0 buys, 6 sells, $14.61 volume. (H)
- 2026-06-16 was five days after the World Cup kick-off. The peak coincides with the tournament, which fits a speculative token tied to the event. (M)

## Event coverage and arbitrage overlap

- Documented: FIFA World Cup 2026 match outcomes, prematch and live, plus parlays. Same event class as Polymarket, Kalshi, Limitless and others, so overlap existed in principle. (M)
- That tournament is over (final 2026-07-19 per the docs' stated end date). The other listed events (Copa America, AFCON, Club World Cup) have no dates. No current fixture list, odds or market IDs could be read. (M)
- Shares liquidity with another venue: not documented. Odds source for "real-time odds": NOT FOUND. If the odds are copied from a sportsbook feed, the venue would be a price taker and not an independent leg. (L)
- Parlay-heavy fixed odds with a house margin would make arbitrage against prediction-market prices structurally hard even when live. (L)

## Adapter notes (only if it comes back)

If the site returns, in order: (1) read `docs.cupmarkets.org` for the program ID and any API; (2) check whether positions are on-chain accounts, then read them via Solana RPC or an indexer instead of scraping; (3) confirm collateral options (USDC would be the minimum bar); (4) read the terms for jurisdiction and automation rules before any wallet use; (5) re-check the Rugcheck and holder-cluster flags. Until then, no adapter, no signal feed.

## Fixtures

Saved under `docs/research/fixtures/cup-markets/` (all unauthenticated GETs on 2026-10-19 except the blocklist record, which is a GitHub raw file):

- `coingecko_coin_cup-markets_2026-10-19.json` (24 KB): coin record with description, links, market data, one Raydium ticker.
- `dexscreener_token_pairs_2026-10-19.json` (1.4 KB): the Raydium CUP/SOL pair with socials (`websites` lists the site and docs).
- `jupiter_token_search_2026-10-19.json` (1.4 KB): holders, audit flags, liquidity, organic score.
- `geckoterminal_token_pools_2026-10-19.json` (12 KB): the nine CUP pools.
- `rdap_cupmarkets.org_2026-10-19.json`: domain registered 2026-05-17, expires 2027-05-17, last changed 2026-08-12, Cloudflare nameservers.
- `phishdestroy_scan_entry_2026-05-25.json`: the one blocklist record (contact email field removed).
- `site_probe_2026-10-19.txt`: the 522 and DNS results.

No fixture exists for a Cup Markets market, book, trade or resolution response because no such endpoint was reachable or documented.

## Not found

- Any readable official page (site, docs, litepaper, terms): 522 throughout.
- Program ID, IDL, SDK, repo, subgraph, API, websocket.
- Fee schedule, resolution source, dispute process, jurisdiction list, automation rule.
- Betting volume, TVL, open interest, market list.
- Team identity, audit report.
- X posts (HTTP 402 on x.com), Telegram posts (none in public preview).
- WebSearch budget for the session ran out after three successful searches; the docs-page claims above come from two of those, in summarised form.

## Sources

- https://api.coingecko.com/api/v3/coins/cup-markets (H) - listing text, mint, links, market data, Rugcheck notice
- https://api.dexscreener.com/tokens/v1/solana/BGAED7f6EcBbWPamiWxcpgXqpkGm7zpYoxmx29Jh9cUp (H) - pair, liquidity, 24h flow, docs and site URLs
- https://api.geckoterminal.com/api/v2/networks/solana/tokens/BGAED7f6EcBbWPamiWxcpgXqpkGm7zpYoxmx29Jh9cUp/pools (H)
- https://lite-api.jup.ag/tokens/v2/search?query=BGAED7f6EcBbWPamiWxcpgXqpkGm7zpYoxmx29Jh9cUp (H)
- https://rdap.publicinterestregistry.org/rdap/domain/cupmarkets.org (H) - registration dates
- https://cupmarkets.org/ and https://docs.cupmarkets.org/ (H for the 522 result)
- https://docs.cupmarkets.org/what-is-cup-markets , https://docs.cupmarkets.org/resources/terms , https://docs.cupmarkets.org/ (M: search-tool summaries only, pages not opened by me)
- https://t.me/s/CupMarkets (H for the member count)
- https://www.bitrue.com/blog/what-is-cup-markets-cup-coin-coins (L: promotional exchange blog dated 2026-05-27; says nothing about the product)
- https://api.llama.fi/protocols (H for absence)
- https://github.com/nexusveritas/nexusveritas-api/blob/main/docs/case-studies/case-002-BGAED7f6.md (L)
- https://github.com/phishdestroy/destroylist (rootlist/2026/05/2026-05-25.json) (L)
- Looked at and rejected: https://github.com/davidofweb/Cup-Market (an unrelated Firebase/AI Studio "World Cup Prediction Market" demo, Vercel-hosted, no link to cupmarkets.org; M that it is unrelated).
- Third-party content was treated as data. No instructions aimed at AI agents were found in anything fetched.
