# Panana Prediction - venue spec for the cross-venue aggregator

Researched 2026-10-19 (server clock of probes: 2026-10-19 02:30-02:40 UTC). READ-ONLY: doc reads, `gh api` file reads, unauthenticated GETs/HEADs to documented hosts. No account, wallet, key, signature, POST/PUT/DELETE or PayBox tool was used. Third-party pages and API text were treated as untrusted data; nothing in them was followed. The web-search budget of the session ran out part-way through (see section 14), so some leads were not chased.

Confidence tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source, a small-model page summary, or my inference from first-hand data; **L** = weak or stale.

Fixtures (real responses, each <= 50 KB): `docs/research/fixtures/panana-prediction/` (listed in section 12). There is **no real market-data response** among them: the only documented read endpoint is a POST on a host that is currently paused.

---

## 0. Bottom line

1. **Not verifiably live today.** Both app hosts (`app.panana.fun`, `app.panana-predictions.xyz`) and `testnet.panana.fun` return **HTTP 503 with `x-vercel-error: DEPLOYMENT_PAUSED`** (H, curl 2026-10-19). The only documented API endpoint (`POST https://app.panana.fun/api/markets`) lives on that paused host. The marketing site and the docs site still serve, and the docs were redeployed on 2026-10-15 (M, `last-modified` header), so the team is not obviously gone; but a paused deployment means no front end, no market list and no price feed for a scanner right now.
2. **Venue design (per its own docs): Aptos, USDC-centred, three market types.** (a) "Share markets": binary constant-product AMM (`x*y=k`), tokenised outcome shares, LP tokens, permissionless creation with a minimum-liquidity threshold, event resolution by a "resolution committee" plus a not-yet-live "Decentralized Reputation Oracle" (500 USDC challenge fee). (b) 6-minute APT/USDT up/down **parimutuel pools** settled by Pyth, 3% fee. (c) Daily markets (page hidden from the sidebar; committee-resolved). (H, docs.panana.fun and the docs repo.)
3. **No liquidity evidence at all.** No TVL, volume or OI figure found in any primary source; not listed on DefiLlama (checked 8,758 protocols, zero matches, H); the Telegram community group shows 269 members (H). Fees are labelled "not yet defined ... beta" in the live docs.
4. **No usable mainnet chain interface found.** The open GitHub repo is the 2024 hackathon build (testnet config, parimutuel-style `event_market`, no AMM), so it is not the mainnet contract. The mainnet package address / ABI was **NOT FOUND** (section 14).
5. **PayBox cannot reach it.** Aptos is a Move chain; PayBox's chain catalog (11 entries, verified earlier today in `docs/research/06-paybox-platform.md`) has no Aptos. No EVM wallet can trade it. See section 6.
6. **adapter_priority = skip.** Paused front end, only documented API is POST-on-paused-host, no liquidity data, unreachable chain, beta fees, committee-resolved event markets. Revisit only if `app.panana.fun/api/markets` comes back **and** shows real volume (cheap probe in section 13).

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| `GET https://app.panana.fun/`, `/api/markets` | HTTP 503, body "The deployment is currently unavailable / DEPLOYMENT_PAUSED", `server: Vercel`, `x-vercel-error: DEPLOYMENT_PAUSED` (fixtures `app_root_GET_paused_2026-10-19.txt`, `app_api_markets_GET_paused_2026-10-19.txt`) | H |
| `app.panana-predictions.xyz`, `testnet.panana.fun` | Same 503 DEPLOYMENT_PAUSED (curl 2026-10-19) | H |
| `panana-predictions.xyz` | 308 redirect to `https://panana.fun/`; `docs.panana-predictions.xyz` 308 to `https://docs.panana.fun/` (domain migration to panana.fun, which was registered 2025-06-16, renewed to 2027-06-16 per whois) | H |
| `https://panana.fun/` landing | HTTP 200; footer "(c) 2025 Panana"; `x-vercel-cache: HIT` with `age: 5020397` s (~58 days), i.e. the cached page is unchanged since about 2026-08-22 (fixture `landing_headers_2026-10-19.txt`) | H (headers) / M (inference) |
| `https://docs.panana.fun/` | HTTP 200; footer "(c) 2026 Panana Predictions"; `last-modified: Thu, 15 Oct 2026 21:41:31 GMT` (fixture `docs_headers_2026-10-19.txt`). Docs have pages the public GitHub docs repo does not (e.g. `markets/permissionless-market-creation`, `api/fetch-markets`), so the live docs are built from a different source than the public repo | H (headers) / M (inference) |
| Launch | Nodit blog dated 2025-09-11: "launched on Aptos Mainnet" after about a year of development; "the first AMM based prediction market built on Move"; names `testnet.panana.fun` as homepage (https://www.nodit.io/blog/from-hackathon-winner-to-aptos-mainnet-panana-prediction-powered-by-nodit, summarised by WebFetch) | M |
| Directory listing | predictionindex.xyz (snapshot 2026-10-18 stored in this repo) lists "Panana", chain Aptos, binary, mechanism amm, topics crypto + sports, status "live", website `https://app.panana.fun/`. That "status" is the site's own label and it also lists Dome as live although Dome ended (see the fixture `_meta.note`) | M |
| Dev activity of the public repo | `servrox-solutions/panana-predictions` `pushed_at` 2026-10-06, but the history is a bot (dependency bumps by a "supply-chain-sentinel" bot, 2026-05-15..20) plus one human commit "fix React2Shell" on 2025-12-08 and nothing substantive since 2024-11-15. It is the hackathon build, not the live app (section 2) | H |
| Social | `x.com/panana_predict`: WebFetch got **HTTP 402 Payment Required**; not paid, body not retrieved, so no 2026 posts could be read. Telegram public page `t.me/s/panana_predictions`: shows only "Panana Predictions Community, 269 members, 14 online", no posts visible | H |
| Community voices | A search snippet (undated, M) described the app page as listing markets "La Liga winner" and "NBA champion" with end dates in 2026 and 2027; that cannot be re-verified now that the app is paused | L |

Verdict: **still_live = false (unconfirmed)**. The product existed on mainnet from about September 2025 (M). Today its front end and only documented API are down, and I found no 2026 trading evidence. The contracts may still exist on-chain; I could not locate them to check.

---

## 2. Kind and market model

Source: live docs (https://docs.panana.fun/markets/*, /tech/*) and the public docs repo `panana-predictions/panana-docs` (last push 2025-09-12). Tag H unless noted.

- **Kind:** on-chain AMM / pool prediction market on **Aptos** (Move). Self-custodial; log in with an Aptos wallet (Petra named) or social login.
- **Market type 1, "Share markets" (the interesting one):**
  - Binary only (two outcome pools); outcome shares are "real tokens" that can be traded or transferred (docs intro: "Shares are tokens"). No categorical or scalar market is documented (NOT FOUND, searched: markets/*, tech/amm).
  - **Constant-product AMM:** `x * y = k`; price of A = `y/(x+y)`, price of B = `x/(x+y)`. Buy flow (docs worked example): fee taken first (example 1.5%), net collateral added as shares to **both** outcome pools, then the bought outcome's pool is rebalanced to `L^2 / other_pool` where L is the liquidity-pool share count. A 100 USDC buy in a 1000/1000/L=1000 pool yields 188 shares and moves the price to 0.55/0.45. So prices sum to 1 and the pool behaves like a Gnosis/Omen FPMM.
  - **Liquidity:** LP tokens ("LPS") issued to LPs; LP fee revenue proportional to stake and time; only trades after deposit count. A protocol-level **minimum liquidity** must be reached before trading starts; the creator can raise it (example "2 USD or higher"). "Synthetic liquidity" (no upfront funds, admin only) must be re-collateralised at resolution.
  - **Creation:** "Anyone can create and fund share markets ... There's no approval step" (permissionless-market-creation page). The creator sets question, category, end time, resolution rules and sources ("Our AI will support you"). A creator who self-funds can take "the first AMM price at 0.5" and earns creator + LP fees. Contradiction inside the docs: the share-market page still says "Markets are curated" and "Market proposals may be introduced by the community in the future" (H, same live page that links to the permissionless guide), so the docs are not internally consistent.
  - **Lifecycle:** open, trading, close (before resolution), resolution, challenge phase, claim after the challenge period.
- **Market type 2, "Crypto markets":** NOT an AMM (docs comparison table says AMM: No). 6-minute rounds on pairs such as APT/USDT; you predict up/down for the **next** round, entries stop when the round starts; winners split the pool pro rata; not sellable before the round ends; settled by Pyth.
- **Market type 3, "Daily markets":** one market per 24 h on sports/politics/weather, common pool, resolved within 24 h by a "committee of judges ... currently defined by Panana"; refund of stakes if the event is cancelled. The source page is `_daily-market.md` (underscore) in the docs repo and is absent from the live sitemap and the comparison table, so it is probably retired or hidden (M).
- **Outcome tokenisation:** share tokens for share markets (token standard not documented: NOT FOUND, searched docs tech/*, glossary). LP tokens exist. Crypto pools issue no tradable token.
- **Reputation token:** "XP" is a non-transferable (soul-bound) points token earned on every trade; planned to drive governance (Aptos Foundation listing text via search summary, M; docs refer to XP in the crypto and protocol pages, H).

---

## 3. Chains and collateral

| Item | Value | Tag |
|---|---|---|
| Chain | **Aptos mainnet** only (docs: "Panana Predictions runs on Aptos"; Nodit blog: Aptos Mainnet) | H |
| Main collateral | **USDC on Aptos** ("uses USDC as the main currency", fund via CEX withdrawal to Aptos or bridge) | H (docs/how-to-fund-wallet) |
| Other collateral claimed | landing page: "Panana supports markets in all kinds of fungible assets - APT, USDC, USDT, and even emojicoins"; README roadmap lists multi-token betting as planned | H (landing text) |
| Bridges named | Panora cross-chain, CCTP via Wormhole, CCTP via LayerZero | H |
| Gas | APT for gas on a normal Aptos wallet (whether Panana sponsors gas for social-login users is NOT FOUND, searched docs and README) | M |
| Contract address / package, share and LP token types | **NOT FOUND** (searched: docs.panana.fun all sitemap pages, landing HTML, public GitHub repo incl. `lib/*` and `Move.toml`, Nodit blog summary; app bundle unreachable because the deployment is paused). The only address in the public repo (`0x6e04...b489`, in `lib/event-market-abi.ts`) has **zero modules** on Aptos mainnet and testnet (GET `/v1/accounts/{addr}/modules`, 2026-10-19) | H (negative) |

---

## 4. Read API

Docs: https://docs.panana.fun/api/ and https://docs.panana.fun/api/fetch-markets (both H, fetched 2026-10-19; extracted text saved as a fixture).

- **Official public API: exists on paper, one endpoint.** `POST https://app.panana.fun/api/markets`, JSON body. No auth ("Currently, the listed endpoints require no authentication and are publicly queryable"); future trading/LP/notification endpoints "may require signatures or wallet-based authentication". "(more endpoints coming soon)": market creation, order placement, liquidity actions, positions, XP stats, leaderboard, price feeds - all unreleased. No OpenAPI spec found (NOT FOUND, searched: docs sitemap, /api/*).
- **Request fields (H):** `sortBy` (`volume` | `ending`), `marketStateIn` (array of `open` | `resolved` | `proposed`), `categoryIn` (array), `search` (title text), `sortDirection` (`asc`|`desc`), `creator` (address), `page` (1-based), `pageSize` (max 200, default 50).
- **Categories (H, 20):** PoliticsAndElections, GeopoliticsAndConflict, MacroEconomy, TraditionalFinance, CryptoAndDeFi, TechAndAI, BusinessAndStartups, LegalAndRegulation, ScienceAndSpace, HealthAndBiotech, EnergyAndClimate, Sports, EsportsAndGaming, EntertainmentAndMedia, InternetAndCulture, RealEstateAndHousing, TransportationAndMobility, EducationAndAcademia, PublicPolicyAndSociety, PlatformAndMeta.
- **Response shape: NOT FOUND.** The docs show only the request. I did not send the documented POST (rule: no POST), and a GET to the same path returns 503 DEPLOYMENT_PAUSED anyway, so I could not confirm any response schema, price field, volume field or resolution field.
- **Not documented anywhere:** order-book/price/trade endpoints (an AMM needs reserves + fee to quote; the response may carry them but that is unverified), WebSocket, rate limits (NOT FOUND, searched docs/api and the landing page).
- **On-chain / indexer fallback:** the team uses Nodit's Aptos Indexer and Nodit webhooks for real-time events (Nodit blog, M). An independent scanner would need the package address, the `view` functions or table resources of the AMM module, and event types. None of that is documented (NOT FOUND). The 2024 hackathon repo used `@thalalabs/surf` with ABI files; those ABIs describe the old parimutuel `event_market` module, not the mainnet AMM (H, repo read).
- **Third-party aggregators:** none found (not on DefiLlama, H). Dune/Aptos-explorer dashboards were not searched (search budget exhausted).

---

## 5. Trade path

- **Programmatic trading: no official API or SDK is documented.** The API page lists order placement and liquidity actions as "coming soon". The product is a web app + Telegram bot/mini app (README of the hackathon repo, M; Telegram group text "Telegram Bot & App", H).
- **Only realistic route:** build and sign Aptos entry-function transactions directly against the mainnet package (Ed25519 account, BCS-encoded RawTransaction, `APTOS::RawTransaction` domain-separated hash, APT for gas). That requires the package address and ABI, which are NOT FOUND, so it cannot be specified.
- Shares are tokens, so they could in theory be moved or sold on a secondary venue (docs claim DeFi composability); no secondary market was found (L).
- Order types: none; an AMM swap has `amount_in`, a min-out/slippage parameter is presumably present but undocumented (NOT FOUND).

---

## 6. Can an EVM wallet via PayBox trade it?

**No (paybox_reachable = no).**
- Aptos is a separate chain and VM (Move), not EVM. The PayBox chain catalog verified earlier today has 11 entries: Solana, Ethereum, Base, Arbitrum, OP, Polygon, BNB, Avalanche, Robinhood, Arc, Hyperliquid - no Aptos (H, via `docs/research/06-paybox-platform.md` line 113, itself first-hand 2026-10-19). That note says the catalog is "not a support allowlist", so absence is evidence not proof.
- No EVM contract, relayer or signed-order flow exists for Panana, so an EVM transaction proposal or EIP-712 order has nothing to target.
- Funding itself would need USDC on **Aptos** (bridge with CCTP/Wormhole/LayerZero from an EVM chain, which is a separate manual step that PayBox does not provide, M).
- Theoretical corner (L): a Solana-style Ed25519 key could in principle derive an Aptos account and sign the transaction hash through a raw-message signing tool, but PayBox's raw-sign behaviour for that is untested, the agent would have to build BCS transactions itself, and gas must be APT. Not a viable adapter path.

---

## 7. Fees

All fee statements in the live docs carry the banner **"Fees are not yet defined and may change at any time during the market's beta phase."** (H, share-market, crypto-market, daily-market, amm pages.)

| Market type | Documented fee | Who pays | Tag |
|---|---|---|---|
| Share market, trade | **1.5% trading fee** in the worked AMM example, deducted from the collateral before shares are minted; split between creator, LPs, platform (percentages not given; "minimum reward percentages are defined at the protocol level, but can be customized by the market creator") | trader | H (example only; actual parameter NOT FOUND) |
| Share market, challenge | **500 USDC** one-time fee to summon the oracle committee | challenger; paid to the oracle | H |
| Share market, creation | no creation fee stated on the live page; the Aptos Foundation listing said "During beta, trading and creation fees are zero, with only the 500 USDC challenge bond" (search summary of an Aptos Foundation page that I could not fetch directly because of a Vercel bot checkpoint) | n/a | L (stale, pre-mainnet wording) |
| Crypto 6-min pools | **3% deducted on buy-in** (the example nets 3% off the losing pool; docs say both "deducted on buy-in" and "3% performance fee") | bettors | H |
| Daily markets | "No fees for market creation or participation" in the (hidden) page, yet the same page's example subtracts a 3% performance fee | n/a | H |
| Withdrawal / bridge | none documented | n/a | NOT FOUND |

History in the public docs repo: commit "feat(fee): removed fees" on 2025-03-08, then "feat(lp): added lp section and fee section details" on 2025-05-25 (H, `gh api repos/panana-predictions/panana-docs/commits`), so the fee text has moved more than once.

---

## 8. Resolution mechanism and dispute risk

- **Crypto 6-min pools:** automatic, Pyth price feeds (H, docs). The 2024 hackathon repo used Switchboard feeds instead (H, `Move.toml`); the landing page lists Pyth under "Powered By". Treat which feed is used on mainnet as Pyth per the live docs. A short-window up/down market is exposed to oracle timing and feed granularity.
- **Share markets (the ones that could overlap other venues):**
  1. Outcome "determined based on verifiable sources and predefined resolution criteria" written by the **market creator**; permissionless creation means the quality of rules is user-controlled (H).
  2. Resolved by a "resolution committee" (comparison table: "Via resolution committee"); the committee composition is not published (NOT FOUND).
  3. A **challenge** costs 500 USDC and summons the **Decentralized Reputation Oracle**, but that page is titled "(coming soon)", says "Committee members will be announced in the near future", and the summoning fee is still "X USDC" in the tech page (H). So the dispute layer is, per the docs themselves, **not live or at least not specified** (M, my reading of "coming soon").
  4. If no challenge occurs "the market resolves automatically after the predefined period" (H, wording unclear: automatically to what outcome is not stated).
  5. The oracle decision is "final binding" and "cannot be reversed" (legal disclaimer, H).
- **Dispute / void risk for an aggregator:** high. Single-point-of-trust committee (Panana-defined for daily markets), creator-authored rules, no UMA-style bonded proposal, a 500 USDC challenge cost that blocks small holders, and unspecified cancel/void handling for share markets (refund rule is stated only for daily markets). Cross-venue arbitrage on the same real event can be broken by differing rule text.
- **Audits:** Landing page "Secured By" shows MoveBit and Sherlock logos; docs say both "performed" audits (H). No report link, no date, no scope (NOT FOUND, searched docs/security, landing). Treat as unverified claims.

---

## 9. Geo / ToS / automation

- No Terms of Service page found (NOT FOUND, searched: panana.fun, docs sitemap). Only the docs' Legal Disclaimer: informational/entertainment platform "as is", "no recourse against the platform"; "The platform may be restricted in certain jurisdictions, and users are responsible for determining their eligibility. Panana Predictions may implement KYC/AML procedures if required by applicable laws." (H, docs.panana.fun/protocol/legal-disclaimer).
- No explicit geoblock list, no bot/automation clause (NOT FOUND, searched legal-disclaimer, api page). The API page invites "bots, dashboards, and trading tools" ("integrate Panana functionality into external applications, dashboards, bots, and trading tools", H).
- Privacy: "does not collect personal data"; interactions via public addresses (H).
- Entity: no legal entity named on the site or docs (NOT FOUND). The public repo is owned by the GitHub org `servrox-solutions`, which also hosts unrelated forks (safe-wallet, iota-multisig); that identifies a repo owner, not a legal operator (L).

---

## 10. Liquidity

- **TVL / volume / OI: NOT FOUND in any primary source.** Searched: landing page, docs (all pages in the sitemap), Nodit blog summary, DefiLlama.
- **DefiLlama:** `GET https://api.llama.fi/protocols` returned 8,758 protocols on 2026-10-19 with **no match** for "panana" in name, slug, url or twitter (fixture `defillama_protocols_absence_check_2026-10-19.json`) (H).
- Docs say "In the early stages, Panana and selected partners will provide most of the initial liquidity" (H) and that the market minimum liquidity can be as low as "2 USD or higher" (example, H): depth is probably tiny and creator-seeded.
- Community size: Telegram group "269 members, 14 online" (H, 2026-10-19). Bot/mini-app user counts: NOT FOUND.
- Hackathon-era: the project won Code Collision Aptos 2024 (Nodit blog, M). No traction metric found since.

---

## 11. Event categories and overlap with other venues

- **Categories (H, API docs):** 20, including PoliticsAndElections, MacroEconomy, CryptoAndDeFi, Sports, EsportsAndGaming. A search snippet suggested league-winner and champion markets (La Liga, NBA) with 2026-2027 end dates (L, unverified).
- **Potential overlap:** sports (season winners), politics, macro, crypto price. All of these exist on Polymarket, Kalshi, Limitless, Myriad and XO. **Practical overlap is unproven**: nothing confirms which markets exist or how deep they are, and creator-authored resolution text means two "same" markets may not be the same contract.
- **Crypto short-term:** the 6-minute APT/USDT up/down pools are parimutuel (payout depends on final pool sizes), settled by Pyth, and cannot be hedged cleanly against other venues' up/down contracts. Not an arbitrage leg.
- Use as signal: the AMM price of share markets is a retail-crowd probability, but with no feed and a paused app it cannot be collected.

---

## 12. Fixtures saved

All under `docs/research/fixtures/panana-prediction/` (total ~12 KB):

- `app_api_markets_GET_paused_2026-10-19.txt` - the 503 DEPLOYMENT_PAUSED response for the documented API path (GET only; the documented method is POST and was not sent).
- `app_root_GET_paused_2026-10-19.txt` - same for the app root.
- `landing_headers_2026-10-19.txt`, `docs_headers_2026-10-19.txt` - headers for panana.fun and docs.panana.fun (cache ages, last-modified).
- `docs_api_markets_request_schema_text_2026-10-19.txt` - text of the official API pages (documentation of the request shape, **not** a response).
- `docs_sitemap_2026-10-19.xml` - the live docs sitemap (shows which pages exist, e.g. permissionless creation and api/fetch-markets).
- `github_servrox_repo_meta_2026-10-19.json`, `github_panana_docs_repo_meta_2026-10-19.json` - repo metadata.
- `defillama_protocols_absence_check_2026-10-19.json` - result of the DefiLlama presence check.

---

## 13. Adapter spec (if it ever comes back) and priority

**adapter_priority = skip** for now. Reasons: front end and sole documented API paused; no response schema; no package address; no volume data; Aptos is outside PayBox's reach; event resolution is committee/creator-based with the dispute layer "coming soon".

If revisited, minimum read-only adapter:
1. Probe: `GET https://app.panana.fun/api/markets` (a 405 or 200 instead of 503 shows the deployment is back; send the documented POST only under a rule set that allows it).
2. `POST /api/markets` with `{"marketStateIn":["open"],"sortBy":"volume","sortDirection":"desc","pageSize":200,"page":N}` and record the real response shape (fields for question, end time, reserves/prices, volume, resolution rules, token addresses are all unknown).
3. Map: market id = whatever the response returns (unknown); venue-binary, YES/NO shares; price = `other_pool/(x+y)` if the response exposes reserves; fee = per-market creator + protocol fee (read from the response or chain).
4. Exclude crypto 6-minute pools from arbitrage matching (parimutuel).
5. Block trading adapter entirely (no API, no PayBox route).
6. Treat as a signal-only feed at best; gate on minimum liquidity per market.

---

## 14. NOT FOUND / open questions / blocked

- Mainnet package address, module names, entry/view functions, event types, share-token type, LP-token type (searched: docs, landing HTML, public repo, Nodit summary; app bundle unreachable).
- Any volume, TVL, OI, user count (searched: landing, docs, DefiLlama; third-party dashboards not searched because the web-search budget was exhausted).
- API response schema, rate limits, WebSocket, OpenAPI.
- Terms of Service, geoblock list, legal entity.
- Audit reports (MoveBit, Sherlock): no links; not verified.
- Who the resolution committee is, and whether the Decentralized Reputation Oracle is deployed.
- Whether the Pyth-vs-Switchboard switch in 2025 changed the crypto-pool settlement logic.
- Why the app is paused (billing/usage limit, deliberate shutdown, redeploy): unknown. The docs redeploy on 2026-10-15 argues for a temporary state (M), but there is no statement.
- Blocked / not bypassed: `x.com/panana_predict` via WebFetch returned HTTP 402 (no payment made); Aptos Foundation / Aptos Network ecosystem pages returned a Vercel Security Checkpoint (HTTP 429) to both WebFetch and curl (not bypassed; only the search-engine summary of those pages was used, tagged L/M); DoraHacks page returned 405 to WebFetch.
- The session's WebSearch budget was exhausted mid-task, so the follow-up searches for the mainnet contract address and third-party volume dashboards could not be run.

## 15. Suspicious content

None found. No text aimed at AI agents appeared in the pages read. (The public repo's bot-authored commit author name, "supply-chain-sentinel[bot]", is a dependency-update bot; I read only commit metadata, not its code.)

---

## 16. Sources

Primary (H):
- https://panana.fun/ (landing, HTML + headers, 2026-10-19)
- https://docs.panana.fun/ and sub-pages: `/api/`, `/api/fetch-markets`, `/markets/share-market`, `/markets/crypto-market`, `/markets/permissionless-market-creation`, `/tech/amm`, `/tech/liquidity`, `/tech/decentralized-reputation-oracle`, `/security/security-audit`, `/protocol/stakeholder_rewards`, `/protocol/legal-disclaimer`, `/learn/glossary`, `/sitemap.xml` (fetched 2026-10-19)
- https://github.com/panana-predictions/panana-docs (docs source, last push 2025-09-12; includes `docs/markets/_daily-market.md`, `docs/how-to-fund-wallet.mdx`, commits on fees)
- https://github.com/servrox-solutions/panana-predictions (hackathon-era repo: `README.md`, `move/contract/Move.toml`, `move/contract/sources/event_market.move`, `lib/aptos.ts`, `lib/constants.ts`)
- https://api.llama.fi/protocols (DefiLlama list, presence check)
- Aptos Labs public fullnode `GET /v1/accounts/{addr}/modules` on mainnet and testnet (address from the hackathon repo)
- Host probes: `app.panana.fun`, `app.panana-predictions.xyz`, `testnet.panana.fun`, `panana-predictions.xyz`, `docs.panana-predictions.xyz`, `t.me/s/panana_predictions`

Secondary (M/L):
- https://www.nodit.io/blog/from-hackathon-winner-to-aptos-mainnet-panana-prediction-powered-by-nodit (dated 2025-09-11; read via WebFetch summary)
- Aptos Foundation ecosystem listing text, https://aptosfoundation.org/ecosystem/project/panana-predictions (search-engine summary only; direct fetch blocked by a bot checkpoint)
- DoraHacks project page https://dorahacks.io/buidl/16813 (search snippet only)
- predictionindex.xyz snapshot stored at `docs/research/fixtures/linking/pop_prediction_index_projects_2026-10-18.json`
- `docs/research/06-paybox-platform.md` (PayBox chain catalog, 2026-10-19)
