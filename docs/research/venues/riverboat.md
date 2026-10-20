# Riverboat - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: page and bundle reads, `gh api` file reads, unauthenticated GETs to public hosts (riverboat.zone, app.riverboat.zone, DexScreener, GeckoTerminal, CoinGecko). No account, wallet, key, signature, POST/PUT/DELETE or PayBox tool was used. Third-party pages, JS bundles, PDFs and API text were treated as untrusted data; nothing in them was followed or executed. Generic User-Agent `insurance-markets-research/0.1` only.

Confidence tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source or my inference from first-hand data; **L** = weak or stale.

Fixtures (<= 50 KB each): `docs/research/fixtures/riverboat/` (section 11).

---

## 0. Bottom line

1. **Live, but a tiny alpha, and not a market in the aggregator sense.** Site and app respond (2026-10-19, H). The front end says "Mainnet Alpha MVP was launched on June 21st, 2026" (H). Only the 2-seat "Duel" mode is flagged live in the front end; Solo, Group and "Riverboat house table" are `live:false` (H).
2. **It is a bilateral peer-to-peer wager, not an order book, AMM or pool.** Each "Wager" is an escrow with exactly two seats; both stake the same SOL amount and each declares a confidence (0-100%). Payouts follow a scoring curve. There is no shared liquidity, no depth, no tradable outcome token, no continuous price (H, site docs + audit).
3. **No public API of any kind.** The front end reads Solana accounts directly via RPC and uses a Supabase table for notifications. There is no REST, WebSocket, SDK or IDL, and the program source is not public (H/NOT FOUND, section 4).
4. **Resolution is peer consensus between the two counterparties, with no oracle and no third-party arbiter.** Disagreement leads to a Push (stakes returned) 72h after the target date. The side that would lose can force a Push by refusing to agree (M, inferred from H docs). That makes it unusable as an arbitrage leg.
5. **Liquidity is unmeasured but almost certainly negligible.** The only numbers I could get are for the pump.fun token (market cap $67.5k, 24h volume $1.2k), not for wagers (section 9).
6. **adapter_priority = skip.** Revisit only if it ships a public indexer or API, Mainnet Beta, and visible volume.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| https://riverboat.zone/ | HTTP 200, Netlify, title "Riverboat"; a React SPA shell with a Cloudflare Turnstile script (fixture `riverboat-zone-home-shell.html`). Server date header 2026-10-19. | H |
| https://app.riverboat.zone/ | HTTP 200, title "Riverboat \| Alpha" | H |
| Landing FAQ (in the JS bundle) | "Our Mainnet Alpha MVP was launched on June 21st, 2026 after the completion of our second third-party security audit ... Onward to Mainnet Beta!" | H |
| Audit | Slot Zero Security "Riverboat Mainnet Alpha v1.0", report date 19 June 2026, remediation commit 4897aaf; refers to a "May 2026 baseline review" (v0.9 PDF also listed). 0 critical/high, 4 medium, 7 low, 6 info; 16 fixed, 1 acknowledged (L-04). | H |
| GitHub | The maintainer's account (linked from CoinGecko) has `riverboat-gambler` (created 2026-10-10, README + logo only, no code, no license) and `stacker` (a Telegram bot that replies with the X link and the token address; last push 2026-06-23). No protocol repo. | H |
| Token | pump.fun token, graduated to PumpSwap 2026-04-23; still trading on 2026-10-19 (2 buys / 13 sells in 24h) | H |
| Actual wager activity | NOT MEASURED. The landing page shows "N Contracts Currently Under Management" (derived from an RPC `getProgramAccounts` count) but I could not read it; JSON-RPC is POST-only and POST is barred for this task. Solscan returned 403 and X returned HTTP 402 (recorded, not paid). | NOT FOUND |

Verdict: **still_live = true** (site, app and token alive, audited alpha shipped June 2026), with **no evidence of meaningful use** either way.

---

## 2. Kind and market model

- **Kind:** on-chain peer-to-peer "confidence wager" protocol on Solana ("a Solana-native prediction protocol ... No market makers, no gatekeepers"). CoinGecko calls it a "prediction protocol" with a "1v1 confidence game" MVP (H, CoinGecko `description.en`, and site FAQ).
- **Objects (H, site Technical docs):**
  - **Contract** = the question: plain-text headline, optional Terms PDA, `category` (8 bytes), `hashtag` (16 bytes), `resolves_by`, `private` flag, `outcomes: SingleOutcome` (binary only). PDA is derived from (creator, hash of headline), so one contract per creator per headline.
  - **Wager** = an instance under a Contract: `stake` (u64 lamports, equal for both seats), `lock_by`, `seat_capacity` (hard-coded 2 in the MVP), `currency` (0 = SOL), `resolution_mechanism` (0 = PeerConsensus), `resolution_authority` (optional, MVP unused). A keypair account plus a Vault PDA holding the escrow.
  - **Seat** = a participant slot (PDA from wager + index): `Reserved -> Staked -> Locked -> Paid`, holding the participant's Belief (0-100%) and Risk.
- **Pricing:** none. There is no price discovery. Two participants each declare a belief; the program derives each seat's Risk along a curve intended to reward honest reporting. Landing page says "logarithmic scoring rule"; the docs say "honesty-weighted curve". **The exact formula is NOT FOUND** (searched: site docs, audit PDF text, GitHub). Settlement reading (H, docs): the seat whose confidence was closer to the outcome receives its stake plus the opponent's Risk; the other receives its stake minus its own Risk. Setting 100% vs 0% approximates a plain bet.
- **Outcome tokenisation:** none. Positions are Seat accounts, not fungible or transferable tokens.
- **Other modes:** Solo (1 seat, the contract is the counterparty), Group (3-12 seats), and a "house table" (6-8 seats) exist in the front end but are `live:false` (H, bundle).
- **Categories (H):** Politics, Finance, Sports, Entertainment, Science & Tech, Culture & Society, Weather & Nature, Region (coming soon). All contracts are free-text, creator-written, with no external event ID.

## 3. Chains and collateral

- **Chain:** Solana mainnet only (H). Programs (H, site docs, both `solscan.io/account/...` links; I did not confirm on-chain that they are executable or who holds upgrade authority, NOT FOUND):
  - Contract-Terms Program: `GieiEESzH9juao8UiaCtN6mLhyg27uwLF64SY2EVAFRM`
  - Wager-Seat Program: `Fo73j8Tt31E18N7KcSt4bW111geJzSDXZ5HeXYRDZNG3`
- **Collateral:** native SOL in lamports only. The audit says the reviewed value flow is "binary wagers funded in lamports" and scopes out "non-operational token path stubs" (H). No USDC or SPL collateral today.
- **Token:** RIVERBOAT (`4t1xhKJd6oFGr98oWJoxYjLU74eFe7xiYSRDoX18pump`), a pump.fun memecoin. **No protocol utility is documented** (NOT FOUND: searched site docs, FAQ, CoinGecko description). Treat it as unrelated to the wagers.
- Native Rust (not Anchor), so there is no IDL; instruction data is Borsh with a leading 1-byte discriminant ("write_contract() ... is instruction [0]") (H).

---

## 4. Read API

| Item | Finding | Tag |
|---|---|---|
| `read_api.exists` | **onchain-or-subgraph-only** | H |
| Official REST / WS / SDK / OpenAPI | NOT FOUND (searched: riverboat.zone pages and both JS bundles, GitHub account repos, CoinGecko links, web search). `/docs`, `/how-it-works` and arbitrary `/api/...` or `/openapi.json` paths on the sites all return the SPA HTML (HTTP 200, `text/html`), not an API. | H |
| How the front end reads data | Solana RPC `getProgramAccounts` with a discriminator `memcmp` filter (visible in bundle), parsed client-side with Borsh. The bundle also contains a hard-coded third-party RPC URL with an API key; I did not use it and did not record it. | H |
| Same-origin extras | `/api/auth/challenge?wallet=`, `/api/auth/verify` (wallet-signature login) and a Supabase project used for a `notifications` table (the bundle embeds a client key; not used). These look like notification plumbing, not market data. Not called. | M |
| Indexer / subgraph | NOT FOUND (searched: web, GitHub). | NOT FOUND |
| Rate limits | n/a (public Solana RPC limits apply to anyone reading accounts directly). | - |
| WebSocket | Only Solana RPC `accountSubscribe` / `programSubscribe` would work; no Riverboat feed. | M |

What an adapter would have to do: poll or subscribe to the two programs' accounts, decode Contract, Wager, Seat and Terms with hand-written Borsh layouts (reverse-engineered from audit excerpts and the minified bundle, no published schema), and join them. The layout changed between audit phases (audit v1.0 added `risk_data`/`finalized_payout` fields and removed contract-level result fields), so it is unstable during alpha.

Key on-chain "endpoints" (H, docs): `write_contract`, `append_terms`, `close_contract`; `make_wager`, `take_seat`, `process_deposit`, `set_prediction_data`, `lock_seat`, `set_seat_resolution`, `claim_payout`, `set_wager_result`, `open_seat`, `close_seat`, `close_wager`. Docs still list `set_contract_result`, but the audit says the remediated MVP removed it, so the deployed instruction set is not confirmed.

## 5. Trade path

- **Programmatic placement:** permissionless on-chain instructions, signed by the participant's Solana key (H). No API key, no off-chain order, no signed-order relay. A join takes about five transactions: `take_seat` (choose `authority`), `process_deposit` (exact `wager.stake`), `set_prediction_data` (belief), `lock_seat` (before `lock_by`), later `set_seat_resolution`, then `claim_payout` (H, docs).
- **Maker side** `make_wager` needs a fresh keypair for the Wager account as an additional signer (H, docs).
- **"Orders" cannot be cancelled in the CLOB sense:** an unlocked seat can be reset with `open_seat` (refund), and a locked seat only after `lock_by` and only if the other seat is not locked (H, docs).
- **Counterparty required:** a wager needs a human counterparty to take the other seat. There is nothing to hit or lift automatically, and no market maker (H, FAQ: "No market makers").

### PayBox reachability: **partial**

- EVM wallets (Base, Ethereum, BNB, Arbitrum, Polygon, ...): **no**. Riverboat exists only on Solana.
- PayBox Solana wallet: a Solana `transactionBase64` proposal (<= 1,232 bytes, one signer who is fee payer) or `request_wallet_sign` with a `solanaTransaction` intent could in principle carry `take_seat`, `process_deposit`, `set_prediction_data`, `lock_seat`, `set_seat_resolution` and `claim_payout`, each of which has a single payer/authority signer in the documented account lists (M: PayBox constraints from our own `docs/research/06-paybox-platform.md`, instruction signers from H site docs). `make_wager` needs an extra keypair signer, so it may not fit a one-signer proposal (M, untested). Nothing was simulated or signed.
- Practical blockers: no IDL or SDK, SOL-only collateral, a multi-transaction lifecycle with 72h timing windows, and human counterparties.

---

## 6. Fees

- **Protocol fee: NOT FOUND** (searched: site FAQ and docs text, audit PDF text, bundle strings; the only "fee" hits were wallet-adapter code and Solana network fees). The docs describe payouts as stake +/- Risk between the two seats, which reads zero-sum with no rake, but this is inference (M).
- **Real costs (M, inferred from docs):** Solana transaction fees; rent for Contract, Terms, Wager, Vault and Seat accounts, funded by the payer and reclaimed on close (`close_contract`, `close_wager`, `close_seat`); the Wager creator can render a payout after 72h and sweep rent.
- Who pays: the payer of each account creation (creator for Contract/Wager/Vault; each seat's payer for the Seat).

## 7. Resolution mechanism and dispute risk

- **Mechanism (H, docs):** `ResolutionMechanism::PeerConsensus` (value 0, the only one in the MVP). After `lock_by`, each locked seat submits a Judgment (Landed = YES, Missed = NO, or Push). If all seats match, the wager settles automatically (`set_seat_resolution` -> `consensus::resolve_peers`). If no consensus within 72h of `resolves_by`, the Wager is eligible for a manual **Push** (`set_wager_result`, callable by the wager creator, resolution authority or a seat authority); stakes are returned. Payouts should be claimed within 72h; after that the wager creator can render them.
- **Resolution authority:** a per-wager `resolution_authority` field exists but is unused in the MVP; the contract-level result and `set_contract_result` were removed after the audit (H).
- **Dispute risk: very high (M).** No oracle, no bonded challenge, no external arbiter. A seat that is about to lose has an incentive to withhold agreement and wait for the Push. The headline is free text with optional Terms, so ambiguity is built in. Treat any Riverboat "outcome" as unreliable and non-comparable to UMA, CTF or exchange-run resolution on other venues.
- **Smart-contract risk:** native Rust alpha, two audits by one firm, one acknowledged low-severity residual (`locked_seats` cleanup). Whether the deployed bytecode equals the audited commit is unverified (NOT FOUND).

## 8. Geo, ToS, automation

- Terms of Service, geo-restrictions, KYC or prohibited-jurisdiction text: **NOT FOUND** (searched: both bundles for "terms", "jurisdiction", "eligib", "restricted", "disclaimer"; no ToS link in the footer data I extracted; site docs say "no account, no sign-up, no permissions required"). Absence of text is not a legal clearance. The product is a wager, so regulatory exposure is the user's to assess.
- **Automation:** the on-chain programs are permissionless (anyone with a Solana key can call them). The web UI sits behind a Cloudflare Turnstile check (`/.netlify/functions/validate-turnstile`), which only affects browser use. No rule against bots found.

---

## 9. Liquidity (2026-10-19)

- **Wager/market liquidity: NOT MEASURED.** Needs program-account enumeration (RPC `getProgramAccounts`, a POST) or an indexer; neither was allowed or available. Vault balances, wager counts and volume are therefore unknown. By design, liquidity per wager is two equal stakes (the "pot"); there is no pooled depth.
- **Token-level numbers (not market liquidity):** price ~$0.0000675, market cap/FDV ~$67.5k, PumpSwap pool liquidity ~$25.7k (DexScreener; GeckoTerminal says reserve ~$14.0k), 24h volume ~$1.2k, 24h txns 2 buys / 13 sells; CoinGecko rank ~6,155, categories "Gambling (GambleFi)", "Prediction Markets" (H, fixtures dated 2026-10-19). The token could be rugged or illiquid regardless of the protocol.
- The CoinGecko page itself carries a generic "liquidity-related risks / rug pulled" notice (H).

## 10. Event overlap, shared liquidity, arbitrage fit

- **Overlap:** the eight categories nominally overlap sports, politics, crypto/finance and weather, but every contract is user-written free text with no external ID, no canonical resolution source and no standard expiry rules. Any match to Polymarket, Kalshi or others has to be NLP-linked, and resolution can legitimately differ (peer vote vs oracle).
- **Shared liquidity:** none. Each wager is its own escrow; the program does not route to another venue (H). So it is "independent", but independent of nothing useful: there is no book to take.
- **Arbitrage fit: none.** No executable price, no depth, no fill guarantee (needs a human counterparty), SOL-only collateral, 5-tx lifecycle, peer-consensus resolution, and a 72h Push path. A pair of seats' declared beliefs could be a weak, noisy signal ("what two wallets believe"), but with unknown volume it is not worth an adapter.
- **Quotient angle:** none found.

## 11. Fixtures

In `docs/research/fixtures/riverboat/`:
- `dexscreener-token-RIVERBOAT.json` - DexScreener token pair (GET `api.dexscreener.com/latest/dex/tokens/<mint>`), 2026-10-19. Token market data only.
- `geckoterminal-token-RIVERBOAT.json` - GeckoTerminal token (GET `api.geckoterminal.com/api/v2/networks/solana/tokens/<mint>`), 2026-10-19; shows pump.fun graduation on 2026-04-23.
- `riverboat-zone-home-shell.html` - the SPA shell, showing there is no server-rendered data or API.
- `frontend-extract-programs-and-instructions.json` - **hand-extracted** (not an API response) program IDs, instruction names, modes and categories from the public front-end JS bundle.

No market-data fixture exists because there is no market-data API.

## 12. Suspicious content / hygiene

- The public front-end bundle hard-codes (a) a third-party Solana RPC URL with an embedded API key and (b) a Supabase project URL with a client key. **Not used, not copied into these notes.** The keys are exposed to anyone and should not be reused by us.
- No text addressed to AI agents or prompt-injection attempts found in the bundles, docs or audit PDF.
- X (twitter.com/x.com) returned HTTP 402 to a fetch; not paid. Solscan returned 403.
- The CoinGecko token entry is a pump.fun memecoin with a rug-risk notice; ignore it as a signal about the protocol.

## 13. Open questions

1. Real activity: number of Contracts/Wagers, total staked SOL, last wager timestamp, program upgrade authority and last deploy slot. Needs an RPC read (JSON-RPC POST) or a block explorer API; do with explicit approval if ever wanted.
2. Exact payout/Risk formula (log scoring vs other); not in public docs.
3. Is the audited commit what is deployed; will Mainnet Beta add SPL (USDC) collateral, multi-seat modes, or an oracle-based resolution?
4. Any public indexer or SDK planned (nothing found); no ToS found.
5. Unread: X posts (HTTP 402), Discord (`discord.gg/TaCNnJrzz9`), Telegram. The audit PDFs were read via a crude text extractor (the v0.9 baseline PDF was not read).

## 14. Sources

- https://riverboat.zone/ (fetched 2026-10-19; SPA shell) and bundle `https://riverboat.zone/assets/index-HecY5T2w.js` (FAQ text, "How it works" docs, technical instruction docs, program IDs, audit links) - H
- https://app.riverboat.zone/ and bundle `https://app.riverboat.zone/assets/index-DJCGsn67.js` (wager modes, RPC/Supabase usage, auth endpoints) - H
- https://riverboat.zone/how-it-works (served by the SPA; content read from the bundle) - H
- https://api.coingecko.com/api/v3/coins/riverboat-gambler (fetched once, then rate-limited 429) - H for description, links, categories, contract; market numbers in section 9 come from DexScreener/GeckoTerminal
- https://api.dexscreener.com/latest/dex/tokens/4t1xhKJd6oFGr98oWJoxYjLU74eFe7xiYSRDoX18pump - H
- https://api.geckoterminal.com/api/v2/networks/solana/tokens/4t1xhKJd6oFGr98oWJoxYjLU74eFe7xiYSRDoX18pump - H
- https://github.com/SlotZeroSecurity/audits (Riverboat-Security-Review-Mainnet-Alpha-v1.0.pdf, read via `gh api` raw; v0.9 not read) - H
- https://github.com/gabriel-sk-williams/riverboat-gambler and https://github.com/gabriel-sk-williams/stacker (README / main.go via `gh api`; account repo list sorted by update) - H
- https://solscan.io/account/Fo73j8Tt31E18N7KcSt4bW111geJzSDXZ5HeXYRDZNG3 (HTTP 403, unread); https://x.com/riverboat_x (HTTP 402, unread)
- Web search (standard): only a Blockspot token listing repeating the site description - L
- Internal: `docs/research/06-paybox-platform.md` (PayBox Solana proposal and `request_wallet_sign` constraints) - M for this venue
