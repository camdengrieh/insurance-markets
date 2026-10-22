# sdk/ - the shared market logic

One implementation of the market model, money, categories and the rules fingerprint for every client: the dApp
(`app/`), the Cockpit daemon (`bridge/`), the PayBox plugin tools (`src/`), the aggregation layer and linker
(`pm/`) and, later, the hosted API. The plan and the order of the moves are in `docs/sdk-and-api-design.md`.

| Path | Contents |
|---|---|
| `model.ts` | `Dec`, `Untrusted`, `Result`, every `VenueId`, and the read model every venue reader returns: `Market`, `MarketSummary`, `Book`, `Prov`, `FeeSpec`, `Rules`, `Status`, the adapter interface and the injected `FetchLike` |
| `hash.ts` | Isomorphic SHA-256 (viem) and canonical JSON |
| `money/amount.ts` | The strict decimal grammar: decimal string to atomic bigint and back |
| `money/fixed.ts` | Fixed-point values (bigint units plus a scale) |
| `money/rational.ts` | Exact rational arithmetic and directed rounding |
| `money/qty.ts` | Unit-tagged quantities (USD, shares, prices) that never mix |
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
| `signals/quotient/` | Quotient body validation only (no fetching): the `/markets/mispriced` and `/signals` bodies into validated rows |

Every client parses a venue through these modules and nothing else: the dApp's readers are the `venues/<venue>`
adapters; `pm/adapters` keeps its own transport and data-terms policy and converts with `pm/adapters/from-sdk.ts`;
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
