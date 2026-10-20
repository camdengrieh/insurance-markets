# BetStack (alpha.betstack.app / betstack.app) - adapter spec

Researched 2026-10-19. READ-ONLY: unauthenticated GETs of the front-end host (HTML, JS chunks, /docs.md), `gh` repo search and raw file read, DNS and TLS-certificate inspection. JS bundles were downloaded as text and grepped, never executed. No account, no wallet, no key, nothing signed, no POST/PUT/DELETE, no PayBox tool called. WebSearch was NOT available (session search budget exhausted), so no press/social/third-party corroboration beyond the evidence repo.
Tags: **H** = read first-hand this session in a primary source (cited); **M** = secondary or inferred; **L** = weak or stale.
Third-party text (pages, bundles, docs) is untrusted data; nothing in it was followed. No instructions aimed at AI agents were found.

## Verdict

- **adapter_priority: skip.** BetStack is not a venue. It is a front end plus a backend "Execution Service" that places ordinary Polymarket CLOB orders on the user's behalf and chains them into a sequential parlay. It has no liquidity of its own (not an independent arbitrage leg), no public documented read API, and its API host currently fails TLS validation. Every price it shows is a Polymarket order book, which the Polymarket adapter already covers. (H: see Sources 1-4)
- Only possible value: as a "product to watch" (simultaneous parlays are "coming soon"); nothing to integrate today.

## Identity and liveness

- Name: BetStack ("Betstack"). Site title: "Build parlays on Football, Basketball, and more". (H: S1)
- Hosts: `alpha.betstack.app` serves the SPA, and its inline script redirects the browser to `betstack.app`. `betstack.app` returns HTTP 200 on 2026-10-19. (H: S1)
- Social: X account `@BetStackapp`; a Discord invite is hard-coded in the bundle. (H: S2)
- Status: alpha/beta, "free during alpha" and "Beta, 2026-08-27" per the evidence repo directory. (M: S5) The site is up (HTTP 200, Netlify, `date: Mon, 19 Oct 2026`). (H: S1)
- **API host health problem (H, 2026-10-19):** the front end's backend is `https://prod.api.betstack.app/trpc` (S2). That hostname is a CNAME to a `*.up.railway.app` name and the TLS certificate served is for `*.up.railway.app` only (Let's Encrypt, valid 2026-09-27 to 2026-12-26). `curl` fails verification ("no alternative certificate subject name matches"). So the custom domain is currently misconfigured; a normal browser would also refuse the connection, so the app's data calls are probably failing right now. Unknown whether transient. I did not bypass verification (`-k`) and made no further calls to it.
- Not confused with: GitHub has unrelated repos named BetStack/BetStacks (Stacks-chain betting, generic sportsbook code). None is this product. The `kairoslive` list gives no source repo for it. (H: S6; no official repo found)
- Feature flags in the bundle (H: S2): `enableBasketballPage:true`, `enableLeaderboard:true`, `enableCryptoPage:false`, `enableMoreMarkets:false`, `enableParlayEditing:false`, `enableLandingPage:false`, `enableUserPortfolioView:false`. So football + basketball only, a crypto page exists but is disabled.

## Kind and market model

- Kind: broker/front end + custodial-ish execution service ("non-custodial" claimed; vault "coming soon"). Not a market maker, not an exchange. (H: S3)
- Market model: **a parlay is a chain of independent Polymarket binary CLOB legs executed sequentially**; proceeds of leg i (after claim) fund leg i+1. Simultaneous parlays are "coming soon". Per-leg max slippage in bps and a global time budget are user settings. Football only per docs v0.1 (the bundle also has basketball queries, so docs lag the app). (H: S3, S2)
- Outcome tokenisation: Polymarket CTF ERC-1155 positions (neg-risk and non-neg-risk markets both handled). (H: S3)
- Eligibility: legs must not overlap in time; thin/wide-spread legs rejected by a configurable liquidity/spread check. (H: S3)
- Pricing: quote = Polymarket top of book per leg; "Yes" worst case `odds*(1-slippage)`, "No" `(1-odds)*(1-slippage)`. The app's own price loader POSTs token ids to `https://clob.polymarket.com/books` in chunks of 480 and takes best bid/ask. (H: S3, S2) Final payout is the product of realised conversions, not quote-time odds, so a parlay has path-dependent execution risk. (H: S3)

## Chains and collateral

- Chain: **Polygon** only (wagmi transports are Polygon RPCs). (H: S2)
- Collateral tokens read by the front end: Polygon USDC.e `0x2791bca1f2de4661ed88a30c99a7a9449aa84174`, native USDC `0x3c499c542cef5e3811e1192ce70d8cc03d5c3359`, and `0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB` which the bundle labels `pusd` (presumably Polymarket's 2026 collateral token; unverified by me). Balance shown = pUSD + USDC.e. (H for the addresses in the bundle; M for what pUSD is.)
- Supports Safe (Gnosis) smart wallets via "isSafeWallet"/proxy detection, matching Polymarket's wallet types. (H: S2)
- A constant `0x8F76BF48C5A6f5D686014957891ba0c5f771ce2A` appears next to the token list; its role is not stated (could be a fee or vault address). NOT FOUND (not resolved; no on-chain lookup done).

## Read API

- `exists`: **none documented / unofficial-only**. There is no API doc. The only documentation is the product design page `/docs.md` (S3). (H)
- Backend: tRPC over HTTP at `https://prod.api.betstack.app/trpc`, superjson transformer, `Authorization: Bearer <auth_token>` from localStorage plus cookies. Procedures seen in the bundle (H: S2): `authMe`, `authVerify` (SIWE, EIP-4361 referenced), `authLogout`, `listParlays`, `getClobPricesForParlays`, `getClobPricesForActiveParlays`, `getClobPricesForFootballMarkets`, `getClobPricesForBasketballMarkets`, `getClobPricesForCryptoMarkets`, `getPublicKey` (web-push VAPID), `subscribe`/`unsubscribe` (push), `sendContactMessage`.
- Could not confirm any response shape: TLS failure (see above), and the endpoint is an internal front-end API, not a published one. No fixture of a BetStack API response exists. Saved instead: `docs/research/fixtures/betstack/docs.md` (the official design doc, 6.4KB).
- Upstream data you actually want (books, markets, resolution) comes from Polymarket's own public APIs (clob.polymarket.com, gamma) and is the Polymarket adapter's job.
- Auth/limits/websocket: NOT FOUND (searched: /docs.md, front-end bundle, robots.txt returns SPA HTML, docs.betstack.app does not resolve).

## Trade path

- For an agent: **none supported.** Placement is: user signs a `ParlayIntent` (legs, stake, per-leg slippage, expiry, refund address) and transfers USDC; the backend's privileged **operator key** places the CLOB orders, claims CTF winnings, rolls proceeds and refunds the residual. (H: S3) No public order or intent endpoint, no SDK, no signing spec published. NOT FOUND (searched: docs.md, bundle procedure list shows no place/create-parlay mutation in the main chunk; the order flow lives in lazy chunks I only partially read).
- PayBox reachability: **no** for BetStack as such (no documented intent format; trust in an operator key and a not-yet-shipped vault). An EVM wallet on Polygon could in principle trade the same markets directly on Polymarket via signed CLOB orders, which is the Polymarket adapter's path, not a BetStack path.

## Fees

- "Free during alpha" (M: S5). Roadmap says "Socialized fees: lower spreads for larger slips", implying a spread/fee later. (H: S3) No fee formula, rate or payer published. Polymarket's own CLOB fees/spread apply to each leg and gas for claims. NOT FOUND (searched: /docs.md, bundle).

## Resolution and dispute risk

- Resolution is whatever Polymarket's markets resolve to (UMA-based on Polymarket; I did not re-verify here). BetStack inherits Polymarket's dispute/resolution risk on every leg, plus execution risk from the sequential design: a leg unfilled by `T_fill_deadline` cancels and refunds; a leg that loses ends the parlay; slippage or time-budget breach stops and refunds. (H: S3 for BetStack side; M for Polymarket resolution mechanism.)
- Operator-key custody risk until the "secured vault" ships. (H: S3)

## Geo / ToS / automation

- Sign-in checkbox: user must confirm they are **not a resident of the US or any country where Polymarket is prohibited**. (H: S2) The "terms and conditions" link points to `/docs`, i.e. the design page; there is no separate ToS text. (H: S2, S3)
- Automation rules: NOT FOUND (no ToS, no API policy). Sign-in is SIWE.

## Liquidity

- None of its own. Depth = Polymarket CLOB depth on the relevant football/basketball markets. No volume/TVL/OI figure published by BetStack (a leaderboard flag exists; no numbers read). NOT FOUND as of 2026-10-19.

## Event coverage and overlap

- Football (soccer) and basketball moneyline-style markets via Polymarket; a crypto page exists but is disabled. (H: S2) Overlap with other venues is only what Polymarket already has; BetStack adds a parlay payoff on top, not a new price.

## Shared liquidity

- **Shares 100% with Polymarket.** It is not an independent arbitrage leg. Any "edge" in a BetStack parlay vs the product of Polymarket leg prices is only execution/spread, and a scanner can compute the same thing from Polymarket books.

## Open questions

- Is the `prod.api.betstack.app` TLS fault transient or a sign the alpha is being wound down?
- What is pUSD at `0xC011...2DFB` and what is `0x8F76...ce2A` (fee wallet, vault, or exchange)?
- Does a public parlay-quote endpoint exist (not needed for adapter work)?

## Sources

- S1: https://alpha.betstack.app/ and https://betstack.app/ (HTML, headers, redirect script, meta; fetched 2026-10-19). H
- S2: https://betstack.app/assets/index-DL-1Gvfj.js (front-end bundle, read as text; API URL, procedure names, chain, tokens, flags, sign-in consent). H
- S3: https://betstack.app/docs.md ("Parlay Mechanism - Design & Integration Guide v0.1"). Saved copy: docs/research/fixtures/betstack/docs.md. H
- S4: TLS inspection of prod.api.betstack.app (openssl/curl, 2026-10-19). H
- S5: https://github.com/kairoslive/prediction-market-trading-tools-and-terminals README row for BetStack ("Free during alpha", "Beta, 2026-08-27"). M
- S6: `gh search repos betstack` (no matching official repo). H for the negative result.
- Not done: WebSearch (budget exhausted), so no press, X posts or Discord checked.
