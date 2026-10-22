# Shared SDK and markets API

Status: steps 1 and 2 done on 2026-10-21; the rest is proposal. What step 2 moved is in section 9 and in
`sdk/README.md`.

## 1. The decision

The aggregation, categorisation, linking, quoting and order-building logic is the product. The dApp, the
local Cockpit daemon, the PayBox plugin, the linker job and a hosted API are all clients of it. The PayBox
plugin is one distribution channel that unlocks access for a user's agent; it is not where the logic lives and
it never operates it on the user's behalf.

This reverses three standing rules, which must be amended when the work starts:

| Rule | Where | Becomes |
|---|---|---|
| "Anything hosted or operated by the author (proxy, agent, cache, push service...)" is refused | `docs/dapp-design.md` section 2.7 | We operate a read and quote API. We still operate no custody, no wallet, no signer and no agent with submit authority. |
| "Nothing the author operates" | `pm/README.md` binding rules | `sdk/` stays runnable by anyone with no service of ours. The API is an optional accelerator, never a dependency of local mode. |
| "We do not sell signals" | `docs/aggregation-design.md` | Unchanged for signals. We sell aggregated, normalised access and routing quotes, not forecasts. |

Every other binding rule carries over unchanged: exact decimals, unknown is never zero, untrusted text in fixed
slots, links only from the human-approved registry, restricted-terms data memory-only, flags default off,
capability facts "unproven" until a live test records "yes".

## 2. What exists today

The logic is already mostly shared in spirit but implemented several times over.

| Concern | Implementations today | Consequence |
|---|---|---|
| Venue readers | `app/src/venues/` (15 venues, injected fetch, browser-safe), `pm/adapters/` (XO, Polymarket, Kalshi), `pm/recorder/venues/` (XO, Polymarket, Limitless; used by the linker) | Three parsers per venue for Polymarket and XO; fixes land in one and not the others |
| Rules fingerprint | `app/src/core/rules-hash.ts` and `pm/core/rules-hash.ts` with different recipes | Proposed links show the rules comparison as unavailable in the dApp |
| Categories | `pm/core/category.ts` plus a byte-identical copy in `app/src/core/category.ts`, held together by a hash test | Works, but a copy is a workaround for a boundary, not a design |
| Domain types | `pm/types.ts` and `app/src/core/ports.ts` (the latter says it will be replaced "when pm-core ships") | Two `VenueId` unions, two `Market` shapes |
| Order builders | `src/xo/signing`, `src/clob/` (already shared with the app through the `@shared/` alias) | The good pattern; keep it |
| Credentialed request signers | `src/xo/signing/hmac.ts`, `src/clob/polymarket/l2.ts`, `src/clob/limitless/hmac.ts` | Correctly fenced out of the page by `app/scripts/check-boundaries.ts` |

Rough size: about 34k lines under `app/src/venues` and `app/src/core`, 25k under `pm/` (non-test), 15k under
`src/xo` and `src/clob`.

## 3. Target layers

```
                        +-------------------------------------------------------------+
                        |  sdk/   isomorphic, pure, no secrets, no Node built-ins,     |
                        |         no disk; fetch, clock and hash are injected          |
                        |                                                              |
                        |  model     VenueId, Market, Book, Dec, Untrusted, Prov       |
                        |  money     rational, exact decimals                          |
                        |  venues    one reader per venue (from app/src/venues)        |
                        |  books     normalise, fees, depth walk, quote, edge labels   |
                        |  category  the fixed taxonomy and matcher                    |
                        |  rules     ONE rules fingerprint recipe                      |
                        |  links     schema, lookup, tiers, linker scoring             |
                        |  trade     unsigned order builders and decoders (XO, CLOB)   |
                        |  signals   Quotient body validation only (no fetching)       |
                        |  chain     one RPC port, per-venue event decoders, readers   |
                        |  health    venue state, field sources, the source ladder     |
                        +----------------------------+--------------------------------+
                                                     |
                        +----------------------------+--------------------------------+
                        |  sdk/node/   Node only: credentialed request signers,        |
                        |              vault, audit writer, sqlite recorder           |
                        +----------------------------+--------------------------------+
                                                     |
   +-----------+   +-----------+   +---------------+ | +-----------+   +------------------+
   |  app/     |   |  bridge/  |   |  src/ plugin  | | |  relay/   |   |  api/  (new)     |
   |  dApp     |   |  Cockpit  |   |  PayBox tools | | |  per-owner|   |  hosted reads,   |
   |  (sdk)    |   |  (sdk+    |   |  local mode:  | | |  XO trade |   |  quotes, groups, |
   |           |   |   node)   |   |  sdk in proc  | | |  submit   |   |  route prepare;  |
   |           |   |           |   |  API mode:    | | |           |   |  metered (keys,  |
   |           |   |           |   |  calls api/   | | |           |   |  x402)           |
   +-----------+   +-----------+   +---------------+   +-----------+   +--------+---------+
                                                                                |
                                                          pm/linker (job) writes groups
```

Rules for `sdk/`:

- Imports nothing from `app/`, `bridge/`, `relay/`, `src/tools`, `src/local` or `pm/` (it is the bottom layer).
- No `node:` imports outside `sdk/node/`. Hashing uses viem's isomorphic `sha256`, which is already a dependency.
- No module reads an environment variable. Flags and policy arrive as arguments.
- Every network call goes through an injected `fetch`; the browser passes its guarded fetch, the daemon passes
  its proxy fetch, the API passes a server fetch with caching.
- No secrets. Anything that takes a credential lives in `sdk/node/` and stays forbidden to the page.

Packaging: the repo rule against running `pnpm install` at the root locally means no new workspace package
yet. `sdk/` is a plain folder reached through a path alias (`@sdk/*`), the same way the app already reaches
`src/` through `@shared/*`. Publishing it as an npm package is a later build step, not a prerequisite.

## 4. The markets API

A hosted HTTP service built only from `sdk/` and `sdk/node/`. It serves what is expensive or impossible to do
from a browser tab or an agent sandbox: fan-out across venues, cross-venue grouping, depth-aware quotes, and
caching.

| Endpoint | Returns | Built from | Tier |
|---|---|---|---|
| `GET /v1/venues` | Registry, capabilities, licence class, health | registry | free |
| `GET /v1/markets?category=&venue=&q=` | Normalised open markets across servable venues | venues, category | free, rate limited |
| `GET /v1/markets/:venue/:id` | One market, rules fingerprint, book | venues, books, rules | free, rate limited |
| `GET /v1/groups` | Approved links, plus linker candidates labelled "proposed" | links | free |
| `GET /v1/quote?group=&side=&size=` | Depth-walked fill across the group's venues after fees, best venue first | books, links | paid |
| `POST /v1/route/prepare` | Unsigned typed-data orders, one per venue leg, with the decoded view | trade | paid |
| `GET /v1/stream/...` | Book and price changes for watched groups | venues, books | paid |

The router is non-custodial and stays prepare-only at first. The API returns unsigned orders; the user signs in
PayBox or their own wallet; submission happens where the user's venue credential already lives (the Cockpit
daemon or the plugin's local mode). Polymarket's order API needs the user's own L2 API secret on every submit,
so a hosted submit would make us the custodian of every user's trading credential. That is a separate,
later decision with its own security review.

Payment sits in `api/` middleware only; `sdk/` never knows about money.

- **x402 per call**, USDC on Base. A PayBox agent pays this natively through `use_service` and `pay_x402`, so
  listing the API as a PayBox service gives every PayBox agent paid access with no plugin code.
- **Subscription keys** for the dApp and for heavy users, checked before the handler runs.
- **Free tier** for the reads a person browsing the dApp needs, rate limited per key or address.

## 5. What the API must never serve

| Data | Why | Instead |
|---|---|---|
| Quotient responses | Its terms forbid sharing or reselling access (`docs/aggregation-design.md`, Terms section 6) | The user's own agent pays Quotient by x402 and the SDK validates the body in memory, as today |
| The six venues classed `own_use_only` (Kalshi among them) | Licensed for the reader's own use | Readable in local mode through the user's own daemon; never cached or served by us |
| The 13 venues whose licence is `unknown` | Unknown fails closed | Not served until someone reads the terms and records a class |
| Links as links | Only a person approves a link | Candidates are served, always labelled "proposed" with their score band |

Routing orders for other people and charging for it may carry venue-terms and regulatory obligations
(geofencing, acting as a broker). This needs a legal read before `/v1/route/prepare` is paid.

## 6. When a venue blocks the API

Assume any venue can rate-limit us, revoke a key or block the API's hosts without notice. The design treats
that as a normal state, not an outage.

- **Per-venue state.** `/v1/venues` reports each venue as `ok`, `throttled` (429 with Retry-After), `blocked`
  (repeated 401 or 403, or an HTML block page served with 200) or `chain_only`. The rule already exists in the
  browser (`app/src/core/budget.ts`: pause after three 429s or any 403, never retry around a block); it moves
  into the SDK so the API, daemon and dApp share it.
- **Field-level sources.** Every field carries its source (`venue_api`, `chain`, `cache`) and its age, as the
  `Prov` type already does for rows. When a venue is blocked, its rows keep every field the chain can supply.
  Fields only the venue holds, mostly the order book, become `null` with the reason. A last-known value is never
  shown as live.
- **Source ladder.** Each field is read from the venue's API first, then our own chain index, then the user's
  own client. The dApp in the browser or the Cockpit daemon reads the venue over the user's own connection in
  local mode. Local mode never depends on the API.
- **No disguise.** The API identifies itself honestly. It uses no rotating egress, no proxies and no spoofed
  headers to get around a block; the dApp design already refuses spoofed `Origin` headers. A block is answered
  by the ladder above and, where it matters, by talking to the venue.
- **Graceful loss.** A blocked venue drops out of quotes and route prepare, because there is no book to quote.
  It stays in the market list and in groups with its chain-derived fields, and the dApp says which venue is
  missing and why.
- **Tests.** The SDK test kit gets a fake venue for each state, including the 200-status block page, and every
  endpoint is tested against each.

## 7. On-chain data

Where a venue settles on a public chain, its contracts are the most durable source we have. A venue cannot
revoke our access to a public chain, and if one RPC provider refuses us, another provider or our own node
serves the same data. Chain data is also authoritative for settlement, which a venue API only reports.

Use the chain for what it holds authoritatively and cheaply:

| Fact | Where on chain, for venues built on conditional tokens | Why it matters |
|---|---|---|
| Positions and balances | ERC-1155 balances on the conditional-tokens contract | A portfolio with no venue key and no venue API |
| Fills, last trade price, volume | Fill events on the venue's exchange contracts | Volume we can verify; the research flags points-farmed volume on Opinion and Predict.fun |
| Resolution and payouts | Condition resolution and payout values on the conditional-tokens contract; the oracle adapter's events where the venue uses UMA | Settled outcome and claimable amount without trusting a venue status field |
| Market existence, outcome token ids | Condition preparation events | A discovery cross-check |
| Collateral, open interest | Collateral held by the exchange and conditional-tokens contracts | Venue size we can verify |

Do not use the chain for order books on hybrid venues. Polymarket, Limitless, Predict.fun, Opinion, Myriad's
order-book markets, SX Bet and XO match orders off-chain and settle on chain, so resting orders are not on
chain. Titles and rules mostly live off-chain too. Where an oracle adapter stores the question on chain, as
UMA's ancillary data does, it is a fallback title source and is still untrusted text.

| Venue | Chain | Easy to read on chain | Only off-chain | In the repo today |
|---|---|---|---|---|
| Trueo | Base 8453 | Everything: markets, prices, quotes from Uniswap v4 pools and the quoter | nothing | Chain-native reader in `sdk/venues/trueo`, over the one port in `sdk/chain/rpc.ts` |
| XO | XO chain 3223 | Settlement, account state, fee rates, upgrades | Book | Account, nonce, fee and upgrade readers in `sdk/chain/xo` (reached through `src/xo/chain`); positions, fills and payouts in `sdk/chain`, pinned in `sdk/chain/xo/pins.ts`; the Holdings view reads positions on chain |
| Polymarket | Polygon 137 | Positions, fills, resolution, payouts, UMA question data | Book | Conditional Tokens, both CTF exchanges, the Neg Risk adapter, two UMA CTF adapters and the Protocol V2 exchange, PositionManager and modules pinned with code hashes in `sdk/chain/polymarket`; positions, fills, payouts and V2 results read on chain; UMA question data not read yet |
| Limitless | Base 8453 | Positions, fills, payouts; AMM markets fully | CLOB book | Conditional Tokens, all six exchanges, their NegRisk adapters and wrapped collateral pinned in `sdk/chain/limitless`; positions, fills and payouts read on chain; a market's `venue.exchange` is still only checked against the list; AMM markets not read |
| Predict.fun | BNB 56 | Positions, fills, resolution (UMA for new markets since March 2026, per its help pages) | Book | Not built. Its API needs a key for every read, so the chain is the keyless path |
| Opinion | BNB 56 | Positions, fills, payouts through its CTF Exchange and ConditionalTokens | Book; the resolution decision comes from its own AI oracle | Not built; `/quoteToken` returns the exchange address |
| Myriad | BNB, Abstract, Linea, Celo | AMM markets fully; order-book fills | Order book | Not built; points-token markets must be filtered out |
| SX Bet | SX Network 4162 | Fills through the OBv3 escrow (address in `docs/venue-census.md`) | Book, behind a key | Not built |
| Rain | Arbitrum 42161 | AMM pools fully | nothing | Not built; almost no volume |
| Pascal | Solana | Program accounts | nothing | Readable only once its account layouts are published; not easy today |
| Hyperliquid outcomes | HyperCore | Not an EVM chain, so no RPC path | Everything, through its info API | API only |
| Kalshi, Novig, OG, Gemini, ProphetX, UDX, Polymarket US | none | nothing | everything | API or local mode only |

Every contract address is pinned in the SDK from the venue's published contract list and checked against the
deployed bytecode, as the Trueo constants already are. No address comes from market text, a model or an API
response without that check; Limitless's per-market exchange already works this way.

Shape in code:

- **`sdk/chain/`** holds one RPC port, merging today's two (`RpcReader` in `src/xo/chain` and `Rpc` in the Trueo
  reader), plus event decoders and readers per venue. Transport is injected, so the dApp can read a user's
  positions straight from a public RPC.
- **`api/indexer`** indexes logs on Polygon, Base, BNB and the XO chain into Postgres: fills, positions,
  resolutions and condition creation. Ponder is a candidate. Each chain gets several RPC providers, with a node
  we run as the last resort for the busiest chains.
- **The API** merges indexer rows with venue API rows field by field, as section 6 describes.

Before building, the event signatures and addresses of each venue's exchange and conditional-tokens contracts
must be read from verified source code. The research records them only for Trueo, XO and SX Bet.

## 8. What changes for each client

- **dApp.** Imports `sdk/` directly. Standalone build reads venues in the browser as today, or the API when a
  key is set. The category mirror, the second rules recipe and `app/src/core/ports.ts` disappear.
- **Cockpit daemon.** Unchanged role: holds credentials and the arm window. Its readers become `sdk/` readers.
- **PayBox plugin.** Two modes behind one tool surface. Local mode runs `sdk/` in process and is free. API mode
  calls `api/` and pays by x402. Moving the heavy work behind the API also shrinks `tools/list`, which already
  sits 6,423 bytes over the hosted limit with the relay tools on (`docs/unified-accounts-agent.md`, V3).
- **Linker job.** Uses `sdk/` readers and scoring instead of the recorder's readers. It writes candidates to
  the API's store as well as to the pull-request flow.
- **Relay.** Keeps per-owner XO submission. Its order building already comes from shared code.

## 9. Migration, in shippable steps

Each step leaves every gate green (root, pm, bridge and app typechecks and tests, app check scripts, Playwright).

1. **Commit the current working tree** so the move starts from a clean base.
2. **Create `sdk/` with the model.** Move domain types, money, category and one rules recipe (pm's rules-v2) into
   it. The app and pm re-export from it. Delete the category mirror and its hash test. Add `sdk/` to the
   boundary allowlist and a check that forbids `node:` imports in it. Done when the dApp's rules comparison
   works for linker candidates.
   *Done 2026-10-21.* Moved: `Dec`, `Untrusted`, `Result` and the full `VenueId` list (pm declares its subset with
   `satisfies`), isomorphic SHA-256 and canonical JSON, the decimal grammar, fixed-point and rational maths, the
   app's unit-tagged quantities, the category taxonomy, and rules-v2 with one rule-field builder per venue.
   Five rules recipes became one: the dApp's readers (XO, Polymarket, Limitless, Kalshi, UDX, Gemini, Trueo,
   Hyperliquid, Manifold) and pm all hash through `sdk/rules.ts`, and the dApp now re-checks a proposed leg's
   rules. Not yet merged: the two money APIs (`qty.ts` for the page, `rational.ts` for the engine) sit side by
   side in `sdk/money/`, and the rest of the read model (`Market`, `Book`, `Prov`) still lives in
   `app/src/core/ports.ts` and `pm/types.ts`; both move with step 3. Behaviour change: rules-v2 keeps markup as
   text and does not fold compatibility forms, so a Polymarket market with no description of its own (the
   event's is shown) has no fingerprint, exactly as the linker already treated it.
3. **Move the venue readers.** `app/src/venues` becomes `sdk/venues` (they already take an injected fetch).
   `pm/adapters` and `pm/recorder/venues` become thin wrappers or go away. Done when each venue has one parser
   and one fixture set.
   *Done 2026-10-21.* Every reader is in `sdk/venues/<venue>`: XO (with its Data API client, `sdk/venues/xo/api`,
   whose fetch and clock are now injected; `src/xo/{client,http,types,units}.ts` re-export it and supply the
   globals), Polymarket, Kalshi, Limitless, Trueo, Hyperliquid, Manifold, Pascal, Novig, OG, Gemini, SX, UDX and
   DefiLlama. The rest of the read model (`Market`, `Book`, `Prov`, the adapter interface) is in `sdk/model.ts`; the
   venue host registry is `sdk/venues/origins.ts`, from which the dApp's CSP and the Cockpit's read-proxy allowlist
   are built; Quotient's body validation is `sdk/signals/quotient` and its paid client stays in the app.
   `pm/adapters` (XO, Polymarket, Kalshi), the recorder's collectors and the linker's discovery keep their own
   HTTP, budgets and data-terms policy but parse only through the SDK, converting with `pm/adapters/from-sdk.ts`;
   a cross-check test pins that the rules hash a linker leg carries equals the dApp's for XO, Polymarket and
   Limitless. Each venue's recordings live once, in `sdk/venues/<venue>/fixtures` (the byte-identical research
   copies are gone; each research folder has a `MOVED.md`). Where two parsers disagreed the stricter one won, for
   example: crossed books are refused everywhere; an XO cancelled market is "unknown", not "voided"; Polymarket needs
   exactly two outcomes, reads its status from the last UMA entry and leaves the fee unknown when Gamma and the CLOB
   disagree; Kalshi needs its full envelopes. Not merged yet: the money helpers (`qty.ts`, `rational.ts`, `dec.ts`
   and pm's own) and pm's book, fee, tick and page shapes, which move with the books and fee engine in step 4.
4. **Move books, fees, depth walk, links and linker scoring** from `pm/core` and `pm/links` into `sdk/`.
   *Done 2026-10-22.* Links: the link registry's pure logic is `sdk/links` (record schema, tier caps, invariants, store, bundle, lookup,
   pin checks, the gold-set tooling, and `approve.ts`, still reached only from `pm/links/cli.ts`), and the linker's
   scoring is `sdk/linker` (features, blocking, pair scores, candidate inputs, the dApp dataset export). The SDK holds
   no platform registry, so which venues' terms allow keeping derived text is injected (`PersistenceTerms`);
   `pm/links` binds its registry's time-independent `termsAllowPersistence` and keeps the CLI, the registry file
   helpers and the shipped bundle, and `pm/linker` keeps discovery, state files, the run loop, the report and the
   Quotient check. The engine's view of a link (`LinkRef`, `BasisAxis` and friends) is `sdk/links/types.ts`. The
   dApp's `links.json` now has one contract, `sdk/links/dataset.ts`: the export checks each link against the schema
   the page parses with and leaves out by name any link the page would refuse, and both ends pin with the SDK's
   canonical JSON (which refuses non-integer numbers instead of serialising them).
   Money: one decimal grammar, `sdk/money/decimal.ts`, now sits under `amount`, `fixed`, `rational`, `qty` and
   `dec`, with one base-unit conversion, one comparison and one rounding (`roundDiv`); the XO read client, the
   plugin's XO and CLOB amounts, the relay's book prices and balances, the dApp's tickets, the Quotient units and
   pm's signal numbers call it instead of their own copies. Where copies disagreed the stricter won: trailing zeros
   count as places ("0.5340000" is seven) in anything a caller types, text is at most 40 characters, and 1 - p is defined
   for p in [0, 1] only. Values a venue sends are exact as written, so the XO read client and the recorder drop zero
   padding before the place check (`parseVenueDecimalToMicro`, `canonDec`) and still refuse a real extra place.
   Engine: the books and fee engine is `sdk/engine` (fee models, the per-venue `FeeSpec` builders, book normalisers,
   the depth walk and quotes, the basket walk, relation checks, the exact LP, gates and labels), with its tests beside
   it under the app's vitest; `pm/core/index.ts` re-exports it. pm's own read shapes are gone: `pm/types.ts`
   re-exports `Market`, `MarketSummary`, `Book`, `Quote`, `FeeSpec`, `Tick`, `Page`, `Provenance` and the adapter
   port from `sdk/model.ts`, the adapters return the SDK rows, and `pm/adapters/from-sdk.ts` is deleted. There is one
   `FeeSpec`: it names its venue and model and carries named decimal parameters (`rate` or `bps`, never both,
   `multiplier`, `exponent`, `buyBps`/`sellBps`, the `amm_stack` parts, `gas`); its id is derived, never stored
   (`feeSpecId`, `venue:model`), so a spec built for one venue never passes the registry check as another's. A
   `Book` carries its raw-order `convention` when the engine normalised it, and the engine re-sorts every book
   either way; tick ranges name their step `tick`; pages give `next`, null at the end. Behaviour changes: the XO
   reader states its fee once, in basis points as a decimal string (a `rate` beside it is ambiguous and the engine
   refuses it), so the dApp no longer shows a separate XO rate line; the unused `min`/`max` fee parameters are gone;
   `pm_get_quote` reports tick ranges as `{from, to, tick}`; and pm's markets now also carry the venue's untrusted
   `categoryNative`. Not merged: the readers' rounding is prose ("ceil_6dp", "usd_cent_up") rather than the
   engine's grammar ("ceil:6"), so the engine refuses to price a reader's own spec until each is restated from its
   source; and `app/src/core/book.ts` stays, because it is display-side (it drops and counts bad levels, keeps a
   venue's equal-price entries and flags a crossed book) where the engine fails closed.
5. **Move the unsigned order builders** from `src/xo/signing` and `src/clob` into `sdk/trade`; the credentialed
   signers go to `sdk/node/`. The boundary check keeps forbidding `sdk/node/` to the page.
   *Done 2026-10-22.* `sdk/trade/xo` holds XO's order, ClobAuth and Kernel builders, the wire signature, the
   verifiers, the expiry window, the amounts and caps, the CTF position ids, the summary lines and the decoded-block
   rebuild; `sdk/trade/xo/account/derive.ts` the counterfactual account; `sdk/trade/xo/userop` the user-operation
   calls, encoding, gas plan, nonce, packing, hash, the `Prepared.sign` block and the signature check (none signs: the
   owner signs through PayBox). `sdk/trade/clob` holds the Polymarket and Limitless order and ClobAuth builders, the
   Deposit Wallet derivation and wrapper, the CLOB amounts, venue facts and decoded blocks. The prepared-item part of
   the relay's wire contract (scalar schemas, what PayBox signs, the decoded blocks, `Prepared` and `verifyPrepared`)
   is `sdk/trade/contract.ts`; `src/relay/contract.ts` re-exports it and keeps the transport constants, the error
   body, the routes and the client interface. The three credentialed request signers (XO L2, Polymarket L2,
   Limitless; HMAC over `node:crypto`) are `sdk/node/trade`, imported by the relay directly; no file under `src/`
   imports a `node:` module any more. The old `src/xo/signing`, `src/clob`, `src/xo/userop` and
   `src/xo/account/derive.ts` paths are one-line re-exports for the plugin, relay, daemon and tests;
   `src/xo/signing/index.ts` still re-exports the XO L2 signer. The dApp's trade screens import `@sdk/trade/...` and
   `@sdk/chain/...`; their hygiene test now allows only the route table and the funding calldata from `@shared` and
   refuses any `@sdk/node` import, and `check-boundaries` has a case for `sdk/node` reached by alias, by relative path
   and through an sdk file. The code moved unchanged (imports and path comments aside), so every pinned vector, typed
   data and hash is the same; the only additions are the exports of four schemas the relay's routes use.
6. **Build `sdk/chain/`.** Merge the two RPC ports, then add position, fill and resolution readers for
   Polymarket, Limitless and XO, with addresses pinned and bytecode-checked. Done when the dApp's holdings view
   reads positions from the chain with no venue API call.
   *Done 2026-10-22.* One JSON-RPC port, `sdk/chain/rpc.ts`, carries every chain read: the XO reads (`RpcReader`, the
   explorer log reader and the tripwires, moved with the XO constants and ABI to `sdk/chain/xo/`; `src/xo/chain/*`
   re-export them and `reads.ts` keeps `readAccountCode`), the funding preflight's Base reader (its two readers now
   share one port and one key latch), the Trueo reader (`sdk/venues/trueo/rpc.ts` is a view of the port) and the
   dApp's wallet balances (with `sdk/chain/multicall.ts`). The transport is an injected POST (`rpcPostFromFetch` builds
   one from a FetchLike, with a body cap and a deadline on the injected clock). The port names its read methods,
   latches on a key refusal, checks each answer's id and result shape, batches with a once-and-for-good fallback to
   single requests, and refuses an eth_getLogs range that is open or wider than 10,000 blocks unless the caller opts
   in (only the XO reader's existing log path does). Pins: `sdk/chain/polymarket/constants.ts`,
   `sdk/chain/limitless/constants.ts` and `sdk/chain/xo/pins.ts`, each address from the venue's own contract list (or
   a verified getter of a listed contract: Polymarket's USDC.e and wrapped collateral), each runtime code hash read
   with eth_getCode on 2026-10-22 and found equal to Sourcify's verified on-chain code (`test/fixtures/chain-bytecode`,
   re-hashed by `test/chain-pins.test.ts`); minimal proxies are pinned with the implementation their slot names. XO is
   not on Sourcify: its exchange implementation is explorer-verified, and its Conditional Tokens is checked by code
   hash, dispatcher selectors and XO's token ids deriving from their conditions. A reader checks a contract's pin
   before reading from it. Readers: `ctf.ts` (the Conditional Tokens position-id derivation, checked against the
   deployed `getCollectionId`/`getPositionId` and against all three venues' listed token ids; payouts; transfer and
   resolution decoders), `positions.ts` (balanceOfBatch, payouts, Protocol V2 module results, bounded transfer scans),
   `fills.ts` (OrderFilled of the three exchange shapes, bounded ranges only) and `exchange.ts` (the XO and Limitless
   token registries, each answer confirmed by derivation), tested against one recording per venue
   (`sdk/chain/<venue>/fixtures`, replayed by `sdk/chain/readers.test.ts`). The Holdings view reads XO, Polymarket and
   Limitless from the chain alone (`app/src/features/portfolio/chain-reads.ts`): candidate token ids from the market
   rows the page has loaded (used only where they derive from the market's condition) and from transfers to the
   address in the newest 30,000 blocks (the range is printed), then balances and results on chain; titles and outcome
   names are the page's own rows, a token the page has not loaded is listed by its id, and an open position has no
   price. Behaviour changes, where merged copies disagreed and the stricter won: a 401 or 403 now latches the Trueo and
   wallet reads too (Trueo reports a 401 as a pause, not drift); a server error, limit or transport failure on a batch is
   thrown instead of retried one by one, and an endpoint that refuses arrays is asked singly from then on (the wallet
   used to retry the batch every read); only code 3 or "execution reverted" counts as a revert; Trueo's single answers
   are checked against their id, log rows that do not match the filter are dropped, and its RPC URL is checked like the
   others (https, no credentials, query or fragment). In the Holdings view, XO and Polymarket are no longer read through their APIs (no profile lookup: an
   owner's own address is read, and a Polymarket wallet is read when pasted), Limitless is read in the standalone build
   too, their open positions are not priced from venue books, XO's cash line is the account's USDC on chain, and their
   rows are labelled as recorded. A signer's Polymarket wallets are then derived on chain too (`sdk/chain/polymarket/wallets.ts`: the proxy wallet and Safe by their factories' CREATE2 rules, checked against Polymarket's published vectors and init code hashes and the factories' pinned code, and the Deposit Wallet), and each one holding its factory's wallet code (and, for a Safe or Deposit Wallet, owned by the signer) is read in its own section, otherwise the view says no Polymarket wallet was found for the signer; pasting a wallet stays as a fallback. Not done: UMA question data, Polymarket combinatorial results, nested CTF
   collections and a recorded Limitless NegRisk market (its wrapped-collateral derivation is only checked in code).
7. **Add venue state and field-level sources to the SDK**, with a fake venue for each state. Done when a blocked
   venue's rows show chain fields and a stated reason instead of an error.
   *Done 2026-10-22.* `sdk/venues/state.ts` holds the one rule the dApp's guarded fetch and the daemon's read proxy now
   share (`VenueStateTracker`, keyed by host in the page and by service in the daemon): `ok`, `throttled` (a 429 with
   Retry-After cools a host down; the third 429 in a row pauses it for ten minutes), `blocked` (any 403, the third 401 in
   a row, or a web page served where JSON was expected, whatever its status) and `chain_only` (declared by the host).
   A paused host is refused before sending and nothing retries around it. A block page is caught at the transport
   (content type or the head of the body, `isBlockPage` in `transport.ts`): the page's direct fetch and the daemon's
   proxy turn it into a block (`FetchError` code `blocked`, the daemon's `venue_paused` with reason `block_page`, which
   the page then holds too), mapped to `VENUE_PAUSED`, never `SCHEMA_DRIFT`. A venue is the worst of its hosts
   (`venueReadState`, from the origin registry), and `venueStateReason` gives every client the same sentence ("Polymarket
   blocked our reads at 2026-10-22 12:03 UTC: 403", "XO Market throttled our reads (429): retry after 30 s").
   `app/src/core/budget.ts` re-exports the tracker as `VenuePauses`; `bridge/contract.ts` re-exports its constants.
   Field sources: `sdk/model.ts` gains `FieldSource` (`venue_api`, `chain`, `cache`), `FieldOrigin` (a source and the time
   it was read, or a reason), `FieldSources` over a list row's fields and `SourcedSummary`; `sdk/venues/state-fields.ts`
   builds them (`sourceSummary`: a kept row is `cache` with its age and never "live"; a blocked or chain-only venue's
   display prices and volume become null with the reason) and reads a row's settlement from its contracts
   (`readChainResolutions`: Conditional Tokens payouts or Polymarket's V2 module results for XO, Polymarket and
   Limitless rows, each contract pin-checked first). `sdk/venues/testkit` is a fake venue for each state (ok, throttled
   with Retry-After, blocked by 403, blocked by a 200 web page, chain only); the Polymarket and XO readers are tested
   against each, and the field rule against XO's recorded chain answers. In the dApp, a throttled, blocked or chain-only
   venue is "degraded", not failed: the Markets view keeps the rows read earlier in this visit, marked "cache" with their
   age, reads their settlement on chain (a "chain" mark; the inspector lists every field's source), says which venue is
   missing and why in a state tile instead of an error panel, and leaves the venue out of book loading, the market
   modal's books and order preparation; a chain-only venue's API is never asked. Behaviour changes, where the two copies
   of the rule disagreed and the stricter won: the daemon honours a Retry-After up to a day (it capped cool-downs at an
   hour), a 404 or a 5xx no longer clears its 429 count, three 401s in a row now block in both, and a 200 web page is a
   block in both (it was schema drift in the page and `upstream_not_json` in the daemon). Not done: no host declares a
   venue chain-only yet (the state, the tile and the tests exist; the API will declare it for key-only venues), the list
   rows carry no fills-derived last trade (the fill reader needs a bounded block range per market, which a list does not
   have), and pm's recorder and adapters keep their own transport and retry policy.
8. **Stand up `api/`**: the indexer and the free read endpoints on the existing container pattern under `deploy/` (AWS host, `deploy/aws`).
   *Done 2026-10-22.* `api/` is built from `sdk/` and its own code only (`api/README.md`); the image is `deploy/api`
   (`deploy/api/README.md`: the run and environment table; built and tested, deployed nowhere; the AWS layout in
   `deploy/aws` can host it beside the recorder). Free endpoints: `GET /v1/health`, `/v1/venues` (every venue's licence
   class, data terms, served or not and why, reader capabilities, read state from `sdk/venues/state.ts`, chain and indexer
   progress), `/v1/markets?category=&venue=&q=` (served venues only, every field with its source and age),
   `/v1/markets/:venue/:id` (one market, its `rules-v2` fingerprint, its books) and `/v1/groups` (links a person approved,
   and linker candidates always "proposed" with their band, from the hash-pinned bundles). Section 5 is enforced in one
   place: `sdk/venues/licence.ts` `apiServability` (a recorded `open` or `attribution` licence, no restriction, and the
   registry's data terms `none_found`; the registry's persistence table moved there and `pm/registry` re-exports it),
   applied before any read by `api/serving.ts`, which also walks every answer and refuses one that names an unserved venue;
   `test/api/serving.test.ts` walks every endpoint against every venue class with the real policy and the served venue in
   each fake state. As recorded today that serves Trueo alone: XO, Polymarket and Limitless have no licence class, so
   `/v1/markets?venue=polymarket` answers `venue_not_served` without contacting Polymarket. Reads use the SDK readers over
   one honest fetch (User-Agent `insurance-markets-api/0.1`, no proxy, no redirect) behind the shared state rule, at most
   one list read a minute per venue, kept in memory only and served as `cache` with its age; a blocked venue keeps its
   rows with chain fields and the stated reason. The indexer (`api/indexer`) reads Polygon (Polymarket's two CTF
   exchanges, the Protocol V2 exchange, Conditional Tokens and the two V2 modules), Base (Limitless's six exchanges and
   Conditional Tokens) and the XO chain (its exchange and Conditional Tokens): fills, condition resolutions and module
   results, and condition preparations, from SDK pins only, each code-checked before the first log; one bounded
   `eth_getLogs` per range (adaptive span, never more than 10,000 blocks), only blocks 64 (configurable) below the head,
   the last block's hash re-checked each pass with a rewind by the depth on a reorg, several RPC URLs per chain with
   failover, a persisted cursor per chain. `api/chain-fields.ts` turns the index into fields: an outcome's last trade
   (exact price from the fill's amounts where the decimals are pinned, the block and the time window of its range) and a
   market's settlement (only for XO and Polymarket rows whose token ids derive from their condition). Tests replay one
   recorded pass per chain (`test/api/fixtures`, public RPC answers of 2026-10-22). Decision forced: the index is SQLite
   (`node:sqlite`) behind `IndexStore`, not Postgres or Ponder, because neither can be added without a dependency; a
   Postgres store can implement the same interface. Not done: no served venue sits on an indexed chain yet, so index
   fields reach no live answer until a licence class is recorded for XO, Polymarket or Limitless; no historical backfill
   (the index starts at the safe head or a configured block, and every "not seen" answer names its range); Limitless rows
   name no condition, so their settlement is not placed from the index; Protocol V2 fills carry no price; each list
   covers at most three pages of a venue's own order.
9. **Add quotes and route prepare**, then metering: subscription keys, x402 middleware, PayBox service listing.
10. **Give the plugin its API mode.**

Steps 3 to 7 can run in parallel once step 2 lands; they change structure and add readers but no product
surface beyond the holdings view. Steps 8 to 10 are new product.

## 10. Decisions still open

- Hosting and region for `api/`, and whether the dApp's standalone build calls it by default or only with a key.
- Pricing per call and per subscription tier.
- Whether the API ever holds venue credentials to submit on a user's behalf (section 4 says not now).
- Which `unknown`-licence venues to clear first so the API can serve them. Until one is cleared the API serves Trueo
  alone, and the chain index's fields reach no answer (step 8).
- Decided by step 8 (forced): the index is SQLite behind `api/store.ts` `IndexStore` until a Postgres dependency can be
  added; when, and whether Ponder replaces the indexer, stays open.
- RPC providers per chain, and whether to run our own nodes from the start or only once a provider refuses us.
- Which chain-settled venues to add after Polymarket and Limitless. Predict.fun and Opinion carry the most volume
  outside Polymarket, Kalshi and XO, and Predict.fun's API is unreadable without a key.
