# app/: the Cockpit page

A static, key-less web app that shows prediction markets, positions by address, Quotient signals and a wallet map. One source tree makes two builds. It holds no wallet key, has no "Connect wallet" button, and talks to no server the author operates.

This file is for people who build, check or change the page. If you only want to run the Cockpit, read [docs/dapp-runbook.md](../docs/dapp-runbook.md). The decision record behind everything here is [docs/dapp-design.md](../docs/dapp-design.md); where this file says "design" it means that document. The real builds have been loaded in one headless Chromium (see "What is not built or not proven"); no other browser has.

> **Status.** Everything below was built and tested offline: in jsdom (a Node-side DOM), in a headless Chromium driven by Playwright (`app/e2e/`, against the real daemon and a local mock of XO), against recorded fixtures and in-memory fakes. No test sent a request to a real venue, nothing was signed. "Built" means "its offline tests pass", not "it works against the real service".

## The two builds

| Build | `import.meta.env.MODE` | Who serves it | What it can reach | Output |
|---|---|---|---|---|
| **Standalone explorer** | `standalone` | You, from any static host or `pnpm --dir app run serve:standalone`. The author deploys nothing. | Only the CORS-open hosts listed in `headers.config.ts` (`BROWSER_DIRECT_ORIGINS`), directly from the browser. No connection to any daemon. Read-only. | `app/dist/standalone` |
| **Local Cockpit** | `cockpit` | The Cockpit daemon (`node dist/local.mjs serve`) from `127.0.0.1`. | `connect-src 'self'` only: every upstream read goes through the daemon's read proxy (`GET` and `POST /ui/read/<service>/...`). | `app/dist/cockpit` |

Both builds use the same venue readers; each reader takes an injected `fetch`. A venue the current build cannot reach shows "needs the Cockpit", never an empty book (design 4.1 principle 4).

## What is built

All paths are under `app/src/`. Counts are from the stream reports for this build; re-run the tests to confirm them.

| Area | Path | What it is |
|---|---|---|
| Shell, session | `main.tsx`, `App.tsx`, `session.ts`, `SessionStatus.tsx`, `ui/*` | The "risograph desk" shell (`docs/design/cockpit-v2/`): hash router, paper/ink light and dark themes (`ui/theme.css`, every colour a token), the vendored Archivo and Martian Mono faces (`ui/fonts.css`, `ui/fonts/`, SIL OFL 1.1), Bayer-dither tone (`ui/dither.tsx`: `DitherDefs`, `DitherBar`, the one live `DitherField`), the top bar (brand, search field that filters loaded rows, "Local Cockpit · n of m venues read", wallet chip slot, theme select), the `HeroBand`, the one caution tile shape behind every status tile (error, empty, unproven, restricted-terms, needs-Cockpit), `Dialog` (narrow, wide, sheet; a sheet on phones), the mono `ProvenanceLine`, `Chip`, `Mark`, `Num`, `UntrustedText`, route discovery and a footer dock slot. There is no navigation bar. In the Cockpit build `session.ts` exchanges the pairing code at load and `SessionStatus` says in words whether the page is paired |
| Core | `core/*` | Money (exact integers and decimal strings), budgets and the 10-minute pause, cache policy, the two fetch ports, EIP-55 and look-alike address checks, derived Kernel account, address-binding store, venue policy table, capability facts, registry reader |
| Readers | `venues/{xo,polymarket,trueo,hyperliquid,pascal,manifold,limitless}` | Read-only venue readers behind the `VenueReadAdapter` port (`core/ports.ts`), wired into the Markets screen. Limitless is read through the daemon only |
| Readers not wired | `venues/{kalshi,sx,udx,novig,gemini,og,defillama}` | Built and tested offline, restricted-terms or daemon-only, off by default, and not reachable from any screen: there is no screen to switch a restricted venue on, and SX Bet, UDX and OG have no host in `headers.config.ts` |
| Quotient | `venues/quotient/*` | A closed-route client for Quotient (not a venue). Off until the user ticks the licence clause. Never pays on its own. |
| Markets, Market | `features/explorer/*`, `routes/{markets,market}.tsx` | Cross-venue list and one-market page |
| Portfolio, Wallet | `features/{portfolio,wallet}/*`, `routes/{portfolio,wallet}.tsx` | Positions by address, per-chain account map, balances, funding steps shown as text (nothing can be sent from them) |
| Signals | `features/signals/*`, `routes/signals.tsx` | Quotient screen and the link overlay (shows "no links": no dataset exists) |
| Terminal | `features/terminal/*`, `features/terminal/prepare/*`, `routes/terminal.tsx` | Cockpit only. A closed read grammar over four read tools, an observer pane (posture, ARM countdown, inbox, audit), and a prepare console (order, cancel text, redeem, fund, deploy, revoke) that gates before it prepares and ends in the Signature Card. Signs and sends nothing |
| Trade, Signing | `features/{trade,signing}/*`, `routes/{trade,signing}.tsx` | Cockpit only. Prepared items are rebuilt and vetted in the page before they are shown; the Signature Card shows the decoded summary and both tags. The sign path (S2) is off in this build and every write capability reads "unproven" |

Venues with a policy entry but no reader wired into a screen show a tile and nothing else: Kalshi, Gemini, Novig, OG/CDNA, UDX, SX Bet, ProphetX, Polymarket US, Myriad, World, DefiLlama. Kalshi, Gemini, Novig, OG and UDX read as "off: restricted terms" (design 4.6 and fork F5).

### The v2 restyle: one surface, a modal, a dock

The Cockpit v2 design (`docs/design/cockpit-v2/`) keeps three real places and treats everything else as a state or an overlay. The routes that remain are `/` and `/markets` (the surface: a markets table with an inspector aside; Holdings, Linked and Signals are view chips on that table, not screens, and a second chip row under them filters by the fixed category taxonomy of `src/core/category.ts`, a byte-for-byte mirror of `pm/core/category.ts`: "All categories" plus one chip per category with a loaded row, composed with the view and the search text, state only, never a route), and `/market/:venue/:marketId` (the surface with the market modal open for that reference, so deep links keep working; a title click opens the same modal in place). `/wallet`, `/portfolio`, `/signals`, `/trade`, `/terminal` and `/signing` are retired: the wallet panels (saved addresses, account map, balances, funding steps) live in the Connect modal's "Just watch an address" tab, the terminal, the prepare console and the signing inbox live in the footer dock, the Signature Card is a modal over the dock, and the wallet chip in the top bar opens the Connect modal. The shell (this step) ships the tokens, fonts, dither, tile, dialog, hero band and the slots (`topBarEnd`, `dock`, `onConnect`); the surface (`features/explorer`) and the flows (`features/{terminal,signing,wallet}`, `main.tsx`) are the next two steps, and until they land the feature rows above describe the previous screens.

## What is not built or not proven

Read this before relying on anything above.

- **One browser only.** The two builds were loaded in a headless Chromium (the Chromium headless shell that Playwright installs into the gitignored `app/.playwright-browsers`, Chrome 153 on macOS) under their real CSPs with Trusted Types enforced, with zero security-policy violations; axe (with colour contrast and target size) is clean at 360 and 1280 px in both themes; the pairing fragment leaves no trace; DNS rebinding and a hostile local page are refused. Run it with `node e2e/install-browser.ts` (from `app/`, the only step that uses the network) and `pnpm --dir app run e2e`. Firefox, Safari, desktop Chrome's Local Network Access prompts, other platforms and screen readers are **untested**. Browser support is therefore **unknown** beyond that one (design DT5).
- **The session client is minimal.** `session.ts` exchanges the pairing code once at load, keeps the `ui` token in memory and `sessionStorage` (this tab only), and registers it with the read screens through `core/page-token.ts`. It does not renew a token: after 12 hours or a daemon restart a fresh pair link is needed. The page opens the event stream only on the Terminal screen (leaving it closes the stream, which can close an ARM window). The page does not yet read recorded capability facts from the daemon, so `setTradeFactsSource` is never called and every capability reads "unproven".
- **The daemon has no `/mcp` route** (`bridge/main.ts` prints "no MCP endpoint in this build"). It does serve `/ui/status`, `/ui/tool` and the rest of the page routes. An agent reaches it through the stdio shim (`node dist/local.mjs shim`), which forwards each call to `/ui/tool`. The tool gate that `/mcp` must call is exported by `bridge/tool-classes.ts`.
- **No market-creation UI** by decision (design O5). The Signature Card can display a creation item an agent prepared; the page cannot make one. The signer path S2 is off (`S2_ENABLED_IN_THIS_BUILD = false`; the daemon side also needs `ENABLE_PAYBOX_SIGNER` and an acknowledgement that DT1 and DT3 were run).
- **Capability facts are all `unknown`.** `core/capabilities.ts` starts every fact (the four XO doors, what PayBox signs and shows, whether the PayBox address is a plain EOA, and so on) as `unknown`. Only an exact `yes` shows "proven"; `no` and `unknown` both show "unproven". Nothing in the repo has recorded a `yes`.
- **No platform registry data.** `core/registry.ts` can read a registry file; none is bundled, so geography, fee and status facts read as unknown everywhere. No eligibility verdict is computed anywhere.
- **No link dataset.** `features/signals/data/links.json` is optional and absent, so every market shows "no links".
- **No build manifest or in-page "verify build".** The design (section 6 row 2) describes a published `build.json` with per-asset hashes. No script produces one. The builds are not verified to be reproducible.
- **Hyperliquid response shapes are unverified** (`HYPERLIQUID_SHAPE_STATUS`), Quotient paid-response shapes were never observed (`QUOTIENT_SHAPE_STATUS`), and no populated XO, Polymarket, Pascal or Trueo position shape was ever seen live. Position rows are labelled "synthetic-shape tested".
- **Offline `app/` checks.** `pnpm --dir app run check` passes at the time of writing (see the build log). `INERT_HOSTS` in `scripts/policy.ts` holds the documentation hostnames that libraries carry in message strings, each with a reason (including `4byte.sourcify.dev` in viem's decode errors).
- **Hosts that are not in `headers.config.ts`**: SX Bet, UDX, OG/CDNA's public API and Polymarket's geoblock endpoint. Their readers refuse every call (`origin_not_registered`, or "unchecked" for the geoblock) until a reviewed entry and a `headers:write` exist, and the daemon's allowlist needs matching routes.

## Commands

Run from the repository root after the toolchain is set up (`source .tools/env.sh` in this checkout; otherwise Node 24 and pnpm 11.11.0, see [docs/quickstart.md](../docs/quickstart.md) section 1). **Never run `pnpm install`, `add`, `update` or `remove` at the repository root for `app/` work.** `app/` is its own pnpm workspace with its own lockfile (`app/pnpm-workspace.yaml`).

| Goal | Command |
|---|---|
| Install | `pnpm --dir app install --frozen-lockfile` |
| Type check | `pnpm --dir app run typecheck` (and `typecheck:bridge` for `bridge/`) |
| Tests | `pnpm --dir app run test` (Vitest); one path: `pnpm --dir app exec vitest run src/venues/xo` |
| Build both | `pnpm --dir app run build`; one: `build:standalone`, `build:cockpit` |
| Preview with the real headers | `pnpm --dir app run serve:standalone` or `serve:cockpit` (binds `127.0.0.1`, free port, prints the URL) |
| Dev server | `pnpm --dir app run dev` (Vite, `--mode cockpit`; the dev server was not exercised) |
| All offline checks | `pnpm --dir app run check` (runs the `check:*` scripts below) |
| Regenerate headers after a CSP change | `pnpm --dir app run headers:write` |
| Daemon tests | `pnpm unit:bridge` (root `tsx`, adds no dependency) |
| Browser suite | `node e2e/install-browser.ts` once (from `app/`), then `pnpm --dir app run e2e` (builds first if needed; `E2E_SKIP_BUILD=1` trusts `dist/`) |

A test that needs a DOM starts with `// @vitest-environment jsdom`.

### The check scripts (`app/scripts/`)

| Script | Fails when |
|---|---|
| `check-boundaries` | The bundled code (every non-test file under `app/src`) imports a Node module, `relay/`, `src/local/`, `src/tools/`, the HMAC signer or the audit writer, or anything outside a short allowlist of shared files; or the plugin, relay or root tests import `app/`, or the plugin graph imports `bridge/` |
| `check-deps` | A dependency is not an exact version or is undocumented, has an install hook, lacks provenance without a written exception, was under 14 days old when recorded, differs from the plugin's pin for a shared package, or a supply-chain setting is missing |
| `check-csp` | The checked-in `vercel.json` and `scripts/examples/*` differ from what `headers.config.ts` generates, or any `connect-src` entry is not https |
| `check-origins` | Source (not tests or recorded fixtures) names a host that is neither in `headers.config.ts` nor on the reasoned `INERT_HOSTS` list, names a `NEVER_IN_APP_HOSTS` host, or breaks the HTML rules (inline script or style, external subresource, missing no-referrer policy) |
| `check-addresses` | A pinned address is not strict EIP-55 |
| `check-bundle` | A built bundle has an unexpected file type or a source map, an unlisted hostname-shaped URL, an eval-like sink beyond the documented probe, or more than one copy of `viem` or `zod` |
| `check-supply-chain` | An installed package has a lifecycle script or `binding.gyp` that the register does not document, the installed tree and the lockfile disagree, a `.pnpmfile` or an `.npmrc` that re-enables scripts or changes the registry exists, or the lockfile holds more than 150 packages |
| `check-e2e-hygiene` | The browser suites could reach a foreign host, use the system browser or a profile, bypass the CSP, leave a `.only`, name a home path or a user, or send a User-Agent other than the fixed ones |
| `check-root-isolation` | An app install changes the root `package.json`, `pnpm-workspace.yaml` or `pnpm-lock.yaml` (it runs an install) |

## Adding a screen

Routes are found with `import.meta.glob("./routes/*.tsx")`, so adding a screen never edits a shared registry. A route file has two exports (`ui/route-types.ts`):

```ts
export const route: RouteMeta = { id, path, title, nav?: { label, order }, availability?: "any" | "cockpit", hero?: boolean };
export default function Screen({ params }: RouteProps) { /* ... */ }
```

The shell renders the only `<h1>` from the fixed `route.title`, so screens start at `<h2>`. A screen with `hero: true` renders that `<h1>` itself inside `<HeroBand title={route.title} facts={...}>` (the live dither field beside a flat panel; facts are real values or words such as "none approved", never a sample) and the shell renders none. A title is app text and must never contain market text; the Market page is titled "Market" and shows the market's own title inside an `UntrustedText`. `nav` is still validated but nothing renders it: there is no navigation bar, the brand links to `/`, and the shell lists the fixed-path screens on an Overview only while no route claims `/`. In the standalone build a `"cockpit"` route shows the "needs the Cockpit" tile and its component is never mounted. A route module that throws or has bad metadata becomes a "screens that could not be loaded" notice; the other screens keep working.

Shell slots (`ui/Shell.tsx` `ShellProps`, forwarded by `App`): `topBarEnd` (the wallet chip), `dock` (the footer dock; without it the footer shows the build's words), `onConnect` and `walletLabel` (a default 44 px chip when no `topBarEnd` is given) and `statusBar` (the session strip, kept while the dock takes over its words). A screen reads the top bar's search text with `useSearchQuery()` and filters the rows it has already loaded (typing never requests), and reports `useReportVenueCount({ read, total })` so the top bar can say "n of m venues read". `DitherDefs` is rendered once by the shell, so a `DitherBar` (or any `fill={ditherFill(step)}`) resolves anywhere, inside portaled dialogs too.

## Rules every change must keep

These are enforced by tests or checks; breaking one should turn something red.

- **Untrusted text.** Anything a market creator or upstream service can influence is typed `Untrusted<T>` (`core/ports.ts`, helpers in `core/untrusted.ts`) and rendered only by `UntrustedText`, as one text node in a fixed, marked slot. No `innerHTML`, `dangerouslySetInnerHTML`, `eval`, markdown, auto-links, images or CSS from data. No link is built from market text.
- **Money.** Quantities are a bigint plus a decimal scale plus a unit (`core/money.ts`). Adding different units throws. Micro-units enter only through `fromMicro` and `fromBaseUnits`. Totals are per collateral symbol with an excluded-row count; there is no blended net worth. No floating point anywhere near an amount.
- **Null is not zero.** An unknown price, volume or size is `null` and prints as "no data" or "n/a". Sorting puts unknown last. A display price is captioned "display price, not executable"; an XO spread is never shown above "indicative".
- **Unknown fails closed.** An unknown enum, status, curve model or registry value is refused or shown as unknown, never defaulted.
- **One CSP source of truth.** `headers.config.ts` lists every origin the app may name, both Content-Security-Policies and the generated example headers. It is import-free so the daemon can import it. Adding a host is a reviewed change followed by `headers:write`. The Cockpit CSP is `connect-src 'self'` with `require-trusted-types-for 'script'`; the standalone one adds the closed host list and no loopback address.
- **No third-party scripts, fonts or analytics**, no remote images, and no request on load: a screen makes a request only when it needs data or the user presses a button. `api.paybox.sh`, `app.paybox.sh` and `api.trueo.com` must appear nowhere in the app (`NEVER_IN_APP_HOSTS`).
- **Restricted-terms data is memory-only.** `core/cache.ts` `canPersist` never lets restricted or unknown-licence data reach IndexedDB. Only the user's own bindings and venue switches persist. No screen has an export, copy or download control for Quotient or Kalshi rows.
- **Any capability not recorded `yes` shows "unproven"** (`core/capabilities.ts`).

## Serving the standalone build yourself

The author runs nothing, so a host is yours to choose. `app/scripts/examples/` has generated header files for Netlify (`_headers`), nginx and Caddy, plus `headers.json`, and `app/vercel.json` is an example for your own Vercel account. They are drift-tested against `headers.config.ts` but were never loaded by those hosts. Serve with the CSP and the other security headers or the page's own protection is gone. Opening the build from `file://` is untested.

## Supply chain

`app/pnpm-workspace.yaml` sets `minimumReleaseAge: 20160` (minutes, 14 days), `blockExoticSubdeps: true`, `trustPolicy: no-downgrade` and `allowBuilds: {}` (no dependency runs an install script). Every direct dependency is pinned exactly and registered in `scripts/dependencies.json` with its licence, publish time, install-hook and provenance status and a reason; `check-deps` fails if `package.json` and the register disagree. Runtime dependencies are seven: React, React DOM, TanStack Query, wouter, idb, viem and zod. `viem`, `zod`, `typescript` and `@types/node` are pinned equal to the plugin's, and the bundle must contain one copy of `viem` and `zod`. There is no wagmi, WalletConnect or AppKit. Provenance attestations were read from registry metadata, not cryptographically verified. To add a dependency, ask the owner of `scripts/dependencies.json`; do not add one from a feature branch.

Zod 4 probes `new Function("")` when a schema is built, which a strict CSP reports as a violation. `scripts/vite-base.ts` therefore prepends `z.config({ jitless: true })` to the entry module (`src/main.tsx`) and puts zod and that setting in one chunk (`codeSplitting` group `zod`), so the setting runs before any module that builds a schema. Keep the entry at that path; the browser suite fails on any violation.

## Live drift suites (opt-in, not run by default)

Each venue reader has a `*.live.test.ts` (or `live.test.ts`) that is **skipped unless `APP_LIVE=1`**. They exist to catch an upstream shape or CORS change and to settle the "unverified" labels above. All of them were written and **none was run**. They send real requests, so run them deliberately:

```sh
APP_LIVE=1 pnpm --dir app exec vitest run src/venues/xo
APP_LIVE=1 pnpm --dir app exec vitest run src/venues/polymarket src/venues/manifold src/venues/pascal
APP_LIVE=1 pnpm --dir app exec vitest run src/venues/hyperliquid src/venues/trueo src/venues/quotient
APP_LIVE=1 pnpm --dir app exec vitest run src/features/portfolio/live.test.ts
```

What they send, so you can judge it first:

- All use the fixed User-Agent `insurance-markets-research/0.1`, are paced (about three requests per second where they say so), and send no credential, cookie or key.
- Most are `GET` only. The Hyperliquid suite sends read-only `POST /info`; the Trueo suite sends read-only JSON-RPC `eth_call` and an `OPTIONS` preflight to a Base RPC (`APP_LIVE_BASE_RPC` overrides the default); the Quotient suite sends unpaid `GET`s (an unpaid 402 is not billed) and pays nothing.
- Some deliberately send an `Origin` header (a foreign one, or a loopback one) to reproduce the CORS table in design 4.2. They send it to the venue hosts named in the test only.
- Two take your own public address for the first populated read (design DT8): `APP_LIVE_OWNER=0x...` for the portfolio suite and `APP_LIVE_PASCAL_OWNER=<pubkey>` for Pascal. The address is read from the environment for that run; the tests print counts, not the address or positions, and store nothing.
- Nothing flips a status constant for you. After you read a result, a person edits `HYPERLIQUID_SHAPE_STATUS` or `QUOTIENT_SHAPE_STATUS` by hand.

## Browser support

**Established for one browser, unknown for the rest.** The page uses `fetch` with streaming reads, `inert`, native `<details>`, IndexedDB with an in-memory fallback, Trusted Types enforcement, and (Cockpit) Server-Sent Events. All of these ran in one headless Chromium (Chrome 153, macOS) in the browser suite. Firefox, Safari, desktop Chrome's Local Network Access behaviour and other platforms were not exercised; test DT5 in the design (serve the Cockpit, run the hostile-title corpus, SSE and CSP checks in each browser) is pending for them. Until it is run, treat a recent desktop Chromium-based browser as the most likely to work and everything else as untested.

## Links

- [docs/dapp-runbook.md](../docs/dapp-runbook.md): how to run the Cockpit, pairing, the security statement.
- [docs/dapp-design.md](../docs/dapp-design.md): the decision record (read its "Fact-check outcome", which overrides earlier text).
- [bridge/contract.ts](../bridge/contract.ts): the wire contract between the page and the daemon.
- [app/src/core/ports.ts](src/core/ports.ts): the venue reader port.
- [docs/safety.md](../docs/safety.md): what the caps do and do not protect.
