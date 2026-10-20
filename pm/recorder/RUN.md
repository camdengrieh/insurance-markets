# pm/recorder - run instructions

A resumable, rate-limited collector that snapshots public order books, market state (status, close
time, fee facts) and clock skew for the markets named in a pm/links bundle and in a targets file
(XO and Polymarket groups), into a local SQLite file. It then reports spreads, persistence,
depth-limited size and a modelled post-fee edge. It exists to fill the evidence gap left by a single
snapshot (docs/research/18 Verification: one 30-day window of candles, no live depth, no
self-recorded history).

It makes no profit claim and trades nothing. It sends only `GET` requests, with the fixed
User-Agent `insurance-markets-research/0.1`, no credentials, no cookies and no request bodies.

Nothing in this folder deploys or starts anything. Every command below is something an operator
chooses to run. The code was tested against fixtures and a loopback fake server only; it has not
been run against the real venues.

## Terms: what is and is not recorded

| Venue | Raw recording | Why |
|---|---|---|
| XO, Polymarket (international), Limitless | yes (allowlist) | public keyless read APIs; registry data policy says `mayPersist` |
| Kalshi | never, not even derived numbers | Developer Agreement bars caching or aggregating beyond one's own trading |
| Quotient | never | terms restrict redistribution |
| ProphetX, Gemini, and every other venue | never | terms restrictive or unread (registry: memory-only) |

The allowlist is code (`allowlist.ts`), not configuration, and it is enforced three times: when
targets are loaded, in the HTTP client (only five allowed hosts exist), and in every database insert.
A link in the bundle with any refused leg is skipped whole and only counted; no id of a refused
market is kept, and its allowlisted partner is not fetched either. A refused venue typed into the
targets file is a hard error. Tests cover each layer.

Stored data is ids, prices, sizes, enums, timestamps and numbers. Third-party text (titles, rules,
descriptions, creator names) is never stored; status words are mapped to a fixed list.

## Storage choice

SQLite through `node:sqlite` (built into Node 24, no dependency). Reasons: the report and the gap
check are range queries over (target, time); resumability needs a small mutable state table beside
append-only data; WAL mode survives a crash mid-write. JSONL with checksums was the fallback and
was not needed.

Data tables (`snapshots`, `market_state`, `events`, `clock_skew`, `host_stats`) are append-only:
every row carries a SHA-256 of its fields, triggers refuse UPDATE, and DELETE is refused except
inside the retention window that `prune` opens. `verify` recomputes every checksum and runs SQLite's
integrity check. That detects corruption and careless edits; it is not protection against someone
with write access to the file.

## Quick start

From the repository root, with the project toolchain on the path:

```sh
source .tools/env.sh
RUN="node_modules/.bin/tsx pm/recorder/main.ts"

# 1. See exactly what would be called and how often. No network, no database.
$RUN dry-run --bundle pm/links/data/links.bundle.json --pin "$(cat pm/links/data/links.bundle.pin)" \
             --targets pm/recorder/targets.json

# 2. One pass over whatever is due, then exit (for cron and timers).
$RUN once --bundle ... --pin ... --targets ... --db pm/recorder/data/recorder.sqlite

# 3. Or loop until SIGINT or SIGTERM.
$RUN run  --bundle ... --pin ... --targets ... --db pm/recorder/data/recorder.sqlite

# 4. Look at the data.
$RUN report --db pm/recorder/data/recorder.sqlite            # text
$RUN report --db ... --format json --out report.json
$RUN verify --db ...                                          # checksums + integrity
$RUN gaps   --db ...
$RUN status --db ...
$RUN prune  --db ... --days 45
```

The shipped bundle is empty (no human has approved any link yet), so give a `--targets` file or a
reviewed bundle. A bundle requires its manifest hash: `--pin <sha256>` or `--pin-file <path>`.
`--unpinned` skips that check and exists for local experiments only.

### Targets file

```json
{
  "format": "pm-recorder-targets",
  "version": 1,
  "groups": [
    { "groupId": "polymarket-balance-of-power", "venue": "polymarket", "exhaustive": "unknown",
      "marketIds": ["0x16c63b7cc37f012b9f59ee164ec03877914c701d06d48291ae8d6fc08a088b0d",
                    "0x0808de4f0cfd47947f2d1be51f9a9c52ea0fec76f73a75cfbe79ddec98d8a908",
                    "0x998bc71817b2d76921d1999ce0f3431cfd5945583667a371280ca2b430b0c06e"] }
  ],
  "markets": [ { "venue": "xo", "marketId": "0x5bb81cbeb6572a4b62a143144b705a107fbdb3af9f5de55865aba0d7d62752a7" } ]
}
```

(Real ids from the public captures in `pm/test/recorder/fixtures/`.) You do not have to write this
file: `discover` builds it, see below.

A group is a set of mutually exclusive markets on one venue (XO or Polymarket). `exhaustive` is
declared by a human from the venue's rules (`proven`, `by_rule`, `no`, `unknown`) and is never
inferred from market text; the long basket is evaluated only for `proven` and `by_rule`. Market ids
are the XO or Polymarket condition id, or the Limitless slug. Ids are checked against a strict
character set before they can reach a URL.

### Discovery: no hand-written targets file

```sh
$RUN discover --dry --targets pm/recorder/data/targets.json   # the requests it would make, and their count; sends nothing
$RUN discover --targets pm/recorder/data/targets.json         # build the file from public data
$RUN run --discover --db ... --targets ...                    # build it if missing or older than --discover-every (default 86400 s), then refresh it in the loop
```

Discovery uses the same client as collection (allowlist, budgets, User-Agent, backoff), GET only:

* XO: active CLOB markets from the Data API (`marketType=2`, `ACTIVE`), read with the `src/xo`
  decoders. List rows carry no event id, so each market's `rootEventSlug` comes from
  `/api/markets/slug/{slug}` (answers are checked against the conditionId; the list slug can be stale
  and 404, in which case the by-contract route supplies the current slug). Results are cached beside
  the targets file (`<targets>.discover-cache.json`, ids and hashes only), so a market costs at most
  three lookups once. Markets with a common `rootEventSlug` form a same-venue group.
* Polymarket: active events by 24 h volume from Gamma. A neg-risk event becomes a group of its
  tradable markets; other events give up to five single markets each. A group over 64 members is
  skipped, never truncated.
* `exhaustive` is always `unknown`. A shared `rootEventSlug` or `negRisk` flag does not prove the set
  is exhaustive, nor (for `rootEventSlug`) even that it is mutually exclusive; read group results with
  that in mind. Group ids are hashes (`xo-evt-...`, `pm-nr-...`); no title or slug is written.
* Sizing: at most `--max-short` (default 30) markets closing within the short horizon and
  `--max-regular` (default 250) others per venue, then cut further, lowest priority first, until the
  projected requests per hour are inside 60 % of every host budget (and the all-short worst case inside
  the full budget) and the projected disk use over `retentionDays` is inside 80 % of `maxDbBytes`.
  `dry-run` on the result shows no `OVER BUDGET`. Previously recorded markets keep their place, so a
  series is not cut by a market drifting across a cap.
* If a venue cannot be read, that venue's part of the previous file is kept. If nothing usable is
  found, the file is untouched. The file is written to a temporary name and renamed.
* Lookups that could not finish (budget, errors) are retried within the hour instead of the full interval.

The files are re-read on every tick, so edits apply without a restart. A bad edit keeps the previous
set and logs an `error` event.

## Cadence and budgets

| Setting | Default | Meaning |
|---|---|---|
| `intervalSec` | 3600 | book snapshot cadence |
| `shortHorizonSec` / `shortIntervalSec` | 72 h / 300 s | markets closing within the horizon are sampled faster |
| `resolveIntervalSec` / `shortResolveIntervalSec` | 3600 / 900 | status, close and fee facts |
| `postCloseGraceSec` | 21600 | polling stops this long after close; resolved or closed markets stop at once |
| `depthLevels` | 20 | levels kept per side |
| `retentionDays` | 45 | applied once a day inside the loop (the study window is 30 days) |
| `maxDbBytes` | 2 GiB | at the cap, collection pauses and logs `disk_cap` |

Per-host budgets (requests per second, burst, requests per hour), all well below the documented
public limits and refused above a ceiling:

| Host | rps | burst | per hour | Documented limit |
|---|---|---|---|---|
| orderbooks.xo.market | 2 | 2 | 6000 | 5 rps |
| api-mainnet.xo.market | 1 | 2 | 3000 | not stated |
| gamma-api.polymarket.com | 2 | 4 | 6000 | 300 to 900 per 10 s |
| clob.polymarket.com | 5 | 5 | 15000 | 1,500 per 10 s for /book |
| api.limitless.exchange | 2 | 2 | 4000 | numeric limit NOT FOUND |

Requests per hour for N targets is about `N * (3600/interval + 3600/resolveInterval)`, doubled to
about `N * (12 + 4)` for short-dated ones. `dry-run` prints the per-host projection and flags
`OVER BUDGET`; over-budget work is deferred, never sent. Failures back off per host (exponential,
`Retry-After` honoured, jitter), repeated failures open a per-host circuit breaker, redirects are
errors, and bodies are size-capped.

Disk estimate (unmeasured, order of magnitude): one snapshot row is about 1.3 KB with 20 levels per
side, so 1,000 targets hourly is about 30 MB a day, and a short-dated market at 5 minutes is about
0.4 MB a day. Check `status` after a day and adjust `depthLevels`.

## What the log records

`events` holds, as short fixed-vocabulary text: starts and stops, an unclean previous run, backoff
and breaker events, refused requests, parse errors, failed state or book calls, retired markets,
detected gaps (both ends), clock regressions (the row is not stored), clock skew beyond
`skewWarnMs`, retention runs, and the disk cap. `clock_skew` stores, per host and every
`skewLogEverySec`, the local clock minus the server `Date` header (positive means the local clock
is ahead; resolution about 500 ms plus half the round trip). `host_stats` stores request, error,
throttle and backoff counts per tick. Run `gaps` or `report` for gap totals.

## Report

`report` pairs each link's two series (snapshots within `pairToleranceSec`, default 120 s), puts
the YES side of the second leg into the first leg's frame using the link's outcome map, and per
venue pair and time-to-close bucket (`lt_1d`, `1_3d`, `3_14d`, `14_60d`, `gte_60d`, `unknown`)
prints: gross gap before fees, modelled net per share at the top of the book, cross-venue mid gap,
each venue's own bid-ask spread, depth-limited share count and modelled net total (only where the
modelled net is positive), and persistence (episodes of gross or net above zero, measured between
samples, never across a recorder gap, so durations are lower bounds). Same-venue groups get a short
basket (buy every NO) and, if declared exhaustive, a long basket.

The net uses pm/core: fee specs rebuilt from the recorded fee facts, the capital-lock charge at the
default hurdle, and the basis-class haircut. It is withheld (not guessed) when the fee model is
unknown (Limitless exposes only a flag), the fee fact is older than three state intervals, the close
time is unknown, or the link basis is unresolved. Every report starts with its limits: no latency or
leg risk, no transfers, no account limits, derived NO-side prices, sampling blindness, and that the
day-90 pre-registered test is not run here.

## Running it

None of these has been executed. Replace the paths; keep the database on a local disk with room for
`maxDbBytes`. Run exactly one recorder per database file (a lock file next to the database refuses a
second one; a lock older than two hours is treated as stale).

### Local machine, loop under a supervisor

systemd (`/etc/systemd/system/pm-recorder.service`):

```ini
[Unit]
Description=pm-recorder (read-only order book recorder)
After=network-online.target

[Service]
User=pmrec
WorkingDirectory=/opt/pm-recorder
ExecStart=/opt/pm-recorder/node_modules/.bin/tsx pm/recorder/main.ts run \
  --db /var/lib/pm-recorder/recorder.sqlite \
  --bundle /opt/pm-recorder/pm/links/data/links.bundle.json --pin-file /opt/pm-recorder/pm/links/data/links.bundle.pin \
  --targets /etc/pm-recorder/targets.json
Restart=on-failure
RestartSec=30
KillSignal=SIGTERM
TimeoutStopSec=60
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/var/lib/pm-recorder

[Install]
WantedBy=multi-user.target
```

launchd (`~/Library/LaunchAgents/pm-recorder.plist`, label of your choice):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>local.pm-recorder</string>
  <key>WorkingDirectory</key><string>/opt/pm-recorder</string>
  <key>ProgramArguments</key><array>
    <string>/opt/pm-recorder/node_modules/.bin/tsx</string>
    <string>pm/recorder/main.ts</string><string>run</string>
    <string>--db</string><string>/var/lib/pm-recorder/recorder.sqlite</string>
    <string>--targets</string><string>/etc/pm-recorder/targets.json</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>30</integer>
</dict></plist>
```

### Local machine, one pass per tick (cron or a systemd timer)

`once` does whatever is due and exits, so a five-minute schedule gives the short-dated cadence and
the hourly books come out of the same state:

```cron
*/5 * * * * cd /opt/pm-recorder && node_modules/.bin/tsx pm/recorder/main.ts once --db /var/lib/pm-recorder/recorder.sqlite --targets /etc/pm-recorder/targets.json >> /var/log/pm-recorder.log 2>&1
```

systemd timer: a `Type=oneshot` service with the same `ExecStart` (verb `once`) and a timer with
`OnCalendar=*:0/5` and `Persistent=true`. An overlapping run exits with code 3 (lock held).

### Container

`deploy/recorder/` builds one image from one bundled file (`node:24-slim`, a volume at `/data`, discovery
on, SIGTERM handled) and explains how to run it on Railway; see `deploy/recorder/README.md`.

### Scheduler (Kubernetes CronJob, cloud scheduler)

Use `once` every five minutes with a persistent volume claim mounted at the database path, a
`concurrencyPolicy: Forbid` (or equivalent), and the same container image. Ephemeral CI runners and
serverless functions are a poor fit: the database must persist between runs, and the lock file and
WAL need a real filesystem.

## Operating notes

* Back up by stopping the recorder and copying the `.sqlite` file (and `-wal` if present), or with
  SQLite's online backup. Run `verify` on the copy.
* After a crash the next start logs `unclean_previous_run` and continues; `gaps` shows what was missed.
* Exit codes: 0 ok, 1 runtime failure, 2 bad input or configuration, 3 lock held.
* Hosts are reached over HTTPS at their real names; the `hostBases` setting exists only for tests and
  accepts loopback origins only.
* Before the first real run, read the venues' current terms once more. The allowlist reflects the
  registry as of 2026-10-19 and is not legal advice.
