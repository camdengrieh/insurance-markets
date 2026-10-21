# sdk/ - the shared market logic

One implementation of the market model, money, categories and the rules fingerprint for every client: the dApp
(`app/`), the Cockpit daemon (`bridge/`), the PayBox plugin tools (`src/`), the aggregation layer and linker
(`pm/`) and, later, the hosted API. The plan and the order of the moves are in `docs/sdk-and-api-design.md`.

| File | Contents |
|---|---|
| `model.ts` | `Dec`, `Untrusted`, `Result`, every `VenueId` |
| `hash.ts` | Isomorphic SHA-256 (viem) and canonical JSON |
| `money/amount.ts` | The strict decimal grammar: decimal string to atomic bigint and back |
| `money/fixed.ts` | Fixed-point values (bigint units plus a scale) |
| `money/rational.ts` | Exact rational arithmetic and directed rounding |
| `money/qty.ts` | Unit-tagged quantities (USD, shares, prices) that never mix |
| `category.ts` | The fixed nine-value category taxonomy and its deterministic matcher |
| `rules.ts` | The one rules fingerprint recipe (rules-v2), the template mask, and each venue's rule-field builder |

Rules (checked by `test/sdk/boundary.test.ts` and the app's `check-boundaries`):

- Isomorphic and pure: no `node:` import, no environment variable, no clock, no global `fetch`. Anything that
  needs I/O takes it as an argument.
- The bottom layer: imports only other `sdk/` files and the bare packages `viem` and `zod`. Never `app/`,
  `bridge/`, `relay/`, `src/` or `pm/`.
- No secrets. Anything that takes a credential will live in `sdk/node/`, which the page may never import.
- Relative imports carry the `.js` extension so Node, esbuild, Vite and `tsc` all resolve them.

The old locations (`pm/core/category.ts`, `pm/core/rational.ts`, `pm/links/hash.ts`, `pm/links/canonical.ts`,
`src/guardrails/amount.ts`, `app/src/core/category.ts`, `app/src/core/money.ts`) are one-line re-exports so
existing import paths keep working while the remaining moves land.
