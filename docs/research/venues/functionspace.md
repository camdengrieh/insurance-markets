# functionSPACE: venue spec (adapter research)

Researched 2026-10-19. Confidence tags: H = read first-hand in a primary source this session; M = secondary or inferred; L = weak or stale.

## Verdict

- **adapter_priority: skip (re-check when Arbitrum mainnet trading opens).** There is no tradable real-money venue today. The company and website are live, but the project is pre-launch.
- Self-declared status on the official homepage (2026-10-19): "markets to date have run as play-money on an off-chain engine, and the on-chain contracts are a proof of concept." (H, https://functionspace.dev/)
- Official Learn page (updated 5 Oct 2026): "Can I trade today? Not yet." and "functionSPACE is building on Arbitrum." (H, https://functionspace.dev/learn/)
- The only discoverable REST backend (`fs-engine-api.onrender.com`) and the docs site (`docs.functionspace.dev`) both return `503 Service Suspended` with `x-render-routing: suspend-by-user` (H, fetched 2026-10-19). Neither is a working public read API today.
- The Foresight News lead (published 2026-05-11) describes the builder SDK and a May 2026 vibecoding competition. That was a play-money SDK era, not a live exchange (H for the article; see Sources).

"still_live" in the structured result is false in the sense "no tradable venue". The project is not dead: the site was rebuilt in Aug-Oct 2026, the Learn page was updated 5 Oct 2026, a $1.7M pre-seed was reported 24 Sep 2026, and a waitlist is open.

## Identity

- Name: functionSPACE (X: @functionSPACEHQ). Official site: https://functionspace.dev (H). Contact address is published on the site (not copied here).
- Core contributor entity: Integral Labs Pty Ltd, Melbourne, Victoria, Australia (H, https://functionspace.dev/terms/).
- Funding: $1.7M pre-seed led by Maven 11 Capital and Blockwall, with Smape Capital (M, Dealroom dated 24 Sep 2026; the investor logos are also on the official homepage, H).
- The "official URL NOT FOUND" hint from the discovery step is resolved: it is https://functionspace.dev.
- Products built on it (first-party or community): cultureSPACE (waitlist only, "Coming soon", H), propSPACE (free-to-play World Cup fantasy trading, H), indexSPACE (community build, 1st place in the builder competition, ERC-7540 index vaults on Base Sepolia, H), Pulso, Calibrated (H, homepage and /ecosystem/ pages).

## Kind and market model

- Kind: pre-launch, on-chain (Arbitrum) continuous-outcome ("numerical outcome") prediction-market primitive plus embeddable builder SDK. Not a conventional exchange (H).
- Market type: scalar/continuous. A market is a question with a numeric answer and a fixed range cut into equal steps (example: $20M to $300M in $5M steps = 56 steps). Each step's share pays $1 if the answer lands in that step, else 0. End steps catch out-of-range answers, so every market settles (H, Learn page).
- Pricing: single-pool AMM driven by a cost function. No order book, nobody quotes. "The pool is the counterparty at every moment until the market closes." Trade cost is quoted exactly before signing and depends only on pool state before and after (H, Learn page). The SDK exposes an "alpha vector" with parameters P0, mu, eps_alpha, tau, gamma, lambda_s, lambda_d, so the engine looks Dirichlet-like or LMSR-like (M: inferred from SDK source, exact formula NOT FOUND).
- Trade shapes: yes/no on a line, range (inside or outside), linear/call-like payoff, or an arbitrary drawn belief curve. All are just sets of shares on the steps (H).
- Liquidity provider: "In the current version each market has one liquidity provider" who seeds the pool, sets the opening forecast, earns the commission, and keeps whatever the winning step leaves in the pool. LP loss is capped at the capital it put in (H).
- Tokenisation: in the play-money engine, a position is a belief/position vector stored by the server (`position_vector`, `claims`, `collateral`), not a token (M, SDK source). On-chain share tokenisation (ERC-1155? ERC-20? internal accounting?) is NOT FOUND (searched: functionspace.dev pages, GitHub org functionspace (0 public repos), SDK repo, indexSPACE repo listing).

## Chains and collateral

- Target chain: Arbitrum (H: "functionSPACE is building on Arbitrum", Learn page; M: CoinTurk 6 Oct 2026 says it "has launched on Arbitrum" but trading is not available and a waitlist is open).
- Testnet usage seen: indexSPACE vaults run on Base Sepolia (H, https://functionspace.dev/ecosystem/indexspace/).
- Contract addresses: NOT FOUND (searched: all functionspace.dev pages for 0x addresses, indexSPACE repo tree). No verified mainnet deployment found.
- Collateral token: NOT FOUND for the on-chain version. Learn page illustrations mention USDC in wallet mock-ups, but those are labelled illustrative (L). The old engine used an internal USD-denominated "walletValue" balance per account (play money, H via SDK docs `core.txt`).

## Read API

- Exists today: **no working public read API.** The only REST engine is suspended and no contract addresses are published, so classification is `none` (previously `official-authenticated`/guest-read for the play-money engine).
- Historic official-ish REST engine (play-money). Base URL appears in SDK docs env example: `https://fs-engine-api.onrender.com` (H that the string is in `packages/docs/.env.example` of the SDK repo; H that it returns 503 suspended now).
- Docs URL: https://docs.functionspace.dev (503 suspended, H). Content survives in the SDK repo: `packages/docs/static/{llms,core,react,ui}.txt`.
- Endpoints (H from SDK source, not observed live because the host is suspended):
  - `GET /api/views/markets/list` : list markets (`markets[]` with `alpha_vector`, `market_model_params`, `num_buckets`, `lower_bound`, `upper_bound`, `current_pool`, `total_positions`, `open_positions`, `total_deposited`, `total_withdrawn`, `title`, `metadata.x_axis_units`, `metadata.decimals`, `is_settled`, `settlement_outcome`, `market_id`, `created_at`, `expires_at`, `resolved_at`, `market_type`, `market_subtype`)
  - `GET /api/views/markets/{market_id}` : one market
  - `GET /api/views/positions/{market_id}` : positions
  - `GET /api/views/history/{market_id}?limit=&offset=` : alpha-vector snapshots over time
  - trade history query exists in SDK (`queryTradeHistory`), path not recorded
  - `POST /api/views/preview/payout/{marketId}` : payout preview
  - `POST /api/auth/login`, `POST /api/auth/signup`, `GET /api/auth/me`
- Auth: guest read mode sends header `Username: guest` on GET requests; trading requires a bearer JWT from `/api/auth/login` (username and password, newer docs mention API key and passwordless email/SMS) (H, SDK source and `core.txt`).
- Rate limits and websocket: NOT FOUND (searched: SDK source, core.txt, llms.txt, site pages).
- A consensus price for an aggregator would be derived client-side: normalise `alpha_vector` to a probability mass over buckets, then integrate over any threshold to get P(X > line) (M: derived from SDK `discoverMarkets` mapping).
- Fixtures saved (none are live market data because the host is suspended): see Fixtures.

## Trade path

- Today: none for real money. The SDK `buy(client, marketId, belief, collateral, numBuckets)` and `sell(...)` call `POST /api/market/trading/buy/{marketId}` and `POST /api/market/trading/sell/{marketId}/{positionId}` with a bearer token, against play-money balances (H, SDK source). The host is suspended.
- Planned: on-chain trades on Arbitrum ("quoted exactly before signing", "pays up front", "sell back to the pool at the current price less the commission") (H, Learn page). Signing scheme and ABI NOT FOUND.
- Position lifecycle: buy, optional sell back before close, settle after the resolver reports (H).

## PayBox reachability

- **paybox_reachable: no (today).** There is no live on-chain market and no published contract address, so there is nothing to send a transaction proposal to. The old REST engine uses username/password and play money, which is not a PayBox signing flow.
- Future: if the Arbitrum contracts launch with plain `buy`/`sell` calls and a standard ERC-20 collateral, an EVM wallet on Arbitrum reachable through PayBox could trade via transaction proposals (approve + buy). That depends on contract details that are not published (L, inference).

## Fees

- A commission is charged on every trade and on sell-backs; it "is the same at every state of the market and does not widen when the market is busy". The LP earns it (H, Learn page). Rate: NOT FOUND (searched: Learn, Explore, home, SDK docs). Settlement fee: NOT FOUND. Market-creator revenue share exists conceptually ("paid out of the commission on every trade it does, from every application that lists it", H, home page) but the split is NOT FOUND.
- Buying then selling the same shares costs the spread (H).

## Resolution and dispute risk

- Stated: "Resolver: Reports the outcome once the number is published." After close, outcome is reported and winning shares pay $1 each; the LP takes the rest of the pool (H, Learn page).
- Who the resolver is, what source data are used, and any dispute or challenge window: NOT FOUND (searched: Learn, research index, SDK docs). In the SDK, `resolutionState` can be `open | resolved | voided`, and "Markets can be resolved server-side" (H, `core.txt`), i.e. centralised resolution in the play-money engine.
- Dispute risk: unknown and likely centralised or LP/creator-controlled at launch. Treat as high until a resolver design is published. A Feb 2026 research post compares delegated (Kalshi) and collective (UMA, Reality.eth, Chainlink) confirmation but does not say which functionSPACE uses (M, headline only).
- Manipulation: LP can change pool between two trades ("any gain comes out of the provider's own capital, with a cap on each action") (H, Learn FAQ).

## Geo, ToS, automation

- Terms of Service: "being prepared and will be published" (H, https://functionspace.dev/terms/). Geo restrictions NOT FOUND. Core contributor is an Australian pty ltd; no jurisdictional rules published.
- Automation: SDK docs recommend constructor credentials "for scripts and bots" and offer an API-key mode, so bots are anticipated (M). No explicit permission or prohibition found.
- Access today is by waitlist (Trade, Provide liquidity, Invest, Integrate); invites are handled by the team via Telegram or email. Do not sign up on the project's behalf.

## Liquidity

- No real-money volume, TVL, or OI. Play-money only (H). The Explore page figures (e.g. pool $1.92M, 24h volume $4.18M, DEX pool tables) are explicitly "illustrative" mock-ups and must not be used (H).
- indexSPACE: 2 live async vaults on Base Sepolia (testnet) and 36 curated functionSPACE markets (H, 2026 indexSPACE page, date not stated).
- Funding: $1.7M pre-seed, 24 Sep 2026 (M). X following about 800 in May 2026 (M, Foresight News, stale).

## Event categories (arbitrage overlap)

Market topics shown in 2026 materials, all on the play-money engine or illustrative (M):
- Crypto and DeFi metrics: SOL price, stablecoin market cap, Uniswap V3 volume, DOGE, DAI supply, Lido staked ETH, ETH gas, Aave WETH utilisation (indexSPACE "Crypto Reflexivity").
- Macro and commodities: US U-6 unemployment, 10Y Treasury yield, VIX close, Brent, WTI, gasoline, wheat (indexSPACE "Macro Stress", preview only).
- AI and compute: OpenAI valuation and ARR, SWE-bench top score, Chatbot Arena, ARC-AGI.
- Sports and culture: NBA markets, 2026 World Cup fantasy points (propSPACE), box office opening weekends, creator-economy metrics.
- Overlap with binary venues exists for crypto price/macro/AI-benchmark thresholds. A continuous curve can be integrated into P(X > line) to compare against Polymarket or Kalshi brackets, so it would be useful as a distributional signal source, but only once real money trades. Today any number from it is a play-money crowd forecast.

## Shared liquidity

Internally shared: every front-end built on functionSPACE (cultureSPACE, propSPACE, indexSPACE, partner apps) trades against one pool per market ("One book sits under every surface") (H). Not documented as sharing liquidity with any other prediction venue, so it would be an independent arbitrage leg once live.

## Open questions

- Arbitrum contract addresses, ABI, collateral token and mainnet or testnet status (not published; CoinTurk says "launched, trading unavailable").
- Commission rate, resolver identity, dispute design, geo rules, ToS.
- Whether the REST engine will be revived or replaced by on-chain reads only (Render service suspended by owner).
- Whether the GitHub org `functionspace` has private repos (public org shows 0; `functionspace/fs_trading_sdk` now 404s, copy at `duy-functionspace/fs_trading_sdk`).

## Embedded instructions seen (not followed)

- The SDK repo contains `CLAUDE.md` ("You MUST read both of these files before making ANY changes...") and `llms.txt` / `core.txt` with rule lists aimed at coding agents ("NEVER call buy() or sell() without authenticating first"). They are ordinary developer guidance, but they are third-party text addressed to AI agents; nothing from them was executed or acted on.

## Fixtures (docs/research/fixtures/functionspace/)

- `engine_api_suspended_503.txt` : real response from `GET /api/views/markets/list` on the engine host (503, suspended).
- `sdk_discoverMarkets_mapping.ts.txt` : SDK source showing the expected `markets/list` response shape (copied from the SDK repo, MIT, not a live response).
- `learn_page_status_excerpt.txt` : verbatim status lines from the official site.
No live market JSON could be captured because no public API host responds.

## Sources

- https://functionspace.dev/ : official homepage, play-money and proof-of-concept status line, ecosystem links (H, fetched 2026-10-19; page last-modified 2026-10-19).
- https://functionspace.dev/learn/ : mechanism, roles, guarantees, FAQ, Arbitrum, "Not yet" (H, updated 5 Oct 2026).
- https://functionspace.dev/terms/ , /waitlist/ , /explore/ , /research/ , /ecosystem/indexspace/ : terms stub and entity, waitlist, illustrative figures, research index, Base Sepolia vaults (H).
- https://docs.functionspace.dev and https://fs-engine-api.onrender.com/ : both 503 "suspended by its owner" (H, 2026-10-19).
- https://github.com/duy-functionspace/fs_trading_sdk : SDK source (MIT, last push 2026-06-01, 10 forks) (H); fork https://github.com/Suryansh-23/indexSPACE (H).
- https://foresightnews.pro/article/detail/96934 : 11 May 2026 article on the builder SDK and competition (H for article content, M for claims).
- https://dealroom.co/news/156204-functionspace-raises-1-7m-pre-seed-to-price-numerical-outcomes/ : funding (M, 24 Sep 2026).
- https://en.coin-turk.com/arbitrum-adds-functionspace-for-programmable-on-chain-markets-arb-trades-at-0-20/ : Arbitrum deployment, trading not yet available (M, 6 Oct 2026).
- Not reached: medium.com article "Information as Capital" (403); web search budget was exhausted mid-task, so no further independent coverage (e.g. exchange listings, token) was checked.
