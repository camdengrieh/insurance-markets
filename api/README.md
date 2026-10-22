# api/ - the markets API (free tier)

The hosted read API of `docs/sdk-and-api-design.md` section 4, step 8 of section 9: the free read endpoints and the
chain indexer, built only from `sdk/` and its own code (no import from `pm/`, `src/`, `relay/`, `app/` or `bridge/`).
It is an optional accelerator: `sdk/` stays runnable by anyone with no service of ours, and local mode never depends on
it. Quotes, route prepare and metering (keys, x402) are step 9 and are not here. The container and its run and
environment table are in `deploy/api/README.md`.

| File | Contents |
|---|---|
| `main.ts` | the entry point, and the only file that reads `process.env`, the global `fetch` and the wall clock |
| `config.ts` | configuration from the environment, validated (relay/config.ts is the pattern); the compiled-in limits |
| `server.ts` | the `node:http` server: methods, size limits, per-client token buckets with 429 and Retry-After, CORS for the configured dApp origins, fixed JSON errors, the serving check on every answer |
| `app.ts` | the parts and the route handlers: `/v1/health`, `/v1/venues`, `/v1/markets`, `/v1/markets/:venue/:id`, `/v1/groups` |
| `serving.ts` | the one serving gate (section 5) over `sdk/venues/licence.ts`, and `checkBody`, which refuses any answer naming a venue that is not served |
| `markets.ts` | the SDK venue readers of the served venues behind the shared state rule; the in-memory list, detail and book caches with their read times; each row's fields with source and age |
| `chain-fields.ts` | the index's read functions: an outcome's last trade from its fills, a market's settlement from resolution events |
| `groups.ts` | approved links and linker candidates from the hash-pinned link bundles; candidates always "proposed" with their band |
| `upstream.ts` | the one outbound fetch: User-Agent `insurance-markets-api/0.1`, no Origin, cookie or credential, no redirect, a size cap and a deadline |
| `store.ts` | `IndexStore`, the storage seam, and `SqliteIndexStore` over `node:sqlite` |
| `indexer/chains.ts` | what is indexed per chain: the pinned exchanges (OrderFilled), Conditional Tokens (ConditionResolution, ConditionPreparation) and Polymarket's Protocol V2 modules (ConditionResolved) |
| `indexer/indexer.ts` | one chain's indexer: pin checks, confirmation depth, reorg check and rewind, bounded adaptive ranges |
| `indexer/rpc-pool.ts` | several RPC endpoints per chain, chain id checked, failover with cool-downs |
| `indexer/events.ts` | the ConditionPreparation and module ConditionResolved decoders |

## Rules

- **What is served is code.** `apiServability` (`sdk/venues/licence.ts`) serves a venue only with a recorded licence class
  (`open` or `attribution`) in `sdk/venues/policy.ts`, no restriction there, and a registry data-terms status of
  `none_found`; the stricter of the two records wins. Today that is Trueo alone. A venue that is not served is never
  asked, and `checkBody` refuses (as `internal`, never a partial answer) any answer that names one under a `venue` key.
  `main.ts` always passes `API_SERVING_POLICY`; no variable or file can widen it. Tests may pass another policy only to
  exercise a path no served venue reaches today.
- **Never shown as live when it is not.** A row read for this request is `venue_api` (or `chain` for a venue read from its
  contracts, like Trueo); a row kept from an earlier read is `cache` with its age; an index field is `chain` with the time
  the index read it and the block it rests on. A field with no value is `null` with the reason. Venue answers stay in
  memory (`sdk/venues/cache.ts`: market data never reaches disk); the database holds public chain events only.
- **No disguise, no retry around a block.** One honest User-Agent, no proxy, no spoofed header; a throttled or blocked
  venue is refused before sending (`sdk/venues/state.ts`) and keeps its rows with its chain fields and the stated reason.
- **Only pinned contracts, only bounded ranges.** Every contract the indexer reads is an SDK pin, checked against its code
  hash before the first log; a contract that changed stops that chain's indexer. Each `eth_getLogs` names a numeric range
  no wider than the span (at most 10,000 blocks, the RPC port's cap), ending at least the confirmation depth below the head.

## Storage

The plan names Postgres (or Ponder) for the index. Neither can be added without a new dependency, so the index is
SQLite through `node:sqlite` behind `IndexStore`; a Postgres store can implement the same interface (atomic range plus
cursor, rewind deletes everything above the kept block) without changing the indexer or the endpoints.

## Not done

- No venue on an indexed chain is served yet: XO, Polymarket and Limitless have no licence class, so the index's last
  trades and settlements reach no answer until a person reads their terms and records one (`test/api/merge.test.ts`
  exercises the merge with a test policy).
- A Limitless row names no condition (its id is a slug), so its settlement is not placed from the index; its last trade is
  matched by the token ids the venue lists.
- Protocol V2 fills on Polygon are stored without a price: their collateral and position decimals are not pinned.
- The index starts at the safe head on first run (or a configured block); there is no historical backfill, and every
  "no fill" or "no resolution" answer names the indexed block range.
- Each venue's list covers at most three pages in the venue's own order; on 2026-10-22 the first pages of Trueo's list were
  all conditional markets, which the SDK reader skips.
