# sdk/ - the shared market logic

One implementation of the market model, money, categories and the rules fingerprint for every client: the dApp
(`app/`), the Cockpit daemon (`bridge/`), the PayBox plugin tools (`src/`), the aggregation layer and linker
(`pm/`) and, later, the hosted API. The plan and the order of the moves are in `docs/sdk-and-api-design.md`.

| Path | Contents |
|---|---|
| `model.ts` | `Dec`, `Untrusted`, `Result`, every `VenueId`, and the read model every venue reader returns: `Market`, `MarketSummary`, `Book` (with its optional raw-order `BookConvention`), `Quote`, `Prov` and `Provenance`, `FeeSpec` (the venue, the model and named decimal parameters), `Tick`, `Page`, `Rules`, `Status`, the adapter interface and the injected `FetchLike`; and, in its own section, field-level sources: `FieldSource` (`venue_api`, `chain`, `cache`), `FieldOrigin` (a source and when it was read, or the reason there is no value), `FieldSources` over a list row's fields, `ChainResolution` and `SourcedSummary` |
| `hash.ts` | Isomorphic SHA-256 (viem) and canonical JSON |
| `money/decimal.ts` | The one decimal grammar (`Dec`, at most 40 characters) and the core every money helper is built on: `splitDecimal`, `isDec`, `decToAtomic`/`atomicToDec` (text to an atomic bigint at 0 to 36 decimals and back; more places than asked is refused, trailing zeros included), `compareScaled`/`compareDecimal`, `complementOfOne`, `roundDiv` (floor, ceil, trunc, half up, half even) and `decFromNumber` (a JSON number to its exact text) |
| `money/amount.ts` | The money guardrail over that core: an amount string to atomic units for a token of at most 18 decimals, with fixed failure reasons, and XO price ticks |
| `money/fixed.ts` | Fixed-point values (bigint units plus a scale) |
| `money/rational.ts` | Exact rational arithmetic for the engine, with directed rounding through `roundDiv` |
| `money/qty.ts` | Unit-tagged quantities (USD, shares, prices) that never mix, for display and totals |
| `money/dec.ts` | Plain decimal-string helpers for readers that receive JSON numbers (Hyperliquid, Manifold) |
| `category.ts` | The fixed nine-value category taxonomy and its deterministic matcher |
| `rules.ts` | The one rules fingerprint recipe (rules-v2), the template mask, and each venue's rule-field builder |
| `untrusted.ts` | The untrusted-text sanitiser (normalise, strip controls, cap length) |
| `text.ts` | Builders of `Untrusted<string>` from raw venue text, and the safe-https-URL check |
| `format.ts` | Display formatting of quantities, prices, times and addresses |
| `venues/origins.ts` | The venue host registry: every upstream origin a reader may name, its service id, and whether a browser may call it directly. The dApp's CSP and the Cockpit's read-proxy allowlist are built from it |
| `venues/transport.ts` | The error contract between a reader and the fetch its host injects (`FetchError`, the map onto `AdapterError`, Retry-After) and the block-page check (`isBlockPage`: a web page where JSON was expected is a block, code `blocked`, never drift) |
| `venues/state.ts` | Venue read state, the one rule every host applies: `VenueStateTracker` (`ok`, `throttled` on a 429 with Retry-After or three 429s, `blocked` on a 403, three 401s or a block page, `chain_only` when declared; a paused key is refused before sending and never retried around), `venueReadState` (a venue is the worst of its hosts or services), `stateOfAdapterError`, the stated reason (`venueStateReason`, `venueStateNext`) and `createStateGuardedFetch` for a host with no budget of its own |
| `venues/state-fields.ts` | Field-level sources for list rows: `sourceSummary` (venue API, chain or cache with its age; a blocked or chain-only venue's venue-only fields null with the reason) and `readChainResolutions` (a row's settlement from its pinned contracts, for XO, Polymarket and Limitless) |
| `venues/licence.ts` | What may be kept and what may be served: `DATA_TERMS` (the platform registry's data-terms status per venue; `pm/registry` re-exports `termsAllowPersistence` from here and a pm test pins the table to its records) and `apiServability`, the hosted API's one serving rule (a recorded `open` or `attribution` licence in `policy.ts`, no restriction, no restrictive clause found; unknown fails closed; Quotient is never a venue) |
| `venues/testkit/` | Test support only: a fake venue for each state (`ok`, `throttled` with Retry-After, `blocked_403`, `blocked_page` served with 200, `chain_only`), behind the shared rule |
| `venues/errors.ts`, `venues/cache.ts`, `venues/policy.ts` | `AdapterException`; cache classes, memory stores and in-flight dedupe; the venue policy table (tiers, terms, switches, provenance) |
| `venues/<venue>/` | One reader per venue: its schemas, its parser into the read model, its constants and its recorded fixtures. `xo` (with its Data API client in `xo/api/`), `polymarket`, `kalshi`, `limitless`, `trueo` (Base on-chain), `hyperliquid`, `manifold`, `pascal`, `novig`, `og`, `gemini`, `sx`, `udx`, and `defillama` (per-venue liveness and volume) |
| `engine/` | The books and fee engine, pure and exact (rationals from `money/rational.ts`, no floating point): fee models and their failure codes (`fees.ts`), the per-venue `FeeSpec` builders and the derived `feeSpecId` (`fee-specs.ts`), book normalisers for every raw convention, complements and mirrors (`books.ts`), the depth walk and `Quote` (`walk.ts`), the marginal basket walk (`basket.ts`) and its book-level wrappers (`depth.ts`), edge and lock-rate defaults (`edge.ts`), set, ladder and implication checks (`relations.ts`), the exact LP (`lp.ts`) and the gates and labels (`labels.ts`). `index.ts` is the barrel; `pm/core/index.ts` re-exports it |
| `signals/quotient/` | Quotient body validation only (no fetching): the `/markets/mispriced` and `/signals` bodies into validated rows |
| `links/` | The link registry, pure: the record schema (`schema.ts`), tier caps, cross-field invariants, the working-registry store, the hash-pinned bundle, offline lookup, runtime pin checks, the gold-set tooling (`goldset/`), and `approve.ts`, imported by path only (approval is a human command, run from `pm/links/cli.ts`). Which venues' terms allow keeping derived text is injected (`PersistenceTerms`); pm binds its platform registry. Also the engine's view of a link (`types.ts`) and the dApp's published dataset contract (`dataset.ts`: schemas, content pin, parser), which the linker's export and the page share |
| `linker/` | The linker's scoring, pure: text features (hashes only), blocking, integer pair scores and vetoes, candidate inputs for pairs and native groups, and the conversion of a bundle into the dApp dataset. Discovery over HTTP, state files and the run loop stay in `pm/linker` |
| `trade/contract.ts` | The prepared-item contract every signer and checker shares: scalar schemas, the order and CLOB vocabulary, what PayBox is asked to sign (`PreparedSign`, `toPayboxIntent`), the decoded blocks, the strict `Prepared` schema and `verifyPrepared`. `src/relay/contract.ts` re-exports it beside the relay's routes |
| `trade/xo/` | XO's unsigned builders and checks: the order, ClobAuth and Kernel typed data and hashes, the wire signature, the verifiers, the GTD expiry window (the clock reading is an argument), amounts and caps, CTF position ids, the summary lines and the decoded-block rebuild (`rebuild.ts`, with `verifyPreparedLocal`). `account/derive.ts` is the counterfactual Kernel account; `userop/` the closed call list, execute encoding, gas plan, nonce, packing, hash, the `Prepared.sign` block and the signature check |
| `trade/clob/` | The Polymarket and Limitless order and ClobAuth builders, the Polymarket Deposit Wallet derivation and its ERC-7739 wrapper, the CLOB amounts, venue facts (domains, exchanges, ticks) and decoded blocks |
| `chain/rpc.ts` | The one JSON-RPC port every chain read goes through: an injected POST (`rpcPostFromFetch` builds one from a FetchLike with a body cap and a deadline), a per-port read-method allowlist (a subset of `RPC_READ_METHODS`), the key latch, envelope and result-shape checks, batching with a once-and-for-good fallback to single requests, and eth_getLogs refused for an open or too-wide range (10,000 blocks by default) |
| `chain/pins.ts`, `chain/multicall.ts` | `ContractPin` (address, source, runtime code hash and size, EIP-1967 implementation) and `checkPin`/`createPinGuard`, which every reader runs before reading a contract; Multicall3 `aggregate3` with its Polygon and Base pins |
| `chain/ctf.ts`, `chain/positions.ts`, `chain/fills.ts`, `chain/exchange.ts` | Conditional Tokens: the position-id derivation (`collectionIdOf`, `positionIdOf`, `binaryPositionIds`), payouts, transfer and resolution decoders; positions (`readBalances`, `readCtfPayouts`, `readModuleResults`, `readPositions`, the bounded `scanTransfersTo`); OrderFilled of the three exchange shapes (`readFills`, bounded ranges only); the XO and Limitless token registries, each answer confirmed by derivation |
| `chain/polymarket/`, `chain/limitless/` | Each venue's pinned contracts (from its own contract list, with the code hashes read on 2026-10-22), its ABI fragments and the choice of token ids and result sources (`polymarketTargets`, `v2PositionParts`, `limitlessTargets`); Polymarket's wallet factories and `polymarket/wallets.ts`, a signer's proxy wallet, Safe and Deposit Wallet derived from its address (`polymarketWalletCandidates`) and confirmed on chain (`findPolymarketWallets`: the factory's wallet code, and the signer as an owner); recordings in `fixtures/` |
| `chain/xo/` | XO's pinned constants and ABI fragments, the account, nonce, fee, paymaster, route and creation reads (`reads.ts`: `RpcReader` over the port, `ExplorerLogReader`), the tripwires, the code pins of its ledger and exchange (`pins.ts`) and its position targets (`positions.ts`); recordings in `fixtures/` |
| `chain/fixtures/` | The read scenarios behind the recordings, the recording and replay transports, and the verified-ABI excerpts the fragments are checked against |
| `node/` | Node only, never reachable from the page: `node/trade/` holds the credentialed request signers (XO L2 in `xo/hmac.ts`, Polymarket L2 in `clob/polymarket/l2.ts`, Limitless in `clob/limitless/hmac.ts`), which take a secret and use `node:crypto` |

Every client parses a venue through these modules and nothing else: the dApp's readers are the `venues/<venue>`
adapters; `pm/adapters` keeps its own transport and data-terms policy and returns the SDK read model unchanged
apart from what pm adds (its rules-hash sentinel, extras and the engine's `FeeSpec`);
the plugin's XO tools reach the XO client through `src/xo/{client,http,types,units}.ts`, which re-export it and
supply the global fetch and clock. Each venue's recorded responses live once, in `venues/<venue>/fixtures`.

Rules (checked by `test/sdk/boundary.test.ts` and the app's `check-boundaries`):

- Isomorphic and pure: no `node:` import, no environment variable, no clock, no global `fetch`. Anything that
  needs I/O takes it as an argument.
- Tests (`*.test.ts`) and recorded fixtures (`fixtures/`) sit next to the code. They run under the app's vitest
  (`cd app && npx vitest run ../sdk`) and may also import `vitest` and `node:` built-ins; the root `tsconfig`s
  leave them out.
- The bottom layer: imports only other `sdk/` files and the bare packages `viem` and `zod`. Never `app/`,
  `bridge/`, `relay/`, `src/` or `pm/`.
- No secrets. Anything that takes a credential lives in `sdk/node/`, the one folder that may import `node:` built-ins
  and which the page may never import (`app/scripts/check-boundaries.ts`).
- Relative imports carry the `.js` extension so Node, esbuild, Vite and `tsc` all resolve them.

The old locations are one-line re-exports so existing import paths keep working: `pm/core/category.ts`,
`pm/core/rational.ts`, `pm/links/hash.ts`, `pm/links/canonical.ts`, `src/guardrails/amount.ts`,
`src/guardrails/untrusted.ts`, `src/xo/{client,http,types,units}.ts`, `src/xo/chain/{constants,abi,reads,tripwires}.ts`
(`reads.ts` also keeps `readAccountCode`), the order builders under `src/xo/signing`, `src/clob`, `src/xo/userop` and
`src/xo/account/derive.ts`, and in the app `core/ports.ts`,
`core/category.ts`, `core/money.ts`, `core/untrusted.ts`, `core/format.ts`, `core/errors.ts`, `core/cache.ts` and
`core/venue-policy.ts`.
