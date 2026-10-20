# Runbook: the pm/ aggregation layer

For the person running the checks, approving links or collecting evidence. What was built and what is unproven is in `docs/build-log-pm.md`; read its "Limits of the evidence" first. The recorder's own reference is `pm/recorder/RUN.md`; this document adds what a first-time operator needs around it and corrects one thing it omits (section 3.7).

All commands run from the repository root with the project toolchain. `tsc` and `tsx` are not on `PATH` after sourcing the environment file, so use `node_modules/.bin/`:

```sh
cd <repo-root>
source .tools/env.sh
```

Never run `pnpm add`, `install`, `update`, `remove` or `pnpm exec` for any of this. pm/ has no dependencies of its own and needs none.

## 1. Run the pm gate

Two commands. Both are offline and deterministic.

```sh
node_modules/.bin/tsc --noEmit -p pm/tsconfig.json
node_modules/.bin/tsx --test "pm/test/**/*.test.ts"
```

Expected (observed on 2026-10-20): the first prints nothing and exits 0; the second ends with `tests 900`, `pass 900`, `fail 0`, `skipped 0`, in about a minute. The recorder file-database tests are the slow part. If the count differs, someone added or removed tests; if anything fails, stop and read the failure before doing anything in sections 2 or 3.

Notes:

- The live drift suites in `pm/test/adapters/live.test.ts` run only with `PM_LIVE=1`. Do not set it unless you intend to contact the real venues; the gate does not need it, and it has never been run.
- The restricted-terms audit is part of the gate (`pm/test/gate/restricted-audit.test.ts`). It plants a sentinel in Kalshi and Quotient bodies and fails if any file under `pm/` or the OS temp area contains it afterwards.
- This gate covers `pm/` only. It does not build the plugin or run the root tests; see the wiring section of the build log.
- Run the gate with nothing else heavy running if you see a timing failure: a few tests use short real timers.

## 2. The link approval workflow

A "link" says two markets (on two venues, or two rungs on one) mean the same thing, with a recorded relation, outcome map and list of differences. The shipped set is empty. Links reach the tools only if they are human-approved, hash-pinned and exported into the shipped bundle. An LLM or a price statistic may propose a link or veto one; neither can approve. Approval is a separate explicit command that needs every input below.

The CLI is `pm/links/cli.ts`. It makes no network calls. By default it works on the working registry `pm/links/data/registry.json` (empty today); pass `--registry <path>` to use another file.

```sh
LINKS="node_modules/.bin/tsx pm/links/cli.ts"
```

Honest limits first: this procedure was tested only with synthetic links and synthetic rule text. Nobody has yet run it on real venue rules, so how long a review takes and how well the hashes cope with real text are unknown. "Human approval" is a procedure, not authentication: a person with shell access can script the CLI, and the handle check is a heuristic. The real control is that the shipped bundle is a file in git and a human reviews its diff before it is committed or released.

### 2.1 Before you start

Read both markets' full current rules on their own venues, yourself. The tool stores hashes of rule text, not the text, and cannot do this reading for you. For a Kalshi leg, remember the data is restricted: never paste Kalshi rule text, titles or quotes into a link record, a note or a file (section 4).

Only four venues have a rules-hash recipe: `xo`, `polymarket`, `kalshi`, `limitless`. Any other venue fails closed with `NO_RECIPE`.

### 2.2 Compute the rule hashes

Save the venue's rule-bearing fields for each market as a JSON object (field names per venue are `RULE_FIELDS` in `pm/links/hash.ts`), then:

```sh
$LINKS hash --venue polymarket --record polymarket-market.json
```

It prints only `rulesSha256`, `maskedSha256` and (if you pass `--entities-file`) an entity-table fingerprint. It never prints rule text. Keep the record files out of git (they hold third-party text).

### 2.3 Propose a candidate

Write the candidate as a JSON file in the shape of `candidateInputSchema` in `pm/links/schema.ts`. The synthetic fixtures in `pm/test/links/fixtures.ts` show a complete example; they use `SYNTHETIC-` ids, which can never be exported to the shipped bundle. Then:

```sh
$LINKS propose --file candidate.json --source manual --by <your-handle>
```

`--source` is one of `structural`, `native_hook`, `manual`, `llm`, `statistics`. A proposal from `llm` or `statistics` may cite only `llm_quoted` or `statistics_hint` evidence and cannot claim deterministic proof; the tool refuses otherwise. `propose` only ever creates a state `candidate`. It prints the link id (`lnk_` plus 32 hex), state and tier cap. The id is content-addressed over relation, legs, outcome maps and both hashes, so changing any pin makes a different link.

Rules the schema enforces (a failure prints `error: ...` and exits 1): known enums only, outcome maps must be permutations, the declared cutoff gap may not understate the gap between the pinned close times, an `identical` basis needs one void policy on every leg, no Kalshi quote text anywhere, and axis values next to a Kalshi leg must be short codes without spaces.

### 2.4 Review

```sh
$LINKS list --state candidate
$LINKS show <link-id>
$LINKS review <link-id>
```

`review` changes nothing. It prints the review sheet (digest, required number of approvals, structural ceiling, a fixed checklist, hazards), the full record and the fixed acknowledgement sentence. Work through the checklist against the live rules on both venues:

1. Same underlying question, same resolution trigger and source.
2. The outcome map matches each venue's own outcome order, not the display order.
3. Every cutoff, window, void, tie-break and exception difference is listed as an axis.
4. Close times and resolver match the pins.

Hazards mean extra care: an LLM or statistics proposer (its verdict is a hint, not evidence), no deterministic proof (your review is the proof), an XO leg not on the creator allowlist, an unknown void policy, a previously suspended link. A cross-venue partition with exhaustiveness proven only by E2 needs two distinct reviewers (`requiredApprovals` in the sheet says 1 or 2).

### 2.5 Approve

Only if you are satisfied, and only on an interactive terminal (the command refuses without a TTY):

```sh
$LINKS approve <link-id> \
  --reviewer <your-handle> \
  --date <YYYY-MM-DD, today> \
  --evidence "what you checked, at most 300 characters" \
  --digest <the digest from review> \
  --ack "<the acknowledgement sentence printed by review>" \
  [--tier-cap indicative_discrepancy]
```

`--evidence` may be repeated. The command first asks you to type the first 8 characters of the digest as a per-link confirmation. It refuses, changing nothing, if any of these fail: link is not `candidate` or `suspended`; reviewer is not a handle, looks like automation (names such as the model names, "assistant", "bot"), is the proposer, or already approved this link; date is not a real date, is in the future, is before the proposal, or the link has expired; no evidence; acknowledgement text differs; digest differs from the current record (run `review` again after any change); tier cap above the structural ceiling; or the cutoff delta was never computed. With a second key required, the first `approve` prints `"finalised": false`; a different person runs the same command to finish it.

Effective labels stay capped at `indicative_discrepancy` for every link until a gold-set evaluation passes a class gate, and no gates ship. So approval makes a link usable by the tools; it does not make any output stronger than an indicative discrepancy.

### 2.6 Take a link out of service

Anyone can do these, and they only ever reduce what is trusted:

```sh
$LINKS suspend <link-id> --by <handle> --reason "short fixed reason"
$LINKS revoke  <link-id> --by <handle> --reason "short fixed reason"
$LINKS veto    <link-id> --by <handle> --source llm --reason "short fixed reason"
```

Suspension and revocation clear the recorded approvals, so reinstating always starts a fresh review. Note: a veto from `llm` or `statistics` of a candidate sets it to `revoked`, which is terminal, and the same content-addressed id cannot be proposed again (known issue LS-6, not fixed).

### 2.7 Export a bundle and ship it

```sh
$LINKS export --out links.bundle.json [--include-candidates]      # a pinned bundle anywhere
$LINKS export --write-shipped                                       # refresh the shipped bundle
$LINKS verify-bundle links.bundle.json --pin <manifestSha256>
$LINKS lookup --bundle links.bundle.json --pin <manifestSha256> --venue polymarket --market-id <id>
```

`export` prints `manifestSha256` and the counts. `--write-shipped` rewrites `pm/links/data/links.bundle.json`, `pm/links/data/links.bundle.pin` and `pm/links/shipped-data.ts` together (the last is generated; do not hand-edit it). It refuses a bundle that contains synthetic links. At load time the plugin checks the embedded bundle against its embedded pin, and any mismatch or tamper (record hash, manifest hash, a candidate flipped to approved) is refused.

After `--write-shipped`: run the gate (section 1), review `git diff` on the three files as a person, and only then commit. That diff review is the control that matters. As of 2026-10-20, `verify-bundle` on the shipped files reports manifest `ee818dee51a4f8b78ddc9f0ce605c4003dc79657ec67f21834a2077856d635bd` with 0 approved, 0 candidate, 0 suspended and 0 revoked (observed while writing this).

### 2.8 Gold-set tooling

`$LINKS goldset validate --gold gold.json` and `$LINKS goldset eval --gold gold.json --predictions preds.json [--json]` compute the agreement and recall statistics a class gate needs. Only synthetic fixtures have been used (`pm/test/links/fixtures/`). Passing a gate does not by itself change anything: a later step has to supply the gates to the tools.

### 2.9 When a pinned venue rule changes

The tools recompute the rules hashes of both legs on every `pm_verify_link` call and suspend the link for that call on any mismatch, change of close time, resolver, status, void policy, tick, or outcome count. That verdict is not written back. To make it durable, run `suspend`, then re-read the rules and propose a new candidate with the new hashes.

## 3. The recorder

Purpose: collect the evidence the design lacks (the verdict rests on one snapshot). It records public order books and market state for the markets you name, then reports spread distribution, persistence, depth-limited size and a modelled post-fee net edge by venue pair and time to close. It trades nothing and its report makes no profit claim.

**It has never been started against a real venue.** All 98 recorder tests use fixtures and loopback fake servers on 127.0.0.1. The first real run is therefore also a test of the recorder. Start small, watch the first hour, and expect to find something.

```sh
REC="node_modules/.bin/tsx pm/recorder/main.ts"
```

### 3.1 Choose targets

Two sources, combined:

- A link bundle (`--bundle` plus its pin, `--pin <sha256>` or `--pin-file <path>`). The shipped bundle is empty, so today it yields no targets. By default candidate links are recorded too; add `--no-candidates` to record approved links only. A link with any refused leg (Kalshi, Quotient, or any venue off the allowlist) is skipped whole, counted, and its allowlisted partner is not fetched.
- A targets file (`--targets`), for same-venue groups and loose markets on XO or Polymarket:

```json
{
  "format": "pm-recorder-targets",
  "version": 1,
  "groups": [
    { "groupId": "example-group", "venue": "polymarket", "exhaustive": "unknown",
      "marketIds": ["0x...", "0x..."] }
  ],
  "markets": [ { "venue": "xo", "marketId": "0x..." } ]
}
```

`exhaustive` is your declaration from the venue's rules (`proven`, `by_rule`, `no`, `unknown`), never inferred from market text; the long basket is evaluated only for `proven` and `by_rule`. Ids are the XO or Polymarket condition id, or the Limitless slug, validated against a strict character set. A venue that is not allowed, written in the targets file, is a hard error. Keep targets files out of git unless they hold only public ids you are happy to publish. The files are re-read every tick; a bad edit keeps the previous set and logs an error event.

### 3.2 Dry run first (no network, no database)

```sh
$REC dry-run --bundle pm/links/data/links.bundle.json --pin-file pm/links/data/links.bundle.pin \
             --targets my-targets.json
```

Prints the User-Agent (`insurance-markets-research/0.1`), the method (GET only, no auth, cookies or bodies), cadence, every URL it would call per target, and the projected requests per hour per host against each budget, flagging `OVER BUDGET`. I ran this on 2026-10-20 with a targets file of two Polymarket markets and one XO market using dummy ids and the empty shipped bundle: exit 0, 3 targets, and these request shapes:

```
polymarket  GET https://gamma-api.polymarket.com/markets?condition_ids=<id>
            GET https://clob.polymarket.com/book?token_id=<yes_token_id from the state call>
xo          GET https://api-mainnet.xo.market/api/markets/contract/<id>
            GET https://orderbooks.xo.market/book?token_id=<yes_token_id from the state call>
```

and a projection of 1 to 2 requests per hour per host for those three targets at the regular cadence. Read the whole output and confirm that you are comfortable with every URL and rate before going further. If you are not, stop here.

### 3.3 What it will request, and how often

Only `GET`, over HTTPS, at the real host names, to five hosts: `orderbooks.xo.market`, `api-mainnet.xo.market`, `gamma-api.polymarket.com`, `clob.polymarket.com`, `api.limitless.exchange`. No credentials, cookies, bodies, redirects (a redirect is an error), or JSON-RPC.

| Setting | Default |
|---|---|
| Order book per market | every 3600 s |
| Markets closing within 72 h | every 300 s |
| Market state (status, close time, fee facts) | every 3600 s, or 900 s for short-dated |
| Stop polling | 6 h after close, or at once if resolved or closed |
| Depth stored | 20 levels per side, YES outcome only (NO is derived by complement and labelled so in the report) |
| Retention | 45 days, applied once a day |
| Database cap | 2 GiB; at the cap collection pauses and logs `disk_cap` |

Per-host budgets (sustained requests per second, burst, requests per hour): XO books 2 / 2 / 6000, XO data 1 / 2 / 3000, Gamma 2 / 4 / 6000, CLOB 5 / 5 / 15000, Limitless 2 / 2 / 4000. These are below the documented public limits (about half the ceiling, and a configured budget above its ceiling is refused, not clamped). The Limitless numeric limit was never found, so its budget is a guess kept low. Failures back off per host (exponential, `Retry-After` honoured, jitter), repeated failures open a per-host circuit breaker for ten minutes, and over-budget work is deferred, never sent.

Rough load for N targets: about `N * (3600/interval + 3600/resolveInterval)` requests per hour at regular cadence, about `N * 16` for short-dated ones. XO needs separate resolve and book calls per market; the dry run prints the projection for your actual target set. One snapshot row is about 1.3 KB at 20 levels, so 1,000 hourly targets is roughly 30 MB a day (an estimate, unmeasured).

Override with flags (`--interval-sec`, `--short-interval-sec`, `--short-horizon-hours`, `--depth`, `--retention-days`, `--venues xo,polymarket,limitless`) or `--config <json>`. The minimum interval is 60 s.

### 3.4 Run it locally

Keep the database on a local disk. Use one recorder per database file; a lock file next to it refuses a second one (exit 3), and a lock untouched for two hours is treated as stale.

```sh
# one pass over whatever is due, then exit (use this first, by hand)
$REC once --targets my-targets.json --db data/recorder.sqlite

# loop until SIGINT or SIGTERM
$REC run  --targets my-targets.json --db data/recorder.sqlite
```

The default database path is `pm/recorder/data/recorder.sqlite`; the folder's `.gitignore` excludes `data/`, `*.sqlite`, `*.sqlite-wal` and `*.sqlite-shm`. Recorded data must never be committed.

Suggested first run: two or three markets you can check by eye, `once` by hand, then `status`, `verify` and `report`, and compare a recorded book with the venue's own page. Then `run` for an hour. Only then schedule it.

### 3.5 Deployment examples

None of these has been executed or linted. Paths are examples; replace them. Full versions are in `pm/recorder/RUN.md`.

systemd service (loop under a supervisor):

```ini
[Service]
User=pmrec
WorkingDirectory=/opt/pm-recorder
ExecStart=/opt/pm-recorder/node_modules/.bin/tsx pm/recorder/main.ts run \
  --db /var/lib/pm-recorder/recorder.sqlite --targets /etc/pm-recorder/targets.json
Restart=on-failure
RestartSec=30
KillSignal=SIGTERM
TimeoutStopSec=60
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/var/lib/pm-recorder
```

launchd (macOS, user agent): a plist with `ProgramArguments` of the same `tsx pm/recorder/main.ts run --db ... --targets ...`, `WorkingDirectory`, `RunAtLoad` and `KeepAlive` true, `ThrottleInterval` 30. A complete plist is in `pm/recorder/RUN.md`.

cron (one pass per tick; a five-minute schedule gives the short-dated cadence and the hourly books come from the same state):

```cron
*/5 * * * * cd /opt/pm-recorder && node_modules/.bin/tsx pm/recorder/main.ts once --db /var/lib/pm-recorder/recorder.sqlite --targets /etc/pm-recorder/targets.json >> /var/log/pm-recorder.log 2>&1
```

A systemd timer works the same way (`Type=oneshot` service running `once`, timer `OnCalendar=*:0/5`, `Persistent=true`). Overlapping runs exit 3. A review fix (ADT-4) lets books come due slightly early (by `min(30 s, interval/10)`), so this schedule samples every tick as intended instead of every second tick.

Container: a `node:24-slim` image that copies the repository and installs from the existing lockfile (`pnpm install --frozen-lockfile`, adding nothing), a persistent volume for the database, the targets file mounted read-only, entrypoint `node_modules/.bin/tsx pm/recorder/main.ts`. SIGTERM closes the run cleanly; the next start resumes. For a Kubernetes CronJob or cloud scheduler, run `once` every five minutes with a persistent volume at the database path and `concurrencyPolicy: Forbid`. Ephemeral CI runners and serverless functions are a poor fit: the database and lock file need a real, persistent filesystem. WAL on network mounts and some container volumes has not been tested.

### 3.6 Stop, read, check

Stop a loop with SIGINT or SIGTERM (Ctrl-C, `systemctl stop`, `docker stop`); the run is marked ended, the lock released, and a later start resumes. After a crash the next start logs `unclean_previous_run` and continues; `gaps` shows what was missed.

```sh
$REC status --db data/recorder.sqlite                         # counts, size, recent runs, retired targets
$REC verify --db data/recorder.sqlite                         # recompute row checksums + SQLite integrity
$REC gaps   --db data/recorder.sqlite                         # missed intervals
$REC report --db data/recorder.sqlite                         # text
$REC report --db data/recorder.sqlite --format json --out report.json
$REC prune  --db data/recorder.sqlite --days 45               # at least 7
```

`verify` detects corruption and careless edits; it is not protection against someone with write access to the file. Exit codes: 0 ok, 1 runtime failure or failed verify, 2 bad input or configuration, 3 lock held.

How to read the report: it pairs each link's two series (snapshots within 120 s), and per venue pair and time-to-close bucket (`lt_1d`, `1_3d`, `3_14d`, `14_60d`, `gte_60d`, `unknown`) prints the gross gap before fees, a modelled net per share at top of book, each venue's own spread, depth-limited size, and persistence (episodes measured between samples and never across a recorder gap, so durations are lower bounds). The net is withheld, not guessed, when the fee model is unknown (Limitless), the fee fact is older than three state intervals, the close time is unknown, or the link basis is unresolved. Every report opens with its limits: no latency or leg risk, no transfers, no account limits, derived NO-side prices, sampling blindness, and that the day-90 pre-registered test is not run here. Treat a "positive modelled net" as something to examine, never as profit. The XO fee used is the `p(1-p)` curve from `pm/core`, while the venue's live config reports a flat-bps model; that conflict is unresolved and affects XO nets.

Back up by stopping the recorder and copying the `.sqlite` file (and `-wal` if present), or with SQLite's online backup, then run `verify` on the copy.

### 3.7 The 30-day pause you must plan for

The recorder checks the bundled platform registry's data-terms record for each venue on every tick and collects only while that record is fresh and allows persistence (review fix TC-2). The bundled terms records are dated 2026-10-19 with a 30-day time to live. So a run started now will pause itself, with one `refused` event per venue ("collection of <venue> paused: the registry data terms are stale or do not permit persisting"), at roughly 2026-11-18, about 29 days in, and will not resume by itself. `pm/recorder/RUN.md` does not mention this.

To continue past it, a person must re-read each venue's current terms, and only if they still allow it, update the dated `dataTerms` records in `pm/registry/records.ts` (the date constant `REGISTRY_AS_OF` and any changed clause), run the gate, and restart the recorder. Do not bump the date without re-reading the terms; that would defeat the check. The 1-day `status` section does not affect the recorder.

### 3.8 If something goes wrong

- Many `429` or breaker-open events: stop, lengthen the intervals, shrink the target set. Do not raise a budget above its ceiling to push through; the recorder refuses that anyway.
- A venue answers with a block page or a redirect: stop that venue (`--venues` without it) and leave it. The recorder will not retry around a block.
- `schema drift` or parse errors: a live response shape differs from the saved fixtures. This is expected possibility on the first real run. Stop, keep the log, fix the parser against a saved sample, extend the fixture test.
- `clock_skew` warnings above 1.5 s: fix the machine's clock; skew affects book age and the persistence figures.
- Disk full or `disk_cap`: collection pauses by design. Run `prune` or move the database.
- `database not found; nothing to read` (exit 2): the read commands never create a database.

## 4. Restricted-terms rules

The binding rule: data from a venue or vendor whose terms restrict caching, aggregation or redistribution is held in memory only. It is never written to disk, never exported, never put in a link record, a test fixture, a log or a report.

| Source | Status | What it means in practice |
|---|---|---|
| Kalshi | restricted (hard-coded floor in `pm/adapters/policy.ts`, in addition to the registry record) | The Developer Agreement bars caching or aggregating beyond one's own trading. The Kalshi adapter is OFF by default. Turning it on needs `PM_KALSHI=1` and `PM_KALSHI_ACK=<clause sha256>` (the hash `pm_list_venues` shows next to the clause disclosure); without both, it makes no network call. Even on, data stays in memory. The recorder never contacts Kalshi and never stores a derived number from it. A link with a Kalshi leg may carry ids and hashes only: no quoted rule text, and axis values beside that leg are short codes without spaces. |
| Quotient | restricted (redistribution) | Tools `pm_signal_request` and `pm_signal_parse` are OFF unless `PM_QUOTIENT=1`; when off they return the terms clause and read nothing. The recorder never calls Quotient. The calibration log keeps only derived numbers (our own mid, Q minus mid, coarse buckets, a one-way fingerprint) and is held by the agent, not the plugin; it is reversible (`q = mid + qMinusMid`), so treat it as the restricted data it derives from: do not publish or share it. |
| ProphetX, Gemini | marked restricted in the registry from census clauses | memory-only, adapters off |
| Pascal, SX Bet, Hyperliquid, OG, Novig, UDX and any venue with unknown terms | treated as memory-only | memory-only, adapters off |
| XO, Polymarket (international), Trueo, Limitless | `none_found` | Persistence allowed only while the registry terms record is fresh (30 days). "None found" means no clause was recorded in the notes; it is not a clean bill. The recorder allowlist is exactly xo, polymarket, limitless. |

Rules to follow as an operator:

1. Do not turn on a restricted adapter without reading the clause and the venue's current terms yourself. The acknowledgement hash is a procedural step, not a strong control.
2. Do not commit anything under `pm/recorder/data/`, any `.sqlite` file, any report built from Kalshi or Quotient data (the recorder produces none), or any rule text.
3. `docs/research/fixtures/kalshi/` already holds captured Kalshi payloads in the repository. Whether they stay is the repository owner's decision. Nothing in `pm/` copies them; tests read them read-only and skip if absent.
4. Stale terms revert to restricted. If `pm_list_venues` or a quote shows `memory_only_data` for XO or Polymarket, the registry's terms record has aged out, and the recorder will have paused (3.7).
5. Third-party text (market titles, rules, descriptions, creator names) is untrusted data. The recorder stores none of it; the tools return it only in a fixed untrusted slot. Do not paste it into prompts or notes as instructions.
6. Nobody contacts XO: no outreach and no feedback channel. The only traffic is the ordinary public read `GET` requests listed in 3.3. No browser automation, no write to any third party.

## 5. Quick reference

| I want to | Command |
|---|---|
| Check everything pm/ offline | section 1 |
| See what the recorder would call | `$REC dry-run ...` |
| Record once by hand | `$REC once --targets t.json --db data/recorder.sqlite` |
| Is the data intact | `$REC verify --db ...` |
| Is anything missing | `$REC gaps --db ...` |
| Read the findings | `$REC report --db ...` |
| Add a link | `hash`, `propose`, `review`, `approve`, then `export --write-shipped` and a human diff review |
| Remove a link | `suspend` or `revoke` |
| Check a bundle | `$LINKS verify-bundle <file> --pin <sha256>` |
