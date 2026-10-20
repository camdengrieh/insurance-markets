# 23 - Conviction creation and metadata, from public chain data and docs (Phase 0 gate 5)

Task key: `creation-and-metadata-onchain`. Research date: 2026-10-19 (machine clock UTC; chain data to 2026-10-18 12:17 UTC). READ-ONLY. GET only. No PayBox tool was called, no `submit_feedback`, no email, form or chat contact with XO, no account, key, order, signature or UserOp was created, no JSON-RPC call and no POST was sent. No `.env`/key/credential file was read. No third-party code was cloned or run (Foundry `cast` was used offline for ABI decoding and keccak only). User-Agent on every request: `insurance-markets-research/0.1`. Scripts were grepped for at-signs, personal names and home paths before use.

Confidence tags: **H** read first-hand in a primary source this session or reproduced by my own computation (script named); **M** secondary or inferred; **L** weak. Where something cannot be established: "NOT FOUND (searched: ...)" or "NOT ESTABLISHABLE WITHOUT XO".

Request budget used (hard cap 150 per host, at least 300 ms between calls to a host, no 429 seen): explorer-mainnet.xo.market 86, api-mainnet.xo.market 83, orderbooks.xo.market 75, storage.googleapis.com 112, market-metadata-623756711122.s3.eu-west-1.amazonaws.com 27. One explorer read timed out on a 3.3 M-block `getLogs` range; I switched to 60 k to 1 M block windows. The ToS was read first (clause on automated access quoted in section 6); traffic stayed far below the documented limits (public REST 5 req/s).

---

## 0. Verdict (read this first)

**Gate 5 (market creation): PARTIAL.** Everything that public chain data and docs can answer is now answered, and it is better news than Phase 0 assumed on process and worse news on hosting.

1. **Creation is a normal, open, sponsored contract call and its review process is fully observable.** 585 `createConvictionMarket` calls (2026-08-14 to 2026-10-18) each paid exactly $1.00 (585 of 585 fee events). In all 13 UserOps I decoded (12 sampled txs plus the last creation tx) the call is one batch `[USDC.e.approve(manager, 2^256-1), createConvictionMarket(...)]` paid for by XO's `PolicyPaymaster` (H; the other 572 were not decoded, [03 V8] separately saw the paymaster in 25 of 25 recent creations).
2. **Metadata is 100% inside two XO-named buckets (585 of 585), and no creator-hosted URI has ever been tried.** The contract does not validate the URI. Whether XO's oracle or indexer would accept an own-hosted URI, and how a non-XO client uploads a JSON/image to XO's bucket, are NOT ESTABLISHABLE WITHOUT XO (or one $1 live attempt by the user). This is the single biggest open item for an agent-operated creator.
3. **First review outcome, all 585:** approve 287 (49.1%), update-required 233 (39.8%), reject 51 (8.7%), none 14 (2.4%; all 14 are owner cancellations within 30 minutes, not pending reviews). Update-required is not a failure: the owner accepted 218 of 233 (93.6%). **Eventual activation: 505 of 585 (86.3%); 390 of 433 (90.1%) since 2026-09-01.** The $1 fee is the only per-attempt cost, so expected fee per live market is about $1.11 (since 09-01).
4. **The oracle rewrites rules.** In 38 original-vs-suggested pairs the oracle changed `rules.description` in 34, the title in 10, sources in 11, and always stripped tags. At least 2 of 38 changed what the market means (a 3% threshold became 5%; a fixed date was replaced). An agent must diff and gate acceptance, not auto-accept (the window is typically 48 h but was as short as 20 minutes).
5. **Seed order:** it is a resting GTC buy with stake normally exactly $10.00 (46 of 71), stored by XO as `convictionSeed.commitment` and visible in the Data API detail route. Public evidence says no seed trades before on-chain activation (0 of 33 first trades; earliest 131 s after activation) and that XO's own pipeline registers the seed in creation order (rank correlation 1.0000, 16 of 16 discordant pairs). Whether a third-party client may post to a PENDING market is NOT ESTABLISHABLE; docs say 422, so wait for `active: true`.
6. **ToS limits are not enforced in practice:** 364 of 585 creations (62%) were the 2nd or later by the same creator in the same ISO week (Annex A: "maximum of one (1) market per calendar week"), and 21 of 36 sampled creators of approved markets show no `XO Catalyst` achievement. That is evidence about enforcement, not permission; the written terms still apply and can be invoked at any time (section 6).
7. **Rules of thumb that matter most** (section 7): sports markets of 1-7 days pass first review 85% of the time (n=107, update/approve split); crypto price markets pass only 33% (n=76); horizon under 1 day passes 40% with 12% rejects; the most common fix is an absolute date, time and timezone (72% of substantive update notes). A deterministic pre-flight checklist of 39 checks (30 lint-able, 9 operational) is in section 8.

---

## 1. How the on-chain creation flow works (source-verified)

All H unless stated; source: verified `XOClobMarketManager` implementation fetched from the explorer (`raw/manager_impl.json`, script `make_topics.py` derives topic hashes with `cast keccak`).

- `createConvictionMarket(uint40 startsAt, uint40 expiresAt, address collateralToken, string metaDataURI)`, selector `0x7f54a7a2`. It calls `_createMarket(msg.sender, ...)` (checks `expiresAt > block.timestamp`, `startsAt <= expiresAt`, collateral equals the exchange collateral and is allowed), mints the market NFT to the caller with the URI as token URI, stores `resolver = XO_ORACLE`, `creatorFeeBps = 0`, `status = PENDING`, then charges `marketCreationFee` with `safeTransferFrom(msg.sender, treasury, fee)` and emits `MarketCreationFeeCharged`. There is no URI validation of any kind (no scheme, host, length or format check).
- `reviewMarket(conditionId, decision, suggestedMetaDataURI, extraNotes, suggestedExpiresAt, suggestionExpiresAt)` is `onlyXOOracle` and valid only from `PENDING`. Decisions: 0 APPROVE (-> ACTIVE), 1 REJECT (-> CANCELLED), 2 UPDATE_REQUIRED (-> UPDATE_REQUIRED, stores the suggestion; reverts if `suggestedExpiresAt <= block.timestamp`). Event `MarketReviewed(conditionId indexed, decision, suggestedMetaDataURI, extraNotes, suggestedExpiresAt, suggestionExpiresAt)`. `extraNotes` is the free-text oracle response (the rejection or change reason).
- `respondToUpdateRequest(bytes32 conditionId, bool acceptUpdate)`, selector `0x1de5facd`, is `onlyMarketOwner` (the NFT holder). Accept requires `block.timestamp < suggestionExpiresAt` (else `InvalidParameter`); it sets `metadataURI = suggestion.metadataURI`, applies `suggestedExpiresAt` if non-zero and activates. Decline cancels. Event `UpdateRequestResponded(conditionId, owner, accepted, metaDataURI-or-empty)`. The payload is only `(bytes32, bool)`: the creator never sends text.
- `cancelMarket(bytes32)`, selector `0xbdb83289`, `onlyMarketOwner`, valid only while `PENDING`. Event `MarketCancelledByOwner`.
- Oracle-only: `updateMetadata`, `updateMetadataAndActivate`, `updateExpiry` (events `MetadataUpdated`, `MarketExpiryUpdated`).
- Enums: `ReviewDecision {APPROVE, REJECT, UPDATE_REQUIRED}`; `MarketStatus {PENDING, CANCELLED, ACTIVE, PAUSED, RESOLVED, CLOSED, UPDATE_REQUIRED, VOIDED, VOIDED_CLOSED}`; `MarketType {STANDARD, PULSE, CLOB, CLOB_PULSE, CLOB_CONVICTION}` (4 = Conviction).
- Market ids are deterministic from `(creator, creatorMarketNonce, collateral)` (`computeNextMarketIds`), so token ids can be known before the tx; the receipt's `CLOBMarketCreated` log carries them anyway.
- The creation call comes from the creator's smart account (`msg.sender`), so the USDC.e balance and allowance requirements apply to the smart account.

Poll shape for one market (validated live, returned the one expected row): explorer `GET /api?module=logs&action=getLogs&fromBlock=<creationBlock>&toBlock=latest&address=<manager proxy>&topic0=<MarketReviewed topic0>&topic1=<conditionId>&topic0_1_opr=and`.

---

## 2. Task item 1: metaDataURI host and scheme distribution

Data: every `CLOBMarketCreated` event with `marketType = 4` from the manager proxy, block 9,228,944 to 12,592,330, paged by block ranges below the 1000-row cap (29 pages, max page 987 rows, no page capped), de-duplicated by (tx, logIndex). Totals in window: type 4 = 585, type 2 = 1,881, type 3 (Pulse) = 18,714 (not decoded further). The 585 conviction rows match the 585 `MarketCreationFeeCharged` events one-for-one by conditionId (set equality), every creation tx contains exactly one conviction creation. Hand decoder cross-checked against `cast abi-decode` on 80 creation logs and 60 review logs, 0 mismatches (`crosscheck_decode.py`). H.

| Host class | URI shape | Count | Share | First use (UTC) | Last use (UTC) | First review: approve / update / reject / none | Eventual ACTIVE |
|---|---|---|---|---|---|---|---|
| GCS | `https://storage.googleapis.com/market-metadata-mainnet/<uuid>.json` | 564 | 96.4% | 2026-08-14 11:07:07 | 2026-10-13 17:06:15 | 274 (48.6%) / 227 (40.2%) / 49 (8.7%) / 14 (2.5%) | 486 (86.2%) |
| S3 | `https://market-metadata-623756711122.s3.eu-west-1.amazonaws.com/<uuid>.json` | 21 | 3.6% | 2026-10-13 11:46:06 | 2026-10-18 12:17:07 | 13 (61.9%) / 6 (28.6%) / 2 (9.5%) / 0 | 19 (90.5%) |
| ipfs, arweave, data:, http, own domain | none | 0 | 0% | - | - | - | - |

- Scheme: `https` 585 of 585. Filenames: UUID `.json` in 585 of 585; 585 distinct URIs (no reuse). Same split for XO's own type-2 CLOB markets (1,753 GCS, 128 S3), so the app and the XO executor use the same buckets.
- There is a bucket migration from GCS to S3 around 2026-10-13 (a 5-hour overlap on that day; image URLs migrated too: `market-image-mainnet` on GCS versus `market-images-623756711122` on S3). The earlier note [03] saw only the S3 form.
- Ownership of the buckets is M-to-H, not proven: bucket names are XO-flavoured, the original JSON object `Last-Modified` is 1 to 9 s before the creation tx in 99 of 99 files with headers (median 3 s), and the oracle's own `suggestedMetaDataURI` (233 of 233) lands in the same two buckets (GCS 227, S3 6). So XO's backend uploads the JSON, then the app sends the UserOp. Objects are public: GCS `Content-Type: application/json`, `Cache-Control: public, max-age=3600`; S3 JSON without cache header. No auth, no CORS header observed on GETs.
- Data API view: `metadataUri` on each market equals the accepted URI (for 218 accepted updates it equals the oracle's suggested URI, 218 of 218), so the Data API follows the on-chain URI.
- **Answer to "are all URIs inside XO's bucket": yes, 585 of 585.** Because the function accepts any string, this is a convention of XO's front end, not an on-chain rule. No data exists on what happens with a non-XO URI (no precedent). NOT ESTABLISHABLE WITHOUT XO: (a) a documented or authenticated upload route for JSON and cover image (NOT FOUND in docs: searched `upload|bucket|metadataUri|ipfs|arweave|s3` over the whole docs tree and both OpenAPI path lists; only `metadataUri` as a response field), (b) whether the oracle/indexer fetches and parses a foreign host.

Artifacts: `fixtures/gaps/creation-and-metadata-onchain/conviction_outcomes.csv` (585 anonymised rows), `scripts/scan_created.py`, `scripts/inline_analyses.py` section B and C.

---

## 3. Task item 2: metadata JSON schema and review text

### 3.1 Schema (138 files: 100 originals and 38 oracle-suggested versions; 111 GCS, 27 S3; all HTTP 200)

All 138 files have exactly these nine top-level keys, no others, in this form (H, `schema_scan.py`, summary in `schema_summary.json`):

| Key | Type | Observed rule |
|---|---|---|
| `title` | string | the market question; 82 of 138 have `description == title` |
| `description` | string | usually the title or a restatement |
| `category` | string | upper-case top-level category; sample: SPORTS 73, CRYPTO 39, POLITICS 9, FINANCE 8, TECH 5, CULTURE 4. Data API `categoryPath[0]` over 493 markets also shows SOCIAL, MENTIONS, OTHER, WEB3, SCIENCE, LEGAL, WEATHER. Path depth 1: 23, 2: 237, 3: 233 |
| `tags` | array of string | originals: 100 of 100 non-empty (typically 4); **oracle-suggested versions: 38 of 38 empty `[]`**, and 30 of those 38 markets went ACTIVE after the owner accepted, so empty tags do not block activation |
| `subcategories` | array of string | names from XO's category tree (e.g. `["Football","Premier League"]`, `["American football","NFL"]`); 1 or 2 items in 137 of 138 |
| `image_url` | string (https) | present in 138 of 138, always an XO image bucket (`storage.googleapis.com/market-image-mainnet/compressed/<uuid>.webp` or `market-images-623756711122.s3.eu-west-1.amazonaws.com/compressed/<uuid>.webp`) |
| `rules` | object | exactly `{description: string, outcomeRules: [...]}` |
| `rules.outcomeRules` | array of `{outcomeIndex: 0\|1, rule: string}` | exactly 2 entries, indices `(0, 1)` in 138 of 138 |
| `resolution_sources` | array of string (URLs) | 1 to 6 URLs (1: 53, 2: 44, 3: 25, 4: 11, 5: 3, 6: 2); mostly domain roots such as `https://www.coingecko.com`, `https://www.espn.com`; the specific page is named inside `rules.description` |
| `outcomes` | array of `{id: 0\|1, title: string}` | exactly 2, ids `(0, 1)`; titles `Yes`/`No` in 111 of 138, otherwise complementary labels (`51 points or more` / `50 points or less`, `Over 262` / `Under or equal to 262`, `Win` / `Draw`) |

- **Creator fields: none.** No creator, wallet, user, seed or timestamp field in any file. The creator is `msg.sender` on-chain (and the NFT holder); the seed lives in XO's DB (section 5).
- Outcome index 0 is the YES slot: the Data API outcomes carry `index 0 = Yes, 1 = No` even when the metadata labels differ.
- Typical `rules.description` structure written by XO's AI-assisted draft (exemplars in `exemplars.json`): "This market resolves based on whether ... Primary source: NFL (https://www.nfl.com). If the primary source is unavailable, incomplete, or inconsistent, resolution falls back to ... The primary source governs. If the game is cancelled or abandoned ... the market voids and all positions resolve equally." Descriptive frequencies in the original sample (n = 27 approved, 38 update-required, 24 substantive rejects; M, small n): contains "primary source" 96% / 89% / 96%; contains a void or cancel clause 96% / 84% / 88%; contains an explicit calendar date 74% / 45% / 50%; contains UTC or another timezone 11% / 26% / 0%; Yes/No outcomes 96% / 79% / 75%. Median rules length 733 / 609 / 655 chars (oracle-rewritten versions 840, ratio 1.22). Median horizon 14.1 / 11.9 / 5.8 days.
- **Mandatory fields for approval:** no mechanism reveals a validator. All nine keys were always present, so the safe default is to emit all nine with these types. Whether an absent `image_url`, an empty `tags`, or an extra key breaks the indexer or oracle is NOT ESTABLISHABLE WITHOUT XO. What the evidence does show is that the oracle itself publishes versions with `tags: []` that activate.
- Rules text must live in `rules.description` and `outcomeRules`: a reject says the key fact "is in the creator note and not in the actual rules, which can be misleading".

### 3.2 Oracle response format (`extraNotes`) - three regimes (H, `analyze_chain.py`, `inline_analyses.py` G)

| Regime | Where seen | Form |
|---|---|---|
| admin stamp | APPROVE 115 (2026-08-14 to 10-17) | exactly "Market approved by admin" |
| MODRA format | APPROVE 99, UPDATE_REQUIRED 12, REJECT 3 (2026-08-15 to 10-02) | markdown: `## MODRA Review`, `**Decision:** APPROVE`, `**Quality score:** 0.64-1.00`, `**Mode:** proposal`, `### Summary`, then `### Changes needed` or `### Rejection reasons` bullet lists |
| auto summary | APPROVE 73 (from 2026-10-04) | "This market is clear and ready to resolve." only |
| free text | everything else | prose reason; for UPDATE_REQUIRED it is a description of what the oracle rewrote |

- Quality scores seen (MODRA-format notes only): APPROVE 0.64 to 1.00 (n=99, median 1.00); UPDATE_REQUIRED 0.00 to 0.9 (12); REJECT 0.00 to 0.4 (3). The ranges overlap, so no clean threshold can be derived (L).
- MODRA reviews talk about the creator's "intent", so the automated reviewer reads a structured intent (title, rules, cutoff), not only the JSON. One note shows an automated cross-check: `Parsed explicit date "October 10, 2026"; user cutoff differs by more than 24h.` (rules date versus on-chain `expiresAt`). Another: `[API-Football] Could not extract team names from market. Market must clearly identify both teams.` (2) and `Market does not fit the playbook criteria.` (1).
- Latency by decision (creation to first review, minutes): APPROVE median 5.0 (p90 99.8), UPDATE_REQUIRED 14.2 (257.5), REJECT 25.7 (195.6); all n=571: median 9.9, p75 34.2, p90 166.3, max 652.2 (matches [03 V3]).

### 3.3 What approved, update-required and rejected look like

**Approved** (287): the stock template above, with an explicit event date, named league and fixture, a primary and a fallback source and a void clause. Notes are the stamps above.

**Update-required** (233): 86 are terse notes (under 60 characters or written before 2026-08-19, e.g. "test", "minor change", "Image updated", "Title update"); 147 describe a rewrite. Keyword frequency over those 147 substantive notes (M, regex, categories overlap):

| What the oracle fixed | Share |
|---|---|
| absolute date, time, timezone, deadline or cutoff added or corrected | 72.1% |
| entity, term or scope defined or disambiguated (competition, season, matchweek, "military action", "public launch") | 51.7% |
| void, cancel, postpone, abandon, no-contest clause added or reworked | 45.6% |
| source named, replaced or fallback chain added | 29.9% |
| numeric threshold, price type, reference definition | 29.3% |
| draw, overtime, extra time, own goal, non-participation edge cases | 18.4% |
| restated as explicit Yes/No | 17.7% |
| title changed to match the rules | 12.9% |
| catch-all/void converted to "otherwise resolves No" | 6.8% |

Typical notes (<=25 words each): "Added the scheduled match date (August 29, 2026); all other resolution rules and sources stayed the same."; "The postponement clause was replaced with a fixed cutoff: if the fight has not taken place by December 15, 2026, 23:50 UTC, the market voids."; "Clarified that only Chelsea's Premier League Matchweek 6 fixture against AFC Bournemouth counts."

**Rejected** (51), categorised (`inline_analyses.py` H):

| Reason | Count | Example (<=25 words) |
|---|---|---|
| junk, test or bare "reject" (almost all 2026-08-14 to 08-18) | 18 | "test market" |
| duplicate of a live market | 9 | "A market with the same event, outcomes, and resolution rules is already live" |
| ambiguous, underspecified, subjective or too vague | 6 | "the rules do not specify the numeric goal threshold. Without this concrete value, the market cannot be resolved unambiguously." |
| event already happened | 5 | "Convictions cannot be created on past events. Only upcoming or unresolved events are eligible." |
| unusable or invalid resolution source | 4 | "No accurate source of truth. Example.com doesn't belong to XO Market." |
| not a clean binary (draw, three-way, two binaries in one) | 4 | "it is not binary: a draw is possible" |
| automated checker (team names, playbook) | 3 | "Could not extract team names from market. Market must clearly identify both teams." |
| about XO itself | 1 | "markets about the project itself, or that reference XO Market metrics, are not permitted." |
| other | 1 | (a rewrite note recorded as a reject) |

Reject share by creation month: Aug 18.4%, Sep 4.3%, Oct 6.8%. Excluding the 18 junk rows, the substantive reject rate is 33 of 567 (5.8%).

Artifacts: `review_notes_reject.json`, `review_notes_update_required.json` (notes truncated to 240 chars, addresses and handles redacted), `pairs_detail.json`, `exemplars.json`.

### 3.4 What the oracle's rewrite does to the JSON (38 original-vs-suggested pairs, `pairs_diff.py`, H)

| Field changed by the oracle | Pairs |
|---|---|
| `tags` (always set to empty) | 38 |
| `rules.description` | 34 (median 609 -> 840 chars) |
| `title` | 10 |
| `resolution_sources` | 11 |
| `rules.outcomeRules` | 11 |
| `description` | 6 |
| `outcomes` / `category` / `subcategories` | 1 / 1 / 1 |

`suggestedExpiresAt` equals the existing expiry in 35 of 38 pairs (it is a required non-zero argument, mostly an echo). **Semantic drift:** one pair dropped a numeric threshold (7,429.65 -> 7,276.46, "3% decline" -> "5% decline", with a changed title) and one replaced a fixed date with an event-based condition. Treat acceptance as a change of contract, not a typo fix.

---

## 4. Task item 3 (part): status-transition timeline from creation to ACTIVE

Statuses (on-chain manager): PENDING -> {ACTIVE (APPROVE) | CANCELLED (REJECT) | UPDATE_REQUIRED -> {ACTIVE (owner accepts) | CANCELLED (owner declines)} | CANCELLED (owner cancels while PENDING)}. There is no automatic expiry of an unanswered UPDATE_REQUIRED on-chain; all 233 were eventually answered.

Outcome of all 585 (H): ACTIVE ever 505 (287 direct + 218 after accepting an update); CANCELLED 80 = 51 rejected + 15 declined updates + 14 owner cancellations. 505 equals the Data API type-4 `itemCount`, which resolves the earlier 585-versus-505 gap in [03]/[02]: the Data API omits exactly the 80 CANCELLED markets. The Data API list returned 493 of 505 rows (12 hidden by its post-count visibility bug).

| Interval (minutes unless stated) | n | median | p75 | p90 | max |
|---|---|---|---|---|---|
| creation -> first review | 571 | 9.9 | 34.2 | 166.3 | 652.2 |
| creation -> first review, since 2026-09-01 | 423 | 8.0 | - | 138 | 652.2 |
| creation -> ACTIVE (all ever-active) | 505 | 13.1 | 62.2 | 310.5 | 1,570.8 |
| creation -> ACTIVE, APPROVE path, since 09-01 | 235 | 4.2 | - | 82.2 | - |
| creation -> ACTIVE, UPDATE path, since 09-01 | 155 | 26.7 | - | 542.9 | - |
| review -> owner accepts (accepted updates) | 218 | 9.4 | 67.6 | 330 | 1,534 |
| creation -> owner cancel (14, all before any review) | 14 | 2.9 | - | - | 30.2 |

- Owner acceptance: 93 of 218 within 5 minutes, 160 within 60 minutes, 217 within 24 h; every accept happened inside the window. 10 of the 15 declines happened after the window had lapsed (six between 106.8 and 107.4 h after the review; looks like a clean-up), so a creator who does nothing leaves the market in UPDATE_REQUIRED indefinitely and keeps the $1 spent.
- Suggestion window (`suggestionExpiresAt - review`): 48 h for 165 of 233, 26 h for 27, under 24 h for 15, under 6 h for 5, shortest 0.33 h (20 minutes). Short windows appear on short-horizon markets, so an agent must poll at minute resolution.
- Data API timestamps: the DB row exists 1.7 s (median, p90 2.6 s, max 18.2 s) after the chain timestamp, so a PENDING market is in the catalogue almost immediately. `createMarketBlockTimestamp` equals the block timestamp exactly. `updatedAt` is too noisy to date activation or the seed (median activation-to-update lag is dominated by later updates).
- `startsAt` is set by the app to creation time: within -29 s to +43 s of the block timestamp in 585 of 585. Horizon (`expiresAt - created`): median 9.4 days, p10 0.52, p90 120.6, max 1,921 days.
- Data API fields: the list route returns `reviewStatus: null`; the detail/slug route returns `reviewStatus` equal to the chain's first decision (50 of 50 matched) and `convictionSeed`.
- Orderbook: `GET /markets/{conditionId}` knows all four cancelled markets I tested (2 rejected, 1 owner-cancelled, 1 declined) with `active: false`, so markets are registered at creation and flagged inactive until activation (H, 4 of 4).

Artifacts: `conviction_outcomes.csv`, `first_trade.json`.

---

## 5. Task item 3: the seed order

**Docs (H):** `create-a-conviction.mdx`: "XO signs your seed order against predicted market identifiers, creates the market through a sponsored on-chain transaction, submits the seed buy as a GTC order, and polls the catalogue until the market appears." "Creation is not idempotent." Step 3: "a stake of at least $10, and a seed price from 5c to 95c". Fees page: "Seed order | At least $10.00". Lifecycle guide: orders on a non-Active market get `422 {"error": "market is not active (status: Pending)"}`.

**What the seed looks like in XO's data (H, `fetch_seed_detail*.py`, 71 ACTIVE markets, detail/slug route):** `convictionSeed.commitment = {orderId, status, outcome, side, price, size, remaining}`. 71 of 71 have one; status `resting` 66, `spent_tombstone` 5; side always `buy`; outcome `yes` 52, `no` 19; stake (price x size) exactly $10.00 in 46 of 71, 9.09 in 1 (the only one below $10), then 12, 15, 20, 25, 30, 40, 100, up to 500; price range 0.01 to 0.95. In a random sample of 25 live books (`seed_books.py`), 21 had resting liquidity (typical single $10 order, `last_update_id` 2 on fresh seeded markets), 4 were empty. The list route does not carry `convictionSeed`.

**Timing evidence (what is and is not observable):**
- First trade versus on-chain activation: for 40 stratified markets with volume (20 APPROVE path, 20 accepted-update path) the earliest price-history point exists for 33; none is before activation; minimum +131 s, then +306 s, +516 s, +631 s, +1,858 s; median +2.0 days (`first_trade.py`). So no fill occurred on a PENDING or UPDATE_REQUIRED market in the sample (H on the sample, L on the population).
- Order-id ordering: 42 markets have a seed `orderId` above 2^60. Rank correlation of orderId with creation time is **1.0000**, with activation time 0.9934; of 16 market pairs whose creation order differs from activation order, **16 follow creation order, 0 follow activation order** (`orderid_test.py`). Reading (M): XO's pipeline registers the seed order when the market is created, before the oracle decides; it cannot trade until the market is ACTIVE.
- Whether a third-party client's order would be accepted on a PENDING market (the doc says 422) or whether XO uses an internal path: NOT ESTABLISHABLE WITHOUT XO. Authenticated order timestamps (`created_at`) would settle it but need HMAC credentials, so I did not attempt it.

**Consequence for an agent:** the safe, documented sequence is create -> read `CLOBMarketCreated` from the receipt (token ids) -> poll review -> on ACTIVE (or on accepted update) check orderbook `GET /markets/{cid}` shows `active: true` -> sign and POST the seed GTC (stake >= $10, price 0.05-0.95). A 422 "market is not active" means retry later, not failure. Pre-signing is possible with `computeNextMarketIds` (needs a state read) or by waiting for the receipt. No creator in the data seeded earlier than the oracle allowed trades, as far as public data shows. Do not retry creation on ambiguity (non-idempotent): reconcile through logs (`topic2 = creator`).

---

## 6. Task item 5: terms of service and product page (quotes <= 25 words)

Read via the xo-docs MCP, `/legal/terms-of-service.mdx` (undated), `/product/products/create-a-conviction.mdx`, `/product/products/convictions.mdx`, `/product/trading/fees.mdx`, `/legal/privacy-policy.mdx` (dated 6/5/2025). No clause names API clients, AI agents or "programmatic" creation. The clauses that bear on an author-operated, automated creator:

**Automated access and reverse engineering (General Terms)**
- "Automated bots or scripts accessing the service must comply with these Terms and not overwhelm or misuse the system."
- "You may not harvest or scrape data from the Platform for unauthorized purposes"
- "reverse engineer or attempt to extract the source code of any proprietary software, except as permitted by law or with our written permission."
- "You also must not exploit any vulnerabilities or bugs in the Platform or smart contracts to gain unfair advantage." (The creation selector is wired to the public role by design, so this is not a bug use; XO could still argue the point.)

**Creating markets (General Terms and Annex A "User Generated Market Terms")**
- "You should not create markets on events that are impossible to verify or that lack objective resolution data."
- "XO (through its moderators or automated systems) may review new markets and has the right to refuse or de-list any market"
- "Ownership of the Catalyst Badge is required for any user to propose, submit, or otherwise create a new market."
- Eligibility: "Accumulate at least 500 Conviction Points", "Complete a streak of 7–10 consecutive daily log-ins on the Platform", "Link and verify an approved social media account".
- "Users may create a maximum of one (1) market per calendar week. Attempted submissions beyond this limit will be rejected by the Platform."
- "All proposed markets undergo review by XO Market administrators/moderators."
- "XO Market reserves the right, in its sole discretion, to suspend or revoke market creation privileges or the Catalyst Badge for"; "Any attempt to transfer the Catalyst Badge or circumvent Catalyst Badge restrictions;"
- Prohibited topics (Annex A section 5): unlawful or violent activity, self-harm, "privacy violations, non-consensual content, or personal data".
- "XO Market also reserves the right to replace, remove, or otherwise change the market creation feature, with notice provided where reasonable."

**Creator obligations, voiding, liability**
- "Contain unreliable, ambiguous, or unverifiable resolution criteria" (grounds to void a market after approval); then "all unresolved positions will be settled on a 50/50 basis between participants, regardless of position taken." The creator's seed is such a position.
- "You must not engage in trading ... where you have direct or indirect influence over the outcome of a market." (a creator trading beyond its seed is exposed)
- "wash trading (engaging in trades with yourself or colluding with others to create artificial activity or false liquidity)"
- Indemnity: "any content you create or actions you take on the Platform (including the creation of markets or disputes) that cause harm to a third party"
- Termination: "suspend, restrict, or terminate your access to the Platform (including disabling your ability to create or trade markets) at any time, with or without cause"
- Gas wording conflicts with sponsorship: users are "solely responsible" for network fees "when ... creating a market", while the docs call creation sponsored.
- Privacy policy: "Do not include personal data (whether yours or someone else's) in market descriptions or comments."

**Product page (Create a Conviction):** "Creator eligibility can be gated, and submissions may be reviewed before going live." "Creation is not idempotent." Charges: "Creation charge | Currently $1.00", "Seed order | At least $10.00". Step 2 is "where a Conviction succeeds or fails" with four checks: specific subject, threshold and window; a source that will still publish; YES and NO cover every possibility with no overlap; what happens if the source is unavailable, corrected or ambiguous.

**Reading for the user's risk acceptance (M):** nothing forbids calling a public contract function through an automated account; the written eligibility rules (badge, 500 CP, daily login streak, one market per week) are the exposure. They are demonstrably not enforced today (section 9), but the ToS gives XO unilateral rights to void markets (seed lost to a 50/50 split), revoke creation, close the selector, and terminate access with or without notice. The "daily log-in streak" requirement cannot be met by an automated account without arguably breaching the "not overwhelm or misuse" clause. Approval mode per attempt is the sensible default.

---

## 7. Task item 6: what a market must look like to pass first review

All figures are first-review outcomes by creation date; denominators include rejects unless stated. Since 2026-09-01 (steady state after the early-August test period): n = 433, approve 54.3%, update 38.1%, reject 5.3%, none 2.3%, eventual activation 90.1%.

| Factor | Evidence (n) | Reading |
|---|---|---|
| Category | Sports, since 09-01, Data API visible: approve 71.7% / update 28.3% (269). Crypto: 32.9% / 67.1% (76). Finance 27% / 73% (11) | crypto and finance price markets almost always need an update |
| Horizon, since 09-01 | <1 d: approve 40.0%, reject 12.0% (75); 1-7 d: 68.3%, 3.6% (139); 7-30 d: 57.1% (112); 30-120 d: 45.7% (70); >120 d: 37.8% (37) | 1-7 days is the sweet spot. Sports 1-7 d approve 85% (107 approve-or-update); crypto <1 d approve 22% (9), 1-7 d 13% (15) |
| Creator experience | creator's 1st market: approve 40.2% all-time (132), 45.2% since 09-01 (84); 4th-10th: 61.8% since 09-01 (131); 31st or later: **88.6%** (44) | repeating a template raises first-pass; the 31st-or-later group is one creator's later markets |
| Weekly position, since 09-01 | 1st in ISO week 49.7% (155) vs 2nd or later 56.8% (278) | the oracle does not penalise multiple per week |
| Time of day | UTC 6-12: 59.9% (162); 18-24: 44.0% (91) | weak; not used |
| Review regime | reject share Aug 18.4%, Sep 4.3%, Oct 6.8%; approve share Aug 34%, Sep 48%, Oct 63% | the reviewer improved or creators learned the template; assume the Oct rate, expect drift |
| Heavy creators (>20 markets) | 3 creators, 131 markets (117 since 09-01), approve 57.3% since 09-01 vs others 53.2% (316) | templating helps modestly |
| Rewrite content | 72% of update notes add absolute date and time; 46% add void/postponement logic; 30% fix sources; 29% define thresholds | these four are the cheapest checks to automate |
| Rejection causes | junk 18, duplicate 9, ambiguous 6, past event 5, bad source 4, non-binary 4 | duplicates and past events are fully deterministic checks |

Cost of the review path (H arithmetic on the above): expected fee per live market since 09-01 = $1.00 / 0.901 = **$1.11**; per immediately-live market (first pass) = $1.00 / 0.543 = $1.84. Updates cost nothing extra (`respondToUpdateRequest` is paymaster-allowlisted).

---

## 8. Proposed deterministic pre-flight checklist (extends the offline lint; I did not touch `src/create/lint.ts`, which does not exist yet)

Severity: **BLOCK** (do not send; deterministic and evidence-backed), **WARN** (send only after the user accepts), **INFO**. "Ev." gives the evidence.

### 8.1 Metadata JSON shape (all deterministic)

| ID | Check | Sev | Ev. |
|---|---|---|---|
| M01 | Parses as UTF-8 JSON object with exactly the nine keys `title, description, category, tags, subcategories, image_url, rules, resolution_sources, outcomes` and the types in section 3.1; extra keys WARN | BLOCK | 138/138 uniform |
| M02 | `outcomes` has exactly 2 entries with ids `0,1`, non-empty distinct titles; prefer `Yes`/`No` | BLOCK / INFO | 138/138; Yes/No 111/138 (96% of approved sample) |
| M03 | `rules.outcomeRules` has exactly 2 entries `outcomeIndex 0,1`, each rule 20-420 chars (WARN outside) | BLOCK on count and indices | 138/138; observed 10-414 chars, median 103 |
| M04 | `category` in the observed set `{SPORTS, CRYPTO, FINANCE, POLITICS, TECH, CULTURE, SOCIAL, MENTIONS, OTHER, WEB3, SCIENCE, LEGAL, WEATHER}`; `subcategories` has 1-2 names | WARN if unknown | Data API 493 |
| M05 | `tags`: 3-5 short strings (empty allowed but INFO) | INFO | originals 100/100 non-empty; oracle versions empty and activate |
| M06 | `image_url` present, https, resolvable offline format; hosting acceptance unknown | WARN | 138/138 XO bucket |
| M07 | `resolution_sources`: 1-6 distinct https URLs, no placeholder domain (`example.com`, `localhost`, raw IP) | BLOCK on placeholder | reject 10-02 |
| M08 | `title` ends with `?` or states a comparator and date; every number, date and entity in the title also appears in `rules.description` | WARN | oracle changed titles in 10/38 |
| M09 | `rules.description` length 300-2,700 chars | WARN | originals: min 38, p10 465, median 664, p90 915, max 2,616 |
| M10 | no URL, handle or personal data of a private individual in any text field | BLOCK | privacy policy |

### 8.2 On-chain parameters

| ID | Check | Sev | Ev. |
|---|---|---|---|
| C01 | `collateralToken` equals USDC.e `0x80c12230ce677e6f304027a14780Edd2A829ab0c` | BLOCK | contract check |
| C02 | `startsAt` within +/-60 s of chain time; `startsAt <= expiresAt`; `expiresAt >= now + 1 h` | BLOCK | 585/585 within -29..+43 s |
| C03 | `metaDataURI` is https, UUID-named `.json`, <= 200 chars (contract has no limit; XO's own are 96-105) | WARN | 585/585 https and UUID; lengths measured on the 138 fetched |
| C04 | Every explicit calendar date in `rules.description` is within 24 h of `expiresAt` (UTC) | BLOCK | oracle message "user cutoff differs by more than 24h" |
| C05 | Horizon: BLOCK > 365 days without human OK; WARN < 1 day and > 120 days | per left | 40% / 38% first-pass; 2029-market reject |

### 8.3 Content rules derived from review reasons

| ID | Check | Sev | Ev. |
|---|---|---|---|
| R01 | Binary: exactly two mutually exclusive, exhaustive outcomes; if the event can end level (football 1X2, ties) the rules must say what a draw resolves to | BLOCK | 4 rejects (no draw, two binaries) |
| R02 | Future event: no date in rules or title earlier than now; the event start/kickoff time (parsed) is after now + 1 h | BLOCK | 5 rejects |
| R03 | Absolute cutoff present: a date AND a clock time AND a timezone (e.g. "23:59 UTC on 2026-12-31") | WARN (BLOCK for crypto) | 72% of update notes |
| R04 | Sources: >= 1 primary named with URL in rules, a named fallback, a precedence sentence ("the primary source governs"), and an unavailable-source clause | WARN | 30% of updates; 4 rejects |
| R05 | The primary source publishes the metric (crypto: CoinGecko/CoinMarketCap/Dexscreener/Binance page named, price type close vs touch, pair, chain and contract address; sports: official league or federation site) | WARN | rewrites of crypto markets |
| R06 | Void/edge clauses for cancellation, postponement beyond a fixed cutoff, abandonment, no-contest or walkover, source correction; prefer "if not X by <cutoff>, resolves No" to open-ended void | WARN | 46% of updates |
| R07 | Thresholds: numeric value, unit, comparator (at least vs more than), reference time and snapshot rule stated | WARN | 29% of updates |
| R08 | Entities: league, season, round or matchweek, both teams, kickoff time; tokens by contract address and chain; social posts by official account and platform list | WARN | MODRA "Changes needed" lists |
| R09 | Duplicate scan against live markets (Data API `search=` over title tokens; compare event key = entities + date + threshold); block on a match with the same outcomes | BLOCK | 9/51 rejects |
| R10 | No mention of XO or its metrics | BLOCK | 1 reject |
| R11 | Prohibited topics per Annex A section 5 (violence, self-harm, personal data) via keyword blocklist plus manual flag | BLOCK | ToS |
| R12 | Objective, archived, publicly verifiable resolution; no outcome that hinges on subjective reading of footage or an unarchived stream | BLOCK | reject 10-08 |
| R13 | Not a composite of independent claims ("two binaries in one") | WARN | reject 10-03 |
| R14 | Key facts in rules, not in a thesis or note | WARN | reject 08-16 |
| R15 | Prefer a proven family template (sports 1-7 days, named fixture, kickoff, primary and fallback source): first-pass 85% vs crypto 33% | INFO | section 7 |

### 8.4 Operational gate before sending (not lint; belongs in the create tool)

| ID | Check | Sev |
|---|---|---|
| O01 | Smart account holds >= fee USDC.e (read the fee from the latest `MarketCreationFeeCharged` event; abort and ask if it is not 1,000,000 raw) plus the intended seed plus a buffer; allowance to the manager >= fee | BLOCK |
| O02 | Calls batch is exactly `[approve(manager, >= fee), createConvictionMarket]`, both allowlisted by the paymaster; no native balance needed | BLOCK |
| O03 | Cadence: count the account's own creations this ISO week from logs (`topic2 = creator`); default policy 1 per week (ToS), higher only on explicit user override | BLOCK by default |
| O04 | Catalyst badge: ask the user to confirm the account's profile shows `XO Catalyst`; if not, WARN with the ToS clause | WARN |
| O05 | Non-idempotent: persist an intent hash (URI + times); before any retry, scan the creator's logs for the same URI; never auto-retry; a lost response is reconciled, not resent | BLOCK |
| O06 | After inclusion: parse `CLOBMarketCreated` from the receipt (conditionId, token ids); poll `MarketReviewed` every 60 s for 30 min then every 5 min for 12 h | - |
| O07 | UPDATE_REQUIRED: fetch `suggestedMetaDataURI`, diff against the original, require invariants (numbers, dates, entities, outcome meaning unchanged) or explicit human approval, accept before `suggestionExpiresAt` minus 10 min, else decline | BLOCK on drift |
| O08 | Seed only when orderbook `active: true`; stake >= $10, price 0.05-0.95, GTC; retry on 422 "market is not active" with backoff | - |
| O09 | Kill switch: if creation reverts with an access-manager error the selector is closed; stop, record capability closed, do not retry | BLOCK |

---

## 9. Task item 4: creation costs end to end (H unless noted)

- **Fee:** 1,000,000 raw USDC.e (6 decimals) = $1.00 in 585 of 585 events; read at call time from `CONFIG_MANAGER.collateralConfig(token).marketCreationFee`, transferred to the treasury by `safeTransferFrom(msg.sender, ...)`, non-refundable after reject, cancel, void or expiry (NatSpec). A fee of zero would skip the transfer.
- **Batch:** 13 of 13 decoded creation UserOps (12 sampled txs plus the last creation tx; 6 first-time creators, 6 repeat) have the shape `[USDC.e.approve(manager, 2^256-1), manager.createConvictionMarket(...)]` as a Kernel `execute` batch (mode `0x01...`). XO's app re-sends the unlimited approve every time, even for repeat creators. A capped approve of exactly the fee would also satisfy the contract (source), but no such approval is observed on-chain (M).
- **Gas sponsorship:** all 13 ops carry paymaster `0x2353b23d8f329fd3cec0d21652f14208248a439d` with `paymasterAndData` length 52 bytes (20-byte address + two 16-byte gas limits, empty `paymasterData`), `maxFeePerGas = maxPriorityFeePerGas = 0`, `initCode` empty (the smart account already exists, also for first-time creators), signature 65 bytes (raw ECDSA by the owner, root validator in the nonce key `0x845a...`). Gas: `callGasLimit` 785k to 1.05 M; single-op `handleOps` txs use 870k to 990k gas at 5 gwei (about 0.0045-0.005 XO), bundles of 2 to 3 ops up to 2.2 M; some bundles show gas price 0. Paid from the paymaster deposit, not by the creator. Per-sender cap 10,000 per day and the allowlist (global `approve`, `createConvictionMarket`, `respondToUpdateRequest`, `cancelMarket`, `redeemPositions`, ...) are from [03 V8]. The sponsorship is demonstrated only for accounts created in XO's app (all 585 creators).
- **Balances for an attempt:** USDC.e >= $1.00 for the fee; the app additionally requires a seed stake >= $10 for the order (a position, not a fee). Trading must be enabled for the seed (USDC.e approve and `setApprovalForAll` to the CTF Exchange, both sponsored). No native XO balance needed for XO-app accounts. So the minimum wallet for create-and-seed is about $11.00 plus any further liquidity wanted.
- **Total per live market:** $1.11 expected fee (section 7), plus the seed stake, plus nothing for gas. Updates cost nothing; `cancelMarket` while PENDING loses the $1.
- **Not established:** foreign-account acceptance by XO's bundler and paymaster (any sender passes the on-chain policy; the bundler is unknown); the allowlist and cap are owner-controlled and can change.

---

## 10. What an agent-operated account can do on its own

| Step | On its own? | Basis |
|---|---|---|
| Call `createConvictionMarket`, pay $1, be sponsored | Yes at contract level; needs an XO-accepted Kernel account (gate 3) | H (source, 585 calls); account acceptance NOT ESTABLISHABLE |
| Obtain a metadata URI | **No documented way.** XO's app uploads JSON and image to XO buckets; own-hosted URI untested | H absence of docs, NOT ESTABLISHABLE acceptance |
| Read review outcome, reasons and suggested JSON | Yes, public GETs (explorer logs, Data API, bucket) | H, validated |
| Accept, decline or cancel | Yes, sponsored UserOps signed by the owner | H source; allowlist [03 V8] |
| Place the seed | Needs orderbook HMAC credentials and `active: true` | docs; gate 1 |
| Meet the ToS creator rules (badge, 500 CP, streak, 1 per week) | Not by itself; not enforced on-chain or, apparently, in practice | section 6 and section 11 |

Practical read for the build: the agent can run the whole creation lifecycle except the first step (hosting) with public data. The cheapest decisive experiment, which only the user can run, is one $1 creation whose `metaDataURI` points to a self-hosted copy of a known-good XO-schema file (same nine keys), then observe `MarketReviewed` and whether the Data API row fills `title`/`rules`. If the indexer or oracle does not accept it, creation stays a human-in-the-loop flow using XO's own UI for the upload step.

---

## 11. Enforcement evidence for the ToS creator rules (M)

- Weekly limit: 364 of 585 creations were the 2nd or later by the same creator in an ISO week; max 19 in one week by one creator; max 14 in a day; 113 of 221 creator-weeks had more than one. Creators: 132; 56 made one market, 51 made 2-5, 22 made 6-20, 3 made more than 20 (max 70).
- Catalyst badge: in detail views for 36 distinct creators of ACTIVE markets, 15 show `XO Catalyst` in `achievements` and 21 do not (19 of those in tier Spectator, median 59 CP; current CP can fall after spending, so CP alone proves nothing). The list route returns empty `achievements` for everyone, so only the detail route is informative. The achievement display could be incomplete.
- Conclusion: the badge and weekly rules are either enforced only on a path I cannot see (XO's upload/creation API) or not enforced. NOT ESTABLISHABLE WITHOUT XO which.

---

## 12. Corrections and additions to earlier notes

1. [03 V3] "none yet 14": all 14 are `MarketCancelledByOwner` within 30 minutes of creation. No market currently awaits first review. 
2. [03 §2.6], gate 5 "metadata at an XO-owned bucket": two buckets, GCS until 2026-10-13 17:06 and S3 from 11:46 the same day.
3. [02]/[10] "reviewStatus null": true for list rows; detail/slug rows carry the first decision, plus `convictionSeed`.
4. 585 versus 505: resolved (80 CANCELLED = 51 + 15 + 14).
5. "40.8% update-required" is not a failure rate: 93.6% of updates were accepted.
6. Phase 0 "orders on PENDING markets are rejected": consistent with docs and with 0 of 33 early fills, but XO's own seed pipeline appears to register in creation order (M).

---

## 13. NOT FOUND / NOT ESTABLISHABLE WITHOUT XO

- A documented or unauthenticated way to upload metadata JSON or cover image to XO's buckets (searched: all docs for `upload|bucket|metadata|ipfs|arweave|s3|pin`, both OpenAPI path lists; the root `docs.xo.market` only shows `metadataUri` as a response field).
- Acceptance of a non-XO `metaDataURI` by the oracle or indexer; whether `image_url` or `tags` may be omitted.
- Whether the Catalyst Badge, 500 CP and weekly limit are enforced anywhere (not on-chain; ToS says the Platform verifies badge status).
- Whether the XO bundler accepts a Kernel account created outside XO's app.
- Whether a PENDING market accepts a third-party seed order (docs: 422); authenticated order timestamps.
- The oracle's scoring rules, quality-score threshold and the model behind MODRA; whether reviewers are the same in November.
- The stability of the paymaster allowlist, the 10,000-per-day cap and the public role wiring.
- Bucket ownership proof (inferred from timing and naming only).

---

## 14. Suspicious content

None. I scanned every oracle note (585 reviews) and all 138 metadata JSON files with a pattern list (instruction verbs addressed to an AI, "ignore previous", system-prompt language, key/seed-phrase/transfer requests); four matches were benign ("instruction" in a MODRA sentence, "reveal" for a product reveal). Docs pages read contained no agent-directed instructions.

---

## Sources

- Docs (xo-docs MCP): `/legal/terms-of-service`, `/legal/privacy-policy`, `/product/products/create-a-conviction`, `/product/products/convictions`, `/product/trading/read-the-rules`, `/product/trading/fees`, `/product/rewards/conviction-points`, `/guides/market-lifecycle`, `/api-reference` pages for prices-history and markets, both OpenAPI path lists.
- Explorer (public GET): `explorer-mainnet.xo.market/api/v2/smart-contracts/<manager impl>` (ABI and source), `/api/v2/transactions/<hash>` (12 creation txs plus 1), `/api?module=logs&action=getLogs` for `MarketCreationFeeCharged`, `CLOBMarketCreated`, `MarketReviewed`, `UpdateRequestResponded`, `MarketCancelledByOwner`, `MetadataUpdated`, `MarketExpiryUpdated`. Manager proxy `0xE1654812Ac8896A69Efa3b6Aa71090E4b44Eb307`, implementation `0x60a10A0C0885628e413afFA4F62F3e942f11fcda`, paymaster `0x2353b23d8f329fd3cec0d21652f14208248a439d`, USDC.e `0x80c12230ce677e6f304027a14780Edd2A829ab0c`, EntryPoint `0x0000000071727De22E5E9d8BAf0edAc6f37da032`.
- Data API: `api-mainnet.xo.market/api/markets?marketType=4&take=50&page=1..11` (493 rows), `/markets/slug/<slug>` for 71 markets.
- Orderbook: `orderbooks.xo.market/prices-history`, `/book`, `/markets/{conditionId}`, `/live-activity/events/{conditionId}` (empty).
- Buckets (public GET): 111 GCS and 27 S3 metadata files.
- Scripts and derived data: `docs/research/fixtures/gaps/creation-and-metadata-onchain/` (`scripts/` with `RUN_ORDER.txt`; `conviction_outcomes.csv`, `schema_summary.json`, `exemplars.json`, `review_notes_reject.json`, `review_notes_update_required.json`, `pairs_detail.json`, `first_trade.json`, `seed_books.json`, `seed_detail_sample.json`, `sample_userop_summary.json`, `inline_analyses_output.txt`). Fixtures hold no wallet addresses, keys, emails or home paths; creators appear as `c001`..; notes have addresses and handles redacted.
- Prior notes read: `docs/phase0-gate-results.md`, `03-xo-lifecycle-funding-creation-policy.md`, `22-order-semantics-from-source.md` (only for the minimum-size context).

---

## Verification (2026-10-19)

Adversarial re-derivation by an independent verifier. Everything below was recomputed with new code (not the saved scripts) from the chain, the docs MCP and public GETs. Verdict: **the notes are highly reliable.** Of about 60 numbers and constants re-derived, all match except the items under "Corrected" (two statements) and "Additions" (things the notes do not say). Gate 5 stays **PARTIAL**; the one NOT ESTABLISHABLE item that became established is the public-role wiring (V1 below).

Verifier traffic (separate from the researcher's): User-Agent `insurance-markets-research/0.1` only; explorer 83 GETs, Data API 66, orderbook 26, GCS 7, S3 8, plus 15 JSON-RPC read POSTs (`eth_chainId`, `eth_call`, `eth_getStorageAt`, `eth_blockNumber`) to `rpc-mainnet-2.xo.market`, which answered keyless with HTTP 200 every time (the docs say an `api_key` is required; no 401/403 appeared, so the stop rule never fired). No write method, no PayBox tool, no `submit_feedback`, no contact with XO. The researcher's header line "no JSON-RPC call" describes the researcher only. Scratch scripts were not added to the repo (the append is the only edit); every recipe needed to repeat a check is given inline.

### V0. Confirmed by independent re-derivation (H)

| Claim in the notes | What I re-derived |
|---|---|
| Selectors `0x7f54a7a2`, `0x1de5facd`, `0xbdb83289`, `0x4cbe35ee` | `cast sig` over signatures built from the verified implementation ABI: identical. Also `updateMetadata(bytes32,string)` `0xa375765e`, `updateMetadataAndActivate` `0xdf369cff`, `updateExpiry` `0xd03e0a02` |
| All seven event topic0 values (section 1 and summary) | `cast keccak` over the ABI event signatures: identical, including indexed layout (conditionId, and creator for the creation/fee events) |
| Proxy `0xE165...b307`, implementation `0x60a1...fcda` | Explorer shows `eip1967` proxy with that implementation; `eth_getStorageAt` on slot `0x360894a1...2bbc` returns `0x60a10a0c...fcda`. Constructor args show the proxy was first deployed on `0x26cf065D...4413` and later upgraded (it is UUPS) |
| Fee 1,000,000 raw USDC.e in 585 of 585; emitter is the proxy; 132 creators; first 2026-08-14 11:07:07, last 2026-10-18 12:17:07 UTC | One `getLogs` call (topic0 only, `fromBlock=1`) returns exactly 585 rows (below the 1000 cap): all data = 1000000, collateral all `0x80c1...ab0c`, 585 distinct conditions and txs, 132 creators |
| 585 conviction creations, host split 564 GCS / 21 S3, first/last use, no ipfs/arweave/data:/http/own domain, UUID `.json`, 585 distinct URIs, length 96-105 | Full re-scan of `CLOBMarketCreated` (35 pages): 21,188 events, marketType 4 = 585 and set-equal to the fee events (and to their tx hashes); host split, first/last timestamps (GCS 08-14 11:07:07 to 10-13 17:06:15, S3 10-13 11:46:06 to 10-18 12:17:07) identical. **Zero** URIs outside the two buckets across all 21,188 markets of every type, not only type 4 |
| Type 2 split 1,753 GCS / 128 S3 (1,881 total); type 3 = 18,714 | My scan reaches block 12,592,600 (a few minutes later): 1,884 (1,756 / 128) and 18,719. Drift of new XO markets, not an error |
| Creators 56 / 51 / 22 / 3 (max 70); 364 of 585 are 2nd-or-later in the creator's ISO week; 221 creator-weeks, 113 with more than one, max 19 per week; startsAt minus block time -29..+43 s; horizon median 9.4 d, p10 0.52, p90 120.6, max 1,921 | Identical |
| First review APPROVE 287 (49.1%) / UPDATE_REQUIRED 233 (39.8%) / REJECT 51 (8.7%) / none 14; the 14 are exactly the 14 `MarketCancelledByOwner` conditions (none had a review); no conviction market was reviewed twice | Identical (MarketReviewed 2,449 events in total, 571 for conviction markets, 1,878 for the other market types) |
| Responses: 218 accepted, 15 declined (10 after the window lapsed), every accept inside the window; eventual ACTIVE 505 (86.3%); since 09-01: n 433, ACTIVE 390 (90.1%), first pass 54.3 / 38.1 / 5.3 | Identical. `UpdateRequestResponded.metaDataURI` equals the oracle's `suggestedMetaDataURI` in 218 of 218. (A scan that stops at block 12,592,700 sees 232; the 233rd response is at block 12,596,345.) |
| Windows: 48 h = 165, 26 h = 27, min 0.33 h, under 6 h = 5, under 24 h = 15 (counting about-24 h) | Identical |
| Latencies (create to first review median 9.9 / p90 166.3 / max 652.2, n 571; create to ACTIVE 13.1 / 310.5 / 1,570.8, n 505; accept 9.4 / p75 67.6 / p90 330 / max 1,534, 160 within 60 min, 93 within 5 min; owner cancel median 2.9, max 30.2; since 09-01 approve path 4.2 / 82.2, update path 26.7 / 542.9; by decision APPROVE 5.0, UPDATE 14.2, REJECT 25.7) | Identical |
| Oracle note regimes: admin stamp 115 (all APPROVE), MODRA format 99 / 12 / 3, auto summary 73 | Identical |
| Reject categories junk 18, duplicate 9 | Reproduced (bare `reject`, `rejected`, `test`, `dup`, `.` = 18; regex for duplicate wording = 9). Other categories not re-bucketed |
| Section 7 tables: by month (Aug 34.2 / 18.4 reject, Sep 48.4 / 4.3, Oct 62.7 / 6.8), horizon buckets, creator experience (40.2 n 132, 45.2 n 84, 61.8 n 131, 88.6 n 44), ISO-week position (49.7 n 155 vs 56.8 n 278), sports 71.7 n 269, crypto 32.9 n 76, finance 27.3 n 11, sports 1-7 d 85.0 n 107, heavy creators 3 / 131 markets (57.3 n 117 vs 53.2 n 316), UTC 6-12 59.9 / 18-24 44.0 | All identical. Note: the sports and crypto percentages are approve over (approve + update), rejects excluded, as section 7 says; the section 0 wording "pass first review" does not repeat that |
| Data API: itemCount 505, list returns 493, none of the 80 CANCELLED markets listed, 12 active ones hidden; list `reviewStatus` null and no `convictionSeed` in 493 of 493; list `achievements` empty in 493 of 493; detail `reviewStatus` equals the chain's first decision | 505 / 493 / 0 of 80 / 12 hidden; null 493 of 493; detail match 55 of 55 (the notes say 50 of 50). DB `createdAt` minus chain time median 1.7 s, p90 2.6, max 18.2; `createMarketBlockTimestamp` equals the block time 493 of 493 |
| Metadata schema: nine keys, `rules{description,outcomeRules[2]}`, `outcomes[2]` ids 0/1, no creator fields; Last-Modified 1-9 s before the creation tx; headers | 13 files fetched (5 GCS and 3 S3 originals, 2 oracle versions, 3 later-rewritten versions): all 13 pass every structural check; Last-Modified 2-6 s before the creation tx in 8 of 8; GCS `application/json`, `public, max-age=3600`; S3 JSON with no cache header; image URLs in the XO image buckets; oracle and rewritten versions have empty `tags`. Data API title, image, sources, outcomes mirror the JSON in 8 of 8 compared (and rules and description in the detail route), so the indexer does ingest the URI's JSON |
| Rewrite example (3% to 5%) | Pair re-fetched: original "close down 3% or more", threshold 7,429.65; oracle version "5% or more", 7,276.46, new title "Will 19 Oct 2026 be another Black Monday?"; the oracle's own note says so. Expiry unchanged in this pair. Real semantic change, H |
| Creation UserOp shape | 4 txs decoded from scratch (creation #3 on 2026-08-14 and the last creation on 2026-10-18, both the account's first-ever conviction creation; #201 on 2026-09-04 and #401 on 2026-09-30, repeat creators): `to` = EntryPoint `0x0000...a032`, `handleOps` `0x765e827f`, batch `[USDC.e.approve(manager, 2^256-1), createConvictionMarket]`, sender = the creator in the event, `initCode` empty even for first creations, `paymasterAndData` 52 bytes = `0x2353...a439d` + two 16-byte limits, empty paymasterData, `maxFeePerGas` = `maxPriorityFeePerGas` = 0, signature 65 bytes, nonce key = type ROOT + validator `0x845adb2c...ce57`, mode first byte `0x01`; calldata `startsAt`/`expiresAt`/URI equal the event. Gas used 870,220 to 988,744 (gas price 0 or 5 gwei in the tx). Explorer names `0x2353...` **PolicyPaymaster**, verified |
| Updates and cancels are sponsored | 3 more txs decoded (accept, decline, cancel): single-call Kernel execute (mode first byte `0x00`; executionCalldata = target(20) ++ value(32) ++ calldata) to the manager, same paymaster, empty paymasterData, `initCode` empty |
| Seed (Data API detail route) | 55 random detail rows: buy side 54 of 54, price 0.01-0.95, status `resting` 52 / `spent_tombstone` 2, stake exactly $10.00 in 37 of 54, minimum 9.09 (same outlier as the notes). Order-id ordering: of 46 markets with an order id above 2^60, Spearman(orderId, creation) = 1.0000, (orderId, activation) = 0.9993; of 4 pairs whose creation order differs from activation order, 4 follow creation order, 0 activation order |
| No fill before activation | 14 more markets (7 approve, 7 update-accepted): first price-history point is 897 s to 3.5 M s after activation, 0 negative, 2 with no points |
| Orderbook registers non-active markets with `active:false` | 4 of 4 cancelled (2 rejected, 1 declined, 1 owner-cancelled) `active:false`; a live approved market `active:true`. Nuance: an approved market that has since expired (CLOSED) is also `active:false`, so `active:false` alone does not mean "pending" |
| Catalyst badge not visible on many creators | 37 distinct creators of the 55 detail rows: 13 show `XO Catalyst`, 24 do not (notes: 15 / 21 of 36). M, same conclusion |
| NOT FOUND: no upload route | Docs tree grep for `upload|ipfs|arweave|pinata|bucket` matches only unrelated pages. `paths` of the Data API OpenAPI (30 GET paths) and the orderbook OpenAPI (42 paths; the write routes are auth/api-key, books, heartbeats, v1/heartbeats, order, orders and the batch price routes, plus the DELETE cancel routes) contain no create-market, metadata or upload route. The Data API spec names `https://api-mainnet.xo.market/api` and a limit of 100 requests per 10 s per IP |
| Orderbook/lifecycle docs: orders on Pending get 422 `market is not active (status: Pending)`; fees page "Creation charge Currently $1.00", "Seed order At least $10.00" | Confirmed in `/guides/market-lifecycle` and `/product/trading/fees` |
| Contract logic in section 1 | Read from the verified implementation: `createConvictionMarket` is `restricted nonReentrant whenNotPaused`; `_createMarket` checks only `expiresAt > now`, `startsAt <= expiresAt`, collateral = exchange collateral and allowed; no URI check; NFT minted to `msg.sender`; `resolver = XO_ORACLE`, `creatorFeeBps = 0`, status PENDING; fee `safeTransferFrom(msg.sender, treasury, fee)`; review decisions and the `suggestedExpiresAt > now` revert; accept needs `now < suggestionExpiresAt`, decline has no window; `cancelMarket` only from PENDING; enum order for ReviewDecision, MarketStatus, MarketType. The NFT contract (`XOMarketNFT`) stores the URI with `_setTokenURI` and no validation either, so "the contract validates nothing about the URI" holds at both levels |
| ToS quotes (section 6) | Re-read in `/legal/terms-of-service.mdx`: every quoted clause is verbatim (General Terms: automated bots, scrape, reverse engineer, vulnerabilities, wash trading, influence-over-outcome, void 50/50, gas "solely responsible", indemnity (d), termination "with or without cause"; Annex A: Catalyst Badge required (3.a), one market per calendar week (3.b), admin review (3.c.i), sole-discretion revocation and "circumvent Catalyst Badge restrictions" (4.b), "replace, remove, or otherwise change the market creation feature" (Annex clause on modification)). The ToS has no date line; the privacy policy says "Last Updated: 6/5/2025" and contains the "Do not include personal data" sentence. No clause names AI agents or programmatic creation (the two "AI agents" mentions concern MODRA resolution) |

### V1. Upgraded from NOT ESTABLISHABLE to established (H, as of block 12,610,509)

The notes list "public-role wiring of the creation selector" among the unknowns. Reading it directly: `authority()` on the manager (`0xbf7e214f`) returns the AccessManager `0x414ea2da101008fc9d59fb4ec43431910cb936f5`. `canCall(address,address,bytes4)` (`0xb7009613`) with caller = the arbitrary address `0x...dEaD` (not a participant in any XO flow I looked at), target = manager:

| Selector | Result `(immediate, delay)` |
|---|---|
| `createConvictionMarket` `0x7f54a7a2` | **(true, 0)**: any address may call it today |
| `createConvictionMarketFor` `0x507cedd3` | (false, 0): restricted to XO infrastructure |
| `respondToUpdateRequest`, `cancelMarket`, `reviewMarket` | (false, 0): not `restricted`; guarded by `onlyMarketOwner` (NFT holder) and `onlyXOOracle` instead |

So neither the Catalyst Badge nor any role is enforced at the manager for creation. What remains NOT ESTABLISHABLE is stability (XO can re-point the selector) and anything enforced off-chain (XO's upload/bundler backends). The source comment says the same: "`restricted` but wired to `PUBLIC_ROLE`, so in practice open to everyone: the creation fee is what gates spam." Build use: run this `canCall` as a pre-flight (it is an `eth_call`) before every send; `false` means the selector was closed and `AccessManagedUnauthorized` would revert the batch.

### V2. Corrected

1. **Section 2, bullet "Data API view" (metadataUri equals the accepted URI, 218 of 218).** The on-chain half is right (re-derived above). The Data API half is wrong as stated. Of the 493 listed rows, 442 have `metadataUri` equal to the accepted URI (the original on the approve path, the oracle's suggestion on the update path) and **51 do not** (17 of 282 approve-path rows, 34 of 211 update-path rows). In 5 of 5 spot checks the Data API value equals the latest on-chain `MetadataUpdated.newURI`: the oracle-only `updateMetadata` (valid in any status except CANCELLED, CLOSED, VOIDED_CLOSED) was called 30 minutes to 7 hours after activation (one market has 3 such events). Correct statement: the Data API follows the latest on-chain URI, and XO rewrites it after activation for at least 10.3% of listed conviction markets. The rewritten files I fetched (3) still match the nine-key schema, with empty `tags`. The build must treat an accepted JSON as not final, watch `MetadataUpdated` (topic0 `0xe36c73fd...b7bd`, topic1 = conditionId; data word 0 is the string offset), and re-run the diff guard on each new URI.
2. **Section 5, "71 of 71 have one" and the stake range.** In my random sample of 55 detail rows, 54 have a non-null `convictionSeed.commitment` and 1 (a VOIDED market created 2026-10-13) has `convictionSeed = {conditionId, creator, commitment: null}`. So "always present" should read "present except at least one VOIDED market". The upper end of stakes is not $500: my sample has a $5,000 stake (37 of 54 are exactly $10.00, 69%, close to the notes' 65%). The seed object also carries the creator address. The docs' 5c-95c bound is not an invariant either (a 0.01 seed exists; the notes already record 0.01-0.95).
3. **Section 3.4 and section 8 O07: "`suggestedExpiresAt` equals the existing expiry in 35 of 38 pairs (mostly an echo)".** True for the sample, but it understates a field that acceptance applies: `respondToUpdateRequest(accept)` sets `expiresAt = suggestedExpiresAt` when non-zero. Over all 233 update requests the suggested expiry equals the on-chain expiry in 211, is **earlier in 17** (down to -12,456 h, about 519 days; several about 184 days) and **later in 5** (up to +1,008 h). So accepting changes the contract's end date in 9.4% (22 of 233) of cases, and that change is not visible in the JSON. O07 must compare `suggestedExpiresAt` with the current `expiresAt`, not only the JSON.

### V3. Additions: facts the notes do not state (build-relevant)

1. **`createConvictionMarketFor(address creator, uint40, uint40, address, string)` exists** (`0x507cedd3`, `restricted`, per its NatSpec "Charges no creation fee ... indistinguishable from a self-created conviction ... Only the absent `MarketCreationFeeCharged` event differs"). It is XO-infrastructure only (canCall false for ordinary addresses) and has never been used for a conviction market (type-4 events equal fee events one-for-one, 585 = 585), but XO can sponsor fee-free creation. Do not infer "creation happened" from the fee event alone; use `CLOBMarketCreated` (topic2 = creator) for reconciliation (O05).
2. **Read the fee from config, not from the last event.** `CONFIG_MANAGER` = `0x7bff30281075ee095a3bdf14a70a36daed9075b1` (read from the manager's `CONFIG_MANAGER()` getter). `collateralConfig(USDC.e)` (struct order in the manager's interface source: `allowed, minInitialCollateralAmount, minCreatorFeeBps, maxFeeCollateralAmount, maxCreatorFeeBps, minTradeSizeInCollateral, maxTradeSizeInCollateral, marketCreationFee`) returned `1, 5000, 200, 5000, 200, 100000, 5000000000, 1000000` at block 12,610,509. So `marketCreationFee = 1000000` today (H), and this `eth_call` is the right O01 input because the contract reads the same value at call time.
3. **Creator account must be able to receive an ERC-721.** The market NFT is minted with OpenZeppelin `_safeMint(to, tokenId)`, which calls `onERC721Received` when `to` is a contract. A smart-contract creator without that handler would revert the whole batch; an EOA, or a Kernel account (XO's own), is fine. Check this before using a third-party smart account (gate 3). The NFT is transferable and `respondToUpdateRequest`/`cancelMarket` follow the current NFT holder.
4. **Single-call and batch encodings.** Creation uses Kernel batch mode (first mode byte `0x01`, executionCalldata `abi.encode((address,uint256,bytes)[])`); respond and cancel use single mode (first byte `0x00`, executionCalldata = target(20) ++ value(32) ++ calldata). Both are sponsored with empty paymasterData.
5. **Event data layouts (so the decode is repeatable).** `CLOBMarketCreated` data words: 0 questionId, 1 outcome1TokenId, 2 outcome2TokenId, 3 collateral, 4 resolver, 5 startsAt, 6 expiresAt, 7 creatorFeeBps, 8 offset(metadataURI), 9 marketType. `MarketReviewed` data words: 0 decision, 1 offset(suggestedMetaDataURI), 2 offset(extraNotes), 3 suggestedExpiresAt, 4 suggestionExpiresAt. `UpdateRequestResponded`: 0 owner, 1 accepted, 2 offset(uri). `MetadataUpdated`: 0 offset(newURI).
6. **Docs conflict on void settlement.** The ToS says voided markets settle "50/50 ... regardless of position taken"; the docs page `/guides/market-lifecycle` says Voided: "positions refund pro-rata". The risk "seed lost to a 50/50 split" should cite both and treat the loss as bounded by the seed either way.
7. **ToS Annex A 3.c.ii** lists "duplicate or substantially similar markets" among the admin checks (supports R09), and 3.d says creation CP rewards accrue only after approval.
8. **Upgradability.** The manager proxy is UUPS and was already upgraded once (initial implementation `0x26cf...4413`). XO can change creation rules by upgrade as well as by re-pointing the role; creation also depends on `whenNotPaused`. The kill-switch list (O09) should include a pause revert and any new revert reason, not only `AccessManagedUnauthorized`.

### V4. Not verified (left as the notes state them)

- Counts that need 20 or more further explorer pages: the 20,989 `MetadataUpdated` events (topic0 verified; per-market events observed), and per-file statistics over all 138 files (I fully checked 13).
- Section 3.3 keyword shares: my cruder regexes give date/time 72.2% and void 45.8% (match), but entity 35%, source 27%, threshold 24%, draw 10% against the notes' 52 / 30 / 29 / 18. These shares are regex-dependent; use them as ordering only (M). The terse versus substantive split is 89 / 144 with my rule against the notes' 86 / 147.
- Bucket ownership (still M: names, timing and the oracle's own suggestions only), acceptance of a self-hosted URI, XO's bundler acceptance of a foreign account, third-party seed acceptance on a PENDING market, MODRA scoring: all remain NOT ESTABLISHABLE WITHOUT XO and nothing public contradicts them.
- Request counts quoted in the notes' header (cannot be audited from outside).

### V5. Privacy, secrets, suspicious content

- Scan of the notes, all 34 saved scripts and fixtures for email-like strings, home paths, the user's names, wallet addresses (the 132 creator addresses and 122 creator wallets/usernames seen in the Data API were checked as literals), social handles and any address other than the six public protocol addresses: **0 hits**. The `pairs_detail.json` condition ids are partly masked by an anonymiser (`0x<addr>` plus 24 hex); harmless. Nothing was scrubbed because nothing was found.
- No key, token or credential appears in the notes or fixtures; the RPC host needed none.
- Oracle notes (all 585 reviews) and 13 metadata files scanned for agent-directed instructions: none (only benign source URLs). Agrees with section 14.

### V6. Effect on the gate and constants

- Gate 5: PARTIAL, unchanged. Remaining blockers are the ones in section 13 (hosting/upload route, foreign-account acceptance, seed on Pending, off-chain enforcement); the public-role question is now answered (open today).
- No constant changed. New constants to add if wanted: AccessManager `0x414ea2da101008fc9d59fb4ec43431910cb936f5`, CONFIG_MANAGER `0x7bff30281075ee095a3bdf14a70a36daed9075b1`, XO_ORACLE `0xdb3206bde18aebd1b84657b98b9e0f55e0f95648`, market NFT proxy `0x83933bf3af4bd7f0cca2e776ef9b55851c0ed098` (implementation `0xf214AA7f356065F97375c9f762F3c2388c92A319`, verified `XOMarketNFT`), `createConvictionMarketFor` `0x507cedd3`, Kernel single-call mode byte `0x00`.
