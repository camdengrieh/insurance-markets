# Ringo (app.joinringo.xyz) - venue spec

Researched 2026-10-19. Confidence tags: H = read first-hand this session in a primary source, M = secondary/inferred, L = weak/stale.

## Verdict
adapter_priority: **skip** (revisit as P2 signal-only if a data feed appears). Live but beta, US-residents-only ToS, no public API, social/1v1-style challenges that rarely overlap liquid venues, tiny/undisclosed liquidity, ToS bans bots and scraping.

## Liveness
- Live: app returns HTTP 200; sitemap lastmod 2026-10-17; ~200 `/ringo/<uuid>` market pages in sitemap (1240 URLs / 6 locales). [H] https://app.joinringo.xyz/sitemap.xml
- Self-described "currently in beta and may occasionally make mistakes". [H] https://app.joinringo.xyz/support
- Operator: Ringo Labs, Inc., Miami FL (JSON-LD on app pages). [H]
- Sampled market (TIA/USD > $0.68 at 21:00 UTC 2026-10-17) had status "cancelled". [H] https://app.joinringo.xyz/ringo/7244f471-cd18-4d9e-aec2-9e1b61104cfe

## Kind / market model
- Social challenges: one verifiable claim, Yes/No (binary only). No categorical or scalar found. [H] /support/markets
- Price per side 1 to 99 cents; winning shares pay 1 USDC, losing 0. [H] /support/markets
- Order-book style: users "take the current price or set your own and wait for someone to meet it"; llms.txt says "back Yes or No via the orderbook". Matching engine details NOT FOUND. Also 1v1 "Challenges" tab and open (many-taker) challenges. [H] /support/gameplay, /llms.txt
- Outcome tokenisation: NOT FOUND (searched: support pages, ToS, homepage). Page says funds go into "a smart contract for that challenge"; whether positions are ERC-20/1155 or ledger entries is unknown.
- Creation paths: web app, or tweeting `@joinringo` on X (bot replies and confirms), plus Kick stream chat `!ringo`. [H] /support/ringo-on-x, /llms.txt
- Credits (promo currency) can be used for positions; pay out as USDC on win. [H] /support/gameplay

## Chains and collateral
- Collateral USDC. ToS Section 8: "Ringo operates USDC on Polygon Network." [H] https://app.joinringo.xyz/terms-and-conditions
- Public marketing/FAQ never name the chain. Deposits accepted cross-chain with provider fee. [H]
- Contract addresses: NOT FOUND (searched: homepage, support pages, client JS chunks). Client bundle only contained generic viem chain tables.
- Gas sponsored by Ringo for in-app activity. [H] /support/wallet-funds-fees
- Wallets: embedded wallet created via email/X/Kick sign-up (client bundle references Privy/Dynamic/thirdweb SDKs [M]); external wallets can be linked.

## Read API
- Official public API: NOT FOUND (searched: /api/markets, /api/claims, /docs -> 404; api.joinringo.xyz does not resolve; llms.txt and ToS list no developer docs; joinringo.xyz mentions none). robots.txt disallows `/api/` and `/markets/`. [H]
- Backend base URL is injected via env (`NEXT_PUBLIC_API_URL`) and not exposed in the bundle; not pursued (ToS bans automated scraping, robots disallows /api/). [H/M]
- Only machine-readable surfaces: sitemap.xml (market URLs), llms.txt (saved as fixture), SSR HTML per market (title/description with status only; price/volume rendered client-side). No fixtures of price/book data possible.
- Resolution data: public "Truth Panel" https://panel.joinringo.xyz (Reality.eth UI); underlying Reality.eth contract data is on-chain and could be read via RPC, but question-to-market mapping unknown.
- Websocket: NOT FOUND.
- Fixtures: docs/research/fixtures/ringo/llms.txt only.

## Trade path
- No programmatic order API found. Trading is via the app's embedded wallet (gas-sponsored), so a PayBox EVM wallet cannot sign orders or send proposals without contract ABI/addresses (NOT FOUND) and an account-linked flow. Users can also trade via X mentions, which is a social-bot path, not an API.
- paybox_reachable: **no** (practically). Funding path exists (send USDC on Polygon to the Ringo wallet, a plain transfer), but placing orders needs the Ringo app/backend.

## Fees
- Commission on settled challenges, deducted from the pool at settlement; part funds the oracle, part goes to the market creator and community. Rate NOT FOUND (ToS says per-challenge fee schedule is posted at joinringo.xyz and changeable at discretion; not on that page). Cross-chain deposit has provider fee. No gas to users. Withdraw anytime for uncommitted balance. [H] /support/wallet-funds-fees, ToS 3(b)
- Minimum position 1 USDC, no maximum. [H] /support/gameplay

## Resolution
- Reality.eth: anyone answers with a bond, anyone can overturn with a larger bond; escalation to Kleros arbitration. Ringo "cannot overrule the result". Bond sizes and dispute-window length NOT FOUND. [H] /support/reality-eth, /resolution-policy
- Invalid -> funds returned proportionally; also "ANSWERED TOO SOON" outcome. Default sources: crypto USD pairs, official league sites, AP/Reuters/Bloomberg. [H] /resolution-policy
- Risk: user-written free-text claims with community truth panel; ambiguous wording, thin juror/answerer participation, cancellation/invalidation of markets (sampled market cancelled). Contracts claimed audited/pen-tested by Highland Security (no report found). [H/M]

## Geo / ToS / automation
- ToS s17: "for use only by individuals residing in and using the Services in the United States"; excluded IL, NV, NJ, MT, OH, MD and Tribal Lands; VPN circumvention prohibited. [H] ToS
- ToS s3(f)(3): "Use an automatic device (such as a robot or spider)" prohibited; data harvesting and reverse engineering prohibited. No separate API terms. [H]
- Self-described "non-regulated entity", not a gambling site (FAQ). 18+. [H] /support/general-information
- Implication: a non-US PayBox user cannot lawfully use it; automated trading breaches ToS.

## Liquidity
- Volume/OI/TVL: NOT FOUND (searched: homepage, market pages SSR, llms.txt, DefiLlama not checked). Homepage figures (ETH market 1,204 positions / $48.2K volume) look illustrative. [L] https://joinringo.xyz
- Market count ~200 pages in sitemap as of 2026-10-17 [M]; many appear short-dated crypto price claims and social claims.

## Overlap / arbitrage
- Categories: Crypto, Sports, Politics, Economics, Tech, Pop Culture, Science, Creator, Esports, Business, Other. [H] llms.txt
- Overlap with liquid venues likely only on short-dated crypto price-threshold claims (e.g., TIA vs a Coinbase print) and some sports/politics; non-standardised free-text claims make market linking error-prone. No evidence of meaningful size. [M]
- Shares liquidity with another venue: no evidence; it is an independent contract set. Uses Reality.eth/Kleros oracle stack (shared with Omen-like venues only at the oracle level). [M]

## Open questions
- Backend API URL and whether any read-only public endpoint exists (ask support@joinringo.xyz; do not scrape).
- Polygon contract addresses, token model, bond sizes, fee rate.
- Real volume.

## Sources
- https://app.joinringo.xyz (homepage) [H]
- https://app.joinringo.xyz/support and /support/{markets,gameplay,wallet-funds-fees,reality-eth,platform-protection,general-information,ringo-on-x} [H]
- https://app.joinringo.xyz/terms-and-conditions [H]
- https://app.joinringo.xyz/resolution-policy [H]
- https://app.joinringo.xyz/llms.txt, /robots.txt, /sitemap.xml [H]
- https://joinringo.xyz [H]
- https://hub.joinringo.xyz (Notion SPA, content not rendered; unread) [L]
- WebSearch unavailable (session budget exhausted); no third-party coverage/TVL sources consulted.
- No embedded AI-targeted instructions observed in fetched pages.
