# Dibs (Dolores Park Labs Inc.) - venue spec

Researched 2026-10-19. Read-only. Tags: H = read first-hand in a primary source this session, M = secondary/inferred, L = weak/stale.

## Verdict

Not a venue. Dibs is an AI/copy-trading front-end for Polymarket (non-custodial interface, order flow goes to Polymarket's CLOB on Polygon). It has no markets, books, resolution or liquidity of its own, and no public API or developer docs. Adapter priority: **skip** (cover it, if at all, through the Polymarket adapter; at most treat Dibs as a possible attribution/builder-fee or smart-money-signal source, which is unverified).

## Liveness (H)

- Marketing site https://www.usedibs.app/ serves a live Next.js page ("Dibs - Your agent for better trades. Find your edge."), with links to Terms, Privacy and Disclosures, plus a web app at https://agents.usedibs.app/ (shows only a "Loading your account / Checking your Dibs access" gate when unauthenticated). [H: usedibs.app, agents.usedibs.app]
- iOS App Store listing "Dibs - Bet Smarter with AI" (id6738373202), developer Dolores Park Labs Incorporated, v1.0 released "25 Mar", latest v1.0.37 on "10 Oct" (page shows no years; since the app store link is live today and the 1.0.x history includes Pro, Gmail/Apple login, live order book view, copy trading, this is an actively updated product; year of the latest release M, most likely 2026). Listed 18+, free with in-app purchases (Dibs Pro). [H: apps.apple.com listing]
- Still live: yes (M-H; site and app listing up, update cadence recent by the listing's own "10 Oct").

## Kind and market model

- kind: broker-or-frontend / AI trading agent and copy-trading UI. [H]
- Markets: those of Polymarket (binary and categorical, central limit order book, outcomes are Polymarket conditional-token (ERC-1155 CTF) positions on Polygon). Dibs "does not process or settle markets itself". [H: Terms s.1/5/20; Disclosures]
- Disclosures page: markets "run on Polymarket ... a decentralized protocol built on Polygon. Orders execute through its central limit order book. Trades are peer-to-peer, and Dibs doesn't act as the counterparty." [H: https://www.usedibs.app/disclosures]
- App Store: "Dibs is a non-custodial interface for CFTC-regulated Polymarket prediction markets." [H]. The marketing site itself names no venue; Terms/Disclosures name only Polymarket; Kalshi is not mentioned. [H]
- Features (H, App Store and site): market discovery across sports, crypto, politics, culture/macro; trader tracking; copy-trading (mirrors a followed trader's new positions with a per-trade cap); AI agents with user-set strategy rules that "monitor markets and execute trades"; live order book view (v1.0.29).

## Chains and collateral

Inherited from Polymarket: Polygon, USDC-denominated collateral (Polymarket's; not independently verified here, see the Polymarket spec). Dibs-specific wallet provider is NOT FOUND (Terms say wallets are self-custodial and refer only generically to third-party auth providers; users "create and control their own wallets"; login via Gmail or Apple suggests an embedded-wallet provider such as Privy, M/L, unverified). (searched: Terms, Disclosures, App Store page)

## Read API

- exists: none (no official public API). NOT FOUND (searched: usedibs.app/docs, /api, /llms.txt, /robots.txt all 404; docs.usedibs.app and api.usedibs.app do not resolve; no GitHub org/repo found via `gh api search/repositories` for "usedibs" / "Dolores Park Labs"; site footer lists only Terms/Privacy/Disclosures; WebSearch budget for the session was exhausted so no further web search was possible).
- agents.usedibs.app is an authenticated web app; its backend endpoints were not probed (would require an account) and are undocumented.
- For market data use the Polymarket read APIs (Gamma, CLOB, Data API) via the Polymarket adapter, not Dibs.
- No fixtures saved (no public API to sample). Directory docs/research/fixtures/dibs-dolores-park-labs/ is empty by design.

## Trade path

- No programmatic/API path to Dibs itself; Terms s.9 prohibits "automating access without authorization" and contain no bot/API rules. [H: https://www.usedibs.app/terms]
- Orders ultimately go to Polymarket's CLOB with the user's own wallet signature, so an aggregator trades Polymarket directly (EIP-712 signed CLOB orders, plus Polygon approvals), not through Dibs.
- PayBox reachability: **no** for Dibs as a venue (no API; no contract of its own). Orders on the underlying venue (Polymarket on Polygon) would be reachable through a PayBox EVM wallet on Polygon only via Polymarket's own signing flow; see the Polymarket spec. Dibs wallets are Dibs/third-party-hosted self-custodial wallets and are not accessible from PayBox. [M]

## Fees

- Terms s.8: "Dibs may charge fees for some Services" plus third-party/network fees; Dibs can change fees at any time. No trading-fee schedule, no builder-fee/revenue-share statement on Terms or Disclosures. [H] Only in-app price seen: Dibs Pro subscription (PHP 1,290 on the PH storefront). [H] Whether Dibs attaches a Polymarket builder fee: NOT FOUND (searched: Terms, Disclosures, App Store, homepage).
- Underlying Polymarket fees apply (see Polymarket spec).

## Resolution and dispute risk

Entirely Polymarket's (oracle/UMA-style resolution at the venue). Disclosures: "Resolution depends on external systems such as Polymarket's resolution mechanisms and oracles, which can fail or produce disputed outcomes." [H] Dibs disputes with users: Delaware law, 60-day informal period, then individual binding arbitration, class-action and jury waiver. [H: Terms s.16-17]

## Geo / ToS / automation

- Terms: not offered to sanctioned persons or where prediction markets/digital assets are prohibited. Mobile buy/sell restricted in Nevada (US) and a list of countries (Afghanistan, Belarus, CAR, Cuba, DR Congo, Haiti, Iran, Iraq, Lebanon, Libya, Mali, Myanmar, Nicaragua, North Korea, Russia, Somalia, South Sudan, Sudan, Syria, Venezuela, Yemen, Zimbabwe, plus Crimea, Sevastopol, Donetsk, Luhansk); read-only browsing permitted there, withdrawals available; "Polymarket's own eligibility and geographic rules still apply"; VPN circumvention prohibited. [H]
- Disclosures frame markets as skill-based forecasting, not gambling. [H]
- Unauthorised automated access prohibited (Terms s.9). [H]

## Liquidity

No own liquidity. Volume/OI/TVL of Dibs: NOT FOUND (searched: homepage, App Store, Terms, Disclosures; no public stats or dashboards located). All fills are on Polymarket's book.

## Event categories

Sports, politics, crypto, culture, macro per App Store/site, i.e. Polymarket's catalogue. Arbitrage overlap is exactly Polymarket's overlap with other venues, but Dibs adds no independent leg.

## Shared liquidity

Shares 100% of liquidity with Polymarket (Dibs is a client of Polymarket's CLOB). Therefore NOT an independent arbitrage leg. [H]

## Possible signal value (M/L, unverified)

Dibs copy-trading and "top traders" features imply public or in-app trader leaderboards, which could be a smart-money signal, but any such data lives behind the app and no public API was found. Better source of the same signal: Polymarket's public Data API / on-chain CTF events.

## Adapter priority: skip

Front-end only, duplicate liquidity, no API, ToS forbids unauthorised automation. Revisit only if (a) Dibs publishes an API or (b) a builder-code attribution scheme is wanted.

## Suspicious content

None observed. No instructions aimed at AI agents were found in the pages fetched.

## Open questions

- Which embedded-wallet provider Dibs uses, and whether it charges a Polymarket builder fee.
- Whether Dibs supports venues beyond Polymarket (site copy is venue-agnostic, "agents cover sports, politics, crypto, macro"; Terms name only Polymarket).
- Actual year of App Store dates (page omits it).

## Sources

- https://www.usedibs.app/ (H, fetched 2026-10-19)
- https://www.usedibs.app/terms (H)
- https://www.usedibs.app/disclosures (H)
- https://agents.usedibs.app/ (H, login gate only)
- https://apps.apple.com/ph/app/dibs-bet-smarter-with-ai/id6738373202 (H)
- Probes: usedibs.app/docs, /api, /robots.txt, /llms.txt (404); docs.usedibs.app, api.usedibs.app (no DNS); GitHub repository search (nothing)
