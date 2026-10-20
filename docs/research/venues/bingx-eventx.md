# BingX EventX (bingx.com/eventx) - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: WebFetch of the press release and BingX pages, plain GETs of public BingX web pages and their public JS bundles (string search only, nothing executed), `gh api` reads of the public `BingX-API` repos. No account, key, wallet, signature, POST/PUT/DELETE, payment or browser automation. No PayBox tool called. No undocumented BingX endpoint was called. The shared WebSearch budget was exhausted before my first search, so there is no independent news coverage beyond the one press release (see section 12).

Tags: **H** = read first-hand in a primary source this session (URL cited); **M** = secondary source, small-model summary of a page, or inference from first-hand data; **L** = weak or stale.

Fixture: `docs/research/fixtures/bingx-eventx/frontend-endpoint-inventory.txt` (paths found in BingX's own web-app JS; not a documented API; no response samples exist because no public read API exists).

---

## 0. Verdict

**adapter_priority = skip.** Confidence: medium-high.

1. It is a **centralized, KYC'd exchange product** inside BingX's Futures menu (H, nav). Positions live in a BingX account. There is no chain, token or wallet signature in any source I could read, so a PayBox EVM/Solana wallet cannot trade it except by depositing crypto to a BingX deposit address and then trading via an account API that does not exist for EventX (section 5).
2. **No official API.** The official BingX API docs (spot, swap/perpetual, coin-M swap, standard contract, copy trading, wallets, sub-accounts, agent, fund) have no event/prediction section (H, section 4). The only machine interface is the website's private `/event-access-api/v1/*` backend, which is undocumented and not for third-party use (M/L).
3. **Liquidity source and size are not stated** anywhere I could read (NOT FOUND). Whether the books are BingX-internal, market-maker-seeded or mirrored from another venue (Polymarket etc.) is unknown, so independence for arbitrage cannot be asserted.
4. **Watch trigger:** re-check if (a) an EventX or "event contract" section appears in `https://bingx-api.github.io/docs-v3/` or the `BingX-API/docs-v3` repo, (b) BingX publishes a rules/settlement-source article, (c) a third party (e.g. an aggregator) starts listing BingX EventX markets. Only then does an adapter make sense, and even then it would be a signal feed at best (P2).

---

## 1. Is it still live? (2026)

| Evidence | Date | Tag |
|---|---|---|
| Press release "BingX Launches EventX, Turning Real-World Events into Tradable Assets" (Chainwire). https://chainwire.org/2026/05/12/bingx-launches-eventx-turning-real-world-events-into-tradable-assets/ | 2026-05-12 | H (that it says this); M (as to truth) |
| `https://bingx.com/en/eventx` returns HTTP 200; page is the server-rendered shell of a live Nuxt app with `eventx-page-root`, "EventX" in the Futures nav ("Predict and trade hot events in one stop"), a footer "(c) 2018-2026", and a platform-config key `eventxPredictionEnable`. Build version string in the payload: `2026-08-31`. | 2026-10-19 | H |
| Routes in the live app: `/eventx`, `/eventx/portfolio`, `/eventx/world-cup-2026`, `/eventx/:contractType?/:section?`, `/eventx/event/:event?`. A World Cup 2026 landing page exists (shows "Which team will be the champion?" with stage and Group A-L filters, but "no events to display under the current filter" and a zero countdown at fetch time). | 2026-10-19 | H |
| Support-center FAQ pages for EventX terms exist at `/en/support/frequent-questions/11256997380367/` and `/11257043904527/` (referenced by the app's agreement/risk-disclaimer links), but the article bodies load client-side and I could not read them. | 2026-10-19 | H (links), NOT FOUND (bodies) |

Verdict: **still_live = true** (product is shipped and wired into the live site five months after launch). I could not confirm any traded volume or market count because the event list is fetched client-side after load (the SSR payload's `allEventList` is empty), so "live" means the product is deployed, not that I observed active books. (M)

---

## 2. Kind and market model

- **Kind (H):** `cex-product`. A prediction/event-contract section inside a centralized crypto exchange (BingX), next to its perpetual futures.
- **Outcomes (M, press release):** "built on Yes/No outcomes". The app code distinguishes events with a single market (`isSingle`) from events with several markets (`isMulti`), each market having Yes and No result icons, so multi-outcome questions look like a set of independent Yes/No markets under one event, the same pattern as Polymarket negative-risk groups (M, inferred from front-end code; not a documented schema).
- **Two contract types (M, press release; H, code):** "Classic Mode" (route `contractType = eventContractNormal`; spot-like full-collateral Yes/No) and "Leverage Mode" (up to 10x per press release; the app has a second `contract` type with `adjust-leverage`, `adjust-margin`, `get-margin-tiered`, `get-funding-rate` calls). A funding-rate call on leveraged event contracts suggests perpetual-style carry on the leveraged side, but no source states the formula (L, inference from endpoint names).
- **Venue structure (M):** order book. The web app subscribes to websocket `depth` (asks/bids with `ts`), `trade`, `quotation` and `overview` channels per market symbol and has place-order / cancel-order / batch-cancel / close-position / flash-close / reverse-position calls. That points to a CLOB-style book inside BingX, not an AMM or parimutuel pool. Prices are shown as a probability (`probabilityText`). Whether price is bounded to 0-1 USDT per share is not stated (NOT FOUND).
- **Tokenisation:** none visible. Positions are account-ledger entries (`position/get-list`, `position/get-history`), not tokens (M, inference).
- **Lifecycle states in the UI:** pending (countdown to open), open, settled (result Yes/No), voided (`isVoided`) (H, front-end code). A voided state means BingX can cancel markets; the rules for voiding are not read (NOT FOUND).
- **Demo mode:** a simulation environment exists (header `trade_event_env: simulation`, endpoint `apply-event-contract-vst` for virtual funds) (H, front-end code).

---

## 3. Chains and collateral

- **Chains: none in any source.** Custody is BingX's. (M)
- **Collateral:** NOT FOUND in a readable source. The sibling BingX derivatives are USDT/USDC margined, and the EventX app transfers funds between accounts via `/event-access-api/v1/fund-transfer`, so collateral is most likely a USDT balance in a BingX sub-ledger (L, inference). Coupons (`coupon/place-order`) also exist as a promo mechanism (H, endpoint names).

---

## 4. Read API

- **Official public API: none for EventX.** The official docs hub (https://bingx-api.github.io/docs-v3/ , repo `BingX-API/docs-v3`, last pushed 2026-10-14) has no `event`, `eventx` or `prediction` string in its bundle; its `/openApi/` path families are swap, spot, copyTrading, cswap, wallets, user, account, subAccount, wealth, api, agent, fund (H, string search of the bundle and `faq.md`). The `BingX-API/api-ai-skills` repo (pushed 2026-10-13) lists skills for spot, swap, cswap, standard, copytrade, sub-account, wallet, fund, agent and announcement only; no events skill (H, repo tree).
- **Unofficial/private:** the web app calls `/event-access-api/v1/market/get-list`, `get-event-detail`, `get-sections`, `get-pinned`, `search`, `get-world-cup-matches`, `share/get-kline-data`, `config/get-fee-rate`, `config/get-funding-rate`, `config/get-margin-tiered`, `permission/get-enable`, and websocket channels `depth`, `trade`, `quotation`, `overview` (H that these strings exist in BingX's public JS; see fixture). The host, auth requirements, rate limits and response schemas were not tested or documented; I did not call them because they are not a documented public API and BingX terms for automation are unread. Treat as `unofficial-only`.
- **Rate limits / WebSocket (documented):** only for other BingX products; none for EventX. NOT FOUND (searched: docs-v3 bundle, api-ai-skills, press release, EventX page).
- **Resolution data:** the UI shows settled result Yes/No and voided state; no API or doc for the resolution source (NOT FOUND).

---

## 5. Trade path and PayBox reachability

- **Programmatic orders:** none documented. The private `trade/place-order` endpoint is the web app's session-authenticated path (H, endpoint name; M, auth not verified). BingX's official API keys (HMAC, spot/swap) are not documented to cover EventX (NOT FOUND).
- **Signing scheme:** none on-chain. Web login + KYC session.
- **PayBox:** `paybox_reachable = no`. A PayBox wallet could only fund a BingX account by an ordinary token transfer to a BingX deposit address (a transfer, not an order), after which trading is by BingX session. No EVM/Solana transaction proposal or signed order can open or close an EventX position. (M)

---

## 6. Fees

- Press release: zero fees for a limited time, then "competitive fees" and integrated VIP tiers (M, single secondary-ish source; promo end date NOT FOUND).
- A fee-rate endpoint (`config/get-fee-rate`) and a VIP tier model exist in the app; formulas, maker/taker split and who pays are NOT FOUND. The general fees page is https://bingx.com/en/support/costs (not read in detail).
- Leverage mode likely carries funding and liquidation costs (L, inferred from endpoint names).

---

## 7. Resolution mechanism and dispute risk

NOT FOUND. The press release does not state a settlement source, oracle or dispute process (H, absence in the fetched release). The EventX agreement and risk-disclosure articles are linked from the app but their text did not render in my fetches. Because BingX is the operator and counterparty-of-record, resolution is presumably at BingX's discretion with a voiding right (the UI has a `voided` state) (L, inference). For an arbitrage scanner this is an unquantifiable resolution-mismatch risk versus on-chain venues with a public oracle.

---

## 8. Geo / ToS / automation

- Press release: "access is limited to certain compliant locations"; availability varies by region (M).
- The site payload contains a `restrictions` / `platformRestrictionState` mechanism and a `blackLocaleList` (H that the keys exist; values not interpreted). The permission check `permission/get-enable?permission_type=prediction_enable` suggests per-user gating (L).
- KYC is required for most BingX features (M, general knowledge; not verified for EventX).
- Automation rules for EventX: NOT FOUND. Do not use the private frontend API without reading BingX's Terms of Use and API terms.
- robots.txt (fetched) only disallows some tracking-parameter URLs for search-engine bots (H); this is not a statement on API use.

---

## 9. Liquidity

NOT FOUND (searched: press release, EventX page, docs-v3, BingX FAQ). No volume, open interest, TVL or market-count figure was published in anything I could read. The home list is sorted by `24h_amount` (H, store default), so volume is shown to logged-in or client-side viewers, but I did not scrape it. Treat as unknown, likely thin relative to Polymarket/Kalshi given it is a 5-month-old add-on to a crypto exchange (L).

---

## 10. Event overlap (where arbitrage could exist)

Categories per press release: politics, sports, entertainment, economics, crypto, "more" (M). A FIFA World Cup 2026 landing page exists (H), which overlaps heavily with Polymarket, Kalshi and Limitless sports markets. Crypto price questions would overlap with Polymarket/Kalshi/Predict.fun crypto-price brackets. Without an API there is no market list to match against.

**Shared liquidity:** unknown. The press release does not say whether markets are mirrored from, or hedged on, another venue (NOT FOUND). Until proven otherwise assume BingX prices could be derived from a reference venue and so are not an independent leg (L).

---

## 11. Integration notes (if ever pursued)

- Do not build against `/event-access-api/v1/*`: private, undocumented, likely to change without notice, and ToS-unknown.
- If BingX later documents an events section, expect HMAC-signed REST under the same style as `/openApi/...` and a websocket for depth/trades, with the same Singapore-region hosting stated in the BingX FAQ (H for the hosting statement: AWS ap-southeast-1, `BingX-API/docs-v3` faq.md).
- Even then, execution would require a KYC'd BingX account; PayBox plugin is not a fit. At most a read-only signal adapter.

---

## 12. Not found / gaps

- Settlement source, oracle, dispute and void rules (articles `11256997380367`, `11257043904527` unreadable; client-rendered).
- Fee formulas, collateral asset, price tick and range, leverage mechanics (liquidation, funding), position limits.
- Any volume/OI/market count.
- Any independent news after the 2026-05-12 launch release (WebSearch budget exhausted; no search-engine workaround was attempted).
- Whether any BingX API key permission covers EventX.

---

## Sources

- https://chainwire.org/2026/05/12/bingx-launches-eventx-turning-real-world-events-into-tradable-assets/ - H (2026-05-12; product claims, modes, categories, region limit, zero-fee promo)
- https://bingx.com/en/eventx - H (live page shell, routes, nav text, store/config keys; 2026-10-19)
- https://bingx.com/en/eventx/world-cup-2026 - H (landing page shell; 2026-10-19)
- https://bingx.com/en/support/frequent-questions/11256997380367/ and .../11257043904527/ - H (links exist; bodies not readable)
- https://bin.bb-os.com/base_nuxt/*.js (BingX web-app bundles referenced by the EventX page) - H for string literals only (endpoint paths, state names); M for any inference from them
- https://bingx-api.github.io/docs-v3/ and https://github.com/BingX-API/docs-v3 (pushed 2026-10-14) - H (no event section)
- https://github.com/BingX-API/api-ai-skills (pushed 2026-10-13) - H (no events skill)
- https://bingx.com/robots.txt - H
