# sdk/ - the shared market logic

One implementation of the market model, money, categories and the rules fingerprint for every client: the dApp
(`app/`), the Cockpit daemon (`bridge/`), the PayBox plugin tools (`src/`), the aggregation layer and linker
(`pm/`) and, later, the hosted API. The plan and the order of the moves are in `docs/sdk-and-api-design.md`.

| Path | Contents |
|---|---|
| `model.ts` | `Dec`, `Untrusted`, `Result`, every `VenueId`, and the read model every venue reader returns: `Market`, `MarketSummary`, `Book` (with its optional raw-order `BookConvention`), `Quote`, `Prov` and `Provenance`, `FeeSpec` (the venue, the model and named decimal parameters), `Tick`, `Page`, `Rules`, `Status`, the adapter interface and the injected `FetchLike` |
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
| `venues/transport.ts` | The error contract between a reader and the fetch its host injects (`FetchError`, the map onto `AdapterError`, Retry-After) |
| `venues/errors.ts`, `venues/cache.ts`, `venues/policy.ts` | `AdapterException`; cache classes, memory stores and in-flight dedupe; the venue policy table (tiers, terms, switches, provenance) |
| `venues/<venue>/` | One reader per venue: its schemas, its parser into the read model, its constants and its recorded fixtures. `xo` (with its Data API client in `xo/api/`), `polymarket`, `kalshi`, `limitless`, `trueo` (Base on-chain), `hyperliquid`, `manifold`, `pascal`, `novig`, `og`, `gemini`, `sx`, `udx`, and `defillama` (per-venue liveness and volume) |
| `engine/` | The books and fee engine, pure and exact (rationals from `money/rational.ts`, no floating point): fee models and their failure codes (`fees.ts`), the per-venue `FeeSpec` builders and the derived `feeSpecId` (`fee-specs.ts`), book normalisers for every raw convention, complements and mirrors (`books.ts`), the depth walk and `Quote` (`walk.ts`), the marginal basket walk (`basket.ts`) and its book-level wrappers (`depth.ts`), edge and lock-rate defaults (`edge.ts`), set, ladder and implication checks (`relations.ts`), the exact LP (`lp.ts`) and the gates and labels (`labels.ts`). `index.ts` is the barrel; `pm/core/index.ts` re-exports it |
| `signals/quotient/` | Quotient body validation only (no fetching): the `/markets/mispriced` and `/signals` bodies into validated rows |
| `links/` | The link registry, pure: the record schema (`schema.ts`), tier caps, cross-field invariants, the working-registry store, the hash-pinned bundle, offline lookup, runtime pin checks, the gold-set tooling (`goldset/`), and `approve.ts`, imported by path only (approval is a human command, run from `pm/links/cli.ts`). Which venues' terms allow keeping derived text is injected (`PersistenceTerms`); pm binds its platform registry. Also the engine's view of a link (`types.ts`) and the dApp's published dataset contract (`dataset.ts`: schemas, content pin, parser), which the linker's export and the page share |
| `linker/` | The linker's scoring, pure: text features (hashes only), blocking, integer pair scores and vetoes, candidate inputs for pairs and native groups, and the conversion of a bundle into the dApp dataset. Discovery over HTTP, state files and the run loop stay in `pm/linker` |

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
- No secrets. Anything that takes a credential will live in `sdk/node/`, which the page may never import.
- Relative imports carry the `.js` extension so Node, esbuild, Vite and `tsc` all resolve them.

The old locations are one-line re-exports so existing import paths keep working: `pm/core/category.ts`,
`pm/core/rational.ts`, `pm/links/hash.ts`, `pm/links/canonical.ts`, `src/guardrails/amount.ts`,
`src/guardrails/untrusted.ts`, `src/xo/{client,http,types,units}.ts`, and in the app `core/ports.ts`,
`core/category.ts`, `core/money.ts`, `core/untrusted.ts`, `core/format.ts`, `core/errors.ts`, `core/cache.ts` and
`core/venue-policy.ts`.
