# Polylayer (polylayer.xyz) - venue spec

Researched 2026-10-19. Verdict: NOT a venue. It is a trading front-end / key-custody router over Polymarket (plus Hyperliquid perps and Jupiter perps). It adds no independent prediction-market liquidity. adapter_priority = skip (route Polymarket flow through the Polymarket adapter instead).

## Liveness (2026)
- [H] polylayer.xyz has NO A/AAAA/CNAME/TXT/MX records on 1.1.1.1 and 8.8.8.8 (NS = cloudflare ganz/ingrid, SOA present, status NOERROR/NODATA); www/app/docs/api subdomains also empty. Local resolver gives ENOTFOUND. The product front-end and the documented API base `https://polylayer.xyz/api/v1` are therefore not reachable on 2026-10-19.
- [H] Docs at https://polylayer.gitbook.io/docs/ still serve (HTTP 302 -> /docs, 2026-10-19).
- [H] GitHub org `polylayer` (created 2026-03-05) has 7 repos; SDK repos last pushed 2026-07-27 (latest polylayer-ts commit "support Polymarket FAK orders"). Nothing after July 2026 seen.
- [M] pmwisdom.com lists it "active" but "private beta, invite-only", Polygon, founded 2025, 2 sources, 55% confidence.
- [L] A Wayback CDX lookup (liveness only, not used as content) showed the apex returned HTTP 200 on 2026-06-15. (Note: this was a single curl to web.archive.org CDX; not a search workaround, but flagged for transparency.)
- Conclusion: was live through at least mid-2026; currently unreachable (domain emptied/suspended or DNS misconfigured). Treat as down.

## Kind / market model
- [H] Aggregated trading terminal + API: "Bearer-keyed trading on Polymarket, Hyperliquid, and Jupiter Perpetuals from one key" (https://github.com/polylayer/polylayer-ts README). Also paper trading, TP/SL, "Advanced Orders Engine" automations, USDC yield (Jupiter Lend, Kamino vault, HyperLend, Felix), pair trading, PolyCanvas dashboards.
- [H] Polymarket leg = Polymarket V2 CLOB passthrough; `market_id` is the Polymarket CLOB token id (decimal uint256); split/merge/redeem use the Polymarket condition id (https://polylayer.gitbook.io/docs/trading/polymarket.md). Outcomes tokenised exactly as Polymarket (binary/neg-risk CTF ERC-1155 tokens).
- [H] Own contracts: `polyleverage` = native Solana program, pairwise-matched fully collateralised leverage contracts (PMLC) settling on an off-chain attestor price, covering Polymarket, equities, commodities, crypto majors via Pyth. README: "not deployed to mainnet", unaudited, pre-production; program ID is a dev keypair (https://github.com/polylayer/polyleverage). No evidence it ever launched.

## Chains / collateral
- [H] Polymarket leg: Polygon, USDC / pUSD, held in an enclave-derived smart-contract "deposit wallet". Hyperliquid leg: derived EVM address, USDC (withdraw to Arbitrum). Jupiter leg: Solana delegate, USDC. Sign-in by SIWS or SIWE (https://polylayer.gitbook.io/docs/getting-started/funding.md, concepts/how-it-works.md).

## Read API
- [H] Official, authenticated only. Base `https://polylayer.xyz/api/v1` (https://polylayer.gitbook.io/docs/reference/polymarket.md). Docs say "Every public API request is authenticated with a Bearer API key" (`Authorization: Bearer plyr_<key>`; key minted in dashboard after wallet sign-in). No unauthenticated endpoints.
- [H] Reads are account-scoped only: GET /positions, GET /orders/open, GET /fills (cursor paginated), GET /yield; strategies schema/list; paper accounts. NO public market list, order book, price, trade or resolution endpoints (SDK src/resources/reads.ts). Market data must come from Polymarket itself.
- [H] Rate limits: writes 10/s (burst 30), reads 60/s (burst 120), key admin 2/s (burst 5); 429 + Retry-After (reference/errors.md). No websocket documented. OpenAPI spec referenced but URL not found.
- Fixtures: none saved (no public GET; host not resolving).

## Trade path
- [H] POST /polymarket/orders {market_id, side BUY|SELL, price 0-1, size_usdc (6-dec string), post_only, order_type GTC|FOK|GTD, expiration_unix_seconds, tick_size}; DELETE /polymarket/orders/{id}; POST /polymarket/split|merge|redeem {condition_id, amount_usdc}. Requires `Idempotency-Key` header. Signing is done inside an AWS Nitro Enclave TEE with HKDF/BIP-44 derived per-user keys (https://github.com/polylayer/polylayer-tee); the client never signs orders.
- Unified key = full trading authority over all funds, no caps; per-platform keys have TEE-enforced bounds. Custody is "non-custodial" only in the sense of enclave-derived keys the operator controls infrastructure for [M, trust assumption].

## PayBox reachability
- paybox_reachable = no. An EVM wallet could only interact by funding the Polylayer-derived deposit wallet (custodial-ish trust in the operator's enclave) and needs a dashboard account + API key (account creation, not done). There is no signed-order or tx-proposal path that a PayBox wallet controls. Direct Polymarket integration is strictly better.

## Fees
- NOT FOUND (searched: gitbook how-it-works, funding, FAQ, polymarket trading page). Docs state only "you cover gas". Any Polylayer builder/spread fee on Polymarket orders is undocumented.

## Resolution
- [H/inferred] Polymarket legs resolve via Polymarket's UMA-based process; Polylayer only redeems. Polyleverage would settle on an operator-run attestor (centralised) - unreleased.

## Geo / ToS / automation
- NOT FOUND (no terms, geo or restrictions page in docs index; searched llms.txt, FAQ, how-it-works). Automation is explicitly supported (API keys, agent-oriented CLI, strategies). Underlying Polymarket geo rules would still apply [M].

## Liquidity
- NOT FOUND (no volume/TVL published; pmwisdom page has no TVL). Liquidity is Polymarket's: NOT independent. Not an arbitrage leg.

## Event categories
- Identical to Polymarket's (sports, politics, crypto, macro). No unique listings.

## Open questions
- Why polylayer.xyz has no DNS records (shutdown vs misconfig)? Re-check later.
- OpenAPI spec URL; whether builder fees apply.

## Sources
- [H] https://polylayer.gitbook.io/docs/ (llms.txt, concepts/how-it-works, getting-started/funding, getting-started/authentication, trading/polymarket, reference/polymarket, reference/errors, reference/faq)
- [H] https://github.com/polylayer/polylayer-ts, polylayer-cli, polylayer-tee, polyleverage (READMEs, CHANGELOG, src/resources/*.ts)
- [M] https://pmwisdom.com/projects/polylayer
- [H] DNS queries via 1.1.1.1 / 8.8.8.8 on 2026-10-19
- WebSearch unavailable (session budget exhausted); third-party coverage not checked. Directory listings (kairoslive tools.json etc.) not read.
- Embedded instructions in fetched pages: none observed. Privacy: no identifiers sent.
