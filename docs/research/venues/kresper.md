# Kresper (kresper.com) - venue spec

Researched 2026-10-19. Confidence tags: H = read first-hand in a primary source this session, M = secondary/inferred, L = weak/stale.

## Verdict

Adapter priority: **skip** (revisit only if it publishes an API). Reasons: EUR fiat, no crypto rails, no documented public API, appears to be at waitlist/early stage, Swedish-resident onboarding (BankID, Swish), European-macro niche markets with little overlap with crypto-venue liquidity. A PayBox EVM/Solana wallet cannot trade it.

## Is it live?

- Site https://kresper.com/ returns HTTP 200 (2026-10-19) and is a React single-page app. [H] (curl)
- sitemap.xml lists only `/` and `/markets`, lastmod 2026-08-24. [H] https://kresper.com/sitemap.xml
- robots.txt disallows `/admin /portfolio /profile /onboarding /suggestions /waitlist-success`. [H] https://kresper.com/robots.txt
- Live-ish but waitlist-gated: site bundle has a prominent "JOIN WAITLIST" / "LOG IN" CTA, `/waitlist` route, and an `onboarding_flows` table (welcome, BankID identity verification, AML check, suitability quiz, mock trading tutorial, terms acceptance). The bundle also contains a "Play Money" vs "Real Money" per-user `trading_setup` toggle and the default SEO text "Trade on prediction markets with virtual currency". So it is unclear whether real-money trading is open to the public. [H for the code strings; M for the inference] https://kresper.com/assets/index-DzNJ6Hb7.js
- GitHub org `Kresper` created 2026-01-03, location Sweden, 0 public repos, bio "Europe's first regulated prediction market". [H] `gh api users/Kresper`
- Bundle links Swedish press (not fetched; WebFetch blocked or 403): Svenska Dagbladet "Kresper och Lyd Markets lanserar prediktionsmarknader i Sverige", Dagens Industri/finansmarknaden "Klarnaveteran startar svensk Polymarket", Sveriges Radio "Kontroversiell form av bettingsajt pa gang i Sverige". [H that the links exist in the bundle; contents NOT read]
- X: @trade_kresper; LinkedIn company page linked. [H]

## Kind and market model

- Kind: centralised, fiat (EUR) regulated-exchange claim; no blockchain. [H] site copy: "Settled in euros", "EUR in, EUR out ... no offshore wallets, no crypto rails".
- Binary YES/NO contracts priced 1c-99c, pay 100c if correct, 0c if wrong. Sell any time before resolution. [H] landing copy in bundle.
- Order book: "Peer-to-peer matching. Every trade is against another participant, never the house. Limit orders, price improvement." Bundle has `liquidity_type === "CLOB"` and an `get_order_book` RPC, and also an LMSR code path (an AMM-style fallback; markets may have either `liquidity_type`). [H code strings; M on which markets use which]
- Grouped markets exist (`type: "group"` with `options[]` each having yes_price), i.e. categorical built from binaries. [H code; M interpretation]
- "Positions are pre-funded: maximum loss is reserved when the order is placed." Fully collateralised. [H]
- Outcome tokenisation: none (database ledger rows: `ledger`, `positions`, `trades`, `orders` tables; EUR currency code; also SEK display support). [H code strings]

## Chains and collateral

- None on-chain. Collateral is EUR held on the operator's ledger. Deposit methods in bundle: Swish, BankGiro, open banking. [H code strings] No stablecoin/USDC string anywhere in the bundle (searched for USDC, MiCA). [H]

## Read API

- Official public API: NOT FOUND (searched: homepage, sitemap, robots, bundle URL strings, probes of /api, /terms, docs.kresper.com and api.kresper.com; the SPA returns its HTML shell with 200 for any path, docs./api. subdomains do not resolve; WebSearch was unavailable because the session search budget was exhausted).
- Backend is a Supabase project (host named in the bundle: `xebcpqskhgzmmpzflint.supabase.co`, with edge functions `clear-positions` and `reconcile-balances`). The web app talks to it with a client anon key via PostgREST/RPC (`get_order_book` RPC with `market_id_param`) and Realtime channel on `orders`. [H code strings] This is an undocumented internal backend, protected by row-level security we cannot assess; I deliberately did NOT use the embedded client key or call it. Treat as unofficial-only and not a basis for an adapter without the operator's permission.
- Fixtures: none saved (no documented public API to sample).

## Trade path

- None programmatic. Onboarding requires BankID identity verification, AML check, suitability quiz and T&Cs, then EUR deposit via Swish/BankGiro/open banking. [H code strings] No API keys, no signed orders documented. PayBox wallet reachable: **no**.

## Fees

NOT FOUND (searched: bundle for fee/commission/trading_fee; landing copy; terms stub). The only "Terms of Service" text in the bundle is a generic stub. [H]

## Resolution

- "Every market resolves on published official data - never on our say-so"; expired markets halt "until the oracle resolves it". Named sources: SCB, Eurostat (inflation); Nord Pool (electricity prices); Riksbank, ECB, EMMI (rates/fixings); Valmyndigheten (elections); Nasdaq, ECB (indices, FX, crypto); SMHI (climate). [H landing copy]
- Dispute process: NOT FOUND. Admin pages `/admin/clearing`, `/admin/reconciliation` exist (centralised clearing). [H route names]

## Regulation / geo / ToS / automation

- Claims: "Europe's first regulated prediction market" (GitHub bio, in-app copy) and "regulatory plumbing ... required for anyone trading on a regulated venue in the EU". No regulator, licence number, or legal entity name found on site or bundle (no "Finansinspektionen", "MiFID", "licence" strings besides library licences). Press hints at a partner "Lyd Markets" (title of SvD article only). [H that no licence is named; L on regulation claim itself]
- Residency/KYC: BankID implies Swedish (Nordic) users at launch. [M]
- Automation rules: NOT FOUND.

## Liquidity

NOT FOUND (no public volume/OI numbers; no API). Order-book empty-state strings ("Nobody has open bids or asks ... Place a limit order to seed the book") suggest thin books on some markets. [M]

## Event overlap with other venues

Mostly European macro/energy/climate (Swedish and Eurozone CPI, Nord Pool prices, Riksbank/ECB rates, Swedish elections, SMHI temperatures) - little overlap with Polymarket/Kalshi/crypto venues. Possible weak overlap: ECB/Fed-style rate decisions, index levels, crypto prices ("Markets" category), where it could serve as a signal. [H categories; M overlap]

## Shared liquidity

Independent, own order book (peer-to-peer, EUR). [H copy] Not an on-chain leg, so cross-venue arbitrage with crypto venues is operationally impractical (EUR fiat rails, KYC per person).

## Open questions

- Real-money launch date and licence/regulator identity (press articles not retrievable here).
- Whether an official API is planned.

## Suspicious content

None found; no AI-directed instructions seen in the pages or bundle.

## Sources

- https://kresper.com/ (HTML head, robots.txt, sitemap.xml) [H]
- https://kresper.com/assets/index-DzNJ6Hb7.js (site bundle, read as text only, not executed) [H]
- https://github.com/Kresper (org profile via gh api users/Kresper) [H]
- Press links found in bundle but not readable: svd.se, finansmarknaden.di.se (WebFetch blocked), sverigesradio.se (403) [not read]
