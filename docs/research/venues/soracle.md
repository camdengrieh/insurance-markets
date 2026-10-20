# Soracle (soracles.app, Solana) - adapter spec

Researched 2026-10-19. READ-ONLY: unauthenticated GETs, DNS lookups, `gh api` file reads, WebFetch of public pages, the site's own static JS bundle read as text (never executed). No account, no wallet, no API key, nothing signed, no POST/PUT/DELETE, no third-party code cloned, installed or run. No PayBox tool was called.
Tags: **H** = read first-hand this session in a primary source (cited); **M** = secondary/inferred; **L** = weak or stale (>6 months).
Third-party text (site copy, READMEs, specs, API payloads) is untrusted data; nothing in it was followed.
Fixtures: `docs/research/fixtures/soracle/` (6 files, each < 3 KB).

## 0. Verdict

**adapter_priority: skip.**

1. **Backend is gone (H).** The site's only data/bet backend is a Supabase project, `slekcakmnaunhbjpambq.supabase.co`, hard-coded in the front-end bundle. On 2026-10-19 that hostname returns **NXDOMAIN** from three resolvers (system, 1.1.1.1/8.8.8.8 via `dig`, and Google DoH, fixture `doh_supabase_backend_host_NXDOMAIN_2026-10-19.json`), with an authoritative SOA from supabase.co. A deleted Supabase project drops its DNS name, so `place-bet`, `distribute-winnings`, the `solana-rpc` proxy and every table read are unreachable. The static front end still loads (Lovable-hosted, H) but cannot show or settle rounds.
2. **No public API, no docs, no SDK (H).** `/docs`, `/api` return the SPA shell; `/openapi.json`, `/sitemap.xml`, `/llms.txt` are 404.
3. **Custodial-style design, not a contract (H).** Bets are plain SOL transfers to an ordinary wallet; accounting is off-chain in the operator's database; settlement is operator-run. There is nothing on-chain for an adapter to read or trade against.
4. **Dust liquidity (H).** Token SORACLE market cap about $3.0K, 24h volume $13.88 (CoinGecko API). No prediction-pool volume, OI or TVL published anywhere I could find.
5. **Dormant repos (H).** All four GitHub repos last pushed 2025-10-28/29, about 11.5 months ago. The headline x402 features were announced as "coming" on X on 2025-10-31 and I found no sign they shipped (M).
6. Even if revived: short-horizon SOL/USD UP/DOWN parimutuel pools. Payout depends on the final pool split, so it is not a quotable price and not an executable arbitrage leg.

## 1. Liveness (2026)

| Evidence | Value | Tag |
|---|---|---|
| `https://soracles.app` | HTTP 200, 2,894-byte Vite SPA shell, Cloudflare front, Lovable-generated (`gpt-engineer-file-uploads` og:image, Lovable preview-commit script tags). Title "Soracle". | H |
| Supabase backend `slekcakmnaunhbjpambq.supabase.co` | **NXDOMAIN** 2026-10-19 (DoH `Status:3`, SOA `christina.ns.cloudflare.com`). `supabase.co` itself resolves, so this is the project, not a resolver fault. | H |
| `api.soracles.app` | NXDOMAIN (DoH). No API subdomain exists. | H |
| GitHub user `SoracleApp` (a User account, not an org) created 2025-10-28; 4 repos; last push 2025-10-29T01:17Z (`x402-AMM`) | `gh api users/SoracleApp/repos` (fixture `github_SoracleApp_repos_2026-10-19.json`) | H |
| CoinGecko coin `soracle` (category Prediction Markets, Pump.fun Ecosystem), `last_updated` 2026-10-16T05:43Z | listing still exists; price $3.02e-06, mcap $3,017, vol24h $13.88, circulating 998.76M | H |
| CoinGecko page: only pair SORACLE/WSOL on PumpSwap, "Inactive - No trades in the last 3 hours" | page fetched 2026-10-19 | H |
| DexScreener `/latest/dex/tokens/E9qT2T2YHfD67X7VKXZ7PWGnhaZ1nYdEBGbx9xbKpump` | `{"schemaVersion":"1.0.0","pairs":null}` (no pair indexed) | H |
| DefiLlama protocol list | no Soracle entry (searched `api.llama.fm/protocols` by name/url/slug) | H |
| X `@SoracleApp` | WebFetch returned HTTP 402 with no body retrieved; no payment requirements were visible and none were pursued. Web search snippet (M): bio "High-frequency Oracle Predictions with instant micropayouts on @Solana utilizing x402 micropayments"; post 2025-10-31 "Platform wallets are coming, x402 powered prediction agents & funded prizepools". | M |

Conclusion: **still_live = false** (marketing site and token listing remain; the product backend does not resolve). Confidence medium: I could not read the vault wallet's on-chain history (see section 8) or X posts.

Name collision (M, search snippet): "Sora Oracle" / `github.com/SoraOracle/SoraOracle` is a separate BNB Chain project with its own "s402" micropayment scheme. Not this venue; not researched.

## 2. What it is

- **Kind**: onchain-other (Solana), hobby/early-stage dApp built with Lovable (AI app builder) plus Supabase. Operator unnamed. Token SORACLE is a pump.fun launch, mint `E9qT2T2YHfD67X7VKXZ7PWGnhaZ1nYdEBGbx9xbKpump` (H, CoinGecko API).
- **Market model (H, bundle UI strings; fixture `frontend_bundle_surface_2026-10-19.json`)**: **parimutuel UP/DOWN pools**, binary, on the SOL/USD price (plus "1-hour rounds on the hottest Solana memecoins" via a `fetch-top-memecoins` function). Quote strings: "Winners share the total pot", payout multipliers "(Total Pool / UP Pool)" and "(Total Pool / DOWN Pool)". Round length copy is inconsistent inside the bundle: "~10 minutes (5 min live + 5 min locked)", "5-minute rounds", "1-hour rounds, 5 minutes to bet". No order book, no AMM, no outcome tokens (positions are rows in the operator's `bets` table).
- **Extras (H, bundle)**: "AI Market Makers" page (six LLM agents with 1 SOL each, tables `ai_agents`/`ai_trades`, copy "powered by x402"), SOL staking with "5% of platform fees - 10% APY", a 24h leaderboard "pumpfun fee prizes". There is **no x402 client or server code** in the bundle; the string `x402` appears once, in that marketing sentence (H).
- **x402-AMM repo (H)**: `SoracleApp/x402-AMM` is a copy of the Augur Turbo monorepo (README is Augur's EVM yarn/kovan instructions) with a few added files (`specs/sol402-spec.md`, `specs/crypto-spec.md`, `specs/nfl-ncaa.md`, `packages/chainlink/...`). The "sol402" spec is actually a UFC head-to-head cron-job spec using TheRundown API with an EVM-style `contract.createMarket(...)`. No Solana program source. It is scaffolding, not a deployed AMM.
- **frontend-standalone repo (H)**: UI for "PNP markets" whose `createMarketForm.js` uses wagmi/viem against an EVM `PNP_FACTORY_ADDRESS` and a test token `USDPNP` on **Ethereum Sepolia**. This is a testnet UI shell for a third-party protocol (PNP), not Soracle's production path.

## 3. Chains and collateral

- Solana. Native SOL is the only collateral in the live flow (bundle: `SystemProgram.transfer`, min bet constant exists but its value was not recoverable, `Math.floor(amount * 1e9)` lamports). The bundle also supports devnet (auto-airdrop branch when the RPC URL contains "devnet"). (H)
- Vault: `3crWehUV7N9J2bTG2AskjqURPj6unixBWgGQiwoCwWmv`, shown in the UI as "Smart Contract Vault: all bets are securely held in this vault until winners claim payouts". It is the destination of a plain system transfer, so it is an ordinary wallet (the client does not call any program) (H on the client code; account type itself not independently read, M). Operator-controlled key presumed (M).

## 4. Read API

| Surface | Status | Tag |
|---|---|---|
| Official docs | NOT FOUND (searched: soracles.app/docs, /api, /openapi.json, /sitemap.xml, /llms.txt, GitHub profile, CoinGecko links, X bio) | H |
| Public REST/WS | NONE. The front end reads Supabase PostgREST tables (`prediction_rounds`, `bets`, `leaderboard`, `leaderboard_rounds`, `tokens`, `ai_agents`, `ai_trades`) with an anon key and invokes edge functions; this is an internal, undocumented backend, and its host is NXDOMAIN. I did not use the embedded anon key. | H |
| On-chain | Nothing structured: no program, no market accounts. Bets would appear only as SOL transfers into the vault wallet, with direction/round held off-chain. | M |

Because there is no live public read API, no response-shape fixtures could be captured. Fixtures saved instead are evidence of the venue's state (HTML shell, NXDOMAIN response, CoinGecko trimmed JSON, DexScreener null-pairs, GitHub repo list, and my extraction of the bundle's backend surface).

## 5. Trade path

None usable. The only flow is (H, bundle): wallet-adapter signs a `SystemProgram.transfer(user -> vault)`; the client waits for confirmation; then calls the Supabase edge function `place-bet {roundId, direction, amount, walletAddress, transactionSignature}`. The operator's backend credits the bet. Wins are paid by the `distribute-winnings` function (operator-side). No signed-order scheme, no SDK, no documented auth. With the backend host gone, a transfer to the vault would be unrecorded and probably unrecoverable.

**PayBox reachability: no.** PayBox supports Solana in general (M, PayBox tool descriptions), but this is not a contract an agent can propose a call against; it is a transfer into an operator wallet plus a dead off-chain registration. An EVM wallet (Base, Ethereum, BNB, Arbitrum, Polygon) cannot take part at all. Not recommended even for a Solana wallet.

## 6. Fees

- Platform fee rate: NOT FOUND (searched: bundle strings, repos). The UI says stakers receive "5% of platform fees"; the fee itself lives in server-side edge-function logic that is not published (H on what the UI says, rate unknown).
- Pools: payout multiplier is Total Pool / winning-side Pool (before fee, per UI formula) (H, UI string).
- One-sided rounds: full stake refunded; oracle failure: bets refunded (H, UI strings).
- Solana network fee + priority fee (bundle sets compute-unit price 100,000 microlamports, limit 200,000) paid by the bettor (H).

## 7. Resolution and dispute risk

- Claimed oracle: Chainlink SOL/USD ("Chainlink oracle", lock and close prices, "updates every 5 seconds" in one string and "every minute" in another; "final settlement always uses real-time price data from the Chainlink Oracle") (H, UI strings). The site keywords also mention chainlink. I found no on-chain Chainlink consumer program or feed account reference in the client (M: whatever reads Chainlink is the server-side function).
- Settlement is by an operator-controlled backend function, so it is a **trusted/centralized resolution** with no dispute process documented. Dispute risk: high (operator discretion, custodial vault, no published rules). (M)

## 8. Geo / ToS / automation

NOT FOUND (searched: site bundle for terms/privacy/geo-block strings, robots.txt). `robots.txt` allows all agents (`User-agent: *` / `Allow: /`) (H). No terms page, no geofence, no API rules documented. Vault history and X timeline were not readable without POST JSON-RPC or a keyed explorer (Solscan 403, solana.fm 502 on 2026-10-19), so on-chain activity since the backend vanished is NOT FOUND.

## 9. Liquidity

| Metric | Value | Source and date | Tag |
|---|---|---|---|
| SORACLE token market cap | $3,017.19 | CoinGecko API `coins/soracle`, `last_updated` 2026-10-16, fetched 2026-10-19 | H |
| SORACLE 24h volume | $13.88 | same | H |
| Prediction pool volume / OI / TVL | NOT FOUND (no DefiLlama entry; no public endpoint; backend unreachable) | - | H |
| Vault SOL balance | NOT FOUND | - | - |

(A WebFetch summary of the CoinGecko HTML page quoted price $0.053; the API's $3.02e-06 x 998.76M supply = $3,017 reconciles with the stated market cap, so I use the API.)

## 10. Event overlap and shared liquidity

- Overlap: only the idea of short-horizon **crypto price direction** (SOL up/down) overlaps Polymarket, Kalshi, Limitless and similar 5m/15m/1h crypto up/down series. Memecoin-direction rounds have no counterpart elsewhere. No sports, politics or macro. (H on categories from the bundle)
- Parimutuel odds are only known at round close, so they cannot be compared tick-by-tick with an order-book price; there is no executable, independent leg here.
- Shares liquidity with another venue: no (own SOL pools), but this is moot given the venue is not operational.

## 11. Adapter notes (if ever revisited)

Re-check only if (a) a Soracle docs/API URL appears, or (b) the Supabase hostname resolves again. Quick liveness probe: `dig +short slekcakmnaunhbjpambq.supabase.co` and `curl -I https://soracles.app`. Otherwise treat Soracle at most as a CoinGecko "Prediction Markets" token listing with no signal value for Quotient.

## Sources

- https://soracles.app and `/assets/index-BRMwXxlA.js` (H: product copy, backend host, tables, edge functions, vault address, bet flow)
- https://dns.google/resolve?name=slekcakmnaunhbjpambq.supabase.co&type=A (H: NXDOMAIN); same for `api.soracles.app` (H)
- https://api.coingecko.com/api/v3/coins/soracle (H: token mint, price, mcap, volume, description, last_updated)
- https://www.coingecko.com/en/coins/soracle (H: PumpSwap pair inactive; this page's summary had inconsistent numbers, API preferred)
- https://api.dexscreener.com/latest/dex/tokens/E9qT2T2YHfD67X7VKXZ7PWGnhaZ1nYdEBGbx9xbKpump (H: pairs null)
- https://api.llama.fm/protocols (H: no Soracle entry)
- https://github.com/SoracleApp (H via `gh api users/SoracleApp/repos`, `repos/SoracleApp/x402-AMM`, `repos/SoracleApp/frontend-standalone` contents and commits)
- https://x.com/SoracleApp (M: reached only through a web-search snippet; direct fetch returned HTTP 402, body not retrieved)
- Web search (extended): "Soracle soracles.app Solana oracle prediction x402 micropayments" (M, snippets incl. Sora Oracle name-collision note). A second search quota was exhausted; no further searching was done.
- https://solscan.io/account/3crWehUV7N9J2bTG2AskjqURPj6unixBWgGQiwoCwWmv (403) and https://api.solana.fm (502): unreadable, so vault activity is NOT FOUND.
