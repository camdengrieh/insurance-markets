# Aura (aura.money / trade.aura.money)

Researched 2026-10-19. Tags: H = read first-hand in a primary source this session (URL cited), M = secondary or inferred, L = weak or stale.

## Verdict

- **adapter_priority: skip.** Aura is a front-end overlay (kind: broker-or-frontend). It has no independent liquidity, no public API and no documented programmatic trade path. Its terms prohibit automated access.
- Polymarket orders go straight to Polymarket's own CLOB with an Aura builder code attached. A scanner should read Polymarket directly (covered by the parallel workflow). Aura adds no price leg.
- Hyperliquid perps, spot, HIP-3 and HIP-4 outcome markets are likewise Hyperliquid's own books. Any HIP-4 adapter should target Hyperliquid, not Aura.
- Revisit only if Aura publishes an API, or if its Groups/social feed becomes a useful signal (nothing public today).

## Is it live (2026)?

- Yes, as a product shell. https://aura.money/ returned 200 and https://trade.aura.money/ returned 200 on 2026-10-19 [H].
- The docs changelog has a single entry: "2026-03-08: Aura Launch (v0.1.0)" [H: https://docs.aura.money/changelog].
- DefiLlama listed three "Aura Money" Interface entries (perps, spot, outcome) with listedAt 2026-10-08T22:17:31Z [H: https://api.llama.fi/protocols].
- The org repo `aura-landing-v2` was last pushed 2026-05-12 [H: GitHub API].
- A Google Play listing exists. A search snippet said it was updated 2026-05-18; I could not open the page [M].
- Aura's X account was described in a search snippet as "private beta" [M]. I could not fetch x.com.
- I did NOT exercise sign-in or trading (read-only rules), so "live" means site, app shell and docs are up, not that trading was tested.
- The homepage says HIP-4 is "coming soon" [H: https://aura.money/]. DefiLlama methodology shows HIP-4 outcome trades attributed to Aura's builder code starting 2026-05-04 [H: summary endpoint below]. The two conflict. Treat Aura's own marketing as lagging.

## Kind and market model

- Kind: non-custodial trading front-end ("visual user interface") over Hyperliquid and Polymarket [H: https://aura.money/terms-of-service, https://docs.aura.money/help/what-is-aura]. It runs its own social layer ("Groups") on top [M: search snippet].
- Polymarket side: binary Yes/No outcome tokens (CTF, ERC-1155) on Polymarket's central limit order book, Polygon chain 137. Neg-risk multi-outcome markets are handled by Polymarket's adapter [H: constants in the trade-app bundle, see fixtures].
  - The docs say "Aura connects directly to Polymarket's order book" [H: https://docs.aura.money/help/what-is-aura].
- Hyperliquid side: perps, spot, HIP-3 builder-deployed perps, and HIP-4 outcome markets. HIP-4 outcomes are fully collateralised Yes/No tokens on a merged order book; the first market is a daily BTC binary settling 06:00 UTC [H: https://hyperliquid.gitbook.io/hyperliquid-docs/hyperliquid-improvement-proposals-hips/hip-4-outcome-markets.md].
- No AMM, no parimutuel, no own order book. Aura holds no inventory ("does not hold, control, or issue assets" per terms) [H].

## Chains and collateral

- Polymarket: Polygon (137). Docs say the Safe accepts only USDC.e on Polygon [H: https://docs.aura.money/help/deposit-polymarket]. The deposit-methods page says the fiat onramp delivers pUSD to the Safe [H: https://docs.aura.money/help/deposit-overview]. The two pages disagree. The bundle references both USDC.e and a pUSD address, plus collateral adapters, which fits Polymarket's CLOB V2 pUSD migration [H: bundle; M: interpretation]. Polymarket's own docs quote fees in pUSD [H: https://docs.polymarket.com/programs/builders/fees.md]. Treat the Aura help page on USDC.e as possibly stale.
- Polymarket wallet: a per-user Safe whose signer is the Privy embedded wallet, deployed on first deposit [H: deposit-polymarket]. The bundle also contains a Polymarket "DepositWallet" factory (CLOB V2 style), so the wallet type may have changed [M].
- Hyperliquid: USDC (and USDH under unified mode) on HyperCore/HyperEVM. Trading is gasless. Deposits from external chains such as Arbitrum need gas from the sender's wallet [H: https://docs.aura.money/help/faq, https://docs.aura.money/help/unified-account-mode].
- Onramps: Helio widget (fiat and crypto, incl. BTC/ETH/SOL sources) [H: deposit-overview]. The docs name "Swapped" for card/bank in the sidebar. The app bundle also references MoonPay [M]. No full chain list is published.

## Read API

- **Official public API: NOT FOUND** (searched: aura.money, docs.aura.money nav and help pages, `/api` and `llms.txt` on both hosts [no API content], GitHub org AuraDotMoney, ToS).
  - docs.aura.money `/api` and `/llms.txt` return the generic docs shell HTML, not API content [H].
  - Marketing-site `/api/markets/hl` and `/api/markets/pm` exist as thin proxies of Hyperliquid `/info` and Polymarket Gamma [H: https://github.com/AuraDotMoney/aura-landing-v2 README]. `robots.txt` on aura.money says `Disallow: /api/` [H: https://aura.money/robots.txt]. I did NOT call them. They carry no Aura-specific data anyway.
- Aura's web client fetches market data directly from Polymarket and Hyperliquid [H: bundle]:
  - Polymarket hosts: `clob.polymarket.com` (e.g. `/prices-history`), `gamma-api.polymarket.com`, `data-api.polymarket.com` (`/positions`, `/closed-positions`, `/activity`), and `polymarket.com/api/geoblock`.
  - Hyperliquid host: `api.hyperliquid.xyz`.
  - User data goes to a Supabase project (host is in the app HTML). I did not probe it.
- Undocumented host `api.aura.money`: one GET to `/` returned 302 and `/health` returned a 404 page. Not documented, not explored further. Its existence implies a private backend [L].
- So the real read APIs are Polymarket's and Hyperliquid's. Use those venue adapters and ignore Aura.
- Auth, rate limits, websocket for Aura: none documented. Fixtures saved are provenance evidence only, since there is no Aura API to sample.

## Trade path

- Aura offers no programmatic path: no API, no SDK, no bot docs [H: docs nav].
- How Aura itself trades:
  - Hyperliquid: a locally generated "agent key" (API wallet) approved once by the account owner. It can place and cancel orders and change leverage, but cannot withdraw. Stored in browser or device storage. Hyperliquid allows 4 active API wallets per account [H: https://docs.aura.money/help/agent-keys, https://docs.aura.money/help/managing-api-wallets].
  - Polymarket: the Privy-managed signer authorises orders and sponsored relayer transactions. Orders carry Aura's `builderCode` (bytes32) via a Polymarket client SDK [H: bundle; docs: "Polymarket transactions are gasless and sponsored through Polymarket's relayer", https://docs.aura.money/help/what-is-aura].
- **PayBox reachability: no.** A PayBox-held EVM key cannot drive Aura. Embedded wallets are Privy-custodied and the external wallet is used only for sign-in and one-time Hyperliquid setup [H: https://docs.aura.money/help/embedded-vs-external-wallet]. The UI is session-bound and the ToS bans automated access.
  - To trade the same books, go direct. Polymarket is Polygon-based, with EIP-712 order signing against the CLOB (see the Polymarket spec). Hyperliquid HIP-4 uses its own L1 signing (see the Hyperliquid spec).

## Fees

- Hyperliquid builder fee: ceiling approved once at 0.1% per order. Current rate 0.001% (0.1 bp) per order on perps, spot and HIP-3, except perps.fun. Waived (0%) until $1B lifetime volume if Aura becomes your Hyperliquid referrer; applies if the account already has a different referrer [H: https://docs.aura.money/help/fees, https://docs.aura.money/help/free-trading].
- Inconsistency: the homepage says bring-your-own-wallet users pay 0.01% [H: https://aura.money/] versus 0.001% in the docs [H: fees page]. Unresolved.
- Hyperliquid protocol maker/taker fees are set by Hyperliquid by 14-day volume tier, paid by the trader [H: fees page]. HIP-4 outcome fees were zero for initial testing, with builder codes earning on sell orders [H: HIP-4 page].
- Polymarket: Aura claims 0% [H: homepage]. Polymarket's own platform fee applies regardless: `platform_fee = C x feeRate x p x (1-p)`, taker-only, per-market `feeRate` [H: https://docs.polymarket.com/programs/builders/fees.md]. A builder fee of up to 100 bp taker / 50 bp maker can be set on top of that and is additive [H: same page].
  - Aura's bundle attaches a builder code to every order [H]. Aura's configured rate for that code is NOT FOUND (searched: Aura docs, Polymarket docs; the builder profile is private). Do not assume 0 bps despite the "0%" marketing claim.
- Gas: no gas to trade. Embedded-wallet deposits are sponsored. External-wallet deposits pay normal network gas [H: fees page].
- No subscription, platform or withdrawal fee [H: FAQ]. Onramp (Helio) fees: NOT FOUND.

## Resolution mechanism and dispute risk

- Aura does not resolve anything. Polymarket markets resolve under Polymarket's own mechanism (commonly the UMA optimistic oracle and its dispute process [M: not re-verified here; see the Polymarket spec]). Aura's help centre says to refer to Polymarket's docs [H].
- HIP-4 outcomes settle automatically at HyperCore mark price, with `settleFraction` 1 or 0 for binary [H: HIP-4 page].
- Extra risk from Aura: its own app/passkey layer. If passkey access is lost, assets may be irretrievable and Aura says it cannot help [H: terms]. The terms call the service "highly experimental" [H].

## Geo, ToS, automation

- Terms of Service last updated 2025-11-18, so they pre-date the Polymarket integration (body text never mentions Polymarket) and may be stale (L-M) [H: https://aura.money/terms-of-service].
- Restricted Territory: United States, China, Italy, and any US/UK/EU-sanctioned region. VPN use to get around it is prohibited. KYC/AML checks may be run [H: terms].
- Automation: a prohibited use is to "access or use the App by automated means". Another is building a competing product or service [H: terms 5.1 (q), (r)]. There is no API or bot policy.
- Polymarket's own geoblock is also checked by the client (`polymarket.com/api/geoblock`) [H: bundle].
- Entity and law: the terms name "Auramaxxing Company Corporation" and the footer says "Infinite Aura Pte Ltd". Governed by Panama law, arbitration in Panama [H: terms]. Treat counterparty identity as unclear.

## Liquidity

- No independent liquidity [H]. All depth is Polymarket's CLOB or Hyperliquid's books.
- Aura's own volume is tiny or unmeasurable. DefiLlama "Interface" entries track only builder-code-attributed Hyperliquid volume [H: https://api.llama.fi/summary/dexs/aura-money-outcome, .../aura-money-spot, retrieved 2026-10-19]:
  - HIP-4 outcome: $96 all-time, with non-zero days 2026-05-04 ($32), 2026-05-11 ($22), 2026-06-15 ($20), 2026-06-16 ($22); 0 over the last 30 days.
  - Spot: $340.7 all-time, 0 over the last 30 days.
  - Perps: fees endpoint shows 0 all-time; volume endpoint is behind DefiLlama's paid plan (HTTP 402, not paid).
- Caveat: builder-code volume may be undercounted while most accounts pay a zero builder fee, so these figures are a lower bound [M]. No user, TVL or total-volume figure was found. Messari returned HTTP 429, so that source was not read.
- Polymarket volume through Aura's builder code: NOT FOUND (searched: Aura docs, DefiLlama; Polymarket builder-leaderboard endpoints not checked).

## Event categories and arbitrage overlap

- Aura's Polymarket categories are politics, sports, crypto and culture (identical to Polymarket) [H: homepage via WebFetch].
- Overlap with other venues is therefore exactly Polymarket's overlap. Aura is the same leg, so it is NOT an independent arbitrage leg versus Polymarket, and any perp/outcome hedge on Hyperliquid is Hyperliquid's own book.
- The one Aura-adjacent cross-venue idea is Polymarket price versus HIP-4 BTC daily binary or HL perps. That idea belongs in the Hyperliquid and Polymarket adapters, not here.

## Signal value

- Aura's "Groups" social feed shows peers' trades in real time [M: search snippet]. No public access, so it is not usable as a signal source.

## Shares liquidity with

- Polymarket (CLOB V2, Polygon) and Hyperliquid (HyperCore/HyperEVM). It is not independent of either.

## Suspicious content

- None found. No text aimed at AI agents appeared in the pages I read. The public bundle contained a third-party RPC API key, which I did not copy anywhere.

## Open questions

- Does Aura's Polymarket builder code carry a non-zero fee? (Polymarket builder profile is private.)
- Is the Polymarket wallet a Safe (per docs) or a CLOB V2 DepositWallet (per bundle constants)? Which collateral is current, pUSD or USDC.e?
- Are HIP-4 outcome markets live in Aura's UI, given the homepage says "coming soon" but DefiLlama shows attributed volume from 2026-05-04?
- Is there any partner or private API behind `api.aura.money`? Not documented.
- Aura's perps volume is gated behind DefiLlama's paid plan.

## Sources

- https://aura.money/ (homepage, 2026-10-19) [H]
- https://aura.money/terms-of-service (last updated 2025-11-18) [H]
- https://aura.money/robots.txt [H]
- https://trade.aura.money/ and its public JS bundle (hosts, Polymarket constants, builder-code order calls) [H]
- https://docs.aura.money, plus /help/what-is-aura, /help/faq, /help/fees, /help/free-trading, /help/builder-fee (nav only), /help/deposit-overview, /help/deposit-polymarket, /help/embedded-vs-external-wallet, /help/agent-keys, /help/managing-api-wallets, /help/unified-account-mode, /changelog [H]
- https://github.com/AuraDotMoney (7 public repos; the trade app and backend are not public) and https://github.com/AuraDotMoney/aura-landing-v2 README [H]
- https://api.llama.fi/protocols and https://api.llama.fi/summary/dexs/aura-money-outcome, /aura-money-spot, /fees/aura-money-perps [H]
- https://docs.polymarket.com/llms.txt and https://docs.polymarket.com/programs/builders/fees.md [H]
- https://hyperliquid.gitbook.io/hyperliquid-docs/hyperliquid-improvement-proposals-hips/hip-4-outcome-markets.md [H]
- Web search snippets (Google Play listing, X profile status, Groups feature): [M]. The web-search budget ran out partway through research, so no further searches could be run. Messari returned HTTP 429.

## Fixtures

Saved under `docs/research/fixtures/aura/`. Aura has no public API, so these are provenance evidence, not Aura response samples.

- `trade-app-bundle-polymarket-constants.json`: Polymarket hosts, contract addresses, builder code and order-call shapes extracted from the public trade-app bundle (RPC keys excluded).
- `defillama-aura-money-protocol-entries.json`: DefiLlama entries for the three Aura interface listings.
- `defillama-aura-money-outcome-summary.json`: DefiLlama volume summary for Aura's HIP-4 outcome trades.
