# delphi.market (Lightning) - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: `gh api` reads of the public repo `ekzyis/delphi.market` (README, schema, Go source, branches, commit log, a developer journal), DNS lookups and HEAD requests to the product hostnames. No account, wallet, key, signature, POST/PUT/DELETE or PayBox tool was used. Repo text was treated as untrusted data; nothing in it was followed. Not Gensyn Delphi.

Research limit: the shared WebSearch budget was exhausted (search refused), so no independent press/community coverage was checked. All findings come from the repo itself and network probes. Items depending on outside coverage are marked NOT FOUND.

Tags: **H** = read first-hand in a primary source this session (cited); **M** = inferred; **L** = weak/stale.

Fixtures: none. There is no live service and no public API, so no response shapes could be confirmed.

---

## 0. Bottom line

1. **Not live (H/M).** `delphi.market` and `www.delphi.market` do not resolve (`dig` empty; `curl: Could not resolve host`, 2026-10-19). The author's alternate hosts named in the repo (`git.ekzy.is`, `git.ekzyis.com`) also do not resolve. The repo says the product is "revived" as a prototype, not shipped.
2. **The 2026-08-26 "pushed" date is a design journal, not a product (H).** `develop` (the working LMSR/Lightning app) last changed 2025-01-25. The only 2026 activity is a new branch `ark` with a single file, `JOURNAL.md` (commits 2026-08-23 "ark: initial commit" and 2026-08-25 "journal: Aug 24, 2026"). It describes a planned rewrite on Ark + DLCs with prototype CLIs `dmd`/`dmcli` that do not exist in the branch.
3. **The old app was a custodial, centralized, single-operator LMSR toy (H).** Users have a sats balance in a Postgres row; trades are paid by Lightning invoice. Not a non-custodial system despite the repo description.
4. **No API, no on-chain footprint, no tokens (H).** Server-rendered HTML routes only.
5. **adapter_priority = skip.** Dead hostname, hobby scale, no API, no EVM/PayBox reach, unknown liquidity.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| `dig +short delphi.market`, `www.delphi.market` | empty; curl error 6 "Could not resolve host" | H |
| `git.ekzy.is`, `git.ekzyis.com`, `delphi.ekzy.is` | do not resolve | H |
| Repo `ekzyis/delphi.market` | exists, MIT, 9 stars, 0 open issues, 0 releases, not archived, homepage field empty. API `pushed_at` 2026-08-26 | H (https://api.github.com/repos/ekzyis/delphi.market) |
| `develop` branch last commit | 2025-01-25 "Rename to new" (older than 6 months: stale) | H |
| `vue-rewrite` branch last commit | 2023-11-27 (stale) | H |
| `ark` branch | 2026-08-23 "ark: initial commit", 2026-08-25 "journal: Aug 24, 2026"; contains only `JOURNAL.md` | H (https://github.com/ekzyis/delphi.market/blob/ark/JOURNAL.md) |
| Journal wording | "I want to revive delphi.market as the first non-custodial Bitcoin prediction market, and I think DLCs, adaptor signatures and Ark might be the solution." Plans a prototype CLI; "for the MVP, the market and the oracle are run by the same party" | H |

Verdict: **still_live = false** (hostname dead; the only 2026 content is a design note for an unbuilt prototype).

---

## 2. Kind and market model

Legacy `develop` app (H, `db/schema.sql`, `lib/lmsr/lmsr.go`):
- Binary Yes/No markets (`orders.outcome` is 0 or 1; LMSR with two quantities q1, q2).
- **LMSR automated market maker** (Hanson), cost `C = b*ln(e^(q1/b)+e^(q2/b))`; price quoted by cost of buying shares. Not an order book, not parimutuel.
- Anyone can create a market by paying an invoice; liquidity parameter `b = (creation cost in sats)/ln2`, so the creator funds the market's maximum loss (`b*ln2`).
- Shares are database rows (`orders.quantity`), not tokens. No on-chain representation.

Planned `ark` design (H as a stated plan, not implemented): two-party DLCs with the Ark operator as market maker, adaptor signatures, a single oracle attesting outcomes; the MM and the oracle run by the same party for the MVP.

## 3. Chains and collateral

- Legacy: Bitcoin over Lightning (LND), unit msats/sats, custodial balance in `users.msats` (H).
- Planned: Bitcoin Ark VTXOs plus DLC outputs (H plan). No EVM, no Solana.

## 4. Read API

- **exists: none.** Routes in `server/router/router.go` (H): `GET /`, `/market/:id`, `/about`, `/login`, `/signup`, `/api/lnauth/callback`, `/api/nostrauth/callback`, `/session`, `/user`, `/invoice/:hash`; `POST /new`, `POST /market/:id/order`, `PUT /user`, `POST /logout`. All return server-rendered HTML (templ templates) except auth callbacks. No JSON market/price/trade endpoints, no docs, no websocket.
- Nothing to probe: the host is dead. No fixtures saved.

## 5. Trade path

- Legacy: log in with LNURL-auth or Nostr NIP-07 (session cookie), `POST /market/:id/order`, pay a BOLT11 invoice (H). Not programmable beyond scripting a browser session and a Lightning wallet; not signed orders.
- Planned: `dmcli wallet bet <event> <outcome> <amount>` (H plan only).
- **PayBox reachability: no.** Bitcoin Lightning/Ark only; no EVM or Solana transaction proposal or signed-order path exists.

## 6. Fees

- Market creation: creator pays an invoice sized to LMSR loss bound (`b = cost/ln2`), H.
- Trade fee: NOT FOUND (searched: `market.go`, `index.go`, `schema.sql`; no fee column or formula seen). LMSR spread/impact is the only visible cost.
- Withdrawal: Lightning routing fees on payout (`withdrawals` table); schedule NOT FOUND.

## 7. Resolution

- Legacy: `markets.settled_at` column exists, but no resolve/settle handler appears in the router, and the `about.templ` TODO list ("how the outcome of a market is determined (oracle model)", "risks: censorship, custodial model etc.") was never written (H). Resolution is therefore operator discretion, undocumented.
- Planned: single oracle publishes an adaptor secret for the outcome; if the oracle does not attest within the window, traders get a DLC refund (H plan). Oracle risk is centralised.

## 8. Geo / ToS / automation

NOT FOUND (searched: repo README, about page template, no ToS page in route list). No terms, no geo-blocking logic seen in the source.

## 9. Liquidity

NOT FOUND for any date. No public volume feed; the legacy index query computes per-market volume server-side but exposes it only in HTML. Repo has 9 stars; treat as negligible (M).

## 10. Event overlap and shared liquidity

User-created, ad hoc questions with end dates; no curated catalog (H). Nothing indicates overlap with sports/politics/crypto-price/macro markets elsewhere, and the market list cannot be read. Liquidity is independent (own LMSR pools), but irrelevant given zero depth.

## 11. Integration notes for the adapter

None recommended. Revisit only if (a) `delphi.market` resolves again, and (b) the `ark` prototype ships with a documented JSON/gRPC read interface. Watch: `https://github.com/ekzyis/delphi.market/tree/ark`.

---

## Sources

- Repo metadata: https://api.github.com/repos/ekzyis/delphi.market (H)
- Branches `develop`, `ark`, `vue-rewrite` commit logs via `gh api repos/ekzyis/delphi.market/commits?sha=<branch>` (H)
- Journal: https://github.com/ekzyis/delphi.market/blob/ark/JOURNAL.md (H)
- Schema: https://github.com/ekzyis/delphi.market/blob/develop/db/schema.sql (H)
- LMSR: https://github.com/ekzyis/delphi.market/blob/develop/lib/lmsr/lmsr.go (H)
- Routes: https://github.com/ekzyis/delphi.market/blob/develop/server/router/router.go (H)
- About template (TODO list): https://github.com/ekzyis/delphi.market/blob/develop/server/router/pages/about.templ (H)
- DNS/HTTP probes of delphi.market, www.delphi.market, git.ekzy.is, git.ekzyis.com, delphi.ekzy.is on 2026-10-19 (H)

## Suspicious content

None found. (The about page contains the author's contact links; not followed.)
