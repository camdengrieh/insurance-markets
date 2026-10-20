# dr-manhattan (guzus/dr-manhattan) - venue spec for the aggregator / arbitrage scanner

Researched 2026-10-19. Read-only: `gh api` raw file reads, public unauthenticated GETs, WebFetch, WebSearch. No accounts, keys, wallets, signing, POST/PUT/DELETE, no third-party code cloned, installed or run.

Tags: H = read first-hand in a primary source this session; M = secondary or inferred; L = weak or stale.

## Verdict

**adapter_priority: skip.** dr-manhattan is a client-side Python library ("CCXT for prediction markets"), not a venue. It has no market, no liquidity and no hosted data service of its own, so it can never be an arbitrage leg (H). As a dependency or signal source it is also poor:

1. Its Kalshi parser no longer matches Kalshi's live response, so it silently reports every Kalshi market at 0.50 (details below; H code + H live GET). A scanner built on it would see phantom arbitrage.
2. Its cross-exchange module is a hand-written outcome-mapping table plus a raw price-difference calculation; the automatic matchers are TODO stubs; no fees, no depth (H).
3. Licence is unclear (three conflicting statements, no LICENSE file).
4. Trading needs raw private keys in process; there is no external-signer seam on `main`, so a PayBox wallet cannot drive it.
5. Quiet and unhealthy: last commit on `main` 2026-07-12 (about 99 days before today), scheduled contract-drift CI failing on every one of its last 30 runs, the hosted MCP server is gone, PyPI has one release from 2025-12-07, about 21 PyPI downloads a month.

Possible uses: a second-opinion reference for field mappings of Opinion and Predict.fun, and its fixture-replay plus live-drift-probe test pattern (see Integration notes). `docs/research/14-platform-of-platforms.md` already rates it IGNORE; this note agrees.

## Identity and liveness (still live: partly)

- Repo https://github.com/guzus/dr-manhattan: created 2025-10-25, 204 stars, 36 forks, 27 open issues (includes open PRs), not archived, `pushed_at` 2026-07-18, **latest commit on `main` 2026-07-12** ("Remove stale docs.html rewrite from Pages deploy (#103)"). Contributors: guzus 44 commits, then 0xghXst 7, bullish-lee 2, others 1 (H, `gh api`, 2026-10-19). The 2026-07-18 push was to branches of open PRs #104 (live QA lane) and #105 (Privy signer), not merged (H).
- Only GitHub release/PyPI version: `0.0.1`, 2025-12-07 (H, PyPI JSON). **More than 6 months old; possibly stale.** The PyPI description shows only Polymarket and Kalshi logos, i.e. it predates Opinion, Limitless and Predict.fun support. `pyproject.toml` on `main` says `0.0.2`; `__version__` says `0.0.1` (H). PyPI downloads 21 last month (pypistats, H).
- Marketing site https://drmanhattan.xyz returns 200 (GitHub Pages, last-modified 2026-07-12; Vite/React SPA, so WebFetch returns only the title). `dr-manhattan.io` (named in the wiki as the wallet-approval page) **does not resolve** (H, curl and dig).
- **Hosted remote MCP server is dead**: `GET https://dr-manhattan-mcp-production.up.railway.app/health` returns HTTP 404 `{"status":"error","code":404,"message":"Application not found",...}` (H, fixture `hosted_mcp_health_2026-10-19.json`). The README, wiki and site still advertise it (H). Read as: no app is attached to that Railway domain (M on "decommissioned").
- **CI health** (H, `gh api` actions): scheduled `contract-drift.yml` (live-API schema check): all 30 most recent runs `failure`, newest 2026-09-16, none after (scheduled workflows are auto-disabled after 60 days without repo activity, M). `ci.yml` last run 2026-08-18: tests and lint pass, `build` job fails at "Check package with twine".
- Show HN post by the author (id 46355238, about 10 months ago, 2 points, no discussion; H via WebFetch). Search snippet attributes the project to "Decipher Global" via the maintainers' X account; unverified, x.com returned HTTP 402 to WebFetch and I stopped there (L).
- Ports: `gtg7784/dr-manhattan-ts` (npm `@alango/dr-manhattan` 1.0.0, MIT, last push 2026-10-15, 56 stars, 82 npm downloads last month) and `gtg7784/dr-manhattan-rust` (no licence, last push 2026-01-04, stale) (H).

## Kind and market model

- Kind: **client library plus optional local MCP server**; a CCXT-style `Exchange` ABC with five wrappers: `polymarket`, `kalshi`, `opinion`, `limitless`, `predictfun` (H, README, `dr_manhattan/__init__.py`). Nothing else is wrapped (so no XO, Trueo, Myriad, Manifold).
- Unified `Market`: `id, question, outcomes[], close_time, volume, liquidity, prices{outcome: 0..1}, metadata{}, tick_size, description`; `Orderbook` with `bids/asks` as `(price, size)` tuples; `Order`, `Position` (H, `models/*.py`). Prices outside [0,1] raise in `__post_init__`.
- Binary and categorical are representable (outcomes list); scalar is not. Venue model is each venue's own CLOB (all five are order books); outcomes are tokenised per venue (Polymarket/Limitless/Opinion/Predict.fun ERC-1155 CTF tokens, Kalshi is a CFTC contract with no token; the wrapper fakes `clobTokenIds = [ticker, ticker]` for Kalshi) (H, `kalshi.py`).
- Cross-exchange module (`dr_manhattan/cross_exchange/`, H): `CrossExchangeManager` takes a **manual** `OutcomeMapping` (slug -> outcome -> exchange -> `ExchangeOutcomeRef`), fetches each market, and `MatchedOutcome.spread = max(price) - min(price)` over `Market.prices`. `matcher.py` strategies (`FedDecisionMatcher`, `ElectionMatcher`, `CryptoHourlyMatcher`, `LLMMatchStrategy`) are all `# TODO`; the doc calls the matcher a "skeleton". No fee model, no order-book depth, no resolution-rule comparison. The only "arbitrage" artefact is open issue #20 "Implement Polymarket <> Opinion Arbitrage example script" (not implemented) (H).

## Chains and collateral

None of its own. Per wrapped venue (H, SKILL.md / wiki): Polymarket on Polygon (USDC.e constant `0x2791...4174` still hard-coded; whether Polymarket has since changed collateral is the Polymarket lane's question), Limitless on Base (USDC), Opinion and Predict.fun on BNB Chain (Predict.fun collateral USDT), Kalshi fiat/CFTC (no chain).

## Read API

- There is **no dr-manhattan API**. "Read" means the library calling each venue's own public API from the caller's machine.
- Base URLs used (H, source): Polymarket `gamma-api.polymarket.com`, `clob.polymarket.com`, `data-api.polymarket.com`; Kalshi `https://api.elections.kalshi.com/trade-api/v2` (demo `demo-api.kalshi.co`); Limitless `https://api.limitless.exchange`, WS `wss://ws.limitless.exchange` (Socket.IO); Opinion `https://proxy.opinion.trade:8443` (API key header required); Predict.fun `https://api.predict.fun`, WS `wss://ws.predict.fun/ws` (API key required even for reads per the author's own PR #104 text).
- Keyless (public) mode works for Polymarket, Kalshi, Limitless only; Opinion and Predict.fun need API keys (H).
- Library rate limit: client-side sliding window, default 10 req/s, 3 retries with exponential backoff (H, `base/exchange.py`). Venue server limits are the venues' (not re-researched here).
- WebSocket: Polymarket (market/user/sports), Limitless, Predict.fun; **none for Kalshi or Opinion** (H, wiki).
- Live-shape check (H, unauthenticated GETs 2026-10-19, fixtures saved): the three public probes the library uses all return 200. Polymarket gamma and Limitless parse as the library expects. **Kalshi does not**: live market objects carry only `*_dollars` strings (`yes_bid_dollars`, `yes_ask_dollars`, `last_price_dollars`) and `*_fp` strings (`volume_fp`, `open_interest_fp`); the integer-cent fields `yes_bid`, `yes_ask`, `last_price`, `volume`, `open_interest` that `kalshi.py::_parse_market` reads are absent. With none present the parser falls through to `yes_price = 0.5`, `volume = 0`, `liquidity = 0`. Example: live `KXFEDDECISION-28JAN-H26` has `yes_bid_dollars 0.0900`, `yes_ask_dollars 0.2100`, `last_price_dollars 0.2200`, `volume_fp 2458.31`, `open_interest_fp 1225.31` (true mid 0.15), and the library would report Yes 0.50, volume 0, liquidity 0. (On the two `mve_filter=exclude` soccer samples the true mid is also 0.50, so the error is invisible there.) This is an inference from reading the parser plus the live response, not an executed run: H on the field absence and on the parser code, M on the resulting values. It matches the failing drift CI (cause not confirmed).
- The library's own docs admit or show drift: its Limitless wiki says the wrapper still uses the older session-cookie login while current Limitless docs describe scoped HMAC tokens; its Kalshi wiki says the wrapper has no Kalshi WebSocket; its Polymarket wiki says "0.5-1% trading fees" while the live gamma payload carries `feesEnabled: true`, `feeSchedule {rate 0.04, takerOnly true, rebateRate 0.25}` (H, all three).

## Trade path

- Programmatic: `create_order / cancel_order / fetch_order / fetch_open_orders / fetch_positions / fetch_balance`, GTC/FOK/IOC (H, SKILL.md). Local MCP server exposes the same plus strategy sessions (market making, spread, spike) (H).
- Signing: local, in process. Polymarket via `py-clob-client` (`private_key` + `funder`); Limitless EIP-712 with `eth_account` (`Account.from_key`) plus session login; Predict.fun via `predict-sdk` / EIP-712, EOA or smart-wallet owner key; Opinion via `opinion-clob-sdk` (`api_key`, `private_key`, `multi_sig_addr`); Kalshi RSA-PSS over `timestamp+method+path` (H, source and wiki).
- **No external signer on `main`.** Searched README, SKILL.md, wiki and source for unsigned-order / prepare / remote-signer APIs: NOT FOUND. Open PR #105 adds a `Signer` ABC (local key or Privy server wallet) for **Limitless only**; it states Polymarket, Opinion and Predict.fun build signatures inside vendor SDKs and still need raw keys (H, PR body, unmerged and unverified end to end by its own text).
- Polymarket "operator" mode (H, `polymarket_operator.py`): the server holds its own key and signs orders with the user's address as funder after the user approves it as operator on-chain. This was the hosted-MCP design; the hosted instance is down.
- Known bug risk in the order path: Limitless orders hard-code `fee_rate_bps = 300` in the signed order (H, `limitless.py` L755), not read from the venue.

## PayBox reachability

**paybox_reachable: no (for dr-manhattan as a dependency).** It insists on a raw private key (or API key and RSA key for Kalshi) in the Python process and has no hook to call `request_wallet_sign`. A PayBox plugin would instead talk to the underlying venues directly and sign their EIP-712 orders through PayBox typed-data signing (plan.md line 101, signing intents include `typedData`): that is possible in principle for Polymarket (Polygon), Limitless (Base), Opinion and Predict.fun (BNB), none of it demonstrated by this library. Kalshi is not reachable from an on-chain wallet at all (fiat account, RSA API key). Those venue questions belong to the per-venue notes.

## Fees

- dr-manhattan charges nothing and takes no cut: no builder code, referral or fee parameter hard-coded anywhere (searched source for `BuilderConfig`/`builder_code`; only the user-supplied Builder credentials in `polymarket_builder.py`) (H).
- It does not model venue fees anywhere in the cross-exchange or strategy code (grep for "fee" finds only order-signing fields in Limitless/Predict.fun and a WS field) (H). Edge computed with it is gross, not net.

## Resolution mechanism and dispute risk

Not applicable to the library. Each venue resolves differently (UMA optimistic oracle on Polymarket, Kalshi rulebook, etc.), and the library copies `description` / `rules_primary` text into `Market.description` but never compares resolution rules across venues (H). That cross-venue rule mismatch is the main non-price risk for any arb and is left entirely to the scanner.

## Geo, ToS and automation

- Licence: **conflicting, effectively unlicensed.** `pyproject.toml` says `MIT`; the site footer says "MIT License"; `SKILL.md` frontmatter says `license: Apache-2.0`; there is **no LICENSE file** (GitHub contents API 404, GitHub `license: null`), although README/wiki link `../LICENSE` (H). The TS port has a real MIT LICENSE. Treat the Python code as not safely reusable until the author adds a file.
- The project has no ToS, no hosted service now, and imposes no geo or automation rules; the venues' rules (e.g. Polymarket geoblocks, Kalshi US-only KYC) apply and are not re-researched here. The project's stated purpose is bots: "run arbitrage and market-making bots" (Show HN text, H).
- The repo uses `@claude`-triggered GitHub Actions that let external users trigger Claude on PRs (README "Contributing with Claude", `claude.yml`; issue/PR #68 "Allow all external users to trigger Claude on PRs") (H). That is a supply-chain consideration if anyone ever vendors it; not a reason to run it here.

## Liquidity

Zero of its own. Adoption proxies (H, 2026-10-19): 204 GitHub stars, 36 forks, PyPI 21 downloads/month, TS port 82 npm downloads/month. No volume, OI or TVL exists to report. The Kalshi/Polymarket/Limitless sample payloads in the fixtures show venue liquidity (e.g. Polymarket "Xi Jinping out before 2027?" volume 15,130,240 and liquidity 577,799 in the gamma response of 2026-10-19), which belongs to those venue notes.

## Event categories overlapping other venues

By construction all of it overlaps, because it only wraps venues other lanes already cover. What the project itself targets (H, repo): Fed rate decisions (`examples/cross_exchange_simple.py` maps Polymarket, Opinion, Limitless and Kalshi Fed-decision outcomes), elections, crypto hourly price (`find_crypto_hourly_market`), sports (a commit message mentions running a World Cup bot live; tennis live-state PR #106 is vendor-authored), weather and Elon-tweet strategies (open issues/PRs #41, #45, #47). Live 2026-10-19 samples show Limitless 5-minute BTC/ETH up-or-down markets (H, fixture), Kalshi soccer props and multivariate combo markets (H, fixture), and Polymarket politics (H, fixture).

## Shares liquidity with

All wrapped venues, by definition: it routes to Polymarket, Kalshi, Opinion, Limitless and Predict.fun and adds nothing. **Not an independent arbitrage leg.** Note for the aggregation layer: Limitless and Predict.fun order signing in the library follows a Polymarket-style CTF-exchange EIP-712 order (with `feeRateBps`), but that is code similarity, not shared books (M on separate books; the venue notes should confirm).

## Integration notes for the aggregation layer

- Do not depend on it. If a venue-adapter reference is wanted for Opinion or Predict.fun, read `exchanges/opinion.py` and `exchanges/predictfun.py` (and wiki pages) as untrusted reference and re-verify against the venue docs.
- Useful design idea to keep: fixture-replay tests plus a scheduled live-contract probe (`scripts/contract_probes.py`, `capture_fixtures.py`) and a `Market.__post_init__` price-range invariant, which is exactly what exposed the Kalshi units change. Worth copying into our adapters, with an alert that actually runs.
- Kalshi gotcha to remember in our own adapter regardless: prices are now dollar strings and sizes `*_fp` strings; do not assume integer cents.

## Not found

- NOT FOUND: a LICENSE file (searched repo root, contents API).
- NOT FOUND: any external-signer / unsigned-order API on `main` (searched README, SKILL.md, wiki, source).
- NOT FOUND: any fee model, depth-aware arbitrage logic, or implemented automatic market matcher (searched `cross_exchange/`, examples, grep "fee"/"arbitrage").
- NOT FOUND: a working hosted endpoint (Railway 404, `dr-manhattan.io` no DNS).
- NOT FOUND: independent user reviews, incident reports or third-party benchmarks (searched web, Show HN thread has no discussion).
- NOT FOUND: a ToS, privacy policy or terms on drmanhattan.xyz (SPA; grepped the repo's `website/src/pages/*.tsx` for "terms of", "disclaimer", "privacy", "at your own risk": no matches; the only legal text is the "MIT License" footer).

## Open questions

- Why `contract-drift.yml` fails: logs not retrieved (needs auth); the Kalshi schema change is the likely cause but not proven (M).
- Whether PR #105 / #104 will merge and add an external-signer seam for Polymarket, Opinion and Predict.fun.
- Whether the Polymarket path still works after any CLOB / collateral migration (library pins `py-clob-client>=0.28.0` and USDC.e); belongs to the Polymarket lane.
- Who operates the project (Show HN author `uncanny_guzus` / GitHub `guzus`; "Decipher Global" attribution is an unverified search snippet).

## Fixtures (docs/research/fixtures/dr-manhattan/)

Unauthenticated GETs on 2026-10-19 with User-Agent `insurance-markets-research/0.1`; all under 50 KB. They are venue responses, saved because they are the three endpoints dr-manhattan's own drift probe uses.

- `kalshi_markets_limit2_2026-10-19.json` (5.5 KB): `GET https://api.elections.kalshi.com/trade-api/v2/markets?limit=2&status=open`; two multivariate combo markets with zero quotes; shows `*_dollars` / `*_fp` fields.
- `kalshi_markets_nonmve_limit2_2026-10-19.json` (3.8 KB): same with `&mve_filter=exclude`; two soccer props with wide quotes (0.05/0.95, 0.01/0.99) and no legacy cent fields.
- `kalshi_markets_fed_limit3_2026-10-19.json` (5.7 KB): `GET .../markets?limit=3&status=open&series_ticker=KXFEDDECISION`; asymmetric quotes, non-zero `volume_fp` / `open_interest_fp`, no legacy cent fields; the best demonstration of the parser mismatch.
- `polymarket_gamma_markets_limit2_2026-10-19.json` (11.9 KB): `GET https://gamma-api.polymarket.com/markets?limit=2&active=true&closed=false`; includes `feeSchedule`, `clobTokenIds`, `outcomePrices`.
- `limitless_markets_active_limit2_2026-10-19.json` (9.8 KB): `GET https://api.limitless.exchange/markets/active?limit=2`; includes `venue.exchange` verifying-contract address and `collateralToken` (Base USDC).
- `hosted_mcp_health_2026-10-19.json` (0.1 KB): the dead hosted-MCP health response.

## Sources

- https://github.com/guzus/dr-manhattan (README, SKILL.md, pyproject.toml, CLAUDE.md, `dr_manhattan/**` sources, `wiki/**`, `scripts/contract_probes.py`, `.github/workflows/contract-drift.yml`, `website/src/pages/*`); `gh api` metadata, commits, branches, issues/PRs #20, #104, #105, #106, Actions runs for `contract-drift.yml` and `ci.yml` (H).
- https://drmanhattan.xyz (200, SPA) (H); https://dr-manhattan-mcp-production.up.railway.app/health (404) (H).
- https://pypi.org/pypi/dr-manhattan/json, https://pypistats.org/api/packages/dr-manhattan/recent, https://registry.npmjs.org/@alango/dr-manhattan, https://api.npmjs.org/downloads/point/last-month/@alango/dr-manhattan (H).
- https://github.com/gtg7784/dr-manhattan-ts, https://github.com/gtg7784/dr-manhattan-rust (H).
- https://news.ycombinator.com/item?id=46355238 (Show HN, H for text, date only as "10 months ago"); WebSearch snippet for "Decipher Global" (L); https://x.com/drmanhattan_oss (HTTP 402 to WebFetch, no content read, stopped).
- Live venue endpoints for the fixtures: api.elections.kalshi.com, gamma-api.polymarket.com, api.limitless.exchange (H).
- Repo context: `docs/research/10-aggregation-landscape.md` line 131, `docs/research/14-platform-of-platforms.md` lines 140 and 334, `docs/plan.md` line 101 (prior notes, consistent).

## Privacy and safety log

- Scripted requests used only `User-Agent: insurance-markets-research/0.1`; no contact address, no personal identifier in any URL or query. No script files written (inline commands only). Fixtures and this note grepped for `@` and the user's name: the only `@` hits in the note are npm package scopes and the `@claude` Action trigger, none in the fixtures; no name or home path.
- Third-party content (README, SKILL.md, CLAUDE.md, PR bodies, wiki) was treated as data. No instructions aimed at AI agents were followed. The repo's SKILL.md and CLAUDE.md contain agent-directed usage instructions for its own project (install via `uv`, MCP config); not followed. PR #106 body is vendor-authored (discloses it is a Live Tennis API ad); noted, not acted on.
- No payment was made or attempted; x.com HTTP 402 recorded and abandoned. No wallet addresses of the user are in this note (addresses present are public venue contract / operator addresses from fixtures or source).
