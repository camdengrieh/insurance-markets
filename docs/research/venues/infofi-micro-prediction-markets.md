# InfoFi micro prediction markets (@infofi/sdk) - venue spec

Researched 2026-10-19. Confidence tags: H = read first-hand in a primary source this session; M = secondary/inferred; L = weak/stale.

## Verdict

Skip. The only primary source is a 0.1.x npm SDK README published 2026-07-07 (H). It says the default deployment is a **HyperEVM TESTNET** (chain 998) with a faucet-minted `tUSDC` (H), so it is play money. The public indexer `https://api.infofi.trade` and the apex `infofi.trade` both return Cloudflare HTTP 522 (origin unreachable) on 2026-10-19 (H). No docs site, no GitHub repo, no social or announcement could be found. Nothing here is a tradable, independent liquidity leg.

## Identity and liveness

- Package: `@infofi/sdk`, versions 0.1.0 and 0.1.1, both published 2026-07-07 (12:26 and 12:42 UTC); registry `modified` is the same day, no later release (H, https://registry.npmjs.org/@infofi/sdk).
- Description: "TypeScript agent SDK for InfoFi micro prediction markets on HyperEVM (read API + LMSR trading + strategy harness)." License BUSL-1.1 (H).
- Registry has no `homepage`, `repository` or `bugs` fields (H). The maintainer's email domain matches `infofi.trade` (H, not recorded here).
- Downloads last month: 72 (2026-09-17 to 2026-10-16), 0 dependents (H, https://api.npmjs.org/downloads/point/last-month/@infofi/sdk and npm search). Negligible usage.
- Liveness probe 2026-10-19 ~07:03-07:05 UTC: `GET https://api.infofi.trade/health`, `/markets?status=open&limit=3`, `/sources`, `/`, and `GET https://infofi.trade/` all returned `HTTP/2 522`, body `error code: 522` (H). DNS resolves to Cloudflare edge IPs and NS are Cloudflare, so the domain is registered and proxied but the origin is down or not reachable. `docs.infofi.trade` does not resolve (H).
- Possible name confusion: the README says "AI-powered micro prediction markets"; the generic "InfoFi" sector (Kaito, attention markets) is a different thing and not this venue (M).
- Is it still live in 2026? "Live" only in the sense of a testnet that has no reachable indexer today. Treat as not live (H for the 522, M for the interpretation; a transient outage is possible, so re-probe once before final removal).

## Market model (H, SDK README; no contract source or docs read)

- Binary YES/NO markets ("micro" markets; categories include a `ship-date` category in the README example, so likely product-ship-date style questions) (M on topic mix, H that the string `ship-date` appears).
- Automated market maker: LMSR. Quotes from on-chain `costOfBuy` / `proceedsOfSell` views; `b` is a per-market parameter (exact big-integer string in the indexer DTO) (H).
- Outcomes tokenised as Gnosis Conditional Tokens (CTF) ERC-1155 YES/NO position ids, derived from `collateral` + `conditionId` (H). Index 0 = YES, 1 = NO.
- Market identifiers: contract address, `MKT-####` code, or "offchain code" (H).
- Lifecycle states include open and FINALIZED; redeem after finalize; "bond amounts" exist in DTOs, which suggests an optimistic resolution with a bond (M).

## Chains and collateral

- Chain: HyperEVM testnet, chain id 998, default RPC `https://rpc.hyperliquid-testnet.xyz/evm`; "immutable HyperEVM testnet deployment" per `deployments/testnet.md` in the (private/unfound) monorepo (H, README).
- Collateral: 6-decimal `tUSDC` (TestUSDC) with a faucet, once per day (H). No mainnet address, mainnet chain, or real USDC mentioned anywhere (H, absence in README; NOT FOUND for any mainnet deployment: searched npm README, npm registry, web search, GitHub repo and code search for "infofi").
- Gas: testnet HYPE (H).

## Read API (official-public per README, currently unreachable)

- Exists: "public indexer" `https://api.infofi.trade`, no key required (H, README). Reachable? No: 522 (H).
- Docs URL: NOT FOUND (searched: npm registry fields, README, web search "infofi.trade", `docs.infofi.trade` DNS). Only the SDK README documents it.
- Endpoints inferred from `ReadClient` method names; the actual paths were not seen, only the parameters (M):
  - `health()`; `markets({category, status: "open", sort: "active"|"newest"|"closing", limit})`; `market(id|address|MKT-####)`; `trades(market, {limit})`; `series(market, {range: "7d", samples: 48})` (price history); `positions(market)`; `leaderboard({limit})`; `sources()`.
- DTOs: `MarketSummary` (has `id`, `code`, `question`, `yesPrice`), `MarketDetail`, `Trade`, `Position`, `LeaderboardEntry`, `Series`, `Source`, `Health`. USDC values are whole-USDC numbers; `b` and bond amounts are strings (H).
- Auth/rate limits/websocket: none documented. NOT FOUND (searched: README, registry).
- On-chain read path: viem calls to market contracts (`costOfBuy`, `proceedsOfSell`, price view, `feeConfig` views) on the testnet RPC (H). Contract addresses are exported in the SDK as `TESTNET_ADDRESSES` / `TESTNET_DEMO_MARKET`; the package tarball was not downloaded or executed (per rules), so addresses were not recorded.
- Fixtures: no real API response could be obtained. Saved only the registry/README evidence and the failed probe (see Fixtures).

## Trade path

- Programmatic, direct on-chain: `TradingClient({privateKey})` with viem: `approveMarket` (ERC-20 approve of tUSDC), `buy(market, outcome, shares, {slippageBps})`, `sell(...)` (needs CTF `setApprovalForAll` operator approval), `redeem(market)` after FINALIZED, `faucet()` (H). No off-chain signed orders, no order book, no CLOB.
- Auth: plain EVM transactions signed by the wallet's key; no API key (H).
- PayBox reachability: **no** for real money. A PayBox EVM wallet could in principle propose the same approve/buy/sell/redeem calls as transactions, but PayBox wallets target mainnets (Base, Ethereum, BNB, Arbitrum, Polygon, Solana) and HyperEVM testnet (chain 998) is not among them, and tUSDC has no value (M, based on the PayBox chain list in the task brief; not verified against PayBox contracts).

## Fees (H, README)

- Per-market configurable fee: buyer pays LMSR cost + fee; seller receives LMSR proceeds - fee. Genesis default 150 bps = 120 bps creator + 30 bps protocol.
- The "currently-live markets are fee-less and don't expose" `creatorFeeBps` / `protocolFeeBps` views, so the SDK falls back to the genesis constant unless told `ZERO_FEE_BPS`.
- Gas paid in testnet HYPE.

## Resolution

NOT FOUND. The README says "after the market finalizes, redeem" and mentions bonds but not who resolves, the oracle, the dispute window or the escalation path (searched: README, registry). The "AI-powered" tagline suggests AI-assisted question generation or resolution (L). Dispute risk: unknown; treat as high.

## Geo / ToS / automation

NOT FOUND (no ToS page reachable; site down). The SDK is explicitly built for agents and ships a "house liquidity agent" example that the README labels as a transparently labelled bot (H), so automation is welcomed on testnet. License BUSL-1.1 on the SDK restricts production use of the code; the venue's own terms are unknown. No geo-block information.

## Liquidity

No volume, OI or TVL figure exists in any source (NOT FOUND: README, registry, web search). On a testnet with a faucet, any such figure would be meaningless. The README admits that activity is seeded by its own "house liquidity agent" that buys random-side $2-5 positions "as the activity floor" (H). Usage proxy: 72 npm downloads/month.

## Event overlap and shared liquidity

- Categories: only `ship-date` is evidenced (H); questions are likely micro/product-specific and unlikely to match Polymarket/Kalshi/XO events (L). No sports/politics/macro/crypto-price overlap is documented.
- Shared liquidity: none; independent AMM, but testnet, so it is not an arbitrage leg anyway.

## Adapter notes (if ever revisited)

- Revisit only if a mainnet deployment and a reachable indexer appear. Then: poll `markets?status=open`, read `yesPrice` (spot probability from LMSR price), use on-chain `costOfBuy` / `proceedsOfSell` for executable price at size and add the fee view. LMSR price impact is deterministic from `b`, so a marginal-price plus quote approach works.
- Signal value: none now.

## Suspicious content

None seen. The README contains no instructions aimed at AI agents beyond ordinary SDK usage. Note: a first scratch-file read gave wrong content because another agent shared the same scratchpad filename (a "Cypher SDK" package); I discarded it, re-fetched to a unique filename and verified the fixture content before saving.

## Fixtures

- `docs/research/fixtures/infofi-micro-prediction-markets/npm-registry-infofi-sdk.json` - registry metadata subset plus full README (12 KB). Note the maintainer contact in the registry doc was deliberately omitted.
- `docs/research/fixtures/infofi-micro-prediction-markets/api-probe-2026-10-19.txt` - record of the 522 responses.

## Sources

- https://registry.npmjs.org/@infofi/sdk (H; README, versions, publish dates)
- https://www.npmjs.com/package/@infofi/sdk (H via registry; same package)
- https://api.npmjs.org/downloads/point/last-month/@infofi/sdk (H; 72 downloads)
- https://registry.npmjs.org/-/v1/search?text=infofi (H; 0 dependents)
- https://api.infofi.trade/health, /markets, /sources and https://infofi.trade/ (H; HTTP 522 on 2026-10-19)
- Web searches "InfoFi micro prediction markets HyperEVM infofi.trade" and ""infofi.trade" prediction markets LMSR HyperEVM testnet" (extended and standard): no page about this venue (NOT FOUND)
- gh search repos/code for "infofi": no matching venue repo (NOT FOUND)
