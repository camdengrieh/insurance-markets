# pm/ - read-only prediction-market aggregation layer

`pm/` holds the venue-agnostic aggregation code described in `docs/aggregation-design.md`
(MVP = AGG-0 + AGG-1), `docs/market-linking-design.md`, `docs/platform-registry-design.md` and
`docs/venue-census.md`. It is a signal and reference-price layer: no tool places orders, no
tool claims guaranteed profit, and every write path is off.

Binding rules (do not weaken):

- Runnable by everyone from day zero. Nothing the author operates, no custody, no contact with XO.
- No browser automation. No third-party writes (no POST/PUT/DELETE, no JSON-RPC).
- Links come only from a human-approved, hash-pinned registry. LLMs and statistics may propose or
  veto a link, never promote one.
- Restricted-terms data (Kalshi, Quotient) is memory-only: never written to disk, never exported.
  Those adapters are OFF by default and show a clause disclosure when enabled.
- Money, prices and share counts are decimal strings or bigint with exact integer math. Never
  floating point. `null` means unknown and is never zero. Every unknown fails closed.
- Market text is untrusted data. It reaches the agent only through `src/guardrails/untrusted.ts`
  in a fixed "untrusted" slot.
- Any capability whose flag is not recorded as `yes` shows `unproven` in the UI.

## Layout

All new code lives in `pm/`. It may import from `src/` (read-only reuse, for example
`src/guardrails/amount.ts`, `src/guardrails/untrusted.ts`, `src/xo/*`) but must never edit
`src/`, `relay/`, `bridge/`, `app/`, `test/`, the root `package.json` or the root lockfile.
There are no pm-specific dependencies; use Node 24 built-ins plus the root `viem` and `zod`.
`node:sqlite` is allowed for the recorder only.

| Path | Owner stream | Contents |
|---|---|---|
| `pm/tsconfig.json`, `pm/types.ts`, `pm/index.ts`, `pm/README.md`, `pm/test/.gitkeep` | pm-scaffold | Package config, shared types and exact-decimal bridge (`Dec`, `Fixed`, `decToFixed`, `fixedToDec`), barrel, this file |
| `pm/core/` | pm-core | Pure logic, no I/O: book normalisers, fee models, depth-walk, edge gates and labels, set/ladder/implication checks, rule hashing |
| `pm/registry/` | pm-registry | Platform registry and link registry records, JSON schemas, hash pinning, verifier |
| `pm/links/` | pm-links | Link proposal and verification pipeline (propose/veto only, never promote) |
| `pm/adapters/` | pm-adapters | Per-venue read adapters (fetch, parse, fixtures), flagged OFF by default where terms restrict use |
| `pm/ops/` | pm-ops | Rate limits, caching (memory-only for restricted data), staleness, health, feature flags |
| `pm/signals/` | pm-signals | Quotient request/parse helpers and alert/signal layer (no network) |
| `pm/recorder/` | pm-recorder | Optional local recorder of unrestricted public data (`node:sqlite`); tested against fixtures and a local fake server only |
| `pm/tools/` | pm-tools | MCP tool surface; exports `registerPmTools(server)` from `pm/tools/index.ts` (wiring into `src/plugin.ts` is a later step) |
| `pm/test/` | everyone | Tests for pm-wide code; each subfolder may also keep tests under `pm/<sub>/test/` or in `pm/test/<sub>/` |

Dependency direction: `pm/types.ts` imports only `src/guardrails/amount.ts`. `pm/core` imports
types only. Adapters import `core` and `types`. Tools import everything. Nothing in `pm/` may
import a signing or trading module.

## Gate

Run from the repo root with the project toolchain:

```sh
source .tools/env.sh
node_modules/.bin/tsc --noEmit -p pm/tsconfig.json          # strict typecheck of pm/ and the src files it imports
node_modules/.bin/tsx --test "pm/**/*.test.ts"              # all pm tests (offline, deterministic)
```

Tests run offline against fixtures, the local mock XO (`test/mock-xo`) and local anvil. Live
drift suites are opt-in with `PM_LIVE=1` and are not part of the gate. Use fixed seeds and
injected clocks. Every guardrail and refusal needs a failing-case test.

## Shared types

`pm/types.ts` (re-exported from `pm/index.ts`) is the single source of the venue-agnostic types:
`VenueId`, `MarketRef`, `OutcomeRef`, `TokenRef`, `Market`, `Rules`, `BookLevel`, `Book` (with its
`convention` tag and `derived` flag), `Quote`, `FeeSpec` and `FeeSpecId`, `Link`, `LinkRef`,
`AdapterError`, `Result`, `Page` and `VenueReadAdapter`. Boundary values are `Dec` strings; the
engine uses `Fixed` (bigint units with an explicit scale 0 to 18). Do not add a second decimal type.
