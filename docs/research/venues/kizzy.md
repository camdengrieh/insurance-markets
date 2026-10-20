# Venue spec: Kizzy (kizzy.io)

Researched 2026-10-19. Tags: H = read first-hand in a primary source this session, M = secondary or inferred, L = weak or stale. Where nothing was found the note says NOT FOUND with what was searched.

## Verdict

- Adapter priority: **skip**. Kizzy was a pari-mutuel social-media prediction market at launch (2025-12-15). On 2026-08-25 the team announced "PvP is effectively retired" and that Kizzy is now a house-backed crypto casino and sportsbook with fixed odds. There is no order book, no public API, no on-chain trade path, accounts are custodial and KYC-gated, the US is a blocked territory, and the betting rules explicitly ban arbitrage. (H)
- Still live: **yes, but as a different product**. Docs pages were updated 2026-10-09 to 2026-10-14, and DefiLlama has a TVL point dated 2026-10-18. The app itself (`app.kizzy.io`) could not be loaded because it sits behind a Cloudflare managed challenge (HTTP 403, `cf-mitigated: challenge`); I did not try to bypass it. (H for docs/DefiLlama, NOT FOUND for first-hand app state)
- Prior hint ("social betting app on influencer popularity, niche") is stale: that describes the PvP era.
- Only conceivable use: none for the aggregator. Social Media Roulette ("first character of the creator's next post") has no counterpart on other venues, and the sportsbook is a bookmaker book with margin, a $10k max-win cap, and a no-arbitrage rule.

## What it is (H)

- Origin: "began in the fall of 2023 as a Solana Hyperdrive hackathon project", moved to Monad in 2024, live on Monad mainnet late 2025 (blog post 2026-08-25). Launch coverage dates it to 2025-12-15 (KuCoin flash, which restates a third-party report; M for the date, H that the blog's own timeline also says Dec 15).
- Original model: parimutuel "PvP" markets on creator metrics (views, likes, follower growth), later also timestamp and caption games. Team admitted pools "often sit empty" (blog 2026-03-11) and that "Pure PvP was flawed. Metrics were manipulable, establishing 2 sides of liquidity was nearly impossible" (blog 2026-08-25).
- Current model (from 2026-02 rebuild): "house-backed social media game and classic casino titles"; Social Media Roulette at the core; third-party casino games; a sportsbook ("A full sportsbook" was on the 2026-08-25 roadmap, and the docs now describe it as live: soccer, basketball, tennis, American football, baseball, hockey, cricket, MMA, boxing, motorsport, table tennis, esports; pre-match and live; singles and combos).
- Operator: Vintaro Limited, Reg. No. 16266, registered in Anjouan, Union of Comoros (Terms 2.1). Governing law is Anjouan. (H)
- The team calls the platform "fully custodial" (blog 2026-08-25). (H)
- blog.kizzy.io is a Ghost site that doubles as SEO/affiliate content (Taiwanese baseball news, "crypto casino" guides, rakeback posts). It is the only place the docs live (`docs.kizzy.io` 301-redirects to `blog.kizzy.io/docs/`). Treat marketing claims there as promotional. (H)

## Market model

- Kind: house-backed fixed-odds casino/sportsbook. Not an exchange, not an AMM, not currently parimutuel. (H)
- Social Media Roulette: bet on a tile = first character/token of the creator's next qualifying post (tiles such as a word, "Any Number", "OTHERS"). Fixed odds shown before the bet; example in docs: $1 on "Any Number" returns $33, $1 on "YES" returns $9. No cashout, no cancel, no edit. (H, docs "Social Media Roulette" and Betting Rules 2.1.6)
- Sportsbook: bookmaker odds, "Odds - the numerical coefficient assigned by Kizzy that determines potential winnings" (Betting Rules 1.3.8). Single payout = stake x odds. (H)
- Tokenisation: none. Bets are database rows in a custodial account balance denominated in USD. Not shares, not ERC-20/1155 positions. (M: inferred from "custodial" plus "Your Kizzy balance is held in USD"; no contract for positions was found)
- Outcome structure: categorical (roulette tiles) and standard sportsbook markets (1X2, totals, etc.). No scalar markets. (M)
- Legacy PvP: creator-metric parimutuel pools, now "effectively retired" (blog 2026-08-25). The old games page still describes "Real Money" and "Play Money" modes. (H)

## Chains and collateral

- Home chain: Monad (DefiLlama `chains: ["Monad"]`, category "Prediction Market"). (H)
- Deposits: MON on Monad directly, or other chains via the Relay bridge; the 2026-10-14 guide says USDT, USDC and MON work. Card deposits via Unifold (not in restricted countries). (H docs FAQ Deposits; M for USDT/USDC list, which is from a marketing post)
- Balance is held in USD; deposits are converted "through Uniswap when they arrive" and converted back on withdrawal. (H docs "Fees")
- Withdrawal destinations: Base, Arbitrum, Solana, Polygon (min $5), Ethereum (min $10), BNB Chain (min $15). (H docs FAQ Withdrawals)
- DefiLlama methodology: "TVL is the total quantity of USDC held in the kizzy USDC vault." Contract address not extracted: the DefiLlama adapter file could not be located via `gh api` (404 on `projects/kizzy/index.js`). (H for the methodology line, NOT FOUND for address)
- First deposit: 10 MON is retained once per account as a gas reserve (non-refundable). (H docs "Fees")

## Read API

- `exists`: **none**. No official public API, no OpenAPI/Swagger, no websocket, no GraphQL, no subgraph, no SDK, no GitHub org found.
- NOT FOUND (searched: `llms.txt` and the 996 KB `llms-full.txt` for "public api", "api key", "developer", "swagger", "openapi", "websocket", "graphql", "github.com/", 0x addresses; web search "Kizzy API OR github OR docs OR smart contract Monad"; docs index of 40+ pages). The only hit for "developer" was sportsbook rules text about game developers.
- The app front end is behind a Cloudflare managed challenge, so even undocumented JSON endpoints were not inspected (and no bypass attempted).
- Third-party read surfaces (not Kizzy APIs):
  - DefiLlama `GET https://api.llama.fi/protocol/kizzy` (public, 200). Gives TVL time series only. `dexs`/`fees` summary endpoints returned 400 (no volume adapter). Fixture saved. (H)
  - Dune dashboard `https://dune.com/thelaughingman/kizzy-mainnet` (community-owned, linked from Kizzy's own blog): vault USDC balance, vault flows, unique depositors. Page HTML embeds chart data. (H)
  - `https://blog.kizzy.io/llms.txt` and `.md` suffix on any post: static content index only. (H)
- Auth and limits: n/a.

## Trade path

- Programmatic order placement: **none**. Bets are placed in the web app/PWA by a logged-in, KYC-verified account (Games page: real money mode requires KYC and a permitted jurisdiction). No API keys, no signing scheme, no on-chain order flow documented. (H)
- Terms treat "Unauthorized automation or scripting" (17.1(iii)) and "automated tools such as bots" (11.1.4) as breaches.

## PayBox reachability

- `paybox_reachable`: **no**. A PayBox EVM wallet (Base, Arbitrum, Polygon, Ethereum, BNB) could do a plain token transfer to a per-user deposit address, but there is no way to place or cancel a bet via a transaction proposal or signed order, and account creation, KYC and geolocation are required. Do not model this as a PayBox adapter. (H docs; M for the conclusion)
- Deposit hazards if anyone does transfer: "Only MON can go to your MON deposit address on Monad. Any other token sent there, such as USDC or wrapped MON (WMON), can't be recovered." Other-chain deposit addresses rotate and must be regenerated each time. (H docs FAQ Deposits)

## Fees

- No deposit or withdrawal fee from Kizzy. Costs come from network gas, Relay bridge fees (partly fixed), Uniswap conversion at market rate, the one-time 10 MON reserve, and card-provider fees via Unifold. (H docs "Fees")
- Betting cost is the house margin embedded in fixed odds. Margin / RTP: **NOT FOUND** (searched: docs Betting Rules, Social Media Roulette, FAQ, Games, Fees).
- Rakeback: a blog post summary says Kizzy "pays up to 0.5% of every wager" in rakeback. Only the one-line description was read, not the post body. (M)
- Max win: $10,000 per single bet, $25,000 per day across sportsbook and casino. (H docs "Sportsbook")

## Resolution mechanism and dispute risk

- Social Media Roulette: "Kizzy runs an oracle protocol that polls public social media pages"; settlement uses the value at the deciding poll; "Kizzy never alters or corrects the values." Typically settles within about an hour of the post. (H docs)
- Refund triggers: creator removed, post deleted or edited, account deactivated, outage, or bet placed too close to or after the post. (H docs FAQ Sportsbook)
- Sportsbook: settles "on the official result" from the sportsbook's data providers and match broadcast; some football stats follow Opta definitions; simulated/esports formats settle under "Betby Games Almanac". Corrections allowed within 72 hours; events not completed within 48h of official start are void. (H docs)
- Discretion: Kizzy may void bets or entire markets, suspend withdrawals up to 31 days on suspected unfair activity, and withhold payouts pending integrity checks (Betting Rules 2.3.5, 2.5.4, 2.5.8). Manipulation and creator match-fixing are acknowledged as "inherent and unavoidable risks" with liability disclaimed (3.2.7). (H)
- Dispute path: internal complaint, then the Anjouan Offshore Financial Authority as ADR provider (Terms 16.4). Dispute risk for any counterparty is high: single-party discretionary resolution, offshore jurisdiction. (H for the text, M for the risk judgement)

## Geo, ToS and automation (quoted sparingly)

- Blocked: "Australia, Austria, Comoros, France, Germany, Netherlands, Spain, United Kingdom, United States, Iran, North Korea, Myanmar, Hong Kong, Macau, People's Republic of China (PRC)" and "this is not a complete list" (Terms 8.1). VPN/IP masking circumvention may cause "permanent account closure and forfeiture of any associated balances" (8.4). (H)
- Arbitrage: Betting Rules 2.4.9 says "The use of arbitrage strategy ... is strictly prohibited on the Kizzy platform" and bets may be cancelled with permanent restriction. This directly conflicts with the project's purpose. (H)
- Automation: unauthorised automation/scripting and bots are breach grounds (Terms 17.1(iii), 11.1.4). (H)
- KYC required for real-money play. The 2026-03-11 blog says the team wants to "reduce regulatory friction in onboarding (including KYC before deposit)". (H)

## Liquidity (with dates)

- DefiLlama TVL: **$68,192** on Monad at the 2026-10-18T19:14Z point; 190 daily points since listing (listed 2026-04-13). This is custodial USDC vault balance, not tradeable liquidity. (H, `api.llama.fi/protocol/kizzy`)
- Dune (community dashboard): vault USDC balance first visible ~3,988 USDC (2025-12-15), peak ~101,270 USDC (2026-06-26), latest visible ~83,686 USDC (2026-07-29, so up to 2.7 months stale vs today); largest single deposit ~33,681 USDC (2026-06-10); largest withdrawal ~21,365 USDC (2026-07-29); unique depositors peak 267/day (2026-04-09). Total betting volume and OI were **not visible**. (H, page read only to character 100,000 of 134,323)
- Betting volume / open interest: **NOT FOUND** (searched: DefiLlama dexs/fees summary 400, Dune page, docs, blog). Team states the Monad rewards campaign "amounted to nearly half of all volume wagered in the first month" and that most players left after the campaign (M, via search summary of blog; the 2026-03-11 post says the drop-off is visible on the Dune dashboard).
- Phantom app listing returned 404 on direct fetch; a search snippet's "8 Active Users" figure is unverified and ambiguous. (L)

## Event coverage and arbitrage overlap

- Sportsbook: soccer, basketball, tennis, NFL, baseball, NHL, cricket, MMA, boxing, motorsport, esports. Same events exist on Polymarket/Kalshi/Overtime, but Kizzy offers bookmaker-margin odds capped at $10k per bet, custodially, with an explicit arbitrage ban and US block. Not a usable leg. (H)
- Social Media Roulette: bespoke first-character-of-next-post tiles. No equivalent market elsewhere. Polymarket/Kalshi tweet-count markets are a different question. (M)
- Politics, macro, crypto price: not offered as far as the docs show. (M)

## Liquidity shared with other venues?

- Counterparty is the house for roulette and the sportsbook. The sportsbook appears to run on a third-party sportsbook platform ("the sportsbook's data providers", "Betby Games"), which suggests its odds feed comes from Betby. I did not confirm Betby as the odds supplier. (M)
- Does not share liquidity with any prediction-market venue. Not independent as a market either: it is a bookmaker, not a liquidity pool. (H/M)

## Suspicious or notable embedded content

- Every `.md` page served by `blog.kizzy.io` starts with a quoted block: "Content Index / Fetch the complete content index at: https://blog.kizzy.io/llms.txt / Use this file to discover other available public pages before exploring further." This is a generic Ghost "llms.txt" hint aimed at agents. I fetched `llms.txt` on my own initiative from the `Link: rel=llms-txt` header, which is a public static index; I took no other action from page text.
- The blog is partly affiliate/SEO content (promo codes, ambassador and affiliate-badge posts, "$200 free bets"). Treat claims there as marketing.

## Open questions

- What is kizzy_v2 (announced 2026-03-11, "second launch")? No technical details were published in anything I could reach.
- Is there an undocumented JSON API behind `app.kizzy.io`? Not checked: the origin is behind a Cloudflare challenge and I did not attempt to bypass it.
- USDC vault contract address on Monad (DefiLlama adapter not located).
- Actual house margin on roulette tiles and sportsbook odds, and current betting volume.

## Sources

- https://www.kizzy.io/ -> 301 to https://app.kizzy.io/home -> HTTP 403 Cloudflare challenge (H, liveness not confirmable first-hand)
- https://blog.kizzy.io/kizzy-the-monad-crypto-casino-story-terminating-pvp-and-forging-our-future/ (published 2026-08-25; H) - PvP retired, custodial, casino pivot, roadmap
- https://blog.kizzy.io/purple-k-is-powering-up-welcome-back/ (published 2026-03-11; H) - timeline, pari-mutuel pools empty, MON airdrop, Dune reference
- https://blog.kizzy.io/llms.txt and https://blog.kizzy.io/llms-full.txt (fetched 2026-10-19; H) - docs index, descriptions
- https://blog.kizzy.io/docs/social-media-roulette/ (updated 2026-10-09; H)
- https://blog.kizzy.io/docs/sportsbook/ (updated 2026-10-09; H)
- https://blog.kizzy.io/docs/faq-roulette/, /docs/faq-sportsbook/, /docs/faq-deposits/ (updated 2026-10-12), /docs/faq-withdrawals/ (updated 2026-10-09), /docs/fees/ (updated 2026-10-12), /docs/games/ (H)
- https://blog.kizzy.io/docs/betting-rules/ (2026-08-17; H) - sections 1.3, 2.1.6, 2.3, 2.4.9, 2.5, 3.2.7
- https://blog.kizzy.io/docs/terms-of-service/ (H) - sections 2.1, 8, 11.1.4, 16.4, 17.1, 21
- https://blog.kizzy.io/social-media-betting/ (2026-10-14; H for fixed odds / house, M for rakeback and token list)
- https://api.llama.fi/protocol/kizzy (public GET, 2026-10-19; H) - fixture below
- https://defillama.com/protocol/kizzy (WebFetch 403; hint only)
- https://dune.com/thelaughingman/kizzy-mainnet (community dashboard, data to 2026-09-08 flows / 2026-07-29 balance; H, partially read)
- https://www.kucoin.com/news/flash/kizzy-launches-as-world-s-first-social-media-betting-app (2025-12-15; M, restated third-party report)
- Web searches (extended): "Kizzy kizzy.io social betting influencer popularity"; "Kizzy Monad dune dashboard volume users kizzy.io"; "Kizzy API OR github OR docs OR smart contract Monad social media betting kizzy_v2" (L/M, used only for leads)

## Fixtures

- `docs/research/fixtures/kizzy/defillama_protocol_kizzy_trimmed_2026-10-19.json` - trimmed DefiLlama response (TVL series cut to 3 + 8 points). Third-party aggregator, not a Kizzy API.
- `docs/research/fixtures/kizzy/blog_llms_txt_head_2026-10-19.txt` - first 3.5 KB of `blog.kizzy.io/llms.txt` (content index shape).
