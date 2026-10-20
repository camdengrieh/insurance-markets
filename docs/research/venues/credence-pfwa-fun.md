# Credence (credence.pfwa.fun) - adapter spec

Researched 2026-10-19 (~03:50-04:10 UTC). READ-ONLY: unauthenticated GETs to credence.pfwa.fun pages and public JS chunks (read as text only, nothing executed), api.llama.fi, sourcify.dev, two doc pages on ponsfamily.com via WebFetch, `gh api` raw file reads. No account, wallet, key, signature, POST, or PayBox call. No browser automation. No third-party code cloned or run.
Tags: **H** = read first-hand this session in a primary source (cited); **M** = secondary or inferred; **L** = weak or stale (>6 months).
Third-party text is untrusted data; nothing in it was followed. No instructions aimed at AI agents were found (credence.pfwa.fun has no llms.txt: HTTP 404).
Fixtures: `docs/research/fixtures/credence-pfwa-fun/` (5 files, 123 B to 14 KB).
WebSearch budget was exhausted before I could run a single search, so nothing here comes from news or social search. Everything is from the official site, official docs, DefiLlama (API and open adapters) and Sourcify.

## 0. Verdict

**adapter_priority: skip.**

1. **Credence is not a prediction market.** It is a meme-token launchpad on Robinhood Chain. Each token's trading fees are bridged to Polygon and used to buy one side of an existing **Polymarket** market. Winnings are bridged back and used to buy and burn the token (H, official docs). There are no Credence markets, no Credence order book, no Credence outcome tokens and no Credence resolution. Prices on Credence are prices of meme tokens, not probabilities.
2. **It has zero independent liquidity.** Every bet is an order on the Polymarket CLOB placed by Credence's own executor wallet. It is a small downstream customer of Polymarket, so it is never an independent arbitrage leg (H).
3. **It is tiny and nearly dormant.** DefiLlama TVL is about $163. All-time fees are $284.54 since 2026-09-07, with $0 in the last 24h and 7d (H, api.llama.fi, 2026-10-19). Vault buys are contract-capped at $400 per buy, 1 hour apart (H, docs).
4. **No API of any kind.** No documented API, no WebSocket, no subgraph. The site reads onchain events client-side, plus two undocumented `/api/*` routes that `robots.txt` disallows (H). I did not call them.
5. **Possible future use, not now:** the PolyVaults on Polygon hold real Polymarket positions that anyone can read onchain. That is a weak "who is buying what" signal, capped at $400 per buy per vault. It is not worth an adapter at current scale.

## 1. Liveness (2026)

| Evidence | Value | Tag |
|---|---|---|
| Site | `https://credence.pfwa.fun/` HTTP 200 on 2026-10-19 03:51 UTC; title "Credence - The Conviction Layer"; pages `/`, `/docs`, `/protocol`, `/privacy`, `/creator`, `/pay`, `/claim` all 200 (sitemap lists exactly these) | H |
| Privacy page | "Last updated 15 October 2026" | H |
| DefiLlama | Listed as "Credence", slug `credence`, id 9128, category Launchpad, `listedAt` 1792093437 = 2026-10-15T19:43Z, chains Robinhood Chain + Polygon, parent `PFWA`. Open adapters: `DefiLlama-Adapters/projects/pfwa-credence/index.js` (TVL) and `dimension-adapters/fees/pfwa-credence.ts` (fees). The TVL series starts 2026-10-15 (6 points). | H |
| First onchain activity | v1 factory's first vault 2026-09-07 04:52 UTC (block 56562702); v2 factory's first vault 2026-09-19 21:05 UTC; CreatorFeeVaultFactory's first vault 2026-09-29 23:15 UTC (all from the DefiLlama fees adapter comments) | H |
| Last nonzero fee day | 2026-10-06 ($0.14); the last sizable day was 2026-10-05 ($183.00, composition unknown) | H |
| Fees last 24h / 7d / 30d | $0 / $0 / $247.40 | H |
| Contracts | Sourcify `exact_match` (creation and runtime) for CredenceVaultFactoryV2 and CredenceLauncherV2 (chain 4663) and PolyVaultFactoryV2 (chain 137), verifiedAt 2026-09-20 | H |

Verdict: live in the sense that the site and contracts are up and recently maintained, but economically dormant (no fees for 13 days).
Operator: independent; "not affiliated with, endorsed by, or associated with Polymarket or Robinhood" (H, docs). Same team as PFWA Markets (`parentProtocol` `PFWA`, site footer "by $pfwa", X account @pfwafun).

## 2. What it is (kind and market model)

- **Kind**: other. A token launchpad plus a fee-funded Polymarket bettor. No venue-level market model of its own.
- **Market model**: none of its own. Per token, the vault backs **one side of one two-outcome (Yes/No style) Polymarket market**, chosen at launch from a Polymarket event URL (H, docs "How to Deploy": "Pick a market with two outcomes, such as Yes/No; the vault backs one side"). The vault holds Polymarket CTF outcome shares (ERC-1155, the same positions Polymarket uses). The market model, order book and tokenisation are Polymarket's, covered by the parallel workflow.
- **Credence's own tokens**: fixed-supply meme tokens launched through Pons V2. Pons V2 docs describe a bonding curve before graduation, then a locked Uniswap v4 pool (H, docs.ponsfamily.com/docs/v2). Credence's docs call it "a Pons V2 bonding curve". Pons's older v1 docs describe a plain Uniswap v3 pool with no curve, so be careful which Pons version a Credence token uses (Credence says V2).
- **Lifecycle (H, docs)**: Launch (PolyVault on Polygon, then one Robinhood Chain tx for token plus CredenceVault) -> Trade (Pons) -> Harvest (20% of collected fees buys and burns $PFWA, 80% bridged to the PolyVault via Relay) -> Buy the outcome (protocol executor places a capped Polymarket order, shares returned to the vault) -> Win: anyone can redeem, winnings bridged home and used to buy and burn the meme token -> Continue (creator links a new market by signing a message). A lost market's worthless shares are redeemed too, which clears the vault so it can relink.
- **Creator Vaults (side product)**: a token's fees can instead go to an X account (CreatorFeeVault, CREATE2 address derived from the numeric account id, no wallet or gas needed to claim, 14-day sweep after fees arrive, protocol takes 10% via an immutable value capped at 20% by the factory). Also `/pay` lets anyone pay an X or GitHub handle via the same vaults. Neither has anything to do with prediction markets (H, docs and site).
- **Why this matters for the aggregator**: the token price has no defined relationship to the Polymarket price. Winnings are a burn, not a redemption, so holders get a small supply reduction at best. There is no "Credence probability" to quote.

## 3. Read API

| Surface | Status | Tag |
|---|---|---|
| Official API docs / OpenAPI | **NOT FOUND** (searched: `/docs`, `/protocol`, site meta, sitemap, `/llms.txt` = 404, DefiLlama adapters; docs describe contracts, fees and limits only; the Pons docs state "There is no pons API in the trust path") | H |
| First-party JSON | The front end calls `GET /api/vaults` and `GET /api/creator-tokens` and POSTs `/api/create-poly-vault` with wallet-signed headers (seen as strings in the public JS chunks). **`robots.txt` is `User-agent: *  Allow: /  Disallow: /admin  Disallow: /sandbox  Disallow: /api/`**, so I did not call any `/api/` route and have no response shape. Undocumented, disallowed for crawlers, can change without notice. | H (existence, robots) / NOT FOUND (shape) |
| Protocol page | `/protocol` says "Every figure here is summed from what the vaults emitted onchain... Nothing comes from our database", rendered client-side ("Loading..." in the static HTML) | H |
| WebSocket / SSE | NOT FOUND (no `wss://` URL in the chunks) | H |
| Subgraph / indexer | NOT FOUND | H |
| Onchain | Canonical. Robinhood Chain (4663) factories `vaultCount()` / `allVaults(uint256)`; Polygon factories `allVaults`, `isVault(address)`, v1 `PolyVaultCreated(address indexed vault, address indexed owner, bytes32 conditionId)` events. Reading needs JSON-RPC (POST), which I did not do. | H (from open adapter code) |
| DefiLlama | `GET https://api.llama.fi/protocol/credence` (TVL by chain) and `GET https://api.llama.fi/summary/fees/credence` (fees, 43 daily points). `summary/dexs/credence` returns 400 "not found" (no volume dimension). | H |
| Pons (underlying launchpad) | No public API or subgraph; docs recommend indexing factory and curve events onchain. Pons V2 factory `0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e` (also visible in Credence's JS chunks). | H |
| Auth / rate limits | None documented for anything above. api.llama.fi is a free public API. | H |

Events visible in the open DefiLlama adapter (H, `fees/pfwa-credence.ts`): v2 vault `FeesCollected(uint256 weth)`; v1 vault `Harvested(uint256 totalWeth, uint256 pfwaBurned, uint256 wethBridged)`; `TokenAndVaultLaunched(address indexed memeToken, address indexed vault, address indexed creator, address curve[, address polyVault])`; CreatorFeeVault `Funded(address indexed asset, address indexed from, uint256 amount)`; `CreatorTokenLaunched(...)`.

**Note on embedded keys**: the public JS bundle contains hard-coded third-party RPC provider URLs with API keys for Robinhood Chain and Polygon. I did not record, copy or use them. A real adapter must use its own RPC, e.g. the public `https://rpc.mainnet.chain.robinhood.com` named in the Pons docs (H).

**Fixtures** (small samples):
- `defillama_protocol_credence_2026-10-19.json`: TVL and chain split.
- `defillama_fees_credence_2026-10-19.json`: fee aggregates, breakdown methodology, daily chart.
- `sourcify_verification_2026-10-19.json`: exact-match verification for three contracts.
- `credence_docs_text_2026-10-19.txt`: text extract of the official docs page.
- `credence_robots_2026-10-19.txt`.

## 4. Trade path

- **No programmatic order placement on any Credence market (there is none).** The only user-controlled actions are:
  1. Launch a token: sign a `launch` call on CredenceLauncherV2 (Robinhood Chain), after the Credence server deploys the PolyVault on Polygon (server-side call with wallet-signed action headers). Launch fee 0.002 ETH total (Pons 0.0005 + Credence 0.0015, H: docs say 0.002 ETH; DefiLlama adapter notes the Credence fee was raised 0.0005 -> 0.0015 ETH on 2026-09-20), excess refunded.
  2. Buy or sell the meme token on Pons (EVM transaction against the Pons curve or pool).
  3. Permissionless keeper calls: collecting fees, funding a buy, settling it, redeeming winnings. These can be triggered by anyone, but the amounts and destinations are fixed in the contracts (H, docs).
  4. Creator relink: sign a message, the protocol submits it.
- **The actual bet is not under an outside agent's control.** The Polymarket order is placed by the protocol's executor wallet ("Polymarket... only accepts orders from its own wallets"), with limits $5 minimum, $400 per buy, $10,000 per day, 1 hour cooldown (5 minutes after an unfilled buy), and max price $0.97 (H, docs, Vault v2). So an agent cannot buy, sell or hedge a Polymarket outcome through Credence.
- **Auth / signing**: standard EVM wallet transactions on chain 4663 for token actions; creator-vault claims need X sign-in via Privy plus a server attestation; the bridge is Relay and is run by the protocol bot.
- **PayBox reachability: partial.** A PayBox EVM wallet could submit transaction proposals for the token buy/sell and launch on Robinhood Chain (4663 is in PayBox's chain catalog per the sibling note `docs/research/venues/pfwa-markets.md`, M; I did not re-check PayBox this session), and Polygon is a standard EVM chain. But no transaction gives a controllable position in the underlying prediction, and launching also needs Credence's own server for the PolyVault step. Nothing here is useful to an arbitrage scanner.

## 5. Fees

| Item | Value | Tag |
|---|---|---|
| Pons base fee | 1% of every trade; Pons keeps 30% (0.30%), 70% (0.70%) goes to the creator fee recipient, which for a Credence launch is the vault. Pons buyback disabled on Credence launches. | H (Credence docs) |
| Creator tax | Set per launch, up to 10%, charged on top of the base fee, all to the vault, fixed at creation. Example: 1% tax -> trader pays 2%, vault receives 1.70%. | H |
| Launch fee | 0.002 ETH one-off, split Pons / Credence, excess refunded | H |
| $PFWA burn | 20% of every harvest buys $PFWA and sends it to the dead address | H |
| Polymarket taker fee | Set by Polymarket per market, on top of each order; the bot sizes buys from the live rate | H |
| Bridge | Relay fees on RHC <-> Polygon (amount not documented) | M |
| Withdrawals | A vault has no withdraw function; creators and Credence cannot take funds out | H (docs; v1 vaults differ, see 7) |
| Creator Vault fee | Protocol takes 10% (immutable, factory cap 20%) | H |
| Aggregates (DefiLlama) | all-time fees $284.54 (creator trading fees + creator vault fees + launch fees), 30d $247.40, 7d $0 | H, 2026-10-19 |

Who pays: traders of the meme tokens (the 1% plus tax), launchers (launch fee). Pons V2 docs say the exact base fee is read onchain (`feeBps()`) and the split from `getLaunchFeePolicy(token)`; the 1% figure is from Credence's own docs.

## 6. Chains and collateral

- Robinhood Chain (chain ID 4663; Arbitrum Orbit L2, native ETH): CredenceVaultFactoryV2 `0x099684533Dc729457650AB2424811AF9c79032D8`, CredenceLauncherV2 `0x6EF3e8b1291463434850fb6ED466858A043D8525`, v1 CredenceVaultFactory `0x17d0f24ADbD613C046eB25c0cc054333c5481F05`, v1 CredenceDeployer `0xdF2eBF0bc156880BbE03d8eD330B2A2431d74019`. DefiLlama also lists a CreatorFeeVaultFactory `0xade0E3e0218d53A89E607F312DB9CeA2DFcC5D10`, a CreatorLauncher `0x0903EB2fBccf7bF9eC86b4cb2894A7a9E5Adab5c` and a retired rehearsal factory `0xD9e709c55Ce2680B99E982Ce1AAb24890dD39D55` (all H, docs and open adapters).
- Polygon (137): PolyVaultFactoryV2 `0x69CD45c4d89CA8Cfe37c2ED1F869306e031d58F9`, v1 PolyVaultFactory `0xC20E838e509B248638812FB3dAa1c8B63D6183C0` (H).
- Timelock `0x7837760cd8adC3acFA5904233a00382D5bC710d6` and Multisig `0x85eb79DBCc50eB3DA0Ee10460109991E863d2666`, same address on both chains (H, docs).
- Collateral: fees accrue as WETH on Robinhood Chain (or the token's pair asset, e.g. USDG or a tokenised stock for creator vaults); the bet is funded in pUSD / USDC.e / USDC on Polygon. TVL assets per DefiLlama: ETH, WETH, USDG on RHC; pUSD, USDC.e, USDC on Polygon (H).
- Bridge: Relay; vaults only send to an approved list of Relay contracts (H, docs).

## 7. Resolution and dispute risk

- Credence has **no resolution mechanism of its own**. Outcomes are decided by the underlying Polymarket market (UMA-based; covered by the parallel Polymarket workflow). Credence only redeems the vault's shares after resolution and bridges the proceeds home.
- Extra operational risk layers (H, docs): off-chain protocol bot required for bridging and buybacks ("they need an off-chain price quote no contract can check"); bridge risk; Relay quote correctness; executor wallet custody; a server attestation key for creator-vault claims "can misdirect a claim to the wrong address".
- **All contracts are unaudited and non-upgradeable** ("nothing here can be changed after deployment, which also means nothing here can be patched. Interact at your own risk."). v1 vaults have no caps, timelock or price limit, and their creator and the bot can move funds. A multisig can pause instantly; limit, bot or address changes take a 12-hour timelock (H, docs).
- A lost bet means the meme token gets nothing; the vault can relink to a new market afterwards.

## 8. Geo, ToS, automation

- **No Terms of Use page** (sitemap and nav have only `/privacy`; "Questions" is a mailto): NOT FOUND (searched: sitemap, nav, footer, docs text). The docs carry only the non-affiliation disclaimer and "Interact at your own risk".
- No geo-blocking, KYC or age-gate text found in the pages I read (H for what I read; HTTP-level geo-blocks were not tested from other regions).
- Privacy page: sign-in via Privy with X; only the RWA "claim a token at a place" feature collects GPS data; no advertising cookies or third-party analytics (H).
- Automation: `robots.txt` disallows `/api/` for all user agents (H); no stated bot policy for the contracts (permissionless).
- Regulatory note (M, inferred, not assessed): the token holder never touches Polymarket, but the vault does, via Credence's executor. Whether Polymarket's geo-restrictions apply to such indirect exposure is an open legal question for a US-facing aggregator and is not worth chasing at this scale.

## 9. Liquidity (all 2026-10-19 unless noted)

| Metric | Value | Source |
|---|---|---|
| TVL (cash in vaults only; excludes Polymarket shares, meme-token liquidity, $PFWA, launch fees) | $162.88 total: Robinhood Chain $151.81, Polygon $11.06 | `api.llama.fi/protocol/credence`, last point 2026-10-19 02:26 UTC (H) |
| Fees, all-time since 2026-09-07 | $284.54 | `api.llama.fi/summary/fees/credence` (H) |
| Fees 30d / 7d / 24h | $247.40 / $0 / $0 | same (H) |
| Implied amount funded to bets, upper bound | at most 80% of creator trading fees, so well under $230 lifetime (the fee total also contains launch fees and creator-vault fees; breakdown not split out in the API response I saved) | M, derived |
| Meme-token trading volume | NOT FOUND (no volume dimension: `summary/dexs/credence` returns 400; the Pons analytics page was not read) | - |
| Open Polymarket positions / amount bet / vault count | NOT FOUND without JSON-RPC or the disallowed `/api/vaults`; the `/protocol` page renders them client-side | - |
| Hard caps per vault | $400 per buy, $10,000 per day, 1 h cooldown, $5 minimum, $0.97 max price | docs (H) |

## 10. Event coverage and shared liquidity

- Coverage = whatever the token launcher picks from Polymarket (it fetches the event by slug from `gamma-api.polymarket.com/events`, which I saw in the public bundle, H), so sports, politics, crypto price and macro are all possible. But Credence adds no price, quote or depth on any of them.
- **Liquidity is 100% shared with Polymarket (H).** Orders go to the Polymarket CLOB; there is nothing independent to cross. Not an arbitrage leg. At most a free-rider whose positions appear on Polymarket's own trade/position data.
- Signal-source idea (not recommended now): PolyVault addresses (Polygon, from `allVaults`) hold Polymarket CTF positions, so an indexer could emit "Credence vault bought side X of condition Y". Max $400 per buy per vault, at most one per hour, with $163 total TVL: noise.

## 11. Open questions

- Number of vaults / backed markets / total amount bet and paid out (need `eth_call` / `eth_getLogs`, or the `/api/vaults` route that robots.txt disallows). The `/protocol` stat cards show them but only client-side.
- Pons-side volume and holder counts for Credence tokens (Pons analytics page, not read).
- Whether the Pons V2 whitelist ("Public launches are closed, so only whitelisted addresses can create a token for now", H, Pons V2 docs) limits who can launch via Credence's launcher.
- What the $183.00 fee day on 2026-10-05 was (launches vs creator-vault fees).

## Sources

- https://credence.pfwa.fun/ , /docs , /protocol , /privacy , /creator , /pay , /claim , /robots.txt , /sitemap.xml (H, fetched 2026-10-19). Public JS chunks under `/_next/static/immutable/chunks/` read as text for route names, chain IDs, URLs (H).
- https://api.llama.fi/protocol/credence and https://api.llama.fi/summary/fees/credence (H, 2026-10-19); https://api.llama.fi/protocols (listing, `listedAt`).
- https://github.com/DefiLlama/DefiLlama-Adapters/blob/main/projects/pfwa-credence/index.js and https://github.com/DefiLlama/dimension-adapters/blob/master/fees/pfwa-credence.ts (H, read with `gh api`).
- https://sourcify.dev/server/v2/contract/4663/0x099684533Dc729457650AB2424811AF9c79032D8 , .../4663/0x6EF3e8b1291463434850fb6ED466858A043D8525 , .../137/0x69CD45c4d89CA8Cfe37c2ED1F869306e031d58F9 (H).
- https://docs.ponsfamily.com and https://docs.ponsfamily.com/docs/v2 (H, via WebFetch summary; Pons is the launchpad Credence uses); https://www.ponsfamily.com/launchpad.
- `docs/research/venues/pfwa-markets.md` (sibling note, same team; M for anything cited from it).
- Not reached: Blockscout API (Cloudflare challenge, not bypassed); WebSearch (session budget exhausted before the first query); no Credence GitHub repo found (searched GitHub repo and code search; only the two DefiLlama adapters reference the contracts).
