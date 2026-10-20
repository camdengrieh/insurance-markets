# Wiring the pm_* tools into the plugin

`pm/tools/index.ts` exports `registerPmTools(server)`. It registers eight read-only tools and nothing
else; it touches no network and does no work at registration, so `tools/list` answers with an empty
environment. This file is the whole change a later step makes. Nothing in `src/` was edited by the
pm streams.

## The change (one import and one call in each of two files)

The plugin has two server entry points. `src/local.ts` only calls `runCli`; the local server that
registers the tools is `src/local/server.ts`, so that is the second file.

`src/plugin.ts` (hosted PayBox bundle, `dist/plugin.mjs`):

```ts
import { registerPmTools } from "../pm/tools/index.js";   // 1. with the other tool imports (after registerFundTools)
...
  registerCreateTools(server);
  registerPmTools(server);                                   // 2. after the last register call, before `return server;`
```

`src/local/server.ts` (local stdio server, `dist/local.mjs`): the same two lines, with the import path
`../../pm/tools/index.js`. `src/local.ts` itself needs no change.

Names are unique (`pm_` prefix, none collides with `xo_`), and the
whole set registers in one call, so a duplicate registration cannot happen unless the call is made
twice (a test checks that a second call on one server throws).

## Checks to run after wiring (root gate, not part of the pm streams)

- `pnpm build` and `pnpm build:local`: both must still bundle. The pm tool graph was bundled on its
  own with esbuild (`pm/tools/index.ts`, node 24, ESM, minified): about 340 KB, 151 inputs, only
  `node:crypto` as a Node import, nothing from `relay/`, `bridge/`, `app/`, `test/` or `pm/recorder/`
  (the recorder, which uses `node:sqlite`, is not imported by any tool).
- `test/tools-schema.test.ts` snapshots every registered tool and `test/integration.test.ts` lists the
  registered names: both probably need their expected lists extended with the eight names below. They
  are root-owned and were not run by the pm streams.
- `scripts/conformance.mjs` against `dist/plugin.mjs`: the hosted runner kills an operation after 10 s.
  The pm tools stop at 9 s (`PM_BUDGET_MS`), each adapter call at 3.5 s, and audit lines go to stderr
  within the existing 8 KiB budget.

## Tools

| Tool | Network | Notes |
|---|---|---|
| `pm_list_venues` | none | Registry view plus adapter state. Safe as a conformance sample call. |
| `pm_get_quote` | GET to the venue | Depth-walk quote. `executable` describes the data; nothing can place an order. |
| `pm_lookup_links` | none | Reads the pinned link bundle. Empty shipped set until a human approves links. |
| `pm_verify_link` | GET to each leg's venue | Recomputes pins; verdict applies to the call only. |
| `pm_compare_market` | GET to both venues | Indicative discrepancy, never above the link's tier cap, never executable arbitrage. |
| `pm_check_structure` | GET to one venue | Within-venue complement, partition and ladder alerts. Member list never proven complete here. |
| `pm_signal_request` | none | Describes a Quotient request. Flag `PM_QUOTIENT`, OFF by default. |
| `pm_signal_parse` | none | Validates a body the agent already paid for. Flag `PM_QUOTIENT`, OFF by default. |

## Settings (all optional, read from the plugin environment)

| Variable | Effect |
|---|---|
| `PM_QUOTIENT=1` | Turns on `pm_signal_request` and `pm_signal_parse`. Off, they return the terms clause and read nothing. |
| `PM_KALSHI=1` and `PM_KALSHI_ACK=<clause sha256>` | Turns on the Kalshi read adapter. The hash is shown by `pm_list_venues` next to the disclosure. Kalshi data stays memory-only even when on. |

## Things the integrating step must know

- Class gates: `PmToolDeps.gates` returns `undefined`, so every label is capped at `indicative_discrepancy`
  until a gold-set evaluation passes a class gate and a later step supplies the gates. This is the
  intended state at launch.
- `getBooks` is called with `deadlineMs` as a budget in milliseconds (what the adapters implement).
  `pm/ops` passes an absolute epoch instead (see the open issue in the pm-tools report); the per-call
  timeout in `guarded` still bounds it.
- XO and Polymarket adapters are always on for in-memory reads. Their registry `terms` section ages
  out after about 30 days, after which quotes carry the `memory_only_data` flag; refresh the registry
  record then.
