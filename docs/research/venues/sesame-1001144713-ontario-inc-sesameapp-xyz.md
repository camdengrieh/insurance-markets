# Sesame (1001144713 Ontario Inc., sesameapp.xyz) - venue spec

Researched 2026-10-19. Tags: H = read first-hand this session in a primary source, M = secondary/inferred, L = weak/stale/ambiguous.

## Verdict

- Adapter priority: **skip** (at most a P2 "culture sentiment" signal feed, not an arbitrage leg).
- It is **not a prediction market** in the event-contract sense. It sells perpetual "sentiment contracts" on people/brands/teams priced by a **sub-linear bonding curve** on Arbitrum. No outcomes, no resolution date, no YES/NO, nothing to hedge against Polymarket/Kalshi/XO. (H, help center "What is Sesame?" and "Where does the pricing come from?")
- Live: yes. Site up 2026-10-19 (HTTP 200), backend API answering, newest chart points dated 2026-10-19, "launching soon" list has listings dated 2026-11-01. (H)
- Independent liquidity but trivially thin (see Liquidity). No public API, ToS forbids scraping/bots. (H)

## Kind and market model

- Kind: SocialFi app on a bonding-curve token system; ToS/privacy policy call it "a SocialFi app combining a prediction market with social media" (H, privacy policy), while the help center says its goal is "community and fandom rather than predict event outcomes" and contrasts itself with Polymarket and Kalshi (H, help center).
- Per-listing token ("BCT"; the name is only visible in the API/JS - NOT FOUND in docs what the acronym stands for). Each listing has its own on-chain address (`bct_address` in `/api/bcts`) and numeric `bct_id`. (H, API)
- Price is "the USDC value of the next share on the bonding curve"; buy pushes price up, sell pushes down; "you trade with the contract, not other users"; always liquid. Contracts are "perpetual and have no binary resolution date". (H, help center glossary / pricing / what-is)
- Not binary/categorical/scalar outcome market. No order book. Not parimutuel. Closest to a per-asset bonding-curve AMM. Curve formula NOT FOUND (help center shows only a diagram; contract source not read, block explorers blocked by Cloudflare/403).
- Minimum buy $5 USDC, minimum sell $1 USDC (H, help center article titles). Prices shown lag chain by ~2-3 minutes because of indexing (H, help center).
- Listings are added weekly by user vote ("launching soon" queue), tagged Unofficial (fan/parody, not run by subject) or Verified. (H, help center + `/api/launching-soon`)
- Inventory 2026-10-19: 73 listings from `/api/bcts`; ~66 of those are World Cup national teams and footballers sitting at the untouched initial price. (H, API)

## Chains and collateral

- Arbitrum One (CAIP-2 `eip155:42161`) only; privacy policy says it "may expand to other chains". (H: site JS constant + privacy policy)
- Collateral: native USDC on Arbitrum, `0xaf88d065e77c8cC2239327C5EDb3A432268e5831` (H, site JS; this is the standard Circle USDC address on Arbitrum, M for that equivalence).
- Wallets: Privy embedded self-custodial wallet per account (email sign-up, no wallet needed); gas is sponsored by Sesame ("gas fees are paid for by Sesame"). (H, help center + App Store listing + JS)
- Deposit: card via Apple/Google Pay, or USDC transfer on Arbitrum to the in-app address. Withdraw: USDC on Arbitrum to an external wallet; `GET /api/config` currently returns `{"withdraw_enabled":false}`, i.e. **withdrawals are switched off in the app right now** (H, API 2026-10-19). Reason NOT FOUND; treat as a custody/exit risk.

## Read API

- Official public API: **none documented**. ToS says no public API is mentioned (H: terms, sec 4.1.5 / 4.1.7 prohibit scraping, robots and scripts beyond reasonable usage).
- Undocumented first-party backend used by the web app, found in the site's public JS bundles (treat as unsupported, may change or be blocked):
  - Base: `https://backend.sesameapp.xyz/api`
  - Unauthenticated GET (confirmed 2026-10-19, H): `/config`, `/categories-count`, `/bcts`, `/browse`, `/launching-soon`, `/entity/{bctIdHex}/chart?period={1h|1d|1w|1m|3m|1y}&type={price|volume|marketcap}` (bctIdHex like `0x1`).
  - Seen in JS but not called (POST or Bearer auth, I did not POST): `POST /bct/market-data {bctIds}`, `POST /bct/trending`, `POST /bct/events {address,page,pageSize}` (trade events with `bctId, tradeSide, amountIn, amountOut`, USDC 6 decimals), `GET /search?q=`, `/user/me`, `/watchlist`, `/vote`, `/notifications`, `POST /transaction` (auth).
- No order book / depth endpoint (bonding curve; depth would have to come from contract reads). No websocket found in Sesame's own code (the `wss://` hits in the bundle belong to third-party libs; Stream Chat is used for chat).
- Auth/limits: public GETs need no auth; Privy bearer token for user routes; rate limits NOT FOUND.
- `volume` and `marketcap` chart series return small integers that are identical to each other for every listing (1 to 13); units unclear, so they are not usable as USD volume or market cap (L).
- Fixtures (all unauthenticated GET, generic User-Agent): `docs/research/fixtures/sesame-1001144713-ontario-inc-sesameapp-xyz/` : `config.json`, `categories-count.json`, `launching-soon.json`, `bcts.sample.json` (4 of 73), `browse.sample.json` (3 of 15 entities), `entity-0x1-chart-{price,volume,marketcap}.sample.json`.
- Response shapes (H): `/bcts` -> `{bcts:[{bct_id, organization_id, bct_address, organizations:{id,name,bio,url,image,categories,category_id,...}}]}`; chart -> `{success, period, data:[{timestamp(ms), value(string decimal)}]}`; price for `bct_id` 1 on 2026-10-19 was 0.159234 USDC (30 daily points over 1m).

## Trade path

- Programmatic: **none supported.** Trades are executed by the web/iOS app through a Privy embedded wallet; the app sends `POST /api/transaction` with `{walletId, data(callData), to, value, caip2:"eip155:42161", sponsor:true, signature, origin}` and a Privy Bearer token, i.e. Sesame's backend relays sponsored Privy `eth_sendTransaction` calls (H, JS). Requires a Privy login session and the wallet-owner authorization signature for a Sesame-created Privy wallet.
- Contract ABI / trading contract address and trade function NOT FOUND (the `bct_address` per listing is known; Arbiscan 403, Blockscout Cloudflare-challenged, I did not do JSON-RPC POSTs).
- PayBox reachable: **partial/no.** An EVM PayBox wallet on Arbitrum with USDC could in principle send ordinary transactions (approve + buy) directly to the contracts if the ABI were known, bypassing the app, but nothing official supports this, the sponsor-gas relay would not apply, and the ToS bans bots/scripts. Not recommended.

## Fees

- Operator fee schedule NOT FOUND. ToS: "No operator fee amounts are listed"; users bear gas and "protocol-level fees" (but Sesame sponsors gas in-app). Buy/sell help articles say nothing on fees/slippage. Bonding curve spread is implicit in price. (H for absence)

## Resolution and dispute risk

- No event resolution (perpetual). Dispute risk is operator/legal rather than oracle: binding individual arbitration under Canadian law, claims within 12 months, liability cap US$100 (H, ToS). Smart-contract, oracle, bridge and front-running risks disclosed generically (H). Listing is by community vote and "Unofficial" profiles are not run by their subjects. Withdrawals currently disabled in config (see above).

## Geo / ToS / automation

- Operator: 1001144713 Ontario Incorporated (Canada), non-custodial claim, no licence or regulatory approval claimed, App Store rating 18+ (H).
- Restricted: Myanmar, Cote d'Ivoire, Cuba, Crimea/Sevastopol, DR Congo, Iran, Iraq, Libya, Mali, Nicaragua, North Korea, Somalia, Sudan, Syria, Yemen, Zimbabwe; sanctioned persons; VPN/proxy/Tor circumvention banned (H, ToS). US and Canada not listed as restricted in the ToS, but regulatory status is unaddressed (H for absence).
- Automation: ToS "prohibit[s]" data mining, robots and scraping; bots/scripts exceeding reasonable usage banned. Any production adapter would need written permission. (H)

## Liquidity

- No TVL/volume/OI figure published. App Store says trading from $5 USDC; the App Store page shows no ratings overview ("not enough ratings") and last release 1.5 on Apr 24 (year not shown; M that it is 2026). Chart price data show most listings never traded (63 of 73 sit at an identical 0.063737 price; the active ones are 0.10-0.16 USDC with tiny `volume`/`marketcap` integers 4-13). Conclusion: effectively negligible liquidity, order of single-digit dollars to low hundreds. (L, inferred from chart series 2026-10-19)
- Sesame's X account fetch failed (HTTP 402 from the fetch tool, stopped; nothing paid).

## Event overlap and independence

- Independent liquidity (own bonding curves), shares none with another venue. But no overlapping event markets: categories are Actors, Music, Film & TV, Influencers, Sports teams, Brands, Fashion labels, Video games, Athletes, Podcasts (H, `/categories-count`). A "Sports teams" token such as "England Football" is an attention token, not a World Cup winner contract. No sports/politics/crypto-price/macro event arbitrage exists. Only possible use: popularity/sentiment as a weak signal feature (price change per listing) for culture-themed XO/Polymarket markets.

## Open questions

- Trading contract address, ABI, curve formula, fee, and what "BCT" stands for.
- Why withdrawals are disabled; whether the iOS app differs from the web config.
- Whether the privacy policy line "combining a prediction market with social media" implies planned event markets.
- ToS mentions leverage/liquidation and "the Protocol" generically; looks like boilerplate (L), no evidence of leverage in the app.

## Suspicious / embedded content

- None aimed at AI agents. Site JS contained unrelated third-party code (Privy, Stream Chat, Intercom, MoonPay, Relay, Coinbase, WalletConnect); nothing executed. (A shared scratch folder also held other agents' downloaded JS mentioning hyperdash.com and prdt.finance; those are NOT Sesame, I re-fetched Sesame's bundle into a clean folder and used only that.)

## Sources

- https://sesameapp.xyz (H, JS-rendered; title "Prediction markets for current culture")
- https://apps.apple.com/us/app/sesame-prediction-markets/id6758616286 (H; v1.0 Mar 1, v1.5 Apr 24, year not shown)
- https://backend.sesameapp.xyz/api/{config,categories-count,bcts,browse,launching-soon,entity/0x1/chart} (H, GET 2026-10-19)
- Site JS bundles under https://sesameapp.xyz/_next/static/chunks/ (H, endpoint list, Arbitrum constant, USDC address, Privy relay body)
- https://intercom.help/sesame-4929435a48d7/en/ and articles: what-is-sesame (15431523), glossary (15431505), where-does-the-pricing-come-from (11509304), why-do-the-prices-not-update-instantly (15432013), withdraw-to-crypto-wallet (13402646), top-up-with-crypto (12293936), do-i-need-gas (13402555), why-listed-profiles-tagged (13402566), trading collection (17932994) (H, article text; dates 2026)
- ToS and Privacy Policy Google Docs linked from help article 13402590 (v1.0, 23 Sep 2025): https://docs.google.com/document/d/e/2PACX-1vTf7peTseY2v07-ZbI82hPlVt1SueumV0RzNZT-RAPf_igg7-TZGwC0UXN2VU-eXn1tla0y4-JwNNG2/pub (ToS), https://docs.google.com/document/d/e/2PACX-1vS-BqLRtpL8-_NSYSkzeiY_NHpArGf7CGSRfJSAP-e1lXqUe27_mwQ-CGkxk9RyQG1qGW9FkXg_5k4q/pub (Privacy) (H; older than 6 months but the operative version)
- Not reachable: web search budget exhausted (no independent coverage found), Arbiscan 403, Blockscout Cloudflare challenge, X 402.
