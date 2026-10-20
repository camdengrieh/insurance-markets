# DexWin (dexwin.bet) - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: page and header reads, unauthenticated GETs to public site hosts, no account, wallet, key, signature, POST/PUT/DELETE or PayBox tool. All third-party text was treated as untrusted data. WebSearch was unavailable (session search budget used up), so no press or TVL cross-checks were done.

Tags: **H** = read first-hand in a primary source this session; **M** = secondary or inferred; **L** = weak or stale.

## 0. Bottom line

1. **Live (H).** Homepage served 2026-10-19; the prediction-market event sitemaps list 31,271 event URLs with lastmod 2026-10-19 04:53-04:55 UTC; terms page "last updated 24 July 2026".
2. **DexWin is not a venue. It is two white-label front ends, and neither has independent liquidity.**
   - `sportsbook.dexwin.bet` is an **Azuro Protocol** front end. Its own JSON-LD says "built on the Azuro Protocol" and the footer says "Powered by Azuro" (H). It sits on the same LP pool as bookmaker.XYZ and others (see `azuro.md`).
   - `dexwin.bet/prediction-markets` is a front end on the **AGG (agg.market)** aggregator. The site's Content-Security-Policy allows `connect-src https://api.agg.market wss://ws.agg.market`, and the page JS calls `https://api.agg.market/midpoints` with an `x-app-id` header (H). AGG in turn routes to Polymarket, Kalshi, Limitless, Predict.fun, Myriad, Hyperliquid (see `agg-agg-market-white-label-prediction-market-aggregator.md`).
3. **No DexWin API exists for us.** `api.dexwin.bet` answers `401 {"error":"token_required"}` (H); the docs site is a GitBook shell I could not read (see section 3). Anything we want is available upstream (Azuro API, AGG API, or the venues directly).
4. **adapter_priority = skip.** Duplicate liquidity on both sides, no public API of its own, ToS forbids automated access and US users, and its marketing claims are inconsistent. It is useful only as a *list entry* ("Azuro front end", "AGG front end") so the matcher does not count it as a separate leg.

## 1. Kind and market model

- Kind: sportsbook front end (Azuro) plus prediction-market router front end (AGG). Not a market maker or exchange. Terms: "The Company is explicitly not a party to any Information Contract or underlying transaction"; it describes itself as an interface to smart contracts (H, https://dexwin.bet/prediction-markets/terms Sec. 2.6, 3.4, via page summary M for the section numbers; the raw page text confirmed the API and automation clauses).
- Sportsbook side: fixed-odds against a shared Azuro LP pool; no order book, no tradable outcome token (see `azuro.md`, H there).
- Prediction side: whatever the underlying venue offers (binary Yes/No, categorical as multiple markets). Venue list on https://dexwin.bet/providers: Polymarket, Kalshi, Limitless, Predict, Myriad, Hyperliquid (H, page summary + sitemap has `/providers/{polymarket,kalshi,limitless,predict,myriad,...}`).
- Category pages: politics, sports, finance, world, crypto, geopolitics, mentions, entertainment, climate, other, health, social (H, sitemap).

## 2. Chains and collateral

| Item | Claim | Tag |
|---|---|---|
| Sportsbook | "USDT on Polygon, WETH on Base Chain" with native bridges for other tokens (homepage FAQ). The sportsbook subdomain FAQ says only "USDT via the Polygon network" and bridge/swap from SOL, ARB, ETH, BNB. | H (site text), inconsistent between pages |
| Prediction aggregator | "USDC, pUSD on Polygon", bridges for other tokens (homepage FAQ) | H |
| Wallets | MetaMask, Coinbase Wallet, TrustWallet etc.; prediction site also uses Firebase auth (CSP allows identitytoolkit/securetoken/firestore) so there are accounts besides wallets | H (CSP), M (inference about accounts) |
| Terms | names Base as primary network, Solana/Ethereum/Polygon as examples; UMA as possible oracle. The terms read as a generic template and do not name Polymarket, Kalshi or Azuro | H (raw text had no "Polymarket"/"Kalshi" hit) |

Contract addresses: NOT FOUND (searched: homepage, sportsbook HTML, terms, prediction-markets page; docs.dexwin.bet unreadable). "Audited smart contracts" is claimed, no audit report or address given (L).

## 3. Read API

- Official public API: **none found**. `https://api.dexwin.bet/` -> 401 `{"error":"token_required"}` (H, fixture). `robots.txt` on dexwin.bet disallows `/api/` and `/auth/`, and `/prediction-markets?*search=` (H, fixture).
- Docs: https://docs.dexwin.bet 307-redirects to `https://app.gitbook.com/o/juDvErP9OY6TqFRH8gE9/s/VwzaaxN4MzWisceZXOnJ/`, which serves an empty "GitBook" JS shell; `llms.txt`, `sitemap.xml` return the same shell; the GitBook content API needs a token (403). Docs content: NOT FOUND (searched: curl, WebFetch, gitbook content API). Not worth a browser (no browser automation allowed).
- Upstream APIs that carry the same data: Azuro public REST/WS (see `azuro.md`) and AGG REST/WS (needs a partner app id; see AGG note). DexWin's client JS embeds an AGG app id; I did not use it (it belongs to DexWin's partner account, not ours).
- Only public machine-readable DexWin artifacts: sitemaps. `https://media.dexwin.bet/public/active-urls/prediction-markets/sitemap.xml` -> 2 gzipped event sitemaps (20,000 + 11,271 URLs) plus expired archives. Slugs are `event/<title-slug>-<cuid>`. Useful only as a market count and freshness signal (H).
- Fixtures (`docs/research/fixtures/dexwin/`): `robots.txt`, `prediction-markets-sitemap-index.xml`, `events-0000-head.xml.txt` (first 4 KB of the decompressed sitemap), `homepage-headers.txt` (incl. CSP showing api.agg.market), `api-dexwin-bet-root-401.txt`.

## 4. Trade path

- Sportsbook: Azuro EIP-712 signed bet via Azuro's relayer, or the DexWin UI. DexWin's own gasless claim: "gasless bet placement" (H, JSON-LD). Mechanics are in `azuro.md`; nothing DexWin-specific to add. NOT FOUND: DexWin affiliate address.
- Prediction: through AGG (managed account or self-custody per AGG note). DexWin adds a "Paper trading" mode in the nav (H) and "smart order routing" marketing (see 8). No documented DexWin order API.
- Recommendation: trade the underlying venues directly. DexWin gives no price or liquidity advantage we can verify.

## 5. PayBox reachability

**partial.** An EVM wallet on Polygon could in principle use the Azuro path (EIP-712 + ERC-20 approval) or fund AGG's managed Polygon address, but both are reachable without DexWin, and DexWin's ToS bars automated access and US users. Nothing here needs a DexWin-specific plugin.

## 6. Fees

- Terms: users pay gas; "Protocol or oracle providers may charge their own fees"; DexWin "reserves the unequivocal right to institute and levy supplementary access fees"; no numbers (H, terms Sec. 4.2-4.3, summary M for numbering).
- Marketing: "smaller fee on each bet", "boosted odds", "assured monthly cashback", "guaranteed bonus", copy trading "for a small fee" (H as claims, L as facts). No fee formula published. Azuro's protocol fee split is in `azuro.md`; AGG fees are in the AGG note.

## 7. Resolution and dispute risk

Delegated to the underlying protocol (Azuro Data Provider; Polymarket UMA; Kalshi; etc.). Terms: DexWin has "no authority to verify outcomes"; liability capped at lesser of 12-month fees or US$100; disputes to arbitration in Panama after 30 + 60 day pre-process (H/M). Extra risk: Azuro had a security incident on 2026-10-06 (see `azuro.md`).

## 8. Geo, ToS, automation

- Restricted jurisdictions: sanctioned territories plus "the United States, United Kingdom, France, Ontario, Singapore, Poland, Thailand, or Taiwan"; VPN circumvention prohibited; violators may be put in close-only mode (H, terms Sec. 8.3 raw text; "close-only" from summary M).
- Automation: prohibits "Employ any automated data retrieval or indexing device, such as a robot, spider, crawler, or scraper" (H, raw text). A trading bot on DexWin would breach this; reading the public sitemap is lower risk but robots.txt disallows `/api/`.
- Marketing page claims that look unreliable (flag, do not rely): FAQ says the aggregator connects to "Polymarket, Kalshi, SX and others", fills "in under 50 ms" at a price "typically 2-4% better than any single platform"; the venue logo row shows Polymarket, Limitless, Predict, Hyperliquid, Myriad (no Kalshi, no SX); the providers page lists Kalshi but not SX. SX is not in the AGG venue list. Treat 2-4% and SX as unverified (L).

## 9. Liquidity

NOT FOUND for DexWin itself (searched: homepage, providers page, sitemaps; no volume/TVL figures; DefiLlama not checked because search was unavailable and DexWin has no own pool). Proxy: 31,271 prediction event URLs (2026-10-19, H) is a listing count, not liquidity. Underlying liquidity is Azuro (TVL about $216k on 2026-10-18 per `azuro.md`, H there) and the AGG-routed venues.

## 10. Event overlap

Prediction side: sports (many soccer exact-score / first-scorer events), politics, crypto price, finance, geopolitics, mentions, entertainment (H, sitemap slugs and categories) - i.e. everything the underlying venues list. Sportsbook: soccer, basketball, tennis, American football, baseball, esports (CS2, Dota 2, LoL), cricket, MMA etc. (H, sportsbook nav icons). Overlap exists, but only as copies of venues we already cover.

## 11. Shared liquidity

Sportsbook: **same pool as every Azuro front end** (bookmaker.XYZ, DGBet, PinWin ...). Prediction: **same books as Polymarket/Kalshi/Limitless/Predict/Myriad/Hyperliquid via AGG**. DexWin is therefore never an independent arbitrage leg.

## 12. Suspicious content

None that targeted AI agents. Only a third-party chat widget script (`chatbox.growbro.ai`) and `platform.onmeta.in` on-ramp SDK on the sportsbook page; not executed.

## 13. Open questions

- Contents of docs.dexwin.bet (needs a browser).
- Whether DexWin takes a routing fee on top of AGG's (not disclosed).
- DexWin's Azuro affiliate address and any contract addresses.
- Why homepage says WETH on Base while the sportsbook says USDT on Polygon only.

## Sources

- https://dexwin.bet/ (H, 2026-10-19; FAQ text, venue logos)
- https://sportsbook.dexwin.bet/ (H; "built on the Azuro Protocol", "Powered by Azuro")
- https://dexwin.bet/prediction-markets, /providers, /prediction-markets/terms (H, terms "last updated 24 July 2026")
- https://dexwin.bet/robots.txt, /sitemap.xml, https://media.dexwin.bet/public/active-urls/prediction-markets/* (H)
- https://dexwin.bet/_next/static/chunks/3f-1cw9pbd4t7.js (H; client JS calling api.agg.market/midpoints)
- https://api.dexwin.bet/ (H; 401)
- https://docs.dexwin.bet (redirects to a GitBook shell, content not readable)
- Internal: docs/research/venues/azuro.md, docs/research/venues/agg-agg-market-white-label-prediction-market-aggregator.md
