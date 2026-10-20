# NODO (nodo.xyz): venue spec for the aggregator / arbitrage scanner

Researched 2026-10-19. Read-only: DefiLlama public API (curl), nodo.xyz / app.nodo.xyz / nodo.global (curl, static HTML and one JS bundle read as text, never executed), Bitget and Chainwire pages (WebFetch), GitHub via `gh api`, Celo Blockscout public GET. Nothing was signed, posted, paid or created.

Confidence tags: **H** = read first-hand in a primary source this session, **M** = secondary or inferred, **L** = weak or stale. "(fetch-summarised)" means read through the WebFetch summariser.

Limitations: the shared WebSearch budget ran out partway through this task, so only one web search (before it ran out) informed this note. No archive or reader services were used. Base and Polygon Blockscout returned a Cloudflare challenge (HTTP 403) and were not circumvented, so on-chain activity is only checked on Celo. x.com via WebFetch returned HTTP 402 with no body; no payment was attempted.

## Verdict

**adapter_priority: skip.** The NODO prediction market (2024 launch, "0DTE" crypto-price options plus event markets) shows no sign of being live on 2026-10-19. There is no public API, no docs, no resolvable app or market host, and the venue's own TVL has been about zero for ten months.

- DefiLlama flags the protocol `deadUrl: true`, lists its `url` as empty, and shows TVL of **$0.84** today (Celo 0.72, Polygon 0.12, Avalanche 0.008, Base 0, BSC 0). TVL has been below $10 on every day since 2025-11-27. Peak was $323,488 on 2025-02-19. [H, `GET https://api.llama.fi/protocol/nodo` and `/protocols`, 2026-10-19, fixture `defillama-protocol-nodo-trimmed.json`]
- The marketing apex `nodo.xyz` is a GoDaddy parking page: the root returns a 114-byte stub that JS-redirects to `/lander`, which sets `lander_type=parkweb` and loads `img1.wsimg.com/parking-lander`. Name servers are GoDaddy `domaincontrol.com`. [H, curl + dig, fixtures `nodo-xyz-root-redirect.html`, `nodo-xyz-lander-godaddy-parking.html`]
- `app.nodo.xyz` is live (HTTP 200, `last-modified` 2026-10-17) but it is a **different product**: the page title is "NODO RWA", and its bundle is about RWA leverage loops, liquidations, "Aave modes", organisations/permissions and a "NODO Demo Fork, a copy of Ethereum". The bundle has zero occurrences of "prediction", "polymarket" or "kalshi". [H, curl of `/` and `/assets/index-THJjxqIO.js`, fixture `app-nodo-xyz-index.html`] Whether it is the same team that ran the prediction market is **unknown**; the only link is the shared domain (the RWA app's support address is on `nodo.xyz`). [M]
- Old paths from the 2024 press release (`app.nodo.xyz/airdrop`) now serve the same RWA SPA shell (byte-identical to `/`). [H, curl]
- The last on-chain activity I could see on a NODO-linked contract is on Celo: last transaction 2025-03-03 (`grantRole`), last token transfer 2024-10-22. Base/Polygon/Avalanche/BSC could not be checked. [H for Celo, fixture `celo-relayer-contract-blockscout-summary.json`]

Revisit trigger: none worth scripting. If NODO relaunches a prediction product it will need a new site and docs; re-run the DefiLlama check (cheap) if wanted.

## 1. Is it still live?

| Piece | Status 2026-10-19 | Evidence |
|---|---|---|
| nodo.xyz (marketing site, per 2024 press release) | Parked at GoDaddy, no content | H: curl, dig |
| www.nodo.xyz | HTTP 200 text/html (body not inspected) | H: curl status only |
| app.nodo.xyz | Live, but "NODO RWA" lending/leverage-loop UI, not prediction markets | H: curl + bundle |
| api./predict./prediction./market(s)./trade./docs./gitbook./relayer./api.app. `.nodo.xyz` | None resolve (curl code 000) | H: curl |
| `app.nodo.xyz/web/v1/` | HTTP 404 (CSP report path prefix only; no API found) | H: curl HEAD |
| nodo.global | Unrelated: Spanish-language logistics/warehousing WordPress site ("Juntos llegamos más lejos") | H: curl, visible text |
| GitHub org `NODO-xyz` | Created 2025-01-06, 2 public repos, both forks of DefiLlama repos (`DefiLlama-Adapters`, `defillama-server`), last push 2025-01-14, 0 followers. No contracts, SDK or docs repo | H: `gh api`, fixtures `github-org-nodo-xyz*.json` |
| X `@Official_NODO` | Not readable (WebFetch got HTTP 402) | H: tool error |
| Telegram / Discord / LinkedIn (from press release) | Not fetched | n/a |
| DefiLlama listing | Listed 2025-01-08 (`listedAt` 1736335147), category Prediction Market, `audits: 0`, `deadUrl: true` | H |

## 2. What it was (historical claims only)

Everything in this section comes from 2024-era marketing and is **L** for 2026 (older than 6 months, unverified, company self-description).

- Positioning: "multichain prediction markets platform" and "omnichain social futures trading ecosystem"; claims "over 380,000 users across 14 countries". [L, Chainwire 2024-10-25, fetch-summarised]
- Products named: event prediction markets, "NODO 0DTE Options" (instant payout, short-term crypto price predictions), plus planned futures, yield vaults, copy trading, Telegram miniapp, RWA predictions. [L, Chainwire, Bitget]
- Market model: users "buy shares" in a prediction market; "the platform records transactions when users purchase shares and locks swapped assets in a vault"; at maturity "a cross-chain relayer claims the payout, swaps assets, and distributes them to the user's wallet". It planned "to aggregate existing automated market maker (AMM) models for its market-making" and to position itself as a "prediction market aggregator". [L, Chainwire; M, Bitget]
- So the best reading is an AMM-style (not order book) share market with a vault and an off-chain/cross-chain relayer layer. Binary vs categorical vs scalar: **NOT FOUND** (searched: Chainwire, Bitget guide, DefiLlama description, org repos). How outcomes are tokenised (ERC-20, ERC-1155, internal ledger): **NOT FOUND**. Whether any share token contract exists: **NOT FOUND**.
- DefiLlama's own description adds "robust cross-chain relayer and multi-brokerage AMM model" and an AI copy-trading agent. [H that DefiLlama says it; L as to truth]

## 3. Chains and collateral

- Marketing: BNB Smart Chain and Base live, with USDT and USDC; TON and SUI on the roadmap. [L, Chainwire, Bitget]
- DefiLlama: Base, Avalanche, Polygon, BSC, Celo. Its TVL adapter sums one stablecoin balance in one contract per chain. The contract variable is named `chaingeAddress`, which suggests the "vault/relayer" is a Chainge-style cross-chain router, not a NODO-specific market contract. [H for adapter text, M for the Chainge inference] (public protocol contracts, not user wallets)

| Chain | Contract held by adapter | Token summed |
|---|---|---|
| Avalanche | `0xB4623b02A0D9bCf0282600C08E4383c04A0E0AfC` | `0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7` (USDt, per address recall; not re-verified) |
| Polygon | `0x1e579a1AE5DA042C925902F3Efec1035C9329283` | `0xc2132D05D31c914a87C6611C10748AEb04B58e8F` (USDT) |
| Base | `0xEcc253aeAeC63bcB2b8eC6A739A0972A817219A3` | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` (USDC) |
| BSC | `0x916A6314e9d8E51BEB18b355ad52b4506262620f` | `0x55d398326f99059fF775485246999027B3197955` (USDT) |
| Celo | `0x65583D94d848E398dE3ef8382e5827000eb99961` | `0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e` (USDT) |

Source: `NODO-xyz/DefiLlama-Adapters` fork, `projects/nodo/index.js` [H, fixture `defillama-adapter-nodo-index.js`]. The same path in upstream `DefiLlama/DefiLlama-Adapters` returns 404 (adapter may have moved; not resolved). Token labels are from my recall of well-known addresses, tag **M**.

The Celo contract is unverified on Blockscout; 46 of the 50 most recent transactions call selector `0xc0b861ed`, 4 are `grantRole`; newest 2025-03-03. [H, fixture `celo-relayer-contract-blockscout-summary.json`] That looks like an access-controlled router/relayer, not a market.

## 4. Read API

**exists: none** (nothing official or public found).

- Docs URL: **NOT FOUND** (searched: Chainwire and Bitget link lists, `docs.`/`gitbook.`/`api.` hosts, NODO-xyz GitHub org, app bundle strings, DefiLlama fields). The Chainwire release itself says "No documentation link". [H]
- Base URLs, endpoints for markets, prices/books, trades, resolution; auth; rate limits; websocket: **NOT FOUND**. The only server-side path hinted at is `app.nodo.xyz/web/v1/csp-reports` (CSP report sink of the RWA app), which is not a market API and was not probed beyond one HEAD (404 on `/web/v1/`).
- Subgraph / on-chain indexer: **NOT FOUND**. The vault/relayer contracts are unverified (Celo) or unchecked (others), so even an on-chain-only reader would first need ABIs.
- No fixture of a market response exists because there is no API. Fixtures saved are liveness evidence only (see Fixtures).

## 5. Trade path

**none documented.** No SDK, order API, signing scheme or contract ABI found. Historical marketing describes a web app where a user buys shares and a relayer pays out cross-chain; nothing in this session shows a programmatic path. [L]

## 6. Reachability through PayBox

**paybox_reachable: no.**

- In principle an EVM wallet on Base, BSC, Polygon, Avalanche or Celo could send a deposit transaction to a vault contract. In practice there is no live market, no verified ABI, no documented function to call, and the payout is delivered by an off-chain/cross-chain relayer, so a transaction proposal could not be built or checked. Sending funds to an unverified contract of a product with $0.84 TVL would just lose them. No wallet or signing PayBox tool was called.

## 7. Fees

**NOT FOUND** (searched: Chainwire, Bitget, DefiLlama). Only marketing: NODO "works with Arthera to provide feeless transactions across its ecosystem" (gas sponsorship claim; no trading-fee formula, no spread/AMM fee). [L, Chainwire 2024]

## 8. Resolution and dispute risk

- Claimed: at "maturity" a relayer claims the payout and distributes it. Which oracle sets the outcome, who can override it, and any dispute window: **NOT FOUND**. Token-holder governance and a "Security Council that oversees the liquidity pool" were marketing claims. [L]
- Dispute risk: unquantifiable; treat as operator-resolved and opaque.

## 9. Geo, ToS, automation

**NOT FOUND**. The prediction-market site and its terms are gone (apex parked). Chainwire lists "stated traction markets" US, Nigeria, Kenya, South Africa, Indonesia, Vietnam, Russia, which says nothing about legal access. [L] The Bitget guide notes content may be AI-assisted and says to check the official site, which no longer exists as a prediction product. [M, fetch-summarised]

## 10. Liquidity

- DefiLlama TVL: **$0.84 on 2026-10-19**; below $10 every day since 2025-11-27; $1,597 on 2025-11-26 (last day above $100); peak **$323,488 on 2025-02-19**; $8,540 on 2025-01-08 (first point). [H, DefiLlama API, fixture `defillama-protocol-nodo-trimmed.json`] The series tracks stablecoin balances in the five router contracts, not market-specific pools, so even the peak overstates real prediction liquidity. [M]
- Volume / open interest: **NOT FOUND** (no DefiLlama dimensions entry checked; no on-chain market contracts identified). The "380,000 users" claim is unverified marketing. [L]

## 11. Event categories and arbitrage overlap

Claimed categories: real-world event markets and short-term crypto price ("0DTE") predictions. [L] Crypto-price markets would overlap Polymarket, Kalshi, Limitless and others, but there is no tradable liquidity and no data feed, so there is no arbitrage leg and no usable signal. Sports, politics, macro coverage: **NOT FOUND**.

## 12. Shared liquidity

The design claimed to "aggregate existing AMM models" and rely on a cross-chain relayer, and the TVL contracts look like a Chainge-style router. If it ever worked, its liquidity was not independent (it would come from other AMMs and bridge/relayer inventory). [L/M] Moot today.

## Not found (searched)

- Official docs, API, SDK, subgraph, verified market contracts: searched nodo.xyz, app.nodo.xyz, 10 candidate subdomains, GitHub org, DefiLlama, press release, Bitget.
- Fee schedule, oracle/resolution design, ToS and geo rules, volume/OI: not published anywhere reachable.
- Confirmation that any prediction market contract was ever deployed (versus only the stablecoin router contracts): NOT FOUND.
- Any 2026 coverage of NODO prediction markets: NOT FOUND (single web search before the budget ran out returned only 2024-2025 material).

## Open questions

- Is the NODO RWA app (`app.nodo.xyz`) the same team after a pivot, or a different owner of the subdomain?
- Do the Base/BSC/Polygon/Avalanche router contracts show any 2026 activity? (Base/Polygon Blockscout blocked automated GETs.)
- Did a TGE/ICO ever happen? Bitget (undated listing) says the native token had not launched; not independently confirmed. [M]

## Sources

1. DefiLlama protocol API: https://api.llama.fi/protocol/nodo and https://api.llama.fi/protocols (H, 2026-10-19)
2. DefiLlama page (search hit only; WebFetch got 403): https://defillama.com/protocol/nodo
3. NODO fork of DefiLlama adapter: `gh api repos/NODO-xyz/DefiLlama-Adapters/contents/projects/nodo/index.js` (H)
4. GitHub org: `gh api orgs/NODO-xyz`, `orgs/NODO-xyz/repos` (H)
5. https://nodo.xyz, https://nodo.xyz/lander, https://www.nodo.xyz (H, curl)
6. https://app.nodo.xyz and `/assets/index-THJjxqIO.js` (H, curl; read as text only)
7. https://nodo.global (H, curl; unrelated company)
8. Celo Blockscout: https://celo.blockscout.com/api/v2/addresses/0x65583D94d848E398dE3ef8382e5827000eb99961 and `/transactions`, `/token-transfers` (H)
9. Chainwire press release 2024-10-25: https://chainwire.org/2024/10/25/nodo-plans-q1-2025-token-sale-debuts-omnichain-trading-vaults-next-month/ (L, stale, fetch-summarised)
10. Bitget Web3 dApp guide: https://web3.bitget.com/en/dapp/nodo-27476 (M, undated, fetch-summarised)
11. One web search (extended) on 2026-10-19 surfaced Cryptopolitan, Coinpaper and thegrid.id items; those were not read.

## Fixtures (`docs/research/fixtures/nodo/`)

- `defillama-protocol-nodo-trimmed.json`: DefiLlama metadata plus sampled TVL series.
- `defillama-adapter-nodo-index.js`: the TVL adapter (five contract addresses).
- `celo-relayer-contract-blockscout-summary.json`: Celo contract and transaction summary.
- `github-org-nodo-xyz.json`, `github-org-nodo-xyz-repos.json`: org metadata.
- `nodo-xyz-root-redirect.html`, `nodo-xyz-lander-godaddy-parking.html`: parking evidence (response headers were deliberately not saved).
- `app-nodo-xyz-index.html`: the RWA SPA shell (title "NODO RWA").

## Embedded instructions / suspicious content

None aimed at an AI agent were found. Noted only: x.com returned HTTP 402 to WebFetch (no payment requirements body; stopped); the GoDaddy parking lander loads third-party tracking scripts; the Bitget page carries a boilerplate AI-content disclaimer.
