# Cockpit runbook

How to run the Cockpit on your own machine: what it is, how to start it, what works with no keys at all, what is still unproven, and the plain security statement. Written 2026-10-19 for the build on branch `build/xo-paybox-plugin`. For the design reasons behind each point see [docs/dapp-design.md](dapp-design.md) (its "Fact-check outcome" overrides its earlier text); for the page's source see [app/README.md](../app/README.md).

> **Honest status.** Everything described here was built and tested **offline**: in jsdom (a Node-side DOM), in one headless Chromium driven by Playwright against the real daemon, against recorded fixtures, a local mock of XO and a local test chain. **No request has left the machine in a test. Nothing has been signed through PayBox, nobody has been contacted, and nothing has been uploaded to PayBox. The Cockpit has not been used with a real venue, a real PayBox account or a real MCP client.** Where this page says a thing "works", it means its offline tests pass. Where something is missing it says so under "What is not finished" below; read that section first if you expect a finished product.

Nothing here is financial or legal advice. Prediction markets can lose you money and some venues restrict regions: read [docs/safety.md](safety.md) before putting money anywhere near this.

## 1. What it is

The Cockpit is one program on your own computer plus a web page it serves to you:

- **The daemon** is `node dist/local.mjs serve`. It is the same local-mode program as the XO MCP server (`src/local/README.md`) with an HTTP front added (`bridge/`). It listens on `127.0.0.1` on a random free port. It owns the data directory (credential vault, ledger, caps, audit log) as the single writer, and it makes your reads for you through an allowlisted proxy.
- **The page** is the static app in `app/dist/cockpit`, served by the daemon from the same origin. It shows markets, your positions by address, Quotient signals and a wallet map. It holds no wallet key and has no "Connect wallet" button: PayBox has no web connection surface, and everything that signs goes through your PayBox wallet via your own agent (design section 0).
- **A second build**, the **standalone explorer** (`app/dist/standalone`), is read-only, needs no daemon, and reads CORS-open venues straight from your browser. You serve it yourself. The author hosts nothing (design section 1.1, fork F2 default).

Nothing runs on a server the author operates. Every request comes from your machine (design rule R1), so each venue sees your IP address and any address you ask about; positions are public by address on most of these venues regardless.

## 2. What is not finished

As of this build, these are missing or untested. They are not hidden elsewhere.

| Missing or unproven | What it means for you |
|---|---|
| **Agent endpoint `/mcp`** | The daemon starts without it and prints "no MCP endpoint in this build". Your agent reaches the daemon through the stdio shim instead: `node dist/local.mjs shim` (section 3.5). The ordinary stdio server (`node dist/local.mjs` with no command) still works as before. |
| **A minimal session** | The page exchanges the pairing code at load and keeps the token for the tab. It does not renew it: after 12 hours or a daemon restart you need a fresh pair link. The page has no kill button (use `kill -USR2`, the `POST /ui/kill` route or a restart), and the event stream runs only while the Terminal screen is open (an ARM window can be started only while it runs, see section 9). |
| **Recorded capability facts** | The page does not receive recorded facts from the daemon, so every capability shows "unproven" (section 6). This is the safe default: the trade screens stay closed. |
| **Sending and signing** | The terminal's prepare console, the Trade screen and the Signing screen prepare, rebuild and show items; none sends a signature. The PayBox-client signer (path S2) is built and off: it needs `ENABLE_PAYBOX_SIGNER`, the write flags and your statement that the PayBox tests DT1 and DT3 were run, and nothing has been run against a real PayBox. |
| **One browser** | Chromium (the headless shell, Chrome 153 on macOS) has loaded both builds cleanly. Firefox, Safari, other platforms and screen readers are untested (section 7). |
| **Everything XO-side** | The four XO "doors" and every write path are unproven (section 6). |
| **Some venues and hosts** | Seven readers are written and tested offline but no screen uses them: Kalshi, SX Bet, UDX, Novig, Gemini, OG and DefiLlama. Of these SX Bet, UDX and OG also have no host in the page's single origin list (so they could not run even if wired), and the daemon's allowlist has no routes for SX Bet and UDX. Polymarket's geoblock check reads "unchecked". The Quotient key held by the daemon has no store yet (use `XO_COCKPIT_QUOTIENT_KEY`). There is no screen to switch a restricted-terms venue on. |
| **The relay's `GET /v1/prepared/{id}`** | It does not exist, so the tool `xo_get_prepared` answers `not_implemented` against a real relay. The Signing screen does not depend on it. |
| **Registry data, link dataset, build manifest** | No venue-fact registry, no cross-venue link dataset and no published build hashes exist. See sections 5 and 8. |
| **External security review** | The design requires one before the daemon is released (design section 6 row 7, M1). It has not happened. |

The full list of what was built, what was checked and what was not is in [docs/build-log-dapp.md](build-log-dapp.md).

## 3. Start it

### 3.1 Prerequisites

Node 24.x and pnpm 11.11.0 (this checkout pins Node 24.21.0), an MCP client only if you also want your agent involved, and a browser. Toolchain and clone steps are in [docs/quickstart.md](quickstart.md) sections 1 and 2; they are not repeated here.

### 3.2 Build

From the repository root:

```sh
pnpm install --frozen-lockfile                 # the plugin and daemon (root workspace)
pnpm build:local                               # writes dist/local.mjs (includes bridge/main.ts)
pnpm --dir app install --frozen-lockfile       # the page (its own workspace and lockfile)
pnpm --dir app run build:cockpit               # writes app/dist/cockpit
```

If `app/dist/cockpit/index.html` is missing the daemon still starts and says so on stderr, with the build command to run.

### 3.3 Run

```sh
node dist/local.mjs serve
```

Everything you need to read goes to **stderr**; nothing goes to stdout. Options (`bridge/main.ts`):

| Option | Meaning |
|---|---|
| `--port N` | Listen on a fixed port, 1024 to 65535, instead of a random one. Useful so an agent keeps a stable endpoint URL. Host and Origin checks follow whichever port is used. |
| `--agent-scope read,prepare[,submit]` | The ceiling of the agent token. Default `read,prepare`. A `submit` scope still does nothing without an open ARM window. |
| `--rotate-agent-token` | Replace the stored agent token; the old one stops working. The new one is printed once. |
| `--app-dir <absolute path>` | Serve a Cockpit build from another directory. |

The same environment variables as local mode apply (`src/local/README.md`): `XO_DATA_DIR`, `XO_MASTER_KEY`, `XO_OWNER`, the `ENABLE_*` write flags (all **off** by default), `XO_KILL_SWITCH`. The Cockpit adds two, both read at start:

| Variable | Meaning |
|---|---|
| `XO_COCKPIT_VENUES` | Comma list of restricted-terms services the read proxy may use, for example `kalshi,quotient`. Naming one is **your** acceptance of that venue's terms. Default empty: those venues are off. Names that are not restricted venues are ignored and counted on stderr. |
| `XO_COCKPIT_QUOTIENT_KEY` | A Quotient key (looks like `qt_...`) that the daemon attaches to Quotient reads. Never sent to the page. |

A second `serve` process on the same data directory starts in **read-only** mode: its tokens are limited to the read scope, it writes nothing, and it says why on stderr. This is the single-writer rule (design 3.2); do not give a second process its own `XO_DATA_DIR` to work around it, because the caps and the stored XO credential would split.

To stop: `Ctrl-C` or `SIGTERM` (graceful, exits 0 and removes `<data dir>/cockpit/daemon.json`).

### 3.4 Open it

On start the daemon prints a banner and then a link of the form `http://127.0.0.1:<port>/#pair=<code>`, "valid 120 s, works once". The code is 128 bits, lives in the URL fragment (a browser never sends a fragment in a request), is burned after 5 wrong tries, and is printed to stderr only. If the 120 seconds pass, loading the page again with no code open makes the daemon print a fresh link (at most every 5 seconds, only for a real page navigation).

Use exactly the address printed. The daemon accepts only `Host: 127.0.0.1:<port>`; `http://localhost:<port>` is refused with `403 host_forbidden`. That is the DNS-rebinding defence, not a bug.

The page removes the code from the address bar before anything else runs, exchanges it once for a `ui` token (read and prepare, never submit) and keeps the token in `sessionStorage` for that tab only. A strip under the header says whether the page is paired; if it is not (no code, an expired or used code, the daemon unreachable) it says why in words and the daemon-backed screens send nothing.

### 3.5 Agent token

Agent access uses a separate token (`cka_...`). It is printed once on first start (or with `--rotate-agent-token`); only its SHA-256 is stored, in `<data dir>/cockpit/agent-token.json` (mode 0600). Page ("ui") tokens live in memory only, last 12 hours, at most 8 at once, and can never hold the `submit` scope. Registering the daemon with an agent needs the `/mcp` endpoint, which is not in this build (section 2). Use the stdio shim instead: save the token to a file with mode 600 and point your agent's MCP configuration at `node dist/local.mjs shim --token-file <path>` (or set `XO_COCKPIT_AGENT_TOKEN_FILE`, or `XO_COCKPIT_AGENT_TOKEN`; a token on the command line is refused). The shim finds the running daemon through `<data dir>/cockpit/daemon.json` (or `--url http://127.0.0.1:<port>`), forwards each tool call to `POST /ui/tool` and holds no relay, ledger or key. `node dist/local.mjs shim --check` says whether the daemon is running and accepts the token. With no daemon every call fails with a clear error; the shim never starts a relay.

## 4. What works with zero keys

No wallet, no PayBox account, no venue account, no API key, no environment variable beyond the defaults. These use public data only.

| Screen | What you get | Needs the daemon? |
|---|---|---|
| **Markets** (`#/markets`) | One list fanned out to XO, Polymarket, Trueo (Base, on-chain), Hyperliquid outcomes, Pascal, Manifold and Limitless (Limitless only in the Cockpit build; the standalone build says "needs the Cockpit"), with a per-venue panel saying what each venue is doing. A failed venue shows an error tile and the others still render. Display prices are captioned "display price, not executable". | No for the standalone-capable venues. XO order books need the Cockpit. |
| **Market** (`#/market/<venue>/<id>`) | Rules (inert text with a fingerprint), sources, times in UTC, fee-model status, order book per outcome where the venue serves one, spread in labelled tiers. | Books for XO: yes. |
| **Portfolio** (`#/portfolio`) | Positions by address on XO (by the derived account), Polymarket, Trueo and Pascal, marked at the best bid, totals per collateral symbol with an excluded-row count. Rows are labelled "synthetic-shape tested". | XO books and claimables: yes. |
| **Wallet** (`#/wallet`) | Paste your PayBox EVM address; see the derived XO smart account on each chain with its real on-chain state, native and token balances, and funding steps as text. Address book stays in your browser; it states the privacy cost first. | Chain reads: public RPCs where the build lists one (Base, Polygon, BNB, XO, HyperEVM); other chains read "derived, not checked". |
| **Terminal, Trade, Signing** (`#/terminal`, `#/trade`, `#/signing`; Cockpit only) | Read commands over XO, the posture, ARM countdown and audit feed, a prepare console, and a Signature Card that shows what an item would sign and two short tags to compare. Every write path behind them is off until you turn it on, and they send nothing themselves. | Yes |
| **Signals** (`#/signals`) | Quotient: **off** until you tick its licence clause. Free track record needs no key; paid routes need your own key or an import of JSON your own agent saved. | Daemon-held key: yes. |

Rules of the road: the wallet screen never asks for a seed or private key (its absence is a test); a derived address is shown as a deposit target only after code is seen on chain, and for XO only after "door (a)" is recorded; "RPC unreachable" is never shown as "undeployed"; null is shown as "no data", never 0; no screen has an export control for Quotient or Kalshi data. Restricted-terms venues (Kalshi, Gemini, Novig, OG, UDX) read "off: restricted terms" on the Markets screen. Their readers exist in the source (they ship off, memory-only, with a disclosure) but no screen reaches them in this release.

## 5. Terms, regions and data

- **Restricted venues are off.** Their terms bar caching or redistribution as read (design 4.6). Their data would be memory-only (dropped on page hide and after 15 idle minutes) and never exported. This is a design default, not legal advice; whether a venue's rules allow what you do is your call.
- **Regions are facts, not verdicts.** XO excludes some jurisdictions and Polymarket and Limitless exclude the US (design 4.8). The Cockpit may show dated, sourced facts but computes no eligibility verdict. No registry data is bundled, so most such facts read "unknown".
- **Quotient** is optional, off by default, and its measured edge is small (design 4.7). The page never pays on its own: a 402 shows "payment required", a paid call needs a press showing its price, and a payment challenge that differs from the pinned tuple (Base USDC, Quotient's payee, at most $0.05 per call and $2 per day) is a hard stop. Quotient figures sit beside venue prices and are never blended into one number or turned into a trade.
- **Hyperliquid** response shapes are unverified (`HYPERLIQUID_SHAPE_STATUS`); its tile says so and shows its "Excluded Persons" clause.
- **No market-creation UI** is shipped (open item O5 in `docs/phase1-gap-closing.md` section 9.4).

## 6. Unproven capabilities

A capability is something this project has not yet seen work against the real system. Each is recorded `yes`, `no` or `unknown`; every one starts `unknown`, and a record becomes `yes` only when **you** confirm a live test (`app/src/core/capabilities.ts`). Anything that is not `yes`, a recorded `no` included, shows **"unproven"** in the page, and nothing that depends on it is enabled. As of this build none has been recorded `yes`, and the page does not read recorded facts from the daemon, so it shows all of them as unproven.

| Capability | Question it answers | Test |
|---|---|---|
| Door (a) | Does XO's bundler admit a first operation from an account XO never provisioned? | T1 |
| Doors (b), (c) | Does the orderbook register the account, and does it accept our login signature? | T2 |
| Door (d) | Does the orderbook credit USDC.e sent straight to the account? | T3a |
| Door (e) | Does XO's relayer deliver a message that did not come through XO's own executor? | design 0 |
| PayBox signs a raw 32-byte digest; signs typed data on chain 3223; shows a decoded typed-data request | What does PayBox actually sign and display? | DT1 (contains T0) |
| PayBox address is a plain EOA | Does it carry an EIP-7702 delegation? Until recorded, the wallet screen does not call it a plain EOA. | DT2 |
| First order accepted and cancelled; withdrawal exit; redeem; capped allowance and revoke | The XO write path end to end | T3b, T4, T5, T8 |

T0 to T8 are the XO and PayBox live tests in [docs/phase1-gap-closing.md](phase1-gap-closing.md) section 6, driven by the scripts described in [docs/runbook.md](runbook.md). DT1 to DT9 are defined in design section 7.5. Each is a **real action** on PayBox's or a venue's systems and needs your explicit go. This repository's builds never run one for you.

If door (a) fails, the whole XO write path stays closed and the Cockpit remains a read-and-verify tool (design section 0).

## 7. Browser support

**Established for one browser only.** Both builds were loaded in a headless Chromium (the Chromium headless shell, Chrome 153, on macOS) under their real Content-Security-Policy with Trusted Types enforced: no security-policy violations, no request outside the policy, axe clean at 360 and 1280 px in both themes, no sideways scroll, the pairing fragment gone from the address bar and from history, and DNS rebinding and a hostile local page refused. Design test DT5 ("does the loopback UI behave in Chromium, Firefox, Safari?") has **not** been run for Firefox or Safari. What is known:

- The page needs Trusted Types enforcement (`require-trusted-types-for 'script'`), `fetch` with streamed reads, IndexedDB (it falls back to memory if unavailable) and, for the event stream, a streamed `fetch` of Server-Sent Events.
- Whether Chrome's Local Network Access prompts or Safari's mixed-content rules affect a loopback page is **not tested**. The design avoids a hosted page calling loopback (section 4.1 principle 3) by serving the page from the daemon itself.
- Opening the standalone build from `file://` is untested; serve it over HTTP.

If something does not render, please record the browser and version; it is the evidence DT5 needs.

## 8. Supply-chain posture

What is enforced in the page build (details in [app/README.md](../app/README.md)):

- Exact version pins; every direct dependency registered with licence, publish time, install-hook and provenance status in `app/scripts/dependencies.json`.
- `minimumReleaseAge` of 20160 minutes (14 days) in both `app/pnpm-workspace.yaml` and the root `pnpm-workspace.yaml`; `blockExoticSubdeps`; `trustPolicy: no-downgrade`; `allowBuilds: {}` so no dependency runs an install script.
- A frozen lockfile (`--frozen-lockfile`). Seven runtime dependencies: React, React DOM, TanStack Query, wouter, idb, viem, zod. No wagmi, WalletConnect or AppKit.
- The page has no third-party script, font, image or analytics; every origin it may name is in one file (`app/headers.config.ts`), and the build is checked for unlisted hosts and for eval-like code.
- The daemon's allowlist is derived from that same file.

What is **not** there: published per-asset hashes, an in-page "verify build" step, and any evidence of reproducible builds. There is no download to compare hashes against; the safe route is to build from a revision you have read, with the frozen lockfile. Provenance was read from registry metadata and not cryptographically verified. `idb`, `typescript` and the `@types/*` packages have no provenance attestation (written exceptions are in the register). A compromised dependency or host could still alter what the page displays; that is reduced, not removed (design 6 row 3).

## 9. Security statement

Read this plainly; it is the part most likely to matter.

**The daemon is the riskiest new piece.** A local web server that can hold the means to move money is the same architectural class that produced a critical remote-code-execution flaw in a well-known MCP tool (CVE-2025-49596, cited in design section 0 and section 6 row 7). It is a necessary evil here, not a safe one. The controls are real and tested offline, and they are **necessary but not sufficient**:

- It binds `127.0.0.1` only. It accepts only the exact `Host: 127.0.0.1:<port>`, and rejects any `Origin` that is not its own, so another web page or a DNS-rebinding trick is refused before authentication.
- Every API route needs a bearer token; there are no cookies and the daemon never sends `Set-Cookie` or CORS headers. Tokens are compared in constant time. The pairing code is 128 bits, single use and valid 120 seconds.
- Authority is split. The page gets a token with no `submit` power. A write needs an **ARM window**: you ask for it (up to 10 minutes), the daemon prints an 8-character code on stderr only, and you type it into the page. A compromised page cannot read your terminal. The window is tied to the page's own live event feed: it can be started only while the Terminal screen's stream is open (a stream opened with the agent token does not count, so an agent cannot keep a window alive after you close the tab), and it closes on expiry, a tripwire, the kill switch, a write flag turning off, or the last page stream going away. "A write flag" means the relay's effective flag: an `ENABLE_*` the environment asks for but the relay holds back (its live-test result is not recorded) does not count, so arming does nothing in that case, and nothing if every `ENABLE_*` flag is off.
- **Never let the agent start, restart or read the daemon.** The pairing link, the ARM code and a new agent token are printed on the daemon's stderr, and the ARM code is the proof that a person is at the keyboard. Whoever can read that stream (an agent that launched the daemon, or a log file you redirected stderr into) can pair a page token, request a window, read the code and confirm it. Start the daemon yourself in a terminal you watch, do not redirect its stderr to a file, and do not run it from an agent's shell tool. The daemon does not check that stderr is a terminal (a known gap, review finding DS-4).
- **A fixed port can be squatted.** `--port N` gives the stdio shim a stable URL, but if the daemon is down, another local process that binds that port first receives the agent token when the shim connects: the shim only checks that the listener answers 401 with the Cockpit's error body, which any process can imitate (review finding DS-5). Prefer the default random port with `daemon.json` discovery, and run the daemon on a computer where you are the only user.
- An unwritable audit log refuses everything that prepares or sends, including tool calls (reads, the kill and the disarm stay open).
- Every tool and route belongs to exactly one class (read, prepare, submit, admin). A tool missing from the table is denied, and a test fails if the table and the real tool list differ.
- **Kill switch.** `POST /ui/kill` (the page has no button for it) or sending `SIGUSR2` to the process engages the relay's one-way kill. There is no way to undo it except restarting the process. On Windows there is no `SIGUSR2`; use the route or restart with `XO_KILL_SWITCH=1`.
- The read proxy refuses any host, path, method or JSON-RPC method not on its list, refuses redirects, caps response size (8 MiB) and time (15 s), and strips cookies, credentials and caller headers. Three 429s or any 403 from a venue pauses that venue for 10 minutes; nothing retries around a block.
- The page runs under a strict CSP with Trusted Types; all market text is rendered as inert text in a fixed marked slot. Both were exercised in one headless Chromium with a corpus of hostile titles, rules and sources; other browsers were not.
- Flags are shown, never set: no endpoint changes an `ENABLE_*` flag, a cap or the data directory. Every write path starts **off**.
- The daemon's audit log has a hash chain whose head the status bar is meant to show. It resists accident, not a malicious local process, and it restarts at its first link when the process restarts.

**What these do not cover.** Malware or another process running as you can read your data directory and your environment; that is out of scope here, as in `docs/safety.md`. The master key is by default a file in the data directory, which protects against stolen copies of the files but not against processes running as you. A browser bug, a hostile browser extension, or a compromised dependency can defeat the page. The external security review has not happened.

**Blind signing is reduced, not removed.** For XO the thing you sign is a 32-byte hash. The Signature Card shows a decoded summary and two short tags to compare with PayBox's window, but what PayBox actually shows for a raw digest or typed data is not known (DT1). The tags guard against accidents and swaps, not against a hostile agent, and approval fatigue is real.

**The caps are advisory against a compromised agent.** The $10 per order and $50 per day limits are enforced by this software only. An agent that holds a PayBox grant can ask PayBox to sign directly and walk around them, and the Cockpit cannot see that. Under an `autonomous` grant nothing is shown to anyone before PayBox signs. Use a dedicated PayBox credential for XO that holds only what you can afford to lose, and approval-gated mode for anything funded. The design requires the page to say "advisory" wherever a write flag is on and never to call a fund, a cap or a tag comparison "safe" or "verified"; the Signing and Trade screens carry that wording.

**Third-party content is hostile by default.** XO markets are permissionless, so titles and rules are written by strangers. They are typed untrusted, cut down to an 80-character slot near any approval, and never become a link or markup. Your own agent reads the same text through its tools and may obey it; the Cockpit cannot control that.

**Money.** Nothing here is custodial: the daemon holds your XO API credentials (encrypted) and, if you add it, a Quotient key; PayBox holds your wallet key. Nothing has moved real money in any test. There is no verified way to take money out of XO yet (T4), so funding is one-way until it passes.

## 10. Live drift suites

Each venue reader has an opt-in suite, skipped unless `APP_LIVE=1`, to catch an upstream shape or CORS change. They were written and **never run**. They send real requests (mostly `GET`; Hyperliquid and Trueo send read-only `POST`s), paced, with the fixed User-Agent `insurance-markets-research/0.1`, no credentials and no cookies. Commands, what each sends and the optional own-address variables (`APP_LIVE_OWNER`, `APP_LIVE_PASCAL_OWNER`, `APP_LIVE_BASE_RPC`) are in [app/README.md](../app/README.md), "Live drift suites". Read that section first; running a suite is your decision. After a run, a person edits the "unverified" constants by hand; nothing flips them automatically.

## 11. If something goes wrong

| You see | Likely cause | What to do |
|---|---|---|
| `error: this build has no Cockpit daemon` | `dist/local.mjs` was built without `bridge/main.ts` | `pnpm build:local` again |
| "the Cockpit app is not built" on stderr | `app/dist/cockpit/index.html` missing | `pnpm --dir app run build:cockpit` |
| `403 host_forbidden` in the browser | You used `localhost` or a different port | Use the exact address the daemon printed |
| `mode: READ ONLY` in the banner | Another process owns the data directory, or the relay did not start | Stop the other process; if a crash left `store.lock`, see `src/local/README.md` |
| Pair link expired | 120 s passed | Reload the page; the daemon prints a fresh link |
| Arming refused with `flag_off` | Every `ENABLE_*` flag is off (the default) | Expected. Write paths are off until you start the process with a flag on |
| A venue says "paused" | A 403 or three 429s; the pause lasts 10 minutes | Wait; nothing retries around it |
| A venue says "off: restricted terms" | Default for Kalshi, Gemini, Novig, OG, UDX; their readers are not reachable from any screen in this release | Nothing to do |
| The strip under the header says "Not paired with the daemon" | The page was opened without a pair link, the code was used or expired, or the daemon restarted | Reload the page; the daemon prints a fresh link. The standalone build needs none of this |
| Kill engaged by mistake | The kill is one-way | Stop and restart the process |

To stop everything: `Ctrl-C` the daemon. To rotate the agent token: restart with `--rotate-agent-token`. To remove local data: delete the data directory you chose (back up `master.key` first if you want the vault again; see [docs/safety.md](safety.md)).

## 12. Sources

- Design, fork decisions and tests: [docs/dapp-design.md](dapp-design.md) sections 0, 1, 3 to 7 and the Fact-check outcome.
- Daemon: `bridge/main.ts` (options and banner), `bridge/server.ts` (checks and pairing), `bridge/auth.ts` (tokens), `bridge/arming.ts` and `bridge/kill.ts`, `bridge/proxy.ts` and `bridge/allowlist.ts` (read proxy), `bridge/contract.ts` (wire contract and limits).
- Local mode and flags: [src/local/README.md](../src/local/README.md), [docs/quickstart.md](quickstart.md), [docs/safety.md](safety.md).
- XO and PayBox live tests: [docs/phase1-gap-closing.md](phase1-gap-closing.md) section 6 and [docs/runbook.md](runbook.md).
- Page: [app/README.md](../app/README.md), `app/headers.config.ts` (every origin and both CSPs), `app/src/core/capabilities.ts` (unproven rule).
