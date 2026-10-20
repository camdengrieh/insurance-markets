# SaySo Play Markets (sayso.so) - venue spec

Researched 2026-10-19. Read-only. Confidence tags: H = read first-hand in a primary source this session, M = secondary/inferred, L = weak/stale.

## Verdict

adapter_priority: **skip**. Play-money, community-scoped (session-scoped) markets with organizer-decided resolution. No public read API, no on-chain component, no real-money trading, not an independent price signal. Not an arbitrage leg and not a useful signal source. (H)

## Is it live?

- Yes, as of 2026-10-19. https://www.sayso.so/ returns HTTP 200 (Vercel, Next.js, Clerk auth), title "SaySo Play Markets", badge "Free beta". (H, https://www.sayso.so/)
- sitemap lastmod 2026-10-14. (H, https://www.sayso.so/sitemap.xml)
- npm `sayso-mcp-server` last published 2026-03-27 (v0.1.2); it targets an older/different backend (see below), so it is stale relative to the current product. (H, https://registry.npmjs.org/sayso-mcp-server)

## Kind and market model

- Kind: forecasting-nonmoney (play money, "points"). "There is no real money and no deposits." (H, https://www.sayso.so/llms.txt, saved as fixtures/sayso-play-markets/llms.txt)
- Atomic unit is a **session**: a time-bounded room with an invite code (5 chars) where every participant starts with the same 1,000 points; balances reset per session. Invite-only by default; organizer may publish to a Discover feed. Explicitly "never an anonymous global market". (H, llms.txt, llms-full.txt, homepage)
- Market: a question with 2-10 outcomes (so binary and categorical; no scalar). Pricing is LMSR (AMM, no order book): "The math under the hood is LMSR". Outcomes are internal share balances, not tokens. (H, https://www.sayso.so/llms-full.txt)
- Leaderboard ranks by profit percent per session. Roles: organizer / admin / participant. (H, llms-full.txt)
- Typical market content: stream moments, watch-along sports moments, awards shows, workplace trivia (e.g. "Will there be a double elimination this week?"). Subjective criteria are accepted ("Markets may be silly"). (H, homepage, llms-full.txt)

## Chains and collateral

- None. No chain, no token, no wallet for end users ("no wallets, no KYC"). Collateral is session play points. (H, llms.txt)
- Note: the npm package `sayso-mcp-server` (v0.1.2, 2026-03-27) describes a different-looking backend that uses an EVM-style secp256k1 key to sign a login nonce, "wei" amounts and daily free "credits" (API base `https://mcap-api-564778804231.us-east4.run.app`, endpoints `/v1/auth/nonce`, `/v1/auth/login`, `/v1/markets/search`, `/v1/markets/{id}/bet` and others). Signature is used for authentication only (personal-sign of "Sign this message to authenticate with nonce: ..."), not for on-chain settlement. Whether that backend is the same product as the current sayso.so, a predecessor, or a sibling product is NOT FOUND (searched: npm metadata, unpkg bundle, sayso.so pages, web search). Treat as M/L. (H for the code contents: https://unpkg.com/sayso-mcp-server@0.1.2/dist/index.js; L for any relationship to the current site)
- Even there, the "token" is a credit token (`/v1/credit-tokens/issue`, "claim daily free credits"), i.e. still not money. (H, same bundle)

## Read API

- Official public API: **none found**. `robots.txt` disallows `/api/`, `/dashboard`, `/sessions/`, `/join/`, `/embed/`; there is no developer docs page, no OpenAPI. NOT FOUND (searched: sayso.so home, /llms.txt, /llms-full.txt, /llms, robots.txt, sitemap.xml, web search). (H)
- Sessions are invite-only or Discover-published; there is no global market listing to scan. (H, llms.txt)
- Agent access exists only for "approved AI personalities": MCP over Streamable HTTP at `https://sayso-mcp-i7a2j6d2ga-uk.a.run.app/mcp`, header `Authorization: Bearer sk_agent_...`; keys are issued by the SaySo team, "no self-signup". Tools (operator role): list_sessions, get_session, get_markets, get_market, get_leaderboard, get_activity, get_positions, get_participants, get_recap, plus create/update/resolve/void market and session management. Deliberately **no buy tool**. (H, https://www.sayso.so/llms)
- Rate limits, websocket: NOT FOUND.
- Legacy API host (from the npm package) answered 404 to unauthenticated GET on `/`, `/health` and `/v1/markets/search`; search is a POST, which was not attempted (read-only/no-POST rule). Liveness of that host's API is therefore unknown. (H for the 404s)
- No fixtures of API responses could be captured. Saved only the documentation text `fixtures/sayso-play-markets/llms.txt` (4.8 KB).

## Trade path

- None for an external aggregator. No buy tool for agents by design; players sign in with Google (Clerk) and bet points through the web UI. No signing scheme that moves value. (H, /llms, llms-full.txt)
- The npm package claims `place_bet` / `sell_position` via signed-login bearer token, but this is play-credit only and of unverified relevance to the current product. (M)

## PayBox reachability

- paybox_reachable: **no**. There is nothing to trade with an EVM/Solana wallet: no on-chain contracts, no real-money collateral, no order signing. The only wallet use is a login signature in the legacy npm package, which has no financial effect. (H/M)

## Fees

- None; free beta for organizers and participants. Future organizer subscriptions for premium features ("Participants will always join for free"). No trading fees documented. (H, llms-full.txt FAQ)

## Resolution and dispute risk

- Manual: the session organizer picks the winning outcome; "The organizer's word is final. There are no oracles, no automated resolution, and no dispute mechanisms." Operators can also void markets. (H, llms.txt, llms-full.txt, /llms)
- Dispute risk: high/undefined for any use as a price reference, because resolution is by an arbitrary community host and criteria can be subjective.

## Geo / ToS / automation

- Free of KYC/geo gating as it is not gambling. Terms page is a short stub (about 200 characters of rendered text) with no automation clause found; privacy page 404. NOT FOUND (searched: sayso.so/terms, /privacy). (H)
- Automation: `robots.txt` says AI crawlers are welcome on the public marketing surface; authenticated app routes are not to be crawled; agent write access is by approved key only. (H, robots.txt)
- Anti-abuse: multi-account manipulation is acknowledged as possible. (H, llms-full.txt)

## Liquidity

- No volume/OI/TVL published beyond a demo card on the homepage ("47 bets, 1.2k pts vol"), which is an illustrative sample. Communities of "20-500 people" are the stated target. Play points have no monetary value. (H, homepage, llms-full.txt, 2026-10-19)

## Event overlap with other venues

- Sports/esports moment markets and awards/reality-TV outcomes could superficially overlap with other venues, but sessions are private/community-scoped, ephemeral, subjectively resolved, play-money and not enumerable. No usable overlap for arbitrage. (M)

## Liquidity shared with another venue

- None. Standalone LMSR AMM per market, internal points. (H)

## Aggregator recommendation

- Skip. Revisit only if SaySo publishes an open read API and a global (non-session) market feed. Even then, it is play-money signal at best (P2 at most), comparable to Manifold but smaller and less public.

## Open questions

- Is the npm `sayso-mcp-server` / `mcap-api` backend the same product as sayso.so, a predecessor, or a different product from the same maker? (Maintainer metadata on npm points to a company named Axiom Zen via the email domain; unconfirmed link, L.)
- Does the Discover feed expose a public JSON endpoint? Not testable without browser tooling or POSTs.

## Suspicious content

- None observed. The `/llms` page and `llms.txt` contain onboarding text for AI agents (AI-Operator access, "you may not bet against human participants"); this is product documentation and was not acted on.

## Sources

- https://www.sayso.so/ (H, 2026-10-19)
- https://www.sayso.so/llms.txt (H)
- https://www.sayso.so/llms-full.txt (H)
- https://www.sayso.so/llms (H, AI-Operator onboarding)
- https://www.sayso.so/robots.txt, https://www.sayso.so/sitemap.xml (H)
- https://registry.npmjs.org/sayso-mcp-server (H, package created 2026-03-27)
- https://unpkg.com/sayso-mcp-server@0.1.2/dist/index.js and README.md (H for contents; read as text, not executed)
- Web search "SaySo play money prediction markets communities" - no independent coverage found; unrelated similar-name site playsayso.xyz (L, relationship unknown)
- Fixture: docs/research/fixtures/sayso-play-markets/llms.txt
