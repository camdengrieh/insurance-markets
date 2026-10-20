# Hyperliquid HIP-4 front-end: SendAI ("SendAI Outcome") - venue spec

Researched 2026-10-19. READ-ONLY: WebFetch of sendai.fun, unauthenticated GETs to the DefiLlama API (User-Agent `insurance-markets-research/0.1`), reading of an earlier project note on the same entity. No account, wallet, key, signature, POST/PUT/DELETE, payment or PayBox tool was used.

Tags: **H** = read first-hand in a primary source this session (URL cited); **M** = secondary, inferred, or taken from another project note; **L** = weak/stale.

Method limits: WebSearch budget was exhausted (no news search possible); defillama.com page returned HTTP 403 to WebFetch (used the JSON API instead). An earlier note, `docs/research/venues/sendai.md` (same day), covers the same entity in more depth (raw builder-fill archive, Terms, JS bundle greps); I re-verified its load-bearing numbers (DefiLlama protocol record and volume series) and cite it as M for the rest. HIP-4 mechanics live in `docs/research/venues/hyperliquid-hip-4-outcome-markets.md`.

---

## 0. Bottom line

1. **Not an outcome-market venue.** sendai.fun describes SendAI as "an applied AI lab building agent harnesses for financial markets" (Solana Agent Kit, hackathon, "Cursor for Trading" upcoming). The page never mentions Hyperliquid, HIP-4, prediction/outcome markets, an API or fees (H, https://www.sendai.fun/, fetched 2026-10-19).
2. **The "SendAI Outcome" thing is only a DefiLlama listing** (id 9043, category "Interface", tag "Hyperliquid HIP4 Builder", chain "Hyperliquid L1", description "SendAI provides access to outcome-based prediction markets through Hyperliquid", listedAt 1791497943 = 2026-10-08) that tracks builder-code volume of one Hyperliquid address (H, https://api.llama.fi/protocol/sendai-outcome). The earlier note found the DefiLlama adapter says the address is "matched by name only to SendAI" (M).
3. **Volume is effectively zero: $60 all-time**, on exactly two days (2026-05-02 $50, 2026-06-17 $10); 24h/7d/30d = $0; last chart point 2026-10-18 = 0 (H, https://api.llama.fi/summary/dexs/sendai-outcome, fetched 2026-10-19).
4. **100% shared liquidity with Hyperliquid HIP-4.** A builder code is a fee tag on an order that fills on Hyperliquid's CLOB. Not an independent arbitrage leg.
5. **adapter_priority = skip.**

## 1. Still live? (2026)

- Company site: live (HTTP 200 content fetched 2026-10-19; footer "Twenty'26 SendAI Inc." per earlier note, M).
- Outcome product: **NOT FOUND** (searched: sendai.fun home, kit.sendai.fun link list, DefiLlama protocol record, earlier note's route/subdomain/bundle/GitHub-org probes; web search unavailable). No docs link, no app link, no API on the homepage (H).
- DefiLlama outcome series: two non-zero days only, nothing in the last ~4 months (H).
- Verdict: **still_live = false** as an outcome-market venue. Hyperliquid HIP-4 itself is live and has its own note.

## 2. Kind and market model

- Kind: at most a builder-code front-end on Hyperliquid HIP-4 (DefiLlama "Interface"). No SendAI-hosted markets, books or settlement (H for DefiLlama text; M for "at most").
- Market model: inherited from HIP-4: binary Yes/No share pairs, categorical "questions", standalone outcomes (scalar-capable), on a native merged CLOB, USDC-collateralised, outcome coins `#<10*outcome+side>` (M, HIP-4 note; the two fill coins `#0` and `#1890` are consistent with that encoding, M).
- DefiLlama methodology: "Volume of Hyperliquid HIP-4 outcome trades placed through the builder code" (H, fixture `defillama_dexs_summary_sendai-outcome.json`).

## 3. Chains and collateral

HyperCore (Hyperliquid L1), USDC quote (M, HIP-4 note). DefiLlama lists only "Hyperliquid L1" (H). SendAI is Solana-centric (Solana Agent Kit), but nothing links Solana to this footprint.

## 4. Read API

`exists = none` from SendAI. No docs, REST, WS or OpenAPI; the homepage lists none (H). For market data use Hyperliquid directly: `POST https://api.hyperliquid.xyz/info`, `wss://api.hyperliquid.xyz/ws`, docs https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api (M, from HIP-4 note). Attribution data only: Hyperliquid publishes builder fills at `https://stats-data.hyperliquid.xyz/Mainnet/builder_fills/<builder>/<YYYYMMDD>.csv.lz4` (M here, H in `sendai.md`). Public DefiLlama endpoints (H, fetched today):
- `GET https://api.llama.fi/protocol/sendai-outcome`
- `GET https://api.llama.fi/summary/dexs/sendai-outcome` (keys `total24h, total7d, total30d, totalAllTime, totalDataChart [[unix_ts, usd]...], methodology`)
- `GET https://api.llama.fi/summary/fees/sendai-outcome`
Auth: none; limits not documented.

## 5. Trade path

None at SendAI level; no SendAI order API, SDK or contract found (H negative). Underlying trading is Hyperliquid's EIP-712-signed `POST /exchange` with optional builder field `{"b": address, "f": tenths of a bp}`, requiring the user's `ApproveBuilderFee` (M, from `sendai.md` citing the Hyperliquid builder-codes doc).

**PayBox reachability: partial, only via Hyperliquid not SendAI.** An EVM wallet could sign Hyperliquid typed-data orders (M, HIP-4 note); SendAI adds no transaction-proposal surface and Hyperliquid L1 is not a PayBox transaction chain. Not queried in PayBox this session.

## 6. Fees

SendAI builder fee on outcomes: **NOT FOUND** (searched: sendai.fun, DefiLlama). Observed builder_fee = 0 on all three outcome fills and DefiLlama fees all-time $0 (M, earlier note; consistent with "builders earn on sells"). Hyperliquid's own outcome fee is in the HIP-4 note (empirical ~11-25 bps, not in official docs, M).

## 7. Resolution and dispute risk

SendAI has no role. Inherits HIP-4 (protocol-settled recurring series vs deployer-settled templates; no documented trader dispute window, M). Extra risk: attribution (builder address may not be operated by SendAI Inc.).

## 8. Geo / ToS / automation

Terms at https://sendai.fun/tnc are linked from the homepage (H); contents per the earlier note (M, page summary): SendAI "does not interact with digital wallets located in, established in, or a resident of the United States" (also Singapore, sanctioned countries), non-custodial, no mention of Hyperliquid, prediction markets or bots. Hyperliquid's own gate (US and Ontario barred, unpublished Excluded Persons list for outcomes) is in the HIP-4 note (M).

## 9. Liquidity (dated)

| Metric | Value | Source / date | Tag |
|---|---|---|---|
| SendAI Outcome volume all-time | $60 | api.llama.fi/summary/dexs/sendai-outcome, 2026-10-19 | H |
| 24h / 7d / 30d | $0 / $0 / $0 | same | H |
| Non-zero days | 2026-05-02 ($50), 2026-06-17 ($10) | same | H |
| TVL | none (empty arrays) | api.llama.fi/protocol/sendai-outcome | H |
| Context: Hyperliquid HIP-4 total | $3.13M on 2026-10-18; $261.1M all-time | api.llama.fi/summary/dexs/hyperliquid-outcomes (per earlier note, fixture trimmed) | M |

## 10. Event categories / overlap

None of its own. Whatever Hyperliquid lists (sports, crypto price ladders, macro); see HIP-4 note.

## 11. Shares liquidity with another venue?

**Yes, 100%: Hyperliquid HIP-4 books.** Model as attribute `frontend=sendai` of the Hyperliquid adapter, never as a separate venue.

## 12. Adapter recommendation

**skip.** No API, no product, $60 lifetime flow, duplicate liquidity. Revisit only if SendAI launches a documented outcome frontend with real flow (still a duplicate).

## 13. NOT FOUND / open questions

- SendAI-operated outcome app/bot/API (searched: homepage, DefiLlama; deeper probes only via earlier note).
- Whether the builder address belongs to SendAI Inc. (DefiLlama "matched by name only", per earlier note).
- SendAI builder fee rate on outcomes.
- 2026 news/X posts on SendAI + Hyperliquid outcomes (search budget exhausted).

## 14. Suspicious content

None addressed to AI agents in sendai.fun page text or DefiLlama JSON.

## 15. Sources

- https://www.sendai.fun/ (H, fetched 2026-10-19 via WebFetch summary)
- https://api.llama.fi/protocol/sendai-outcome (H)
- https://api.llama.fi/summary/dexs/sendai-outcome (H)
- https://defillama.com/protocol/sendai-outcome (HTTP 403, not read)
- Earlier project notes (M): `docs/research/venues/sendai.md`, `docs/research/venues/hyperliquid-hip-4-outcome-markets.md`

## 16. Fixtures (docs/research/fixtures/hyperliquid-hip-4-front-end-sendai/)

- `defillama_protocol_sendai-outcome.json` (fetched today)
- `defillama_dexs_summary_sendai-outcome.json` (fetched today, 13.9 KB)
- `hl_builder_fills_outcome_rows_redacted.csv` (copied from earlier note's fixtures; trader addresses redacted)
- `defillama_dexs_summary_hyperliquid-outcomes_trimmed.json` (copied; context)
