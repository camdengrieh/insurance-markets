# Hecto (Hecto Predictions) - venue spec

Researched 2026-10-19. Read-only. Tags: H = read first-hand this session, M = secondary/inferred, L = weak/stale.

## Verdict

SKIP. Not a prediction market in the arbitrage sense, and not currently live. [H]
- The original daily "Predictions" cycle is closed: app.hecto.inc says "The original prediction app cycle is complete, with final states closed" and only a token-unlock portal remains. [H] https://app.hecto.inc/
- "Prediction Market V2" is listed as "Coming soon", with no date. A Hecto X post (about 79 days old per search snippet) says V2 will have binary markets on pre-IPO outcomes (IPO timing, valuation milestones). [M, search snippet]
- Conflict: www.hecto.inc/products/predictions still labels Predictions "LIVE" ("Daily markets for the private companies everyone is watching") with a "0+" user counter. The app page (more specific, newer-looking) says the cycle is closed. Treat the marketing page as stale. [H]
- Revisit only if V2 ships with binary markets on a public API. Neither exists today.

## Kind and market model [H unless noted]
- Kind: Canton-native token-allocation game, not a market. Users convert $CC to $HECTO (1 CC = 100 HECTO per PR) and lock $HECTO on one of the >$100B "hectocorns" (SpaceX, OpenAI, Stripe, ...). [M, press release: https://chainwire.org/2026/03/10/hecto-launches-market-to-predict-the-value-of-private-giants-like-spacex-and-openai/]
- No order book, AMM or odds. The product page says users allocate to the company expected to "move most today" (daily rounds). Wrong picks keep their HECTO. [H https://www.hecto.inc/products/predictions]
- Payout is a fixed per-epoch CC emissions pool (UserPool) split by score, not a pari-mutuel pool funded by losers. Docs: Stage 1 participation 50%, Stage 2 allocation accuracy 50%, Stage 3 holder multiplier; concavity gamma = 0.5; anti-hedging lambda = 0.9; NetScore = max(0, CorrectLocked - lambda*WrongLocked); normalised so total = UserPool. Earnings are in Canton Coin via the "Hecto Incentivization Program". [H, docs CMS: https://ttg6lrdc.apicdn.sanity.io (Sanity dataset behind docs.hecto.inc), docPage "Allocator", updated 2026-03-26]
- Consequence: there is no tradable price per outcome, so nothing to compare against Polymarket/Kalshi odds. Economically it is an airdrop/incentive scheme; payoff depends on other participants' scores.
- V2 (planned): "token-aware accounts, asset-based participation, clearer market settlement, more expressive market formats". [H app.hecto.inc]

## Chains and collateral
- Canton Network (privacy-oriented institutional ledger), $HECTO is a CIP-56 token, supply 100B, TGE 2026-03-09. Collateral/entry: $CC (Canton Coin). Needs a "supported Canton wallet" and Party ID. [H hecto.inc product page; M for supply via search snippet]
- Not EVM or Solana. Wallet options listed on app.hecto.inc are Canton wallets (Console, Loop, Bron, Lattice, etc.). [H]

## Read API
- exists: none (no official public API for market/price data). [H: docs.hecto.inc is a SPA whose bundle references only a Sanity CMS, `/api/chat` (docs chatbot) and the app/site links. NOT FOUND (searched: docs.hecto.inc, app.hecto.inc HTML, docs JS bundle, web search for API/SDK).]
- Docs URL: https://docs.hecto.inc (canonical points to docs.hecto.finance). Docs content is served from a public Sanity CMS read endpoint `https://ttg6lrdc.apicdn.sanity.io/v2024-01-01/data/query/production?query=...` (GET, unauthenticated). That is a CMS for documentation, not market data. Do not build on it.
- Rates/auth/websocket: NOT FOUND. Leaderboard/analytics are described in docs but no endpoint documented.
- Fixture: docs/research/fixtures/hecto-hecto-predictions/docs-cms-sanity-docpage-sample.json (1 KB, CMS section index, shows docs structure and 2026-03-26 update date).

## Trade path
- None programmatic. Interaction is via the web app with a Canton wallet. No documented order or transaction API. [H]
- PayBox reachability: no. PayBox wallets are EVM/Solana; Canton is a separate ledger and no Canton chain is among the supported ones in the task brief. No bridge to an EVM-signable order flow documented. [M]

## Fees
- ToS 2.4/2.5: the site charges no fees; only network fees are paid to third parties. [H https://www.hecto.inc/resources/legal/terms]
- Economic cost is HECTO acquisition (CC to HECTO conversion; HECTO unlock/vesting) not a fee.

## Resolution and dispute risk
- Press release: top-performing company by "higher estimated valuation growth" per cycle; methodology and verifier not explained. [M chainwire]. Docs mention "deterministic scheduling, outcome calculation" for daily settlement and an "Oracle" term but the text was not retrieved. [L]
- Private-company valuations are not observable daily, so resolution depends on Hecto's chosen reference. High operator-discretion risk. Disputes: confidential arbitration in the BVI, 60-day negotiation, class waiver. [H terms section 7]

## Geo / ToS / automation
- Users must not be US persons and must not be in sanctioned or listed territories (Myanmar, Cuba, Iran, Syria, North Korea, etc.). [H terms 1.4]
- No explicit bot/API clause, but access can be restricted by IP, device type, wallet app (2.6); Sybil/griefing attacks barred (4.2); not regulated by any financial regulator (2.8). KYC/review may be required per FAQ headings. [H]
- Predictions Eligibility Checker at predictions.hecto.inc gates access by HECTO holdings and "Hecto Score" tied to a verified Hecto account. [H HTML title and description]

## Liquidity
- No volume/OI/TVL figures published for Predictions. Press release gives none. [H/M] The hecto.inc page shows "0+" users. NOT FOUND (searched: product page, FAQ, press release, app).
- HECTO token market cap exists on CoinGecko-style trackers (cryptorank), not retrieved; irrelevant to arb.
- Independent of other venues: yes, but there is no tradable liquidity to take.

## Event categories overlapping other venues
- Private-company valuation themes (OpenAI, SpaceX, Anthropic, Stripe) overlap with Polymarket/Kalshi/Manifold IPO and valuation markets, but Hecto's "which company moves most today" has no equivalent contract. V2 binary markets (IPO timing, valuation milestones) would overlap if launched. [M]

## Related
- $NEOPRIME (announced 2026-10-13 by Neoprime Capital, developed by Hecto): Canton-native token backed by pre-IPO shares, trading "coming soon". Not a prediction market, but a possible price signal for private-company valuation later. [M, search snippets: invezz / defiprime / blocktelegraph]
- hecto.finance moved to hecto.inc (per brief); docs still canonicalise to docs.hecto.finance. [H]

## Adapter priority
skip. Reasons: cycle closed, V2 undated, no API, no price/odds, Canton-only, US persons excluded. Watch item: re-check app.hecto.inc for V2 launch and any API docs.

## Sources
- https://www.hecto.inc (H)
- https://www.hecto.inc/products/predictions (H)
- https://app.hecto.inc/ (H)
- https://docs.hecto.inc (H, SPA; content via Sanity CMS endpoint above)
- https://www.hecto.inc/resources/faq (H, questions only)
- https://www.hecto.inc/resources/legal/terms (H)
- https://predictions.hecto.inc (H, eligibility checker title/description)
- https://chainwire.org/2026/03/10/hecto-launches-market-to-predict-the-value-of-private-giants-like-spacex-and-openai/ (M)
- Web search results (M): decrypt.co, benzinga.com, defiprime.com, invezz.com, blocktelegraph.io

## Suspicious content
None found.
