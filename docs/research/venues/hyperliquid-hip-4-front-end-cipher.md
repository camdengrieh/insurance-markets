# Hyperliquid HIP-4 front-end: Cipher (app.cipher.gg) - venue spec

Researched 2026-10-19. READ-ONLY. Only unauthenticated GETs/POST-to-info (read queries) against documented public hosts, page reads, no account, wallet, key, signature or PayBox money tool. Third-party content treated as untrusted data.

Tags: **H** = read first-hand this session (URL cited); **M** = secondary, or relayed from a sibling note in this repo, or inference; **L** = weak/stale.

Related notes in this repo (same day, independently written): `docs/research/venues/cipher.md` (deep dive on Cipher, including bundle analysis), `docs/research/venues/hyperliquid-outcomes-hip-4.md` (HIP-4 mechanics). Facts taken from them and not re-verified here are tagged M.

Fixtures (all < 50 KB) in `docs/research/fixtures/hyperliquid-hip-4-front-end-cipher/`:
- `defillama_cipher-outcome_protocol.json` - DefiLlama listing record
- `defillama_cipher-outcome_dexs_summary_20261019.json` - volume summary, methodology, the 12 non-zero days
- `defillama_factory_hyperliquid_cipher_lines.txt` - builder-address mapping from DefiLlama adapter source
- `hl_info_outcomeMeta_sample_20261019.json` - trimmed `POST api.hyperliquid.xyz/info {"type":"outcomeMeta"}` (4 of 333 outcomes)

---

## 0. Bottom line

- Cipher is **not a venue**. It is a Solana-first trading terminal whose "Predict" tab is a front-end over Hyperliquid HIP-4 outcome markets, tagged with a Hyperliquid builder code. DefiLlama: category "Interface", tag "Hyperliquid HIP4 Builder", "Cipher provides access to outcome-based prediction markets through Hyperliquid." (H, https://api.llama.fi/protocol/cipher-outcome)
- **100% shared liquidity with Hyperliquid HIP-4. Not an independent arbitrage leg.** DefiLlama flags the volume `doublecounted: true`. (H)
- Usage is trivial: **$939 lifetime** outcome volume via Cipher's builder code, 12 non-zero days, last meaningful day 2026-06-18 plus one $15 day on 2026-10-18 (H, DefiLlama dimension API, 2026-10-19). Hyperliquid outcomes overall: ~$261M all-time (M, sibling note).
- No Cipher API, no Cipher docs for Predict, ToS silent on prediction markets and barring the US/"Republic of China"/Singapore.
- **adapter_priority = skip.** The Hyperliquid HIP-4 adapter is the only thing to build.

---

## 1. Still live?

| Evidence | Result | Tag |
|---|---|---|
| `https://app.cipher.gg/predict` | HTTP 200 on 2026-10-19 (curl). `/perpetuals` page nav shows "Perpetuals / Predict / Multi Chart" (WebFetch). | H |
| DefiLlama listing `cipher-outcome` (id 8971) | `listedAt` 1791497871 = 2026-10-08; parent "Cipher.gg" with Cipher Perps, Cipher Spot, Cipher Outcome; twitter `tradeonCipher` | H |
| Outcome volume | 24h $15, 7d $15, 30d $15, all-time $939; non-zero on 12 days only (latest 2026-10-18 = $15; before that 2026-06-18) | H |
| Underlying Hyperliquid HIP-4 live | `POST https://api.hyperliquid.xyz/info {"type":"outcomeMeta"}` returned 333 outcomes incl. sports, Pyth-priced binaries (settlement dates 2026-10-21..23); `l2Book` for coin `#142000` returned live depth (px ~0.29, sizes 40..863 shares) at timestamp 1792386996804 (2026-10-19) | H |
| Cipher announcement of Predict | NOT FOUND (searched: WebSearch "Hyperliquid HIP-4 outcome markets Cipher front-end"; no result mentions Cipher; cipher.gg/terms; app page). Third-party coverage names Outcome.xyz and Nansen as front-ends, not Cipher. | M |

Verdict: **still_live = true** as an interface; effectively dormant for outcomes.

---

## 2. Kind and market model

- Kind: broker/front-end ("Interface") (H, DefiLlama category).
- Market model is entirely Hyperliquid HIP-4: binary Yes/No outcomes on a central limit order book on HyperCore, `quoteToken` USDC, outcomes grouped into questions; `outcomeMeta` fields seen: `outcome`, `name` (template id), `description`, `sideSpecs`, `quoteToken`, `venue` (deployer tag, e.g. `out`, `skew`), `deployerFeeScale` (H, fixture `hl_info_outcomeMeta_sample_20261019.json`). Order-book coin naming `#<10*outcome+side>` (I queried `#142000` for outcome 14200 side 0 and got a book: H). Asset id `100_000_000 + encoding` for orders (M, sibling note).
- Cipher adds no market, pool, oracle or token of its own (H, DefiLlama methodology: "Volume of Hyperliquid HIP-4 outcome trades placed through the builder code").

## 3. Chains and collateral

- Hyperliquid L1 / HyperCore (DefiLlama chain "Hyperliquid L1", H). Collateral USDC (`quoteToken: "USDC"`, H). Cipher funding UX is Solana USDC bridged to Hyperliquid (M, from `cipher.md`, docs read there). Builder address `0x32F6940795d6D484A6d29b6B628ebaFf80A0c779` (H: DefiLlama `factory/hyperliquid.ts` lines in fixture).

## 4. Read API

- **Cipher: none documented** (M: `cipher.md` read the GitBook index `llms.txt`; no API page. cipher.gg/terms lists "a web application, APIs, and smart contracts" as Services and nothing else, H). A private `api.cipher.gg` backend is reported in the front-end bundle (M, `cipher.md`); not probed, not documented.
- **Use Hyperliquid's public API instead** (H, live calls this session):
  - Base: `https://api.hyperliquid.xyz/info` (POST JSON, keyless), WS `wss://api.hyperliquid.xyz/ws` (M, docs), docs https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api (M, relayed).
  - Markets: `{"type":"outcomeMeta"}` -> `{outcomes, questions, deployers, feeScale}`.
  - Book: `{"type":"l2Book","coin":"#<enc>"}` -> `{coin,time,levels:[[bids],[asks]]}` with `{px,sz,n}` string levels; prices in (0,1).
  - Mids, trades, candles, settlement: see sibling note (M).
- Rate limits: per-IP weights on `/info` (M, sibling note); not re-verified.
- Per-fill builder archive (M, `cipher.md`): `https://stats-data.hyperliquid.xyz/Mainnet/builder_fills/<builder>/<YYYYMMDD>.csv.lz4`, useful only to measure Cipher-attributed flow (about zero).

## 5. Trade path

- Via Cipher: none (no API/SDK). The web ticket signs plain Hyperliquid `order` actions with a `builder` field (`f: 50`) using an approved agent wallet (M, `cipher.md` bundle read).
- Real path is Hyperliquid directly: signed actions to `POST https://api.hyperliquid.xyz/exchange`, EIP-712 "phantom agent" for L1 actions, `approveAgent`, optional builder codes (M, sibling note section 5, from HL docs).

## 6. PayBox reachability

**no** for Cipher (no EVM contract, no API, Solana-first, in-browser agent wallet). For the underlying Hyperliquid venue: partial (per sibling note: orders are HyperCore signed actions, not EVM tx proposals; EVM-side only funding via Arbitrum USDC and signing `approveAgent`; a separately held agent key would sign orders). Cipher adds nothing to this and would add a 5 bps builder fee.

## 7. Fees

- Cipher builder fee: 0.05% (`f: 50` = 5 bps) attached to each order, paid by user on top of Hyperliquid's fees (M, `cipher.md` bundle read; consistent with in-app "Builder fee 0.05%").
- DefiLlama all-time Cipher outcome fees $0.12 vs $939 volume (about 1.3 bps) - does not match 5 bps; unresolved (H data, cause unknown).
- Hyperliquid outcome fees: charged on close/settle only, per-deployer `deployerFeeScale` multiplier, no maker rebate; numeric base rate not in official docs, effective 11-25 bps observed by sibling note (M).

## 8. Resolution and dispute risk

Identical to Hyperliquid HIP-4: protocol auto-settle for recurring crypto binaries against HyperCore mark price, deployer-settled templates otherwise, no trader dispute window documented (M, sibling note). Cipher has no resolution role (M, inferred from architecture and builder-code model).

## 9. Geo / ToS / automation

- Source: https://cipher.gg/terms, read 2026-10-19 (H). **Effective June 1st, 2025: older than 16 months, possibly stale**; never mentions prediction markets or Hyperliquid.
- Prohibited jurisdictions per the sibling read (M): United States, Republic of China, Singapore, plus sanctioned regions. Quote (H): "The use of VPNs or other methods to bypass these restrictions is strictly forbidden and will lead to account termination."
- Bots/automation: not mentioned (H). Hyperliquid's own terms (US and Ontario barred) apply to the underlying venue (M, sibling note).

## 10. Liquidity (dates)

| Metric | Value | Source, date | Tag |
|---|---|---|---|
| Cipher Outcome volume 24h/7d/30d | $15 / $15 / $15 | api.llama.fi `summary/dexs/cipher-outcome`, 2026-10-19 | H |
| Cipher Outcome all-time volume | $939 (12 non-zero days) | same | H |
| TVL / OI | none (no custody; `tvl: []`) | api.llama.fi/protocol/cipher-outcome | H |
| Hyperliquid outcomes all-time | ~$261M | sibling note citing DefiLlama, 2026-10-19 | M |

## 11. Event categories and overlap

Whatever Hyperliquid lists: crypto price binaries (Pyth/mark-based), index levels, sports contests/tournament winners, policy-rate decisions (H from `outcomeMeta` sample: sports, `binaryPrice` on ZEC and XYZ100). Overlap with Polymarket/Kalshi exists only through the Hyperliquid adapter, never through Cipher.

## 12. Shared liquidity

**Yes, 100% with Hyperliquid HIP-4** (H: methodology states builder-code trades; `doublecounted: true`). Same for other HL front-ends (Outcome.xyz, Nansen, etc.). Not an independent leg.

## 13. Adapter guidance

Do not build a Cipher adapter. Optionally model front-ends as an `attribution` field on the Hyperliquid HIP-4 adapter (builder address + fee bps). Monitoring Cipher flow is pointless at current volume.

## 14. Priority: skip

Duplicate liquidity, no API, $939 lifetime volume, ToS excludes US, no PayBox path of its own.

---

## NOT FOUND

- Cipher docs/announcement for the Predict tab (searched: web search, app page, terms, and the sibling note's GitBook index read).
- Cipher API documentation or rate limits.
- Cipher-specific resolution/dispute policy.
- Cause of the fee/volume mismatch on DefiLlama.
- Direct fetch of DefiLlama protocol page (HTTP 403 via WebFetch); used api.llama.fi JSON instead.

## Suspicious content

None encountered in pages read this session.

## Sources

| # | URL | Tag |
|---|---|---|
| 1 | https://app.cipher.gg/perpetuals ; https://app.cipher.gg/predict (HTTP 200) | H |
| 2 | https://cipher.gg/terms | H |
| 3 | https://api.llama.fi/protocol/cipher-outcome ; https://api.llama.fi/summary/dexs/cipher-outcome | H |
| 4 | https://defillama.com/protocol/cipher-outcome (403 to WebFetch) | - |
| 5 | https://api.hyperliquid.xyz/info (outcomeMeta, l2Book) | H |
| 6 | docs/research/venues/cipher.md ; docs/research/venues/hyperliquid-outcomes-hip-4.md (repo, same day) | M |
| 7 | WebSearch results: alearesearch.substack.com, quicknode.com/blog/hip4-hyperliquid-outcome-contracts, coinspectator.com (Nansen first front end, 2026-09-08) | L |

Privacy: only User-Agent `insurance-markets-research/0.1` used; no personal identifiers in requests or fixtures (grep for "@" on fixtures returned no hits).
