# Sentinel (sentinel-team.org) - venue spec

Researched 2026-10-19. Verdict: NOT a market. Adapter priority: P2 (signal-only, manual/RSS).

## Status and kind
- Live: yes. Site shows (c) Sentinel Research, Inc. 2026 and the Substack feed has weekly posts through 2026-10-12 (20 items in feed back to 2026-06-01). [H] https://sentinel-team.org , https://blog.sentinel-team.org/feed
- Kind: forecasting-nonmoney. A for-profit research company (Sentinel Research, Inc.) of superforecasters (cofounders: Nuno Sempere of Samotsvety, Rai Sur). Publishes a weekly "Global Risks Watch" briefing on Substack. [H] https://sentinel-team.org
- No trading, no tokens, no collateral, no chain, no order book, no AMM. No wallet interaction of any kind. [H] (site has only: Track Record, Leadership, Sign Up; commented-out sections are lorem ipsum)
- Product pitch in commented-out HTML (not live): "Weekly probability updates on custom questions", "integrate forecasts directly into your systems or access via dashboard and reports" - i.e. a possible future B2B feed. Commented out, so do not rely on it. [M]

## Read API
- NOT FOUND (searched: homepage HTML/JS, /api, /robots.txt, /terms return 404; WebSearch unavailable this session - session search budget exhausted, so no external search was done). No public API, no docs, no websocket, no auth scheme, no rate limits.
- Only machine-readable surface: Substack RSS `https://blog.sentinel-team.org/feed` (unauthenticated GET 200, ~727KB, 20 items). Forecasts are embedded as prose in `content:encoded` HTML, e.g. "Our forecasters think there's a 43% (17% to 68%) chance" for "Will an internationally active financial institution experience an AI-assisted cyberattack resulting in losses > $1B ... before 2028?" and "8.5% (0.3% to 50%)" for a rogue-AI incident question. [H] https://blog.sentinel-team.org/feed , post https://blog.sentinel-team.org/p/hundreds-of-mathematical-solutions (2026-10-12)
- Format: point probability + 80%-ish interval in text (interval definition not verified [L]); no structured fields, no stable question IDs, no resolution criteria in feed excerpt. An adapter would need LLM/regex extraction of the prose = fragile.
- Posts also cite Polymarket odds as an input (e.g. Spain PM, Brazil election, 2028 US election: "We think 12% ... Polymarket gives him 10%"). So the signal is partly derived from, and not independent of, prediction-market prices. [H] feed
- Homepage has a calibration/Brier chart ("Number of Predictions", observed vs predicted) but it is a static/commented block; no data endpoint found. [H] homepage HTML

Fixture: docs/research/fixtures/sentinel-sentinel-team-org/feed-sample.xml (channel header + first item, body truncated to 3KB, contact email redacted).

## Trade path / PayBox
- None. Nothing to trade. PayBox reachable: no (nothing on any chain). Only possible PayBox relevance is paying for a future B2B feed via x402 - not offered. [M]

## Fees, resolution, liquidity
- Fees: NOT FOUND / not applicable. Weekly briefing signup is email; no pricing page found. [H for absence on homepage]
- Resolution: none (no contracts). Forecast questions in briefs are resolved by Sentinel's own judgment; no public resolution rules, so scoring would be unaudited unless they publish the track record. [M]
- Liquidity: N/A. No volume/OI/TVL.
- Geo/ToS/automation: NOT FOUND (no terms/privacy page at /terms; 404). Treat RSS scraping as personal/low-rate use only; the Substack content terms apply to the feed. [L]

## Event coverage / overlap
- AI risk, geopolitics (elections, wars), bio, cyber, economics, climate. [H] homepage, feed
- Overlaps Polymarket/Kalshi/Metaculus-style markets on elections and geopolitics. Useful only as a human-curated "second opinion" probability to compare with market prices (edge signal, not an arbitrage leg). Long-dated tail-risk questions (e.g. "before 2028") rarely have matching liquid markets.
- Shares liquidity with: n/a; but signal is partly anchored on Polymarket prices (see above), so correlation with Polymarket is expected.

## Adapter recommendation
- P2: signal-only. If built, a weekly RSS poller that stores (post_url, date, question text, point estimate, interval) as an annotation layer keyed manually to market links; extraction via LLM with human review. Do not model as a venue/order-book adapter. Re-check for a real API/dashboard feed (commented-out "Built for Your Workflow" section suggests intent) and email hello@ops.sentinel-team.org only if the user wants to ask (not done; no contact made).

## Sources
- [H] https://sentinel-team.org (fetched 2026-10-19, HTML read incl. comments)
- [H] https://blog.sentinel-team.org/feed and /p/hundreds-of-mathematical-solutions (2026-10-12)
- [H] 404s: https://sentinel-team.org/api , /robots.txt , /terms
- WebSearch attempted but refused (session budget); no third-party corroboration of the Samotsvety/Sentinel claims beyond the site itself (site cites a Vox 2024 article on Samotsvety) [L].

## Suspicious content
- None found (no instructions aimed at AI agents in fetched pages).
